/**
 * Physical Modeling String Synthesizer v0.1 — Application Bootstrap & Module Wiring
 *
 * Connects the shared SynthFramework, AudioBus, EnvelopeModule, DetuneModule,
 * LFOModule, ArpeggiatorModule, AudioFXEngine, and VisualizerSuite to the
 * 6 Physical Modeling String Engines:
 * 1. Pinched / Plucked String (Extended Karplus-Strong & Digital Waveguide)
 * 2. Tapped / Struck String (Hunt-Crossley Non-Linear Hammer & Fret-Tangent Contact)
 * 3. Bowed Violin / Cello (Helmholtz Stick-Slip Friction & Corpus Formants)
 * 4. Touched / Flageolet Harmonics & Sitar Javari Bridge Buzz
 * 5. Sympathetic String Array & Acoustic Soundboard Luthiery
 * 6. Dispersive Stiff String & Prepared Wire (Euler-Bernoulli 4th-Order PDE)
 */

// ============================================================================
// 1. SYNTHESIZER STATE & DEFAULT PARAMETERS
// ============================================================================
let audioCtx = null;
let audioBus = null;
let fxEngine = null;
let voiceManager = null;
let visualizerSuite = null;
let synthFramework = null;

let isAudioStarted = false;
let currentOctave = 3; // Base C3 (note 48)
let isRecording = false;
const activeHeldNotes = new Set();
let savedPatchA = null;

const synthParams = {
  mode: 'pinched_plucked', // 'pinched_plucked', 'tapped_struck', 'bowed_violin', 'touched_harmonic', 'sympathetic_array', 'stiff_dispersion'
  masterVolume: 0.75,
  glideTime: 20, // ms
  microtuningOffset: 0,
  pitchBendCents: 0,

  // Mode 1: Pinched / Plucked String (Karplus-Strong Waveguide)
  pluckPosition: 0.18,
  pinchWidth: 0.06,
  stringDamping: 0.32,
  stringStiffness: 0.0008,
  bodyResonance: 0.55,
  pickupPosition: 0.14,

  // Mode 2: Tapped / Struck String (Hammer-String Contact)
  tapPosition: 0.25,
  hammerHardness: 2.5,
  hammerMass: 0.40,
  tangentClick: 0.35,

  // Mode 3: Bowed String (Violin / Cello Helmholtz Stick-Slip)
  bowPressure: 0.55,
  bowVelocity: 0.65,
  bowPosition: 0.11,
  rosinGrit: 0.20,

  // Mode 4: Touched String (Flageolet Harmonics & Javari Fret Buzz)
  touchNodePos: 0.500,
  touchDamping: 0.55,
  fretBuzz: 0.20,
  harmonicShimmer: 0.50,

  // Mode 5: Sympathetic String Array & Acoustic Body
  sympatheticMix: 0.60,
  courseDetune: 0.40,
  bridgeCoupling: 0.55,
  bodySize: 1.15,

  // Mode 6: Dispersive Stiff String & Prepared Wire
  inharmonicityB: 0.003,
  stiffPartials: 20,
  stiffHfLoss: 0.30,
  tensionDrop: 0.20,

  // Super-Unison Stack & Sub-Bass
  unisonEnabled: true,
  unisonCount: 3,
  unisonDetune: 6,
  unisonStereo: 70,
  subLevel: 0.25,
  subOctave: 12,
  subWave: 'sine',

  // ADSR Amplitude Envelope
  attack: 0.005,
  decay: 0.90,
  sustain: 0.25,
  release: 0.65,

  // Multi-Mode Filter
  cutoff: 7500,
  resonance: 1.2,
  filterType: 'lowpass',

  // Modulation LFO
  modLfoRate: 0.8,
  modLfoDepth: 8,
  modLfoShape: 'sine',
  modLfoTarget: 'cutoff'
};

const fxParams = {
  driveAmount: 0.0,
  chorusMix: 0.18,
  chorusRate: 1.2,
  delayMix: 0.06,
  delayTime: 340,
  delayFeedback: 0.25,
  reverbMix: 0.32,
  reverbSize: 2.6
};

const arpParams = {
  enabled: false,
  mode: 'updown',
  rate: 120,
  division: 0.25,
  octaves: 2,
  gate: 0.8,
  swing: 0.0,
  scale: 'chromatic',
  heldNotes: [],
  currentStep: 0,
  lastStepTime: 0
};

const knobs = {};
const audioRecorder = new AudioRecorder();

window.synthParams = synthParams;
window.fxParams = fxParams;
window.arpParams = arpParams;

// ============================================================================
// 2. REGISTER STRING SYNTH LFO TARGETS & 3D VIBRATING STRING VISUALIZER
// ============================================================================
let lastLfoWavetableUpdateMs = 0;
let lastSympatheticUpdateMs = 0;
let lastBufferRebuildMs = 0;

function throttledBufferVoiceUpdate() {
  if (!voiceManager || voiceManager.activeVoices.size === 0) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (nowMs - lastBufferRebuildMs >= 110) {
    lastBufferRebuildMs = nowMs;
    voiceManager.updateActiveVoices(synthParams, true);
  }
}

function registerStringSynthLFOTargets() {
  // Helper for real-time zero-CPU native filter brightness modulation on buffer-based string modes
  const modulateBrightnessFilter = (modVal, scaleHz = 1800) => {
    if (fxEngine && fxEngine.filterNode && audioCtx) {
      const targetFreq = Math.max(80, Math.min(18000, (synthParams.cutoff || 7500) + modVal * scaleHz));
      fxEngine.filterNode.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.015);
    }
  };

  LFOModule.registerModeTargets('pinched_plucked', [
    {
      value: 'pluckPosition',
      label: 'Dest: Pluck Position (β)',
      handler: (modVal) => {
        const modP = Math.max(0.04, Math.min(0.49, (synthParams.pluckPosition || 0.18) + modVal * 0.18));
        renderStringExcitationCanvas({ ...synthParams, pluckPosition: modP });
        modulateBrightnessFilter(-modVal, 2200);
      }
    },
    {
      value: 'pinchWidth',
      label: 'Dest: Pinch Flesh Width',
      handler: (modVal) => {
        modulateBrightnessFilter(-modVal, 1800);
      }
    },
    {
      value: 'stringDamping',
      label: 'Dest: String Damping',
      handler: (modVal) => {
        modulateBrightnessFilter(-modVal, 2600);
      }
    },
    {
      value: 'bodyResonance',
      label: 'Dest: Body Resonance',
      handler: (modVal) => {
        if (fxEngine && fxEngine.filterNode && audioCtx) {
          const targetQ = Math.max(0.2, Math.min(14.0, (synthParams.resonance || 1.2) + modVal * 3.0));
          fxEngine.filterNode.Q.setTargetAtTime(targetQ, audioCtx.currentTime, 0.015);
        }
      }
    }
  ]);

  LFOModule.registerModeTargets('tapped_struck', [
    {
      value: 'tapPosition',
      label: 'Dest: Tap Strike Position',
      handler: (modVal) => {
        modulateBrightnessFilter(-modVal, 2000);
      }
    },
    {
      value: 'hammerHardness',
      label: 'Dest: Hammer Hardness (ρ)',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2800);
      }
    },
    {
      value: 'tangentClick',
      label: 'Dest: Fret/Tangent Click',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 1600);
      }
    }
  ]);

  LFOModule.registerModeTargets('bowed_violin', [
    {
      value: 'bowPressure',
      label: 'Dest: Bow Pressure',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2400);
      }
    },
    {
      value: 'bowVelocity',
      label: 'Dest: Bow Velocity',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 1800);
      }
    },
    {
      value: 'bowPosition',
      label: 'Dest: Bow Position (Ponticello/Tasto)',
      handler: (modVal) => {
        modulateBrightnessFilter(-modVal, 2500);
      }
    }
  ]);

  LFOModule.registerModeTargets('touched_harmonic', [
    {
      value: 'touchNodePos',
      label: 'Dest: Finger Touch Node (1/N)',
      handler: (modVal, { voiceManager: vm }) => {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (nowMs - lastLfoWavetableUpdateMs < 40) return;
        lastLfoWavetableUpdateMs = nowMs;
        const modN = Math.max(0.10, Math.min(0.50, (synthParams.touchNodePos || 0.500) + modVal * 0.15));
        if (vm) vm.updateActiveVoices({ ...synthParams, touchNodePos: modN });
      }
    },
    {
      value: 'fretBuzz',
      label: 'Dest: Fret / Javari Bridge Buzz',
      handler: (modVal, { voiceManager: vm }) => {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (nowMs - lastLfoWavetableUpdateMs < 40) return;
        lastLfoWavetableUpdateMs = nowMs;
        const modB = Math.max(0.0, Math.min(1.0, (synthParams.fretBuzz || 0.20) + modVal * 0.45));
        if (vm) vm.updateActiveVoices({ ...synthParams, fretBuzz: modB });
      }
    },
    {
      value: 'harmonicShimmer',
      label: 'Dest: Harmonic Shimmer',
      handler: (modVal, { voiceManager: vm }) => {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (nowMs - lastLfoWavetableUpdateMs < 40) return;
        lastLfoWavetableUpdateMs = nowMs;
        const modS = Math.max(0.0, Math.min(1.0, (synthParams.harmonicShimmer || 0.50) + modVal * 0.4));
        if (vm) vm.updateActiveVoices({ ...synthParams, harmonicShimmer: modS });
      }
    }
  ]);

  LFOModule.registerModeTargets('sympathetic_array', [
    {
      value: 'sympatheticMix',
      label: 'Dest: Sympathetic Resonance',
      handler: (modVal, { voiceManager: vm }) => {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (nowMs - lastLfoWavetableUpdateMs < 40) return;
        lastLfoWavetableUpdateMs = nowMs;
        const modM = Math.max(0.0, Math.min(1.0, (synthParams.sympatheticMix || 0.60) + modVal * 0.4));
        if (vm) vm.updateActiveVoices({ ...synthParams, sympatheticMix: modM });
      }
    },
    {
      value: 'courseDetune',
      label: 'Dest: Course Detune Beating',
      handler: (modVal, { voiceManager: vm }) => {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (nowMs - lastLfoWavetableUpdateMs < 40) return;
        lastLfoWavetableUpdateMs = nowMs;
        const modC = Math.max(0.0, Math.min(1.0, (synthParams.courseDetune || 0.40) + modVal * 0.4));
        if (vm) vm.updateActiveVoices({ ...synthParams, courseDetune: modC });
      }
    },
    {
      value: 'bodySize',
      label: 'Dest: Acoustic Body Size',
      handler: (modVal, { voiceManager: vm }) => {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (nowMs - lastLfoWavetableUpdateMs < 40) return;
        lastLfoWavetableUpdateMs = nowMs;
        const modS = Math.max(0.2, Math.min(2.0, (synthParams.bodySize || 1.15) + modVal * 0.5));
        if (vm) vm.updateActiveVoices({ ...synthParams, bodySize: modS });
      }
    }
  ]);

  LFOModule.registerModeTargets('stiff_dispersion', [
    {
      value: 'inharmonicityB',
      label: 'Dest: Inharmonicity (B)',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2200);
      }
    },
    {
      value: 'tensionDrop',
      label: 'Dest: Non-Linear Tension Drop',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 1500);
      }
    }
  ]);
}

// Custom 3D Vibrating String & Modal Standing-Wave Visualizer for Tab 1
let stringVizPhase = 0;
window.CustomPrimaryVisualizer = function (viz, w, h, sParams) {
  const ctx = viz.mainCtx;
  stringVizPhase += 0.06;

  // Compute RMS energy from analyser time-domain buffer
  let sum = 0;
  if (viz.timeData && viz.timeData.length > 0) {
    for (let i = 0; i < viz.timeData.length; i++) {
      const v = (viz.timeData[i] - 128) / 128.0;
      sum += v * v;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, viz.timeData.length));
  const vibAmp = (0.18 + rms * 1.8) * h * 0.35 * viz.attractorZoom;

  const mode = sParams.mode || 'pinched_plucked';
  let excitePos = 0.18;
  if (mode === 'pinched_plucked') excitePos = sParams.pluckPosition || 0.18;
  else if (mode === 'tapped_struck') excitePos = sParams.tapPosition || 0.25;
  else if (mode === 'bowed_violin') excitePos = sParams.bowPosition || 0.11;
  else if (mode === 'touched_harmonic') excitePos = sParams.touchNodePos || 0.333;

  const padX = w * 0.08;
  const stringLen = w - padX * 2;
  const cy = h * 0.52;

  // Draw Nut (left) and Bridge (right) anchors
  ctx.strokeStyle = 'rgba(0, 230, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, cy - 45); ctx.lineTo(padX, cy + 45);
  ctx.moveTo(w - padX, cy - 45); ctx.lineTo(w - padX, cy + 45);
  ctx.stroke();

  // Render 6 Modal Standing-Wave Ribbons in 3D perspective
  const numModes = 6;
  const numSegments = 96;
  for (let m = numModes; m >= 1; m--) {
    const modalWeight = Math.sin(m * Math.PI * excitePos) / Math.pow(m, 0.85);
    const zOffset = (m - 3.5) * 10 * Math.sin(viz.attractorRotX);
    const hue = (185 + m * 28) % 360;
    ctx.strokeStyle = m === 1 ? '#00e6ff' : `hsla(${hue}, 95%, 62%, ${0.28 + 0.5 / m})`;
    ctx.lineWidth = m === 1 ? 2.5 : 1.3;

    ctx.beginPath();
    for (let i = 0; i <= numSegments; i++) {
      const normX = i / numSegments;
      const sx = padX + normX * stringLen;
      const standingY = Math.sin(m * Math.PI * normX) * Math.cos(stringVizPhase * m) * modalWeight * vibAmp;
      const sy = cy + standingY + zOffset;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // Draw Excitation Point Marker (Pinch / Tap / Bow / Touch Node)
  const exX = padX + excitePos * stringLen;
  ctx.strokeStyle = '#ff0080';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(exX, cy, 7, 0, Math.PI * 2);
  ctx.moveTo(exX, cy - 35);
  ctx.lineTo(exX, cy + 35);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0, 230, 255, 0.8)';
  ctx.font = '11px monospace';
  ctx.fillText(`3D WAVEGUIDE STANDING MODES • MODE: ${mode.toUpperCase()} • EXCITATION β=${excitePos.toFixed(2)}`, 12, 18);
};

// Interactive 2D String Excitation & Pickup Position Canvas (Mode 1)
function renderStringExcitationCanvas(params = synthParams) {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('string-excitation-canvas-v2');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#070a10';
  ctx.fillRect(0, 0, w, h);

  const pluckPos = Math.max(0.04, Math.min(0.5, params.pluckPosition !== undefined ? params.pluckPosition : 0.18));
  const pickupPos = Math.max(0.05, Math.min(0.48, params.pickupPosition !== undefined ? params.pickupPosition : 0.14));

  const pad = 12;
  const len = w - pad * 2;
  const midY = h * 0.55;
  const pluckX = pad + pluckPos * len;
  const pluckY = h * 0.22;

  // Draw String Nut & Bridge
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, midY);
  ctx.lineTo(w - pad, midY);
  ctx.stroke();

  // Draw Triangular Pinched String Displacement Profile
  ctx.strokeStyle = '#00e6ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, midY);
  ctx.lineTo(pluckX, pluckY);
  ctx.lineTo(w - pad, midY);
  ctx.stroke();

  // Draw Pickup Sensor Marker
  const pickupX = pad + pickupPos * len;
  ctx.strokeStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(pickupX, midY - 14);
  ctx.lineTo(pickupX, midY + 14);
  ctx.stroke();

  // Draw Pinch Crosshair
  ctx.fillStyle = '#ff0080';
  ctx.beginPath();
  ctx.arc(pluckX, pluckY, 4.5, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================================
// 3. AUDIO ENGINE & FRAMEWORK LIFECYCLE
// ============================================================================
function initAudioEngine() {
  if (isAudioStarted && audioCtx) return;

  if (!synthFramework) {
    synthFramework = new SynthFramework({ synthParams, fxParams, arpParams, knobs });
  }
  synthFramework.visualizerSuite = visualizerSuite;

  synthFramework.initAudioEngine({
    onInitialized: (fw) => {
      audioCtx = fw.audioCtx;
      audioBus = fw.audioBus;
      fxEngine = fw.fxEngine;
      voiceManager = fw.voiceManager;
      visualizerSuite = fw.visualizerSuite;
      isAudioStarted = true;
    }
  });

  if (typeof FACTORY_PRESETS !== 'undefined' && FACTORY_PRESETS.length > 0) {
    loadPreset(FACTORY_PRESETS[0]);
  }
  setupWebMIDI();
}

// ============================================================================
// 4. DELEGATED MODULE ADAPTERS
// ============================================================================
function renderADSRCanvas() {
  EnvelopeModule.renderADSRCanvas(synthParams, 'adsr-canvas-v2');
}

function updateLFOTargetOptions(mode) {
  LFOModule.updateTargetOptions(mode, synthParams, 'lfo-target-select-v2');
}

function updateModulationLFO(nowTime) {
  LFOModule.updateModulation(nowTime, {
    isAudioStarted,
    audioCtx,
    synthParams,
    fxParams,
    fxEngine,
    voiceManager
  });
}

function updateArpeggiator(nowTime) {
  ArpeggiatorModule.update(nowTime, arpParams, synthParams, voiceManager, setPianoKeyActive);
}

function setPianoKeyActive(note, active) {
  PianoKeyboard.setKeyActive(note, active);
}

function generate2OctaveKeyboard() {
  PianoKeyboard.generate2OctaveKeyboard({
    containerId: 'piano-keyboard-v2',
    getOctave: () => currentOctave,
    onNoteOn: (note, velocity, keyEl) => {
      if (!audioCtx) initAudioEngine();
      if (arpParams.enabled) {
        if (!arpParams.heldNotes.includes(note)) arpParams.heldNotes.push(note);
      } else {
        voiceManager.playNote(note, velocity, synthParams);
        keyEl.classList.add('active');
      }
    },
    onNoteOff: (note, keyEl) => {
      if (arpParams.enabled) {
        arpParams.heldNotes = arpParams.heldNotes.filter(item => item !== note);
      } else {
        if (voiceManager) voiceManager.stopNote(note, false, synthParams);
        keyEl.classList.remove('active');
      }
    }
  });
}

function handleMIDIMessage(msg) {
  WebMIDIManager.handleMessage(msg, {
    ensureAudioEngine: () => { if (!audioCtx) initAudioEngine(); },
    getVoiceManager: () => voiceManager,
    synthParams,
    arpParams,
    onKeyVisual: setPianoKeyActive
  });
}

function setupWebMIDI() {
  WebMIDIManager.setup(handleMIDIMessage, 'btn-midi-v2');
}

function initAudioRecorder() {
  const btnRec = document.getElementById('btn-record-v2');
  if (!btnRec) return;

  btnRec.addEventListener('click', (e) => {
    if (!audioCtx) initAudioEngine();

    if (!isRecording) {
      audioRecorder.start(audioCtx, fxEngine);
      btnRec.innerText = '⏹️ Stop & Download WAV';
      btnRec.classList.add('recording');
      isRecording = true;
    } else {
      audioRecorder.stop();
      btnRec.innerText = '⏺️ Record Master WAV';
      btnRec.classList.remove('recording');
      isRecording = false;
    }
    if (e.target && e.target.blur) e.target.blur();
  });
}

function loadPreset(preset) {
  PresetManager.loadPreset(preset, {
    synthParams,
    fxParams,
    arpParams,
    syncKnobValuesFromParams,
    updateLFOTargetOptions,
    fxEngine,
    voiceManager,
    visualizerSuite
  });
  renderStringExcitationCanvas(synthParams);
}

// ============================================================================
// 5. ROTARY KNOBS BINDING & SYNCHRONIZATION
// ============================================================================
function initAllKnobs() {
  const bindKnob = RotaryKnob.bind;
  const formatTime = (v) => (v < 1.0 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)}s`);

  // 1. Mode 1: Pinched / Plucked String Knobs
  knobs.pluckPosition = bindKnob('knob-pluck-pos', 5, 50, Math.round((synthParams.pluckPosition || 0.18) * 100), 1, '%', (v) => {
    synthParams.pluckPosition = v / 100.0;
    renderStringExcitationCanvas(synthParams);
    throttledBufferVoiceUpdate();
  });
  knobs.pinchWidth = bindKnob('knob-pinch-width', 1, 25, Math.round((synthParams.pinchWidth || 0.06) * 100), 1, '%', (v) => {
    synthParams.pinchWidth = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.stringDamping = bindKnob('knob-string-damping', 5, 95, Math.round((synthParams.stringDamping || 0.32) * 100), 1, '%', (v) => {
    synthParams.stringDamping = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.bodyResonance = bindKnob('knob-body-res', 0, 100, Math.round((synthParams.bodyResonance || 0.55) * 100), 1, '%', (v) => {
    synthParams.bodyResonance = v / 100.0;
    throttledBufferVoiceUpdate();
  });

  // 2. Mode 2: Tapped / Struck String Knobs
  knobs.tapPosition = bindKnob('knob-tap-pos', 5, 50, Math.round((synthParams.tapPosition || 0.25) * 100), 1, '%', (v) => {
    synthParams.tapPosition = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.hammerHardness = bindKnob('knob-hammer-hardness', 1.2, 4.0, synthParams.hammerHardness || 2.5, 0.1, '', (v) => {
    synthParams.hammerHardness = v;
    throttledBufferVoiceUpdate();
  });
  knobs.hammerMass = bindKnob('knob-hammer-mass', 10, 100, Math.round((synthParams.hammerMass || 0.40) * 100), 1, '%', (v) => {
    synthParams.hammerMass = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.tangentClick = bindKnob('knob-tangent-click', 0, 100, Math.round((synthParams.tangentClick || 0.35) * 100), 1, '%', (v) => {
    synthParams.tangentClick = v / 100.0;
    throttledBufferVoiceUpdate();
  });

  // 3. Mode 3: Bowed Violin / Cello Knobs
  knobs.bowPressure = bindKnob('knob-bow-pressure', 5, 100, Math.round((synthParams.bowPressure || 0.55) * 100), 1, '%', (v) => {
    synthParams.bowPressure = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.bowVelocity = bindKnob('knob-bow-velocity', 5, 100, Math.round((synthParams.bowVelocity || 0.65) * 100), 1, '%', (v) => {
    synthParams.bowVelocity = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.bowPosition = bindKnob('knob-bow-position', 3, 45, Math.round((synthParams.bowPosition || 0.11) * 100), 1, '%', (v) => {
    synthParams.bowPosition = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.rosinGrit = bindKnob('knob-rosin-grit', 0, 100, Math.round((synthParams.rosinGrit || 0.20) * 100), 1, '%', (v) => {
    synthParams.rosinGrit = v / 100.0;
    throttledBufferVoiceUpdate();
  });

  // 4. Mode 4: Touched / Flageolet Harmonics Knobs
  knobs.touchNodePos = bindKnob('knob-touch-node', 0.10, 0.50, synthParams.touchNodePos || 0.500, 0.005, '', (v) => {
    synthParams.touchNodePos = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.touchDamping = bindKnob('knob-touch-damping', 0, 100, Math.round((synthParams.touchDamping || 0.55) * 100), 1, '%', (v) => {
    synthParams.touchDamping = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.fretBuzz = bindKnob('knob-fret-buzz', 0, 100, Math.round((synthParams.fretBuzz || 0.20) * 100), 1, '%', (v) => {
    synthParams.fretBuzz = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.harmonicShimmer = bindKnob('knob-harmonic-shimmer', 0, 100, Math.round((synthParams.harmonicShimmer || 0.50) * 100), 1, '%', (v) => {
    synthParams.harmonicShimmer = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });

  // 5. Mode 5: Sympathetic String Array Knobs
  knobs.sympatheticMix = bindKnob('knob-symp-mix', 0, 100, Math.round((synthParams.sympatheticMix || 0.60) * 100), 1, '%', (v) => {
    synthParams.sympatheticMix = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.courseDetune = bindKnob('knob-course-detune', 0, 100, Math.round((synthParams.courseDetune || 0.40) * 100), 1, '%', (v) => {
    synthParams.courseDetune = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.bridgeCoupling = bindKnob('knob-bridge-coupling', 0, 100, Math.round((synthParams.bridgeCoupling || 0.55) * 100), 1, '%', (v) => {
    synthParams.bridgeCoupling = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.bodySize = bindKnob('knob-body-size', 0.3, 2.0, synthParams.bodySize || 1.15, 0.05, 'x', (v) => {
    synthParams.bodySize = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });

  // 6. Mode 6: Stiff String Dispersion Knobs
  knobs.inharmonicityB = bindKnob('knob-stiff-b', 0.0, 0.06, synthParams.inharmonicityB || 0.003, 0.001, '', (v) => {
    synthParams.inharmonicityB = v;
    throttledBufferVoiceUpdate();
  });
  knobs.stiffPartials = bindKnob('knob-stiff-partials', 2, 32, synthParams.stiffPartials || 20, 1, '', (v) => {
    synthParams.stiffPartials = v;
    throttledBufferVoiceUpdate();
  });
  knobs.stiffHfLoss = bindKnob('knob-stiff-hfloss', 5, 100, Math.round((synthParams.stiffHfLoss || 0.30) * 100), 1, '%', (v) => {
    synthParams.stiffHfLoss = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.tensionDrop = bindKnob('knob-tension-drop', 0, 100, Math.round((synthParams.tensionDrop || 0.20) * 100), 1, '%', (v) => {
    synthParams.tensionDrop = v / 100.0;
    throttledBufferVoiceUpdate();
  });

  // 7. ADSR Amplitude Envelope Knobs
  knobs.adsrAttack = bindKnob('knob-adsr-attack', 0.002, 2.5, synthParams.attack || 0.005, 0.002, '', (v) => {
    synthParams.attack = v;
    renderADSRCanvas();
  }, formatTime);
  knobs.adsrDecay = bindKnob('knob-adsr-decay', 0.01, 3.0, synthParams.decay || 0.90, 0.01, '', (v) => {
    synthParams.decay = v;
    renderADSRCanvas();
  }, formatTime);
  knobs.adsrSustain = bindKnob('knob-adsr-sustain', 0, 100, Math.round((synthParams.sustain !== undefined ? synthParams.sustain : 0.25) * 100), 1, '%', (v) => {
    synthParams.sustain = v / 100.0;
    renderADSRCanvas();
  });
  knobs.adsrRelease = bindKnob('knob-adsr-release', 0.005, 4.0, synthParams.release || 0.65, 0.005, '', (v) => {
    synthParams.release = v;
    renderADSRCanvas();
  }, formatTime);

  // 8. Unison Stack & Sub-Bass Knobs
  knobs.unisonVoices = bindKnob('knob-unison-voices', 1, 7, synthParams.unisonCount || 3, 2, '', (v) => {
    synthParams.unisonCount = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);
  });
  knobs.unisonDetune = bindKnob('knob-unison-detune', 0, 50, synthParams.unisonDetune || 10, 1, ' ct', (v) => {
    synthParams.unisonDetune = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.unisonStereo = bindKnob('knob-unison-stereo', 0, 100, synthParams.unisonStereo || 70, 1, '%', (v) => {
    synthParams.unisonStereo = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.subLevel = bindKnob('knob-sub-level', 0, 100, Math.round((synthParams.subLevel || 0.25) * 100), 1, '%', (v) => {
    synthParams.subLevel = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.glideTime = bindKnob('knob-glide-time', 0, 500, synthParams.glideTime || 20, 5, ' ms', (v) => {
    synthParams.glideTime = v;
  });

  // 9. Modulation LFO Knobs
  knobs.lfoRate = bindKnob('knob-lfo-rate', 0.05, 20.0, synthParams.modLfoRate || 1.5, 0.05, ' Hz', (v) => {
    synthParams.modLfoRate = v;
  });
  knobs.lfoDepth = bindKnob('knob-lfo-depth', 0, 100, synthParams.modLfoDepth !== undefined ? synthParams.modLfoDepth : 20, 1, '%', (v) => {
    synthParams.modLfoDepth = v;
  });

  // 10. Studio Audio FX Knobs
  knobs.filterCutoff = bindKnob('knob-filter-cutoff', 50, 16000, synthParams.cutoff || 7500, 10, ' Hz', (v) => {
    synthParams.cutoff = v;
    if (fxEngine) fxEngine.updateParams(null, synthParams);
  });
  knobs.filterRes = bindKnob('knob-filter-res', 0.1, 15.0, synthParams.resonance || 1.2, 0.1, '', (v) => {
    synthParams.resonance = v;
    if (fxEngine) fxEngine.updateParams(null, synthParams);
  });
  knobs.fxDrive = bindKnob('knob-fx-drive', 0, 100, Math.round((fxParams.driveAmount || 0.0) * 100), 1, '%', (v) => {
    fxParams.driveAmount = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxChorusMix = bindKnob('knob-fx-chorus-mix', 0, 100, Math.round((fxParams.chorusMix || 0.22) * 100), 1, '%', (v) => {
    fxParams.chorusMix = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxDelayMix = bindKnob('knob-fx-delay-mix', 0, 100, Math.round((fxParams.delayMix || 0.20) * 100), 1, '%', (v) => {
    fxParams.delayMix = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxDelayTime = bindKnob('knob-fx-delay-time', 50, 1000, fxParams.delayTime || 340, 10, ' ms', (v) => {
    fxParams.delayTime = v;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxDelayFeedback = bindKnob('knob-fx-delay-feedback', 0, 90, Math.round((fxParams.delayFeedback !== undefined ? fxParams.delayFeedback : 0.35) * 100), 1, '%', (v) => {
    fxParams.delayFeedback = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxReverbMix = bindKnob('knob-fx-reverb-mix', 0, 100, Math.round((fxParams.reverbMix || 0.35) * 100), 1, '%', (v) => {
    fxParams.reverbMix = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxReverbSize = bindKnob('knob-fx-reverb-size', 0.5, 5.0, fxParams.reverbSize || 2.6, 0.1, 's', (v) => {
    fxParams.reverbSize = v;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });

  // 11. Arpeggiator Knobs
  knobs.arpBpm = bindKnob('knob-arp-bpm', 40, 240, arpParams.rate || 120, 1, ' BPM', (v) => {
    arpParams.rate = v;
  });
  knobs.arpOctaves = bindKnob('knob-arp-octaves', 1, 4, arpParams.octaves || 2, 1, '', (v) => {
    arpParams.octaves = v;
  });
  knobs.arpGate = bindKnob('knob-arp-gate', 10, 95, Math.round((arpParams.gate || 0.8) * 100), 1, '%', (v) => {
    arpParams.gate = v / 100.0;
  });
}

function syncKnobValuesFromParams() {
  if (knobs.pluckPosition && synthParams.pluckPosition !== undefined) knobs.pluckPosition.setValue(synthParams.pluckPosition * 100, false);
  if (knobs.pinchWidth && synthParams.pinchWidth !== undefined) knobs.pinchWidth.setValue(synthParams.pinchWidth * 100, false);
  if (knobs.stringDamping && synthParams.stringDamping !== undefined) knobs.stringDamping.setValue(synthParams.stringDamping * 100, false);
  if (knobs.bodyResonance && synthParams.bodyResonance !== undefined) knobs.bodyResonance.setValue(synthParams.bodyResonance * 100, false);

  if (knobs.tapPosition && synthParams.tapPosition !== undefined) knobs.tapPosition.setValue(synthParams.tapPosition * 100, false);
  if (knobs.hammerHardness && synthParams.hammerHardness !== undefined) knobs.hammerHardness.setValue(synthParams.hammerHardness, false);
  if (knobs.hammerMass && synthParams.hammerMass !== undefined) knobs.hammerMass.setValue(synthParams.hammerMass * 100, false);
  if (knobs.tangentClick && synthParams.tangentClick !== undefined) knobs.tangentClick.setValue(synthParams.tangentClick * 100, false);

  if (knobs.bowPressure && synthParams.bowPressure !== undefined) knobs.bowPressure.setValue(synthParams.bowPressure * 100, false);
  if (knobs.bowVelocity && synthParams.bowVelocity !== undefined) knobs.bowVelocity.setValue(synthParams.bowVelocity * 100, false);
  if (knobs.bowPosition && synthParams.bowPosition !== undefined) knobs.bowPosition.setValue(synthParams.bowPosition * 100, false);
  if (knobs.rosinGrit && synthParams.rosinGrit !== undefined) knobs.rosinGrit.setValue(synthParams.rosinGrit * 100, false);

  if (knobs.touchNodePos && synthParams.touchNodePos !== undefined) knobs.touchNodePos.setValue(synthParams.touchNodePos, false);
  if (typeof document !== 'undefined' && synthParams.touchNodePos !== undefined) {
    const tnSelect = document.getElementById('touch-node-select-v2');
    if (tnSelect) tnSelect.value = synthParams.touchNodePos.toFixed(3);
  }
  if (knobs.touchDamping && synthParams.touchDamping !== undefined) knobs.touchDamping.setValue(synthParams.touchDamping * 100, false);
  if (knobs.fretBuzz && synthParams.fretBuzz !== undefined) knobs.fretBuzz.setValue(synthParams.fretBuzz * 100, false);
  if (knobs.harmonicShimmer && synthParams.harmonicShimmer !== undefined) knobs.harmonicShimmer.setValue(synthParams.harmonicShimmer * 100, false);

  if (knobs.sympatheticMix && synthParams.sympatheticMix !== undefined) knobs.sympatheticMix.setValue(synthParams.sympatheticMix * 100, false);
  if (knobs.courseDetune && synthParams.courseDetune !== undefined) knobs.courseDetune.setValue(synthParams.courseDetune * 100, false);
  if (knobs.bridgeCoupling && synthParams.bridgeCoupling !== undefined) knobs.bridgeCoupling.setValue(synthParams.bridgeCoupling * 100, false);
  if (knobs.bodySize && synthParams.bodySize !== undefined) knobs.bodySize.setValue(synthParams.bodySize, false);

  if (knobs.inharmonicityB && synthParams.inharmonicityB !== undefined) knobs.inharmonicityB.setValue(synthParams.inharmonicityB, false);
  if (knobs.stiffPartials && synthParams.stiffPartials !== undefined) knobs.stiffPartials.setValue(synthParams.stiffPartials, false);
  if (knobs.stiffHfLoss && synthParams.stiffHfLoss !== undefined) knobs.stiffHfLoss.setValue(synthParams.stiffHfLoss * 100, false);
  if (knobs.tensionDrop && synthParams.tensionDrop !== undefined) knobs.tensionDrop.setValue(synthParams.tensionDrop * 100, false);

  if (knobs.adsrAttack && synthParams.attack !== undefined) knobs.adsrAttack.setValue(synthParams.attack, false);
  if (knobs.adsrDecay && synthParams.decay !== undefined) knobs.adsrDecay.setValue(synthParams.decay, false);
  if (knobs.adsrSustain && synthParams.sustain !== undefined) knobs.adsrSustain.setValue(synthParams.sustain * 100, false);
  if (knobs.adsrRelease && synthParams.release !== undefined) knobs.adsrRelease.setValue(synthParams.release, false);

  if (knobs.unisonVoices && synthParams.unisonCount !== undefined) knobs.unisonVoices.setValue(synthParams.unisonCount, false);
  if (knobs.unisonDetune && synthParams.unisonDetune !== undefined) knobs.unisonDetune.setValue(synthParams.unisonDetune, false);
  if (knobs.unisonStereo && synthParams.unisonStereo !== undefined) knobs.unisonStereo.setValue(synthParams.unisonStereo, false);
  if (knobs.subLevel && synthParams.subLevel !== undefined) knobs.subLevel.setValue(synthParams.subLevel * 100, false);
  if (knobs.glideTime && synthParams.glideTime !== undefined) knobs.glideTime.setValue(synthParams.glideTime, false);

  if (knobs.lfoRate && synthParams.modLfoRate !== undefined) knobs.lfoRate.setValue(synthParams.modLfoRate, false);
  if (knobs.lfoDepth && synthParams.modLfoDepth !== undefined) knobs.lfoDepth.setValue(synthParams.modLfoDepth, false);

  if (knobs.filterCutoff && synthParams.cutoff !== undefined) knobs.filterCutoff.setValue(synthParams.cutoff, false);
  if (knobs.filterRes && synthParams.resonance !== undefined) knobs.filterRes.setValue(synthParams.resonance, false);

  if (knobs.fxDrive && fxParams.driveAmount !== undefined) knobs.fxDrive.setValue(fxParams.driveAmount * 100, false);
  if (knobs.fxChorusMix && fxParams.chorusMix !== undefined) knobs.fxChorusMix.setValue(fxParams.chorusMix * 100, false);
  if (knobs.fxDelayMix && fxParams.delayMix !== undefined) knobs.fxDelayMix.setValue(fxParams.delayMix * 100, false);
  if (knobs.fxDelayTime && fxParams.delayTime !== undefined) knobs.fxDelayTime.setValue(fxParams.delayTime, false);
  if (knobs.fxDelayFeedback && fxParams.delayFeedback !== undefined) knobs.fxDelayFeedback.setValue(fxParams.delayFeedback * 100, false);
  if (knobs.fxReverbMix && fxParams.reverbMix !== undefined) knobs.fxReverbMix.setValue(fxParams.reverbMix * 100, false);
  if (knobs.fxReverbSize && fxParams.reverbSize !== undefined) knobs.fxReverbSize.setValue(fxParams.reverbSize, false);

  renderADSRCanvas();
}

function initPresetUI() {
  const select = document.getElementById('preset-select-v2');
  if (!select) return;
  select.innerHTML = '';

  FACTORY_PRESETS.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.innerText = `[${p.category}] ${p.name}`;
    select.appendChild(opt);
  });

  select.addEventListener('change', (e) => {
    const p = FACTORY_PRESETS.find(item => item.id === e.target.value);
    if (p) loadPreset(p);
    e.target.blur();
  });

  const btnMutate = document.getElementById('btn-mutate-v2');
  if (btnMutate) {
    btnMutate.addEventListener('click', (e) => {
      const amount = 0.25;
      PresetManager.mutatePatch(synthParams, amount);
      synthParams.pluckPosition = parseFloat(Math.max(0.05, Math.min(0.48, (synthParams.pluckPosition || 0.18) + (Math.random() * 2 - 1) * 0.12)).toFixed(2));
      synthParams.bowPressure = parseFloat(Math.max(0.1, Math.min(1.0, (synthParams.bowPressure || 0.55) + (Math.random() * 2 - 1) * 0.2)).toFixed(2));
      synthParams.touchNodePos = parseFloat(Math.max(0.12, Math.min(0.5, (synthParams.touchNodePos || 0.333) + (Math.random() * 2 - 1) * 0.1)).toFixed(3));
      synthParams.inharmonicityB = parseFloat(Math.max(0.0002, Math.min(0.05, (synthParams.inharmonicityB || 0.003) * (1 + (Math.random() * 2 - 1) * amount))).toFixed(4));

      syncKnobValuesFromParams();
      renderStringExcitationCanvas(synthParams);
      if (fxEngine) fxEngine.updateParams(fxParams, synthParams);
      if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);

      const lblPreset = document.getElementById('lbl-current-preset-v2');
      if (lblPreset) lblPreset.innerText = '🎲 Mutated Patch (25%)';
      e.target.blur();
    });
  }

  const btnSaveA = document.getElementById('btn-save-a-v2');
  const btnSaveB = document.getElementById('btn-save-b-v2');
  if (btnSaveA) {
    btnSaveA.addEventListener('click', (e) => {
      savedPatchA = JSON.parse(JSON.stringify(synthParams));
      btnSaveA.innerText = '✓ State A Saved';
      setTimeout(() => { btnSaveA.innerText = '💾 Save State A'; }, 2000);
      e.target.blur();
    });
  }
  if (btnSaveB) {
    btnSaveB.addEventListener('click', (e) => {
      if (savedPatchA) {
        loadPreset({ name: 'Audition State A', params: savedPatchA });
      }
      e.target.blur();
    });
  }
}

function setupUIEventListeners() {
  const btnStart = document.getElementById('btn-audio-start-v2');
  if (btnStart) {
    btnStart.addEventListener('click', (e) => {
      initAudioEngine();
      e.target.blur();
    });
  }

  const btnOctDown = document.getElementById('btn-oct-down-v2');
  if (btnOctDown) {
    btnOctDown.addEventListener('click', (e) => {
      if (currentOctave > 1) {
        currentOctave--;
        document.getElementById('lbl-octave-v2').innerText = `Octave: C${currentOctave}`;
        generate2OctaveKeyboard();
      }
      e.target.blur();
    });
  }

  const btnOctUp = document.getElementById('btn-oct-up-v2');
  if (btnOctUp) {
    btnOctUp.addEventListener('click', (e) => {
      if (currentOctave < 6) {
        currentOctave++;
        document.getElementById('lbl-octave-v2').innerText = `Octave: C${currentOctave}`;
        generate2OctaveKeyboard();
      }
      e.target.blur();
    });
  }

  document.querySelectorAll('input[name="synth-mode-v2"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      synthParams.mode = e.target.value;
      document.querySelectorAll('.mode-panel-v2').forEach(p => p.classList.add('hidden'));
      const target = document.getElementById(`panel-${e.target.value}-v2`);
      if (target) target.classList.remove('hidden');
      updateLFOTargetOptions(e.target.value);
      if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);
      e.target.blur();
    });
  });

  // Mode 1: Interactive 2D String Excitation Canvas
  const sCanvas = document.getElementById('string-excitation-canvas-v2');
  if (sCanvas) {
    let isDragging = false;
    const updateStringExcitation = (e) => {
      const rect = sCanvas.getBoundingClientRect();
      const nx = Math.max(0.04, Math.min(0.50, ((e.clientX - rect.left) / Math.max(1, rect.width)) * 0.5));
      const ny = Math.max(0.05, Math.min(0.48, ((e.clientY - rect.top) / Math.max(1, rect.height)) * 0.48));
      synthParams.pluckPosition = parseFloat(nx.toFixed(2));
      synthParams.pickupPosition = parseFloat(ny.toFixed(2));
      if (knobs.pluckPosition) knobs.pluckPosition.setValue(synthParams.pluckPosition * 100, false);
      renderStringExcitationCanvas(synthParams);
      throttledBufferVoiceUpdate();
    };
    sCanvas.addEventListener('mousedown', (e) => { isDragging = true; updateStringExcitation(e); });
    window.addEventListener('mousemove', (e) => { if (isDragging) updateStringExcitation(e); });
    window.addEventListener('mouseup', () => { isDragging = false; });
  }

  // Mode 4: Touch Node Preset Ratio Dropdown
  const touchNodeSelect = document.getElementById('touch-node-select-v2');
  if (touchNodeSelect) {
    touchNodeSelect.addEventListener('change', (e) => {
      synthParams.touchNodePos = parseFloat(e.target.value) || 0.333;
      if (knobs.touchNodePos) knobs.touchNodePos.setValue(synthParams.touchNodePos, false);
      if (voiceManager) voiceManager.updateActiveVoices(synthParams);
      e.target.blur();
    });
  }

  const subWaveSelect = document.getElementById('sub-wave-select-v2');
  if (subWaveSelect) {
    subWaveSelect.addEventListener('change', (e) => {
      synthParams.subWave = e.target.value;
      if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);
      e.target.blur();
    });
  }

  const subOctSelect = document.getElementById('sub-octave-select-v2');
  if (subOctSelect) {
    subOctSelect.addEventListener('change', (e) => {
      synthParams.subOctave = parseInt(e.target.value) || 12;
      if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);
      e.target.blur();
    });
  }

  const arpModeSelect = document.getElementById('arp-mode-select-v2');
  if (arpModeSelect) {
    arpModeSelect.addEventListener('change', (e) => {
      arpParams.mode = e.target.value;
      e.target.blur();
    });
  }

  const lfoShapeSelect = document.getElementById('lfo-shape-select-v2');
  if (lfoShapeSelect) {
    lfoShapeSelect.addEventListener('change', (e) => {
      synthParams.modLfoShape = e.target.value;
      e.target.blur();
    });
  }

  const lfoTargetSelect = document.getElementById('lfo-target-select-v2');
  if (lfoTargetSelect) {
    lfoTargetSelect.addEventListener('change', (e) => {
      synthParams.modLfoTarget = e.target.value;
      e.target.blur();
    });
  }

  const filterTypeSelect = document.getElementById('filter-type-select-v2');
  if (filterTypeSelect) {
    filterTypeSelect.addEventListener('change', (e) => {
      synthParams.filterType = e.target.value;
      if (fxEngine) fxEngine.updateParams(null, synthParams);
      e.target.blur();
    });
  }

  const toggleUnison = document.getElementById('toggle-unison-v2');
  if (toggleUnison) {
    toggleUnison.addEventListener('change', (e) => {
      synthParams.unisonEnabled = e.target.checked;
      if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);
      e.target.blur();
    });
  }

  const toggleMasterFX = document.getElementById('toggle-fx-master-v2');
  if (toggleMasterFX) {
    toggleMasterFX.addEventListener('change', (e) => {
      fxParams.fxEnabled = e.target.checked;
      if (fxEngine) {
        fxEngine.setMasterFXBypass(!e.target.checked, fxParams, synthParams);
      }
      e.target.blur();
    });
  }

  const volSlider = document.getElementById('master-volume-v2');
  if (volSlider) {
    const handleVol = (e) => {
      synthParams.masterVolume = e.target.value / 100.0;
      if (audioBus) {
        audioBus.setMasterVolume(synthParams.masterVolume);
      } else if (fxEngine && fxEngine.masterGain) {
        fxEngine.masterGain.gain.setTargetAtTime(synthParams.masterVolume, audioCtx ? audioCtx.currentTime : 0, 0.01);
      }
      const valBadge = document.getElementById('volume-val-v2');
      if (valBadge) valBadge.innerText = `${e.target.value}%`;
    };
    volSlider.addEventListener('input', handleVol);
    volSlider.addEventListener('change', (e) => { handleVol(e); e.target.blur(); });
  }

  const toggleArp = document.getElementById('toggle-arp-v2');
  if (toggleArp) {
    toggleArp.addEventListener('change', (e) => {
      arpParams.enabled = e.target.checked;
      arpParams.heldNotes = [];
      e.target.blur();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat || isTypingInText(e.target)) return;
    const semitone = PianoKeyboard.getSemitoneForKeyCode(e.code);

    if (semitone !== undefined) {
      e.preventDefault();
      const baseNote = currentOctave * 12 + 12;
      const note = baseNote + semitone;
      if (!activeHeldNotes.has(note)) {
        activeHeldNotes.add(note);
        if (arpParams.enabled) {
          if (!arpParams.heldNotes.includes(note)) arpParams.heldNotes.push(note);
        } else {
          if (!audioCtx) initAudioEngine();
          voiceManager.playNote(note, 0.85, synthParams);
          setPianoKeyActive(note, true);
        }
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (isTypingInText(e.target)) return;
    const semitone = PianoKeyboard.getSemitoneForKeyCode(e.code);

    if (semitone !== undefined) {
      e.preventDefault();
      const baseNote = currentOctave * 12 + 12;
      const note = baseNote + semitone;
      if (activeHeldNotes.has(note)) {
        activeHeldNotes.delete(note);
        if (arpParams.enabled) {
          arpParams.heldNotes = arpParams.heldNotes.filter(n => n !== note);
        } else {
          if (voiceManager) voiceManager.stopNote(note, false, synthParams);
          setPianoKeyActive(note, false);
        }
      }
    }
  });
}

function startMainAnimationLoop() {
  function loop(timestamp) {
    try {
      const nowTime = timestamp / 1000.0;
      updateArpeggiator(nowTime);
      updateModulationLFO(nowTime);

      // Continuous sympathetic string beating wave evolution (throttled to ~20 FPS to save CPU)
      if (voiceManager && isAudioStarted && synthParams.mode === 'sympathetic_array' && voiceManager.activeVoices.size > 0) {
        if (timestamp - lastSympatheticUpdateMs >= 50) {
          lastSympatheticUpdateMs = timestamp;
          const sympWave = SympatheticStringEngine.createSympatheticWave(audioCtx, synthParams, timestamp);
          if (sympWave) {
            for (const voiceObj of voiceManager.activeVoices.values()) {
              if (voiceObj.currentMode === 'sympathetic_array') {
                for (const uNode of voiceObj.unisonNodes) {
                  if (uNode.osc) {
                    try { uNode.osc.setPeriodicWave(sympWave); } catch (e) {}
                  }
                }
              }
            }
          }
        }
      }

      if (visualizerSuite) {
        visualizerSuite.render(synthParams);
      }
    } catch (err) {
      console.error('Animation loop error:', err);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function bootstrapStringApp() {
  if (window.__stringSynthAppInitialized) return;
  window.__stringSynthAppInitialized = true;

  registerStringSynthLFOTargets();
  synthFramework = new SynthFramework({ synthParams, fxParams, arpParams, knobs });
  generate2OctaveKeyboard();
  initAllKnobs();
  renderStringExcitationCanvas(synthParams);
  visualizerSuite = new VisualizerSuite(null, null, null);
  initPresetUI();
  if (typeof FACTORY_PRESETS !== 'undefined' && FACTORY_PRESETS.length > 0) {
    loadPreset(FACTORY_PRESETS[0]);
  }
  initAudioRecorder();
  setupUIEventListeners();
  startMainAnimationLoop();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapStringApp);
} else {
  bootstrapStringApp();
}
