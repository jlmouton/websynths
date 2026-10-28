/**
 * DX7 & Dexed 80s FM Pianos v1.0 — Application Bootstrap & Module Wiring
 *
 * Connects the shared SynthFramework, AudioBus, EnvelopeModule, DetuneModule,
 * LFOModule, ArpeggiatorModule, AudioFXEngine, and VisualizerSuite to the
 * 6 Musician-Friendly Yamaha DX7 / Dexed 6-Operator Phase-Modulation Engines:
 * 1. Classic DX7 E.Piano 1 (Algorithm 5: 3 Parallel 2-Op Stacks — Body/Bark, 14:1 Tines, Hammer Click)
 * 2. 80s Crystal Bell & Celeste (Algorithm 14: Cascaded 3-Op Bell Tower + Warm Body)
 * 3. FM Wurlitzer 200A & Barking Reed (Algorithm 4: 2:1 & 3:1 Odd-Harmonic Reed Bite)
 * 4. LA Studio TX816 Stereo Stack (Multi-Rack Detuned Foster Love-Ballad Stack)
 * 5. Soft Rounded Ballad EP & Dream Pad (Algorithm 16: Velvet Softness & Blooming Harmonics)
 * 6. Sharp-Attack CP-80, FM Clav & Hollow Mallet (Algorithm 7: Snappy Transient & Hollow Ratios)
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
  mode: 'dx7_epiano1', // 'dx7_epiano1', 'fm_crystal_bell', 'fm_wurli_reed', 'fm_tx816_stack', 'fm_lush_pad_ep', 'fm_perc_clav'
  masterVolume: 0.78,
  glideTime: 0, // ms
  microtuningOffset: 0,
  pitchBendCents: 0,

  // Mode 1: Classic DX7 E.Piano 1 (Algorithm 5)
  tineChime: 0.68,
  fmBark: 0.42,
  hammerClick: 0.35,
  tineDecay: 0.55,

  // Mode 2: 80s Crystal Bell & Celeste (Algorithm 14)
  bellRatio: 7.0,
  bellRoundness: 0.55,
  cascadeShimmer: 0.48,
  warmPadMix: 0.65,

  // Mode 3: FM Wurlitzer 200A & Barking Reed (Algorithm 4)
  reedBite: 0.62,
  reedBuzz: 0.45,
  tremoloDepth: 0.40,
  woodBody: 0.65,

  // Mode 4: LA Studio TX816 Stereo Stack (80s Love Ballad)
  stackSpread: 0.80,
  fosterGlass: 0.75,
  balladWarmth: 0.80,
  attackSnap: 0.50,

  // Mode 5: Soft Rounded Ballad EP & Dream Pad (Algorithm 16)
  toneSoftness: 0.75,
  bellBloom: 0.60,
  subWarmth: 0.70,
  airHalo: 0.52,

  // Mode 6: Sharp-Attack CP-80, FM Clav & Hollow Mallet (Algorithm 7)
  attackSharpness: 0.75,
  hollowRatio: 3.0,
  stringBrilliance: 0.60,
  damperTightness: 0.60,

  // Super-Unison Stack & Sub-Bass (off by default for pure FM piano clarity)
  unisonEnabled: false,
  unisonCount: 3,
  unisonDetune: 7,
  unisonStereo: 70,
  subLevel: 0.0,
  subOctave: 12,
  subWave: 'sine',

  // ADSR Amplitude Envelope
  attack: 0.003,
  decay: 1.35,
  sustain: 0.32,
  release: 0.85,

  // Multi-Mode Filter
  cutoff: 11500,
  resonance: 1.0,
  filterType: 'lowpass',

  // Modulation LFO
  modLfoRate: 0.85,
  modLfoDepth: 8,
  modLfoShape: 'sine',
  modLfoTarget: 'tineChime'
};

const fxParams = {
  driveAmount: 0.0,
  chorusMix: 0.0,
  chorusRate: 1.1,
  delayMix: 0.10,
  delayTime: 360,
  delayFeedback: 0.28,
  reverbMix: 0.34,
  reverbSize: 2.8
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
// 2. REGISTER FM PIANO LFO TARGETS & 3D DX7 OPERATOR VISUALIZER
// ============================================================================
let lastBufferRebuildMs = 0;

function throttledBufferVoiceUpdate() {
  if (!voiceManager || voiceManager.activeVoices.size === 0) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (nowMs - lastBufferRebuildMs >= 110) {
    lastBufferRebuildMs = nowMs;
    voiceManager.updateActiveVoices(synthParams, true);
  }
}

function registerFMPianoLFOTargets() {
  const modulateBrightnessFilter = (modVal, scaleHz = 2200) => {
    if (fxEngine && fxEngine.filterNode && audioCtx) {
      const targetFreq = Math.max(120, Math.min(18000, (synthParams.cutoff || 11500) + modVal * scaleHz));
      fxEngine.filterNode.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.015);
    }
  };

  LFOModule.registerModeTargets('dx7_epiano1', [
    {
      value: 'tineChime',
      label: 'Dest: Tine Bell Chime (14:1)',
      handler: (modVal) => {
        const modChime = Math.max(0.0, Math.min(1.0, (synthParams.tineChime || 0.68) + modVal * 0.25));
        renderFMAlgorithmCanvas({ ...synthParams, tineChime: modChime });
        modulateBrightnessFilter(modVal, 2600);
      }
    },
    {
      value: 'fmBark',
      label: 'Dest: Fundamental Bark & Warmth',
      handler: (modVal) => {
        const modBark = Math.max(0.0, Math.min(1.0, (synthParams.fmBark || 0.42) + modVal * 0.25));
        renderFMAlgorithmCanvas({ ...synthParams, fmBark: modBark });
        modulateBrightnessFilter(modVal, 1800);
      }
    },
    {
      value: 'hammerClick',
      label: 'Dest: Hammer Attack Click',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 1500);
      }
    },
    {
      value: 'tineDecay',
      label: 'Dest: Tine Overtone Decay',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 1600);
      }
    }
  ]);

  LFOModule.registerModeTargets('fm_crystal_bell', [
    {
      value: 'bellRatio',
      label: 'Dest: Bell Harmonic Ratio (C:M)',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2800);
      }
    },
    {
      value: 'bellRoundness',
      label: 'Dest: Bell Roundness / Softness',
      handler: (modVal) => {
        modulateBrightnessFilter(-modVal, 2400);
      }
    },
    {
      value: 'cascadeShimmer',
      label: 'Dest: Cascade Overtone Halo',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2500);
      }
    },
    {
      value: 'warmPadMix',
      label: 'Dest: Warm Body Foundation',
      handler: (modVal) => {
        modulateBrightnessFilter(-modVal, 1500);
      }
    }
  ]);

  LFOModule.registerModeTargets('fm_wurli_reed', [
    {
      value: 'reedBite',
      label: 'Dest: Reed Bite & Odd-Harmonic Growl',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2600);
      }
    },
    {
      value: 'reedBuzz',
      label: 'Dest: Reed Harmonic Buzz (Op 6 FB)',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2200);
      }
    },
    {
      value: 'tremoloDepth',
      label: 'Dest: Stereo Vibrato Depth',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 1600);
      }
    },
    {
      value: 'woodBody',
      label: 'Dest: Warm Cabinet Resonance',
      handler: (modVal) => {
        if (fxEngine && fxEngine.filterNode && audioCtx) {
          const targetQ = Math.max(0.2, Math.min(12.0, (synthParams.resonance || 1.2) + modVal * 2.5));
          fxEngine.filterNode.Q.setTargetAtTime(targetQ, audioCtx.currentTime, 0.015);
        }
      }
    }
  ]);

  LFOModule.registerModeTargets('fm_tx816_stack', [
    {
      value: 'stackSpread',
      label: 'Dest: Stereo Rack Width',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 1800);
      }
    },
    {
      value: 'fosterGlass',
      label: 'Dest: Glassy Dual Tines (7x+14x)',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2800);
      }
    },
    {
      value: 'balladWarmth',
      label: 'Dest: Ballad Body Warmth',
      handler: (modVal) => {
        modulateBrightnessFilter(-modVal, 1800);
      }
    },
    {
      value: 'attackSnap',
      label: 'Dest: Layered Hammer Snap',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2000);
      }
    }
  ]);

  LFOModule.registerModeTargets('fm_lush_pad_ep', [
    {
      value: 'toneSoftness',
      label: 'Dest: Velvet Tone Softness',
      handler: (modVal) => {
        modulateBrightnessFilter(-modVal, 2400);
      }
    },
    {
      value: 'bellBloom',
      label: 'Dest: Harmonic Bell Bloom',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2200);
      }
    },
    {
      value: 'subWarmth',
      label: 'Dest: Sub-Octave Pad Warmth',
      handler: (modVal) => {
        modulateBrightnessFilter(-modVal, 1600);
      }
    },
    {
      value: 'airHalo',
      label: 'Dest: Celestial Air Halo (4x+6x)',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2600);
      }
    }
  ]);

  LFOModule.registerModeTargets('fm_perc_clav', [
    {
      value: 'attackSharpness',
      label: 'Dest: Strike / Pick Sharpness',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2800);
      }
    },
    {
      value: 'hollowRatio',
      label: 'Dest: Hollow Harmonic Ratio (C:M)',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2200);
      }
    },
    {
      value: 'stringBrilliance',
      label: 'Dest: String Feedback Brilliance',
      handler: (modVal) => {
        modulateBrightnessFilter(modVal, 2500);
      }
    },
    {
      value: 'damperTightness',
      label: 'Dest: Transient Damper Tightness',
      handler: (modVal) => {
        modulateBrightnessFilter(-modVal, 1800);
      }
    }
  ]);
}

// Custom 3D DX7 6-Operator Phase-Modulation & Bessel Sideband Visualizer for Tab 1
let fmVizPhase = 0;
window.CustomPrimaryVisualizer = function (viz, w, h, sParams) {
  const ctx = viz.mainCtx;
  fmVizPhase += 0.05;

  let sum = 0;
  if (viz.timeData && viz.timeData.length > 0) {
    for (let i = 0; i < viz.timeData.length; i++) {
      const v = (viz.timeData[i] - 128) / 128.0;
      sum += v * v;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, viz.timeData.length));
  const mode = sParams.mode || 'dx7_epiano1';

  // Determine effective modulation index & bell brilliance from current mode
  let modIdx = 0.5;
  let chimeAmt = 0.6;
  let algLabel = '6-OP FM ALG 5 (3×2-OP TINES)';
  if (mode === 'dx7_epiano1') {
    modIdx = sParams.fmBark !== undefined ? sParams.fmBark : 0.42;
    chimeAmt = sParams.tineChime !== undefined ? sParams.tineChime : 0.68;
    algLabel = 'ALG 5 • [OP2→OP1 BODY] + [OP4(14x)→OP3 TINES] + [OP6→OP5 CLICK]';
  } else if (mode === 'fm_crystal_bell') {
    modIdx = 1.0 - (sParams.bellRoundness !== undefined ? sParams.bellRoundness : 0.55) * 0.7;
    chimeAmt = sParams.cascadeShimmer !== undefined ? sParams.cascadeShimmer : 0.48;
    algLabel = `ALG 14 • CASCADED BELL TOWER (RATIO 1:${(sParams.bellRatio || 7).toFixed(1)})`;
  } else if (mode === 'fm_wurli_reed') {
    modIdx = sParams.reedBite !== undefined ? sParams.reedBite : 0.62;
    chimeAmt = sParams.reedBuzz !== undefined ? sParams.reedBuzz : 0.45;
    algLabel = 'ALG 4 • ODD-HARMONIC REED STACK (2:1 + 3:1 BARK)';
  } else if (mode === 'fm_tx816_stack') {
    modIdx = sParams.balladWarmth !== undefined ? sParams.balladWarmth : 0.80;
    chimeAmt = sParams.fosterGlass !== undefined ? sParams.fosterGlass : 0.75;
    algLabel = 'MULTI-RACK STEREO BALLAD STACK (7x + 14x DUAL TINES)';
  } else if (mode === 'fm_lush_pad_ep') {
    modIdx = 1.0 - (sParams.toneSoftness !== undefined ? sParams.toneSoftness : 0.75) * 0.7;
    chimeAmt = sParams.bellBloom !== undefined ? sParams.bellBloom : 0.60;
    algLabel = 'ALG 16 • VELVET ROUNDED EP & BLOOMING BELL HALO';
  } else if (mode === 'fm_perc_clav') {
    modIdx = sParams.attackSharpness !== undefined ? sParams.attackSharpness : 0.75;
    chimeAmt = sParams.stringBrilliance !== undefined ? sParams.stringBrilliance : 0.60;
    algLabel = `ALG 7 • SHARP ELECTRIC GRAND / CLAV (HOLLOW RATIO 1:${(sParams.hollowRatio || 3).toFixed(1)})`;
  }

  const padX = w * 0.08;
  const spanW = w - padX * 2;
  const baseY = h * 0.74;

  // 1. Draw 3D Perspective Bessel J_n(I_m) Harmonic Sideband Bars
  const numSidebands = 16;
  const barStep = spanW / numSidebands;
  for (let k = 1; k <= numSidebands; k++) {
    const x = padX + (k - 0.5) * barStep;
    const isTinePartial = (k === 7 || k === 14);
    const sidebandWeight = isTinePartial
      ? (0.35 + chimeAmt * 0.65)
      : Math.exp(-Math.pow((k - 1) / (1.8 + modIdx * 6.5), 1.45));
    const livePulse = 1.0 + 0.25 * Math.sin(fmVizPhase * 1.4 + k * 0.6);
    const barHeight = Math.min(h * 0.55, (0.12 + rms * 2.2) * h * 0.48 * sidebandWeight * livePulse * viz.attractorZoom);

    ctx.fillStyle = isTinePartial
      ? 'rgba(255, 0, 128, 0.78)'
      : `hsla(${188 + k * 8}, 92%, 58%, 0.65)`;
    ctx.fillRect(x - barStep * 0.28, baseY - barHeight, barStep * 0.56, barHeight);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '9px monospace';
    ctx.fillText(`${k}f`, x - 6, baseY + 13);
  }

  // 2. Overlay Phase-Modulated FM Carrier Waveform Ribbon in 3D space
  const cy = h * 0.36;
  const waveAmp = (0.14 + rms * 1.4) * h * 0.22;
  ctx.strokeStyle = '#00e6ff';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  const numPts = 120;
  for (let i = 0; i <= numPts; i++) {
    const norm = i / numPts;
    const px = padX + norm * spanW;
    const theta = norm * Math.PI * 4 + fmVizPhase;
    const modSignal = Math.sin(theta) * modIdx * 2.2 + Math.sin(theta * 7) * chimeAmt * 0.85;
    const py = cy + Math.sin(theta + modSignal) * waveAmp;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(0, 230, 255, 0.85)';
  ctx.font = '11px monospace';
  ctx.fillText(algLabel, 12, 18);
};

// Interactive 2D DX7 6-Operator Algorithm 5 & Bessel Sideband Canvas (Mode 1)
function renderFMAlgorithmCanvas(params = synthParams) {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('fm-algorithm-canvas-v2');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#070a10';
  ctx.fillRect(0, 0, w, h);

  const chime = Math.max(0.0, Math.min(1.0, params.tineChime !== undefined ? params.tineChime : 0.68));
  const bark = Math.max(0.0, Math.min(1.0, params.fmBark !== undefined ? params.fmBark : 0.42));

  // Draw 3 parallel DX7 Algorithm 5 stacks: [Op2->Op1], [Op4->Op3], [Op6->Op5]
  const cols = [w * 0.22, w * 0.50, w * 0.78];
  const modY = h * 0.26;
  const carY = h * 0.72;
  const labelsMod = ['OP2 (1x)', 'OP4 (14x)', 'OP6 (9x)'];
  const labelsCar = ['OP1 Body', 'OP3 Tine', 'OP5 Click'];

  for (let c = 0; c < 3; c++) {
    const cx = cols[c];
    // Arrow line from Modulator to Carrier
    ctx.strokeStyle = c === 1 ? 'rgba(255, 0, 128, 0.75)' : 'rgba(0, 230, 255, 0.65)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, modY + 10);
    ctx.lineTo(cx, carY - 10);
    ctx.stroke();

    // Modulator box (top)
    ctx.fillStyle = c === 1 ? `rgba(255, 0, 128, ${0.22 + chime * 0.55})` : `rgba(0, 230, 255, ${0.18 + bark * 0.55})`;
    ctx.strokeStyle = c === 1 ? '#ff0080' : '#00e6ff';
    ctx.lineWidth = 1.2;
    ctx.fillRect(cx - 18, modY - 10, 36, 18);
    if (ctx.strokeRect) ctx.strokeRect(cx - 18, modY - 10, 36, 18);

    // Carrier box (bottom)
    ctx.fillStyle = 'rgba(0, 230, 255, 0.20)';
    ctx.strokeStyle = '#00e6ff';
    ctx.fillRect(cx - 18, carY - 10, 36, 18);
    if (ctx.strokeRect) ctx.strokeRect(cx - 18, carY - 10, 36, 18);

    ctx.fillStyle = '#e2f1ff';
    ctx.font = '7.5px monospace';
    ctx.fillText(labelsMod[c], cx - 16, modY + 2);
    ctx.fillText(labelsCar[c], cx - 16, carY + 2);
  }

  // Draw Interactive XY Cursor (X = Tine Chime, Y = Rhodes Bark)
  const curX = 10 + chime * (w - 20);
  const curY = (h - 10) - bark * (h - 20);
  ctx.fillStyle = '#ff0080';
  ctx.beginPath();
  ctx.arc(curX, curY, 4.5, 0, Math.PI * 2);
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
  renderFMAlgorithmCanvas(synthParams);
}

// ============================================================================
// 5. ROTARY KNOBS BINDING & SYNCHRONIZATION
// ============================================================================
function initAllKnobs() {
  const bindKnob = RotaryKnob.bind;
  const formatTime = (v) => (v < 1.0 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)}s`);

  // 1. Mode 1: DX7 E.Piano 1 (Algorithm 5) Knobs
  knobs.tineChime = bindKnob('knob-tine-chime', 0, 100, Math.round((synthParams.tineChime || 0.68) * 100), 1, '%', (v) => {
    synthParams.tineChime = v / 100.0;
    renderFMAlgorithmCanvas(synthParams);
    throttledBufferVoiceUpdate();
  });
  knobs.fmBark = bindKnob('knob-fm-bark', 0, 100, Math.round((synthParams.fmBark || 0.42) * 100), 1, '%', (v) => {
    synthParams.fmBark = v / 100.0;
    renderFMAlgorithmCanvas(synthParams);
    throttledBufferVoiceUpdate();
  });
  knobs.hammerClick = bindKnob('knob-hammer-click', 0, 100, Math.round((synthParams.hammerClick || 0.35) * 100), 1, '%', (v) => {
    synthParams.hammerClick = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.tineDecay = bindKnob('knob-tine-decay', 5, 100, Math.round((synthParams.tineDecay || 0.55) * 100), 1, '%', (v) => {
    synthParams.tineDecay = v / 100.0;
    throttledBufferVoiceUpdate();
  });

  // 2. Mode 2: 80s Crystal Bell & Celeste (Algorithm 14) Knobs
  knobs.bellRatio = bindKnob('knob-bell-ratio', 1.0, 14.0, synthParams.bellRatio || 7.0, 0.5, ':1', (v) => {
    synthParams.bellRatio = v;
    if (typeof document !== 'undefined') {
      const ratioSel = document.getElementById('bell-ratio-select-v2');
      if (ratioSel) ratioSel.value = v.toFixed(1);
    }
    throttledBufferVoiceUpdate();
  });
  knobs.bellRoundness = bindKnob('knob-bell-roundness', 0, 100, Math.round((synthParams.bellRoundness || 0.55) * 100), 1, '%', (v) => {
    synthParams.bellRoundness = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.cascadeShimmer = bindKnob('knob-cascade-shimmer', 0, 100, Math.round((synthParams.cascadeShimmer || 0.48) * 100), 1, '%', (v) => {
    synthParams.cascadeShimmer = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.warmPadMix = bindKnob('knob-warm-pad-mix', 0, 100, Math.round((synthParams.warmPadMix || 0.65) * 100), 1, '%', (v) => {
    synthParams.warmPadMix = v / 100.0;
    throttledBufferVoiceUpdate();
  });

  // 3. Mode 3: FM Wurlitzer & Barking Reed (Algorithm 4) Knobs
  knobs.reedBite = bindKnob('knob-reed-bite', 0, 100, Math.round((synthParams.reedBite || 0.62) * 100), 1, '%', (v) => {
    synthParams.reedBite = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.reedBuzz = bindKnob('knob-reed-buzz', 0, 100, Math.round((synthParams.reedBuzz || 0.45) * 100), 1, '%', (v) => {
    synthParams.reedBuzz = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.tremoloDepth = bindKnob('knob-tremolo-depth', 0, 100, Math.round((synthParams.tremoloDepth || 0.40) * 100), 1, '%', (v) => {
    synthParams.tremoloDepth = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.woodBody = bindKnob('knob-wood-body', 0, 100, Math.round((synthParams.woodBody || 0.65) * 100), 1, '%', (v) => {
    synthParams.woodBody = v / 100.0;
    throttledBufferVoiceUpdate();
  });

  // 4. Mode 4: LA Studio TX816 Stereo Stack Knobs
  knobs.stackSpread = bindKnob('knob-stack-spread', 0, 100, Math.round((synthParams.stackSpread || 0.80) * 100), 1, '%', (v) => {
    synthParams.stackSpread = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.fosterGlass = bindKnob('knob-foster-glass', 0, 100, Math.round((synthParams.fosterGlass || 0.75) * 100), 1, '%', (v) => {
    synthParams.fosterGlass = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.balladWarmth = bindKnob('knob-ballad-warmth', 0, 100, Math.round((synthParams.balladWarmth || 0.80) * 100), 1, '%', (v) => {
    synthParams.balladWarmth = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.attackSnap = bindKnob('knob-attack-snap', 0, 100, Math.round((synthParams.attackSnap || 0.50) * 100), 1, '%', (v) => {
    synthParams.attackSnap = v / 100.0;
    throttledBufferVoiceUpdate();
  });

  // 5. Mode 5: Soft Rounded Ballad EP & Dream Pad (Algorithm 16) Knobs
  knobs.toneSoftness = bindKnob('knob-tone-softness', 0, 100, Math.round((synthParams.toneSoftness || 0.75) * 100), 1, '%', (v) => {
    synthParams.toneSoftness = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.bellBloom = bindKnob('knob-bell-bloom', 0, 100, Math.round((synthParams.bellBloom || 0.60) * 100), 1, '%', (v) => {
    synthParams.bellBloom = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.subWarmth = bindKnob('knob-sub-warmth', 0, 100, Math.round((synthParams.subWarmth || 0.70) * 100), 1, '%', (v) => {
    synthParams.subWarmth = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.airHalo = bindKnob('knob-air-halo', 0, 100, Math.round((synthParams.airHalo || 0.52) * 100), 1, '%', (v) => {
    synthParams.airHalo = v / 100.0;
    throttledBufferVoiceUpdate();
  });

  // 6. Mode 6: Sharp CP-80, FM Clav & Mallet (Algorithm 7) Knobs
  knobs.attackSharpness = bindKnob('knob-attack-sharpness', 0, 100, Math.round((synthParams.attackSharpness || 0.75) * 100), 1, '%', (v) => {
    synthParams.attackSharpness = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.hollowRatio = bindKnob('knob-hollow-ratio', 1.0, 8.0, synthParams.hollowRatio || 3.0, 0.5, ':1', (v) => {
    synthParams.hollowRatio = v;
    throttledBufferVoiceUpdate();
  });
  knobs.stringBrilliance = bindKnob('knob-string-brilliance', 0, 100, Math.round((synthParams.stringBrilliance || 0.60) * 100), 1, '%', (v) => {
    synthParams.stringBrilliance = v / 100.0;
    throttledBufferVoiceUpdate();
  });
  knobs.damperTightness = bindKnob('knob-damper-tightness', 0, 100, Math.round((synthParams.damperTightness || 0.60) * 100), 1, '%', (v) => {
    synthParams.damperTightness = v / 100.0;
    throttledBufferVoiceUpdate();
  });

  // 7. ADSR Amplitude Envelope Knobs
  knobs.adsrAttack = bindKnob('knob-adsr-attack', 0.002, 2.5, synthParams.attack || 0.003, 0.002, '', (v) => {
    synthParams.attack = v;
    renderADSRCanvas();
  }, formatTime);
  knobs.adsrDecay = bindKnob('knob-adsr-decay', 0.01, 3.0, synthParams.decay || 1.35, 0.01, '', (v) => {
    synthParams.decay = v;
    renderADSRCanvas();
  }, formatTime);
  knobs.adsrSustain = bindKnob('knob-adsr-sustain', 0, 100, Math.round((synthParams.sustain !== undefined ? synthParams.sustain : 0.32) * 100), 1, '%', (v) => {
    synthParams.sustain = v / 100.0;
    renderADSRCanvas();
  });
  knobs.adsrRelease = bindKnob('knob-adsr-release', 0.005, 4.0, synthParams.release || 0.85, 0.005, '', (v) => {
    synthParams.release = v;
    renderADSRCanvas();
  }, formatTime);

  // 8. Unison Stack & Sub-Bass Knobs
  knobs.unisonVoices = bindKnob('knob-unison-voices', 1, 7, synthParams.unisonCount || 3, 2, '', (v) => {
    synthParams.unisonCount = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);
  });
  knobs.unisonDetune = bindKnob('knob-unison-detune', 0, 50, synthParams.unisonDetune || 7, 1, ' ct', (v) => {
    synthParams.unisonDetune = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.unisonStereo = bindKnob('knob-unison-stereo', 0, 100, synthParams.unisonStereo || 70, 1, '%', (v) => {
    synthParams.unisonStereo = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.subLevel = bindKnob('knob-sub-level', 0, 100, Math.round((synthParams.subLevel !== undefined ? synthParams.subLevel : 0.0) * 100), 1, '%', (v) => {
    synthParams.subLevel = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.glideTime = bindKnob('knob-glide-time', 0, 500, synthParams.glideTime || 0, 5, ' ms', (v) => {
    synthParams.glideTime = v;
  });

  // 9. Modulation LFO Knobs
  knobs.lfoRate = bindKnob('knob-lfo-rate', 0.05, 20.0, synthParams.modLfoRate || 0.85, 0.05, ' Hz', (v) => {
    synthParams.modLfoRate = v;
  });
  knobs.lfoDepth = bindKnob('knob-lfo-depth', 0, 100, synthParams.modLfoDepth !== undefined ? synthParams.modLfoDepth : 8, 1, '%', (v) => {
    synthParams.modLfoDepth = v;
  });

  // 10. Studio Audio FX Knobs
  knobs.filterCutoff = bindKnob('knob-filter-cutoff', 50, 16000, synthParams.cutoff || 11500, 10, ' Hz', (v) => {
    synthParams.cutoff = v;
    if (fxEngine) fxEngine.updateParams(null, synthParams);
  });
  knobs.filterRes = bindKnob('knob-filter-res', 0.1, 15.0, synthParams.resonance || 1.0, 0.1, '', (v) => {
    synthParams.resonance = v;
    if (fxEngine) fxEngine.updateParams(null, synthParams);
  });
  knobs.fxDrive = bindKnob('knob-fx-drive', 0, 100, Math.round((fxParams.driveAmount !== undefined ? fxParams.driveAmount : 0.0) * 100), 1, '%', (v) => {
    fxParams.driveAmount = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxChorusMix = bindKnob('knob-fx-chorus-mix', 0, 100, Math.round((fxParams.chorusMix !== undefined ? fxParams.chorusMix : 0.0) * 100), 1, '%', (v) => {
    fxParams.chorusMix = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxDelayMix = bindKnob('knob-fx-delay-mix', 0, 100, Math.round((fxParams.delayMix || 0.10) * 100), 1, '%', (v) => {
    fxParams.delayMix = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxDelayTime = bindKnob('knob-fx-delay-time', 50, 1000, fxParams.delayTime || 360, 10, ' ms', (v) => {
    fxParams.delayTime = v;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxDelayFeedback = bindKnob('knob-fx-delay-feedback', 0, 90, Math.round((fxParams.delayFeedback !== undefined ? fxParams.delayFeedback : 0.28) * 100), 1, '%', (v) => {
    fxParams.delayFeedback = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxReverbMix = bindKnob('knob-fx-reverb-mix', 0, 100, Math.round((fxParams.reverbMix || 0.34) * 100), 1, '%', (v) => {
    fxParams.reverbMix = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxReverbSize = bindKnob('knob-fx-reverb-size', 0.5, 5.0, fxParams.reverbSize || 2.8, 0.1, 's', (v) => {
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
  if (knobs.tineChime && synthParams.tineChime !== undefined) knobs.tineChime.setValue(synthParams.tineChime * 100, false);
  if (knobs.fmBark && synthParams.fmBark !== undefined) knobs.fmBark.setValue(synthParams.fmBark * 100, false);
  if (knobs.hammerClick && synthParams.hammerClick !== undefined) knobs.hammerClick.setValue(synthParams.hammerClick * 100, false);
  if (knobs.tineDecay && synthParams.tineDecay !== undefined) knobs.tineDecay.setValue(synthParams.tineDecay * 100, false);

  if (knobs.bellRatio && synthParams.bellRatio !== undefined) knobs.bellRatio.setValue(synthParams.bellRatio, false);
  if (typeof document !== 'undefined' && synthParams.bellRatio !== undefined) {
    const ratioSel = document.getElementById('bell-ratio-select-v2');
    if (ratioSel) ratioSel.value = synthParams.bellRatio.toFixed(1);
  }
  if (knobs.bellRoundness && synthParams.bellRoundness !== undefined) knobs.bellRoundness.setValue(synthParams.bellRoundness * 100, false);
  if (knobs.cascadeShimmer && synthParams.cascadeShimmer !== undefined) knobs.cascadeShimmer.setValue(synthParams.cascadeShimmer * 100, false);
  if (knobs.warmPadMix && synthParams.warmPadMix !== undefined) knobs.warmPadMix.setValue(synthParams.warmPadMix * 100, false);

  if (knobs.reedBite && synthParams.reedBite !== undefined) knobs.reedBite.setValue(synthParams.reedBite * 100, false);
  if (knobs.reedBuzz && synthParams.reedBuzz !== undefined) knobs.reedBuzz.setValue(synthParams.reedBuzz * 100, false);
  if (knobs.tremoloDepth && synthParams.tremoloDepth !== undefined) knobs.tremoloDepth.setValue(synthParams.tremoloDepth * 100, false);
  if (knobs.woodBody && synthParams.woodBody !== undefined) knobs.woodBody.setValue(synthParams.woodBody * 100, false);

  if (knobs.stackSpread && synthParams.stackSpread !== undefined) knobs.stackSpread.setValue(synthParams.stackSpread * 100, false);
  if (knobs.fosterGlass && synthParams.fosterGlass !== undefined) knobs.fosterGlass.setValue(synthParams.fosterGlass * 100, false);
  if (knobs.balladWarmth && synthParams.balladWarmth !== undefined) knobs.balladWarmth.setValue(synthParams.balladWarmth * 100, false);
  if (knobs.attackSnap && synthParams.attackSnap !== undefined) knobs.attackSnap.setValue(synthParams.attackSnap * 100, false);

  if (knobs.toneSoftness && synthParams.toneSoftness !== undefined) knobs.toneSoftness.setValue(synthParams.toneSoftness * 100, false);
  if (knobs.bellBloom && synthParams.bellBloom !== undefined) knobs.bellBloom.setValue(synthParams.bellBloom * 100, false);
  if (knobs.subWarmth && synthParams.subWarmth !== undefined) knobs.subWarmth.setValue(synthParams.subWarmth * 100, false);
  if (knobs.airHalo && synthParams.airHalo !== undefined) knobs.airHalo.setValue(synthParams.airHalo * 100, false);

  if (knobs.attackSharpness && synthParams.attackSharpness !== undefined) knobs.attackSharpness.setValue(synthParams.attackSharpness * 100, false);
  if (knobs.hollowRatio && synthParams.hollowRatio !== undefined) knobs.hollowRatio.setValue(synthParams.hollowRatio, false);
  if (knobs.stringBrilliance && synthParams.stringBrilliance !== undefined) knobs.stringBrilliance.setValue(synthParams.stringBrilliance * 100, false);
  if (knobs.damperTightness && synthParams.damperTightness !== undefined) knobs.damperTightness.setValue(synthParams.damperTightness * 100, false);

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
      synthParams.tineChime = parseFloat(Math.max(0.1, Math.min(1.0, (synthParams.tineChime || 0.68) + (Math.random() * 2 - 1) * 0.2)).toFixed(2));
      synthParams.fmBark = parseFloat(Math.max(0.05, Math.min(0.95, (synthParams.fmBark || 0.42) + (Math.random() * 2 - 1) * 0.2)).toFixed(2));
      synthParams.bellRoundness = parseFloat(Math.max(0.1, Math.min(0.95, (synthParams.bellRoundness || 0.55) + (Math.random() * 2 - 1) * 0.2)).toFixed(2));
      synthParams.reedBite = parseFloat(Math.max(0.1, Math.min(0.95, (synthParams.reedBite || 0.62) + (Math.random() * 2 - 1) * 0.2)).toFixed(2));

      syncKnobValuesFromParams();
      renderFMAlgorithmCanvas(synthParams);
      if (fxEngine) fxEngine.updateParams(fxParams, synthParams);
      if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);

      const lblPreset = document.getElementById('lbl-current-preset-v2');
      if (lblPreset) lblPreset.innerText = '🎲 Mutated FM Patch (25%)';
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

  // Mode 1: Interactive 2D DX7 Algorithm 5 XY Pad (X = Tine Chime, Y = Rhodes Bark)
  const fmCanvas = document.getElementById('fm-algorithm-canvas-v2');
  if (fmCanvas) {
    let isDragging = false;
    const updateFMXY = (e) => {
      const rect = fmCanvas.getBoundingClientRect();
      const nx = Math.max(0.0, Math.min(1.0, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const ny = Math.max(0.0, Math.min(1.0, 1.0 - (e.clientY - rect.top) / Math.max(1, rect.height)));
      synthParams.tineChime = parseFloat(nx.toFixed(2));
      synthParams.fmBark = parseFloat(ny.toFixed(2));
      if (knobs.tineChime) knobs.tineChime.setValue(synthParams.tineChime * 100, false);
      if (knobs.fmBark) knobs.fmBark.setValue(synthParams.fmBark * 100, false);
      renderFMAlgorithmCanvas(synthParams);
      throttledBufferVoiceUpdate();
    };
    fmCanvas.addEventListener('mousedown', (e) => { isDragging = true; updateFMXY(e); });
    window.addEventListener('mousemove', (e) => { if (isDragging) updateFMXY(e); });
    window.addEventListener('mouseup', () => { isDragging = false; });
  }

  // Mode 2: Bell Harmonic C:M Ratio Dropdown
  const bellRatioSelect = document.getElementById('bell-ratio-select-v2');
  if (bellRatioSelect) {
    bellRatioSelect.addEventListener('change', (e) => {
      synthParams.bellRatio = parseFloat(e.target.value) || 7.0;
      if (knobs.bellRatio) knobs.bellRatio.setValue(synthParams.bellRatio, false);
      throttledBufferVoiceUpdate();
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

function bootstrapFMPianosApp() {
  if (window.__fmPianosSynthAppInitialized) return;
  window.__fmPianosSynthAppInitialized = true;

  registerFMPianoLFOTargets();
  synthFramework = new SynthFramework({ synthParams, fxParams, arpParams, knobs });
  generate2OctaveKeyboard();
  initAllKnobs();
  renderFMAlgorithmCanvas(synthParams);
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
  document.addEventListener('DOMContentLoaded', bootstrapFMPianosApp);
} else {
  bootstrapFMPianosApp();
}
