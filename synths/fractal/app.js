/**
 * Fractal Sound Engine v2.0 — Application Bootstrap & Module Wiring
 *
 * Connects the UI controls to the modular SynthFramework, AudioBus,
 * 6 Fractal Sound Engines, EnvelopeModule, DetuneModule, LFOModule,
 * ArpeggiatorModule, AudioFXEngine, and VisualizerSuite.
 */

// ============================================================================
// 1. SYNTHESIZER STATE & DEFAULT PARAMETERS
// ============================================================================
let audioCtx = null;
let audioBus = null;
let fxEngine = null;
let voiceManager = null;
let visualizerSuite = null;
let fractalCanvas2D = null;
let synthFramework = null;

let isAudioStarted = false;
let currentOctave = 3; // Base C3 (note 48)
let isRecording = false;
const activeHeldNotes = new Set();
let savedPatchA = null;

const synthParams = {
  mode: 'polotti_fas', // 'polotti_fas', 'julia', 'attractor', 'drone', 'image', 'automata'
  masterVolume: 0.75,
  glideTime: 30, // ms
  microtuningOffset: 0,
  pitchBendCents: 0,

  // Mode 1: Polotti FAS Engine (EPFL TH2711)
  fasGamma: 2.000,
  fasHarmonics: 8,
  fasDecay: 0.55,
  fasDimension: 1.35,
  fasFbmAmount: 0.35,

  // Mode 2: 2D & 3D Complex Fractals
  fractalSet: 'julia',
  cReal: -0.70,
  cImag: 0.27,
  zoom: 1.0,
  maxIter: 16,
  angle3D: 45,

  // Mode 3: Strange Attractor FM Core
  attractorType: 'lorenz',
  sigma: 10.0,
  fmDepth: 0.50,
  attractorSpeed: 35.0,
  rosslerA: 0.2, rosslerB: 0.2, rosslerC: 5.7,
  chuaAlpha: 15.6, chuaBeta: 28.0,
  thomasB: 0.208,

  // Mode 4: Hyper-Drone Engine
  droneMorph: 0.50,
  droneSwirlRate: 0.25,
  droneSub: 0.60,
  droneSpectral: 8,

  // Mode 5: Optical Image Harmonics
  imagePreset: 'preset_nebula',
  imageScanMode: 'radial',
  imageColorMode: 'luminance',
  imageRadius: 25,
  imageContrast: 100,
  imageCursorX: 60,
  imageCursorY: 60,

  // Mode 6: Cellular Automata
  cellularRule: 110,

  // Super-Unison Stack & Sub-Bass
  unisonEnabled: true,
  unisonCount: 3,
  unisonDetune: 15,
  unisonStereo: 80,
  subLevel: 0.35,
  subOctave: 12,
  subWave: 'sine',

  // ADSR Amplitude Envelope
  attack: 0.04,
  decay: 0.18,
  sustain: 0.70,
  release: 0.35,

  // Multi-Mode Filter
  cutoff: 4500,
  resonance: 1.2,
  filterType: 'lowpass',

  // Modulation LFO
  modLfoRate: 1.5,
  modLfoDepth: 30,
  modLfoShape: 'sine',
  modLfoTarget: 'cutoff'
};

const fxParams = {
  driveAmount: 0.0,
  chorusMix: 0.25,
  chorusRate: 1.5,
  delayMix: 0.20,
  delayTime: 350,
  delayFeedback: 0.40,
  reverbMix: 0.30,
  reverbSize: 2.5
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

// Offscreen Optical Texture Buffer Canvas
const imageBufferCanvas = document.createElement('canvas');
imageBufferCanvas.width = 120;
imageBufferCanvas.height = 120;
window.imageBufferCanvas = imageBufferCanvas;
window.synthParams = synthParams;
window.fxParams = fxParams;
window.arpParams = arpParams;

// ============================================================================
// 2. AUDIO ENGINE & FRAMEWORK LIFECYCLE
// ============================================================================
function initAudioEngine() {
  if (isAudioStarted && audioCtx) return;

  if (!synthFramework) {
    synthFramework = new SynthFramework({ synthParams, fxParams, arpParams, knobs });
  }
  synthFramework.visualizerSuite = visualizerSuite;
  synthFramework.fractalCanvas2D = fractalCanvas2D;

  synthFramework.initAudioEngine({
    onInitialized: (fw) => {
      audioCtx = fw.audioCtx;
      audioBus = fw.audioBus;
      fxEngine = fw.fxEngine;
      voiceManager = fw.voiceManager;
      visualizerSuite = fw.visualizerSuite;
      fractalCanvas2D = fw.fractalCanvas2D;
      isAudioStarted = true;
    }
  });

  if (typeof FACTORY_PRESETS !== 'undefined' && FACTORY_PRESETS.length > 0) {
    loadPreset(FACTORY_PRESETS[0]);
  }
  setupWebMIDI();
}

// ============================================================================
// 3. DELEGATED MODULE ADAPTERS
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
    voiceManager,
    fractalCanvas2D
  });
}

function updateArpeggiator(nowTime) {
  ArpeggiatorModule.update(nowTime, arpParams, synthParams, voiceManager, setPianoKeyActive);
}

function renderImageTexture(presetName) {
  OpticalImageEngine.renderTextureToBuffer(presetName, imageBufferCanvas);
  drawCompositeImageCanvas();
}

function drawCompositeImageCanvas() {
  OpticalImageEngine.drawCompositeOverlay(synthParams, document.getElementById('image-canvas-v2'), imageBufferCanvas);
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
      btnRec.innerText = '⏺️ Stop & Download WAV';
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
    renderImageTexture,
    fxEngine,
    voiceManager,
    visualizerSuite,
    fractalCanvas2D
  });
}

// ============================================================================
// 4. ROTARY KNOBS BINDING & SYNCHRONIZATION
// ============================================================================
function initAllKnobs() {
  const bindKnob = RotaryKnob.bind;
  const formatTime = (v) => (v < 1.0 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)}s`);

  // 1. Polotti FAS Knobs
  knobs.fasGamma = bindKnob('knob-fas-gamma', 1.0, 4.0, synthParams.fasGamma || 2.0, 0.001, '', (v) => {
    synthParams.fasGamma = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.fasHarmonics = bindKnob('knob-fas-harmonics', 1, 16, synthParams.fasHarmonics || 8, 1, '', (v) => {
    synthParams.fasHarmonics = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.fasDimension = bindKnob('knob-fas-dimension', 1.0, 1.95, synthParams.fasDimension || 1.35, 0.01, '', (v) => {
    synthParams.fasDimension = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.fasDecay = bindKnob('knob-fas-decay', 0.10, 0.95, synthParams.fasDecay || 0.55, 0.01, '', (v) => {
    synthParams.fasDecay = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.fasFbm = bindKnob('knob-fas-fbm', 0, 100, Math.round((synthParams.fasFbmAmount || 0.35) * 100), 1, '%', (v) => {
    synthParams.fasFbmAmount = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });

  // 2. 2D/3D Sets Knobs
  knobs.fractalZoom = bindKnob('knob-fractal-zoom', 0.2, 5.0, synthParams.zoom || 1.0, 0.1, 'x', (v) => {
    synthParams.zoom = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
    if (fractalCanvas2D) fractalCanvas2D.render(synthParams);
  });
  knobs.fractalAngle3D = bindKnob('knob-fractal-angle3d', 0, 360, synthParams.angle3D || 45, 1, '°', (v) => {
    synthParams.angle3D = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });

  // 3. Attractor FM Knobs
  knobs.attractorFmDepth = bindKnob('knob-attractor-fmdepth', 0.0, 1.5, synthParams.fmDepth || 0.50, 0.01, '', (v) => {
    synthParams.fmDepth = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);
  });
  knobs.attractorSpeed = bindKnob('knob-attractor-speed', 5.0, 100.0, synthParams.attractorSpeed || 35.0, 0.5, '', (v) => {
    synthParams.attractorSpeed = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });

  // 4. Hyper-Drone Knobs
  knobs.droneMorph = bindKnob('knob-drone-morph', 0, 100, Math.round((synthParams.droneMorph || 0.50) * 100), 1, '%', (v) => {
    synthParams.droneMorph = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.droneSwirl = bindKnob('knob-drone-swirl', 0.01, 2.0, synthParams.droneSwirlRate || 0.25, 0.01, ' Hz', (v) => {
    synthParams.droneSwirlRate = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });

  // 5. Optical Image Knobs
  knobs.imageRadius = bindKnob('knob-image-radius', 5, 100, synthParams.imageRadius || 25, 1, ' px', (v) => {
    synthParams.imageRadius = v;
    drawCompositeImageCanvas();
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });

  // 6. Cellular Automata Knobs
  knobs.automataRule = bindKnob('knob-automata-rule', 0, 255, synthParams.cellularRule || 110, 1, '', (v) => {
    synthParams.cellularRule = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });

  // 7. ADSR Amplitude Envelope Knobs
  knobs.adsrAttack = bindKnob('knob-adsr-attack', 0.002, 2.5, synthParams.attack || 0.04, 0.002, '', (v) => {
    synthParams.attack = v;
    renderADSRCanvas();
  }, formatTime);
  knobs.adsrDecay = bindKnob('knob-adsr-decay', 0.01, 3.0, synthParams.decay || 0.18, 0.01, '', (v) => {
    synthParams.decay = v;
    renderADSRCanvas();
  }, formatTime);
  knobs.adsrSustain = bindKnob('knob-adsr-sustain', 0, 100, Math.round((synthParams.sustain !== undefined ? synthParams.sustain : 0.7) * 100), 1, '%', (v) => {
    synthParams.sustain = v / 100.0;
    renderADSRCanvas();
  });
  knobs.adsrRelease = bindKnob('knob-adsr-release', 0.005, 4.0, synthParams.release || 0.35, 0.005, '', (v) => {
    synthParams.release = v;
    renderADSRCanvas();
  }, formatTime);

  // 8. Unison Stack & Sub-Bass Knobs
  knobs.unisonVoices = bindKnob('knob-unison-voices', 1, 7, synthParams.unisonCount || 3, 2, '', (v) => {
    synthParams.unisonCount = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);
  });
  knobs.unisonDetune = bindKnob('knob-unison-detune', 0, 50, synthParams.unisonDetune || 15, 1, ' ct', (v) => {
    synthParams.unisonDetune = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.unisonStereo = bindKnob('knob-unison-stereo', 0, 100, synthParams.unisonStereo || 80, 1, '%', (v) => {
    synthParams.unisonStereo = v;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.subLevel = bindKnob('knob-sub-level', 0, 100, Math.round((synthParams.subLevel || 0.35) * 100), 1, '%', (v) => {
    synthParams.subLevel = v / 100.0;
    if (voiceManager) voiceManager.updateActiveVoices(synthParams);
  });
  knobs.glideTime = bindKnob('knob-glide-time', 0, 500, synthParams.glideTime || 30, 5, ' ms', (v) => {
    synthParams.glideTime = v;
  });

  // 9. Modulation LFO Knobs
  knobs.lfoRate = bindKnob('knob-lfo-rate', 0.05, 20.0, synthParams.modLfoRate || 1.5, 0.05, ' Hz', (v) => {
    synthParams.modLfoRate = v;
  });
  knobs.lfoDepth = bindKnob('knob-lfo-depth', 0, 100, synthParams.modLfoDepth !== undefined ? synthParams.modLfoDepth : 30, 1, '%', (v) => {
    synthParams.modLfoDepth = v;
  });

  // 10. Studio Audio FX Knobs
  knobs.filterCutoff = bindKnob('knob-filter-cutoff', 50, 16000, synthParams.cutoff || 4500, 10, ' Hz', (v) => {
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
  knobs.fxChorusMix = bindKnob('knob-fx-chorus-mix', 0, 100, Math.round((fxParams.chorusMix || 0.25) * 100), 1, '%', (v) => {
    fxParams.chorusMix = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxDelayMix = bindKnob('knob-fx-delay-mix', 0, 100, Math.round((fxParams.delayMix || 0.20) * 100), 1, '%', (v) => {
    fxParams.delayMix = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxDelayTime = bindKnob('knob-fx-delay-time', 50, 1000, fxParams.delayTime || 350, 10, ' ms', (v) => {
    fxParams.delayTime = v;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxDelayFeedback = bindKnob('knob-fx-delay-feedback', 0, 90, Math.round((fxParams.delayFeedback !== undefined ? fxParams.delayFeedback : 0.40) * 100), 1, '%', (v) => {
    fxParams.delayFeedback = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxReverbMix = bindKnob('knob-fx-reverb-mix', 0, 100, Math.round((fxParams.reverbMix || 0.30) * 100), 1, '%', (v) => {
    fxParams.reverbMix = v / 100.0;
    if (fxEngine) fxEngine.updateParams(fxParams, null);
  });
  knobs.fxReverbSize = bindKnob('knob-fx-reverb-size', 0.5, 5.0, fxParams.reverbSize || 2.5, 0.1, 's', (v) => {
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
  if (knobs.fasGamma && synthParams.fasGamma !== undefined) knobs.fasGamma.setValue(synthParams.fasGamma, false);
  if (knobs.fasHarmonics && synthParams.fasHarmonics !== undefined) knobs.fasHarmonics.setValue(synthParams.fasHarmonics, false);
  if (knobs.fasDimension && synthParams.fasDimension !== undefined) knobs.fasDimension.setValue(synthParams.fasDimension, false);
  if (knobs.fasDecay && synthParams.fasDecay !== undefined) knobs.fasDecay.setValue(synthParams.fasDecay, false);
  if (knobs.fasFbm && synthParams.fasFbmAmount !== undefined) knobs.fasFbm.setValue(synthParams.fasFbmAmount * 100, false);

  if (knobs.fractalZoom && synthParams.zoom !== undefined) knobs.fractalZoom.setValue(synthParams.zoom, false);
  if (knobs.fractalAngle3D && synthParams.angle3D !== undefined) knobs.fractalAngle3D.setValue(synthParams.angle3D, false);

  if (knobs.attractorFmDepth && synthParams.fmDepth !== undefined) knobs.attractorFmDepth.setValue(synthParams.fmDepth, false);
  if (knobs.attractorSpeed && synthParams.attractorSpeed !== undefined) knobs.attractorSpeed.setValue(synthParams.attractorSpeed, false);

  if (knobs.droneMorph && synthParams.droneMorph !== undefined) knobs.droneMorph.setValue(synthParams.droneMorph * 100, false);
  if (knobs.droneSwirl && synthParams.droneSwirlRate !== undefined) knobs.droneSwirl.setValue(synthParams.droneSwirlRate, false);

  if (knobs.imageRadius && synthParams.imageRadius !== undefined) knobs.imageRadius.setValue(synthParams.imageRadius, false);
  if (knobs.automataRule && synthParams.cellularRule !== undefined) knobs.automataRule.setValue(synthParams.cellularRule, false);

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

// ============================================================================
// 5. OPTICAL IMAGE UI & PRESET BAR INITIALIZATION
// ============================================================================
function loadCustomImageFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const ctx = imageBufferCanvas.getContext('2d');
      const w = imageBufferCanvas.width;
      const h = imageBufferCanvas.height;
      ctx.clearRect(0, 0, w, h);

      const scale = Math.max(w / img.width, h / img.height);
      const nw = img.width * scale;
      const nh = img.height * scale;
      const ox = (w - nw) / 2;
      const oy = (h - nh) / 2;

      ctx.drawImage(img, ox, oy, nw, nh);
      synthParams.imagePreset = 'custom';

      const optCustom = document.getElementById('opt-custom-img');
      const select = document.getElementById('image-preset-select-v2');
      if (optCustom && select) {
        optCustom.style.display = 'block';
        select.value = 'custom';
      }

      drawCompositeImageCanvas();
      if (voiceManager && synthParams.mode === 'image') {
        voiceManager.updateActiveVoices(synthParams);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function initImageCanvas() {
  const canvas = document.getElementById('image-canvas-v2');
  if (!canvas) return;

  renderImageTexture(synthParams.imagePreset || 'preset_nebula');

  let isDraggingImg = false;
  const updateScanCursor = (e) => {
    const rect = canvas.getBoundingClientRect();
    synthParams.imageCursorX = Math.round(Math.max(0, Math.min(canvas.width, e.clientX - rect.left)));
    synthParams.imageCursorY = Math.round(Math.max(0, Math.min(canvas.height, e.clientY - rect.top)));
    drawCompositeImageCanvas();
    if (voiceManager && synthParams.mode === 'image') {
      voiceManager.updateActiveVoices(synthParams);
    }
  };

  canvas.addEventListener('mousedown', (e) => { isDraggingImg = true; updateScanCursor(e); });
  window.addEventListener('mousemove', (e) => { if (isDraggingImg) updateScanCursor(e); });
  window.addEventListener('mouseup', () => { isDraggingImg = false; });

  canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    canvas.style.borderColor = 'var(--accent-cyan)';
  });
  canvas.addEventListener('dragleave', () => {
    canvas.style.borderColor = 'var(--accent-magenta)';
  });
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.style.borderColor = 'var(--accent-magenta)';
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      loadCustomImageFile(e.dataTransfer.files[0]);
    }
  });

  const presetSelect = document.getElementById('image-preset-select-v2');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      synthParams.imagePreset = e.target.value;
      renderImageTexture(e.target.value);
      if (voiceManager && synthParams.mode === 'image') {
        voiceManager.updateActiveVoices(synthParams);
      }
      e.target.blur();
    });
  }

  const scanSelect = document.getElementById('image-scan-mode-v2');
  if (scanSelect) {
    scanSelect.addEventListener('change', (e) => {
      synthParams.imageScanMode = e.target.value;
      drawCompositeImageCanvas();
      if (voiceManager && synthParams.mode === 'image') {
        voiceManager.updateActiveVoices(synthParams);
      }
      e.target.blur();
    });
  }

  const fileInput = document.getElementById('image-file-input-v2');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        loadCustomImageFile(e.target.files[0]);
      }
      e.target.blur();
    });
  }
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
      PresetManager.mutatePatch(synthParams, 0.25);
      syncKnobValuesFromParams();
      if (fxEngine) fxEngine.updateParams(fxParams, synthParams);
      if (voiceManager) voiceManager.updateActiveVoices(synthParams, false);
      if (fractalCanvas2D) fractalCanvas2D.render(synthParams);

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

// ============================================================================
// 6. UI EVENT LISTENERS & 60 FPS MAIN LOOP
// ============================================================================
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

  const fractalSetSelect = document.getElementById('fractal-set-select-v2');
  if (fractalSetSelect) {
    fractalSetSelect.addEventListener('change', (e) => {
      synthParams.fractalSet = e.target.value;
      if (voiceManager) voiceManager.updateActiveVoices(synthParams);
      if (fractalCanvas2D) fractalCanvas2D.render(synthParams);
      e.target.blur();
    });
  }

  const attractorSelect = document.getElementById('attractor-type-select-v2');
  if (attractorSelect) {
    attractorSelect.addEventListener('change', (e) => {
      synthParams.attractorType = e.target.value;
      if (voiceManager) voiceManager.updateActiveVoices(synthParams, true);
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

  const mCanvas = document.getElementById('mandelbrot-canvas-v2');
  if (mCanvas) {
    let isDragging = false;
    const updateCoords = (e) => {
      const rect = mCanvas.getBoundingClientRect();
      const nx = Math.max(0, Math.min(rect.width, e.clientX - rect.left)) / rect.width;
      const ny = Math.max(0, Math.min(rect.height, e.clientY - rect.top)) / rect.height;
      synthParams.cReal = -2.1 + nx * 3.0;
      synthParams.cImag = -1.2 + ny * 2.4;
      if (fractalCanvas2D) fractalCanvas2D.render(synthParams);
      if (voiceManager) voiceManager.updateActiveVoices(synthParams);
    };
    mCanvas.addEventListener('mousedown', (e) => { isDragging = true; updateCoords(e); });
    window.addEventListener('mousemove', (e) => { if (isDragging) updateCoords(e); });
    window.addEventListener('mouseup', () => { isDragging = false; });
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

  // QWERTY Key Listeners (2 Octaves)
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

  document.addEventListener('pointerup', (e) => {
    if (e.target && e.target.closest && e.target.closest('select')) return;
    const interactive = e.target && e.target.closest
      ? e.target.closest('button, input[type="checkbox"], input[type="radio"], input[type="range"], .mode-tab-label')
      : null;
    if (interactive && !isTypingInText(e.target)) {
      setTimeout(() => {
        if (document.activeElement && document.activeElement !== document.body && document.activeElement.tagName !== 'SELECT' && !isTypingInText(document.activeElement)) {
          document.activeElement.blur();
        }
      }, 30);
    }
  });
}

function startMainAnimationLoop() {
  function loop(timestamp) {
    try {
      const nowTime = timestamp / 1000.0;

      // 1. Update Arpeggiator
      updateArpeggiator(nowTime);

      // 2. Real-time Modulation LFO
      updateModulationLFO(nowTime);

      // 3. Real-time Drone Wave Continuous Swirl
      if (voiceManager && isAudioStarted && synthParams.mode === 'drone') {
        voiceManager.updateDroneWaves(synthParams, timestamp);
      }

      // 4. Render Visualizers
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

function bootstrapApp() {
  if (window.__fractalAppInitialized) return;
  window.__fractalAppInitialized = true;

  synthFramework = new SynthFramework({ synthParams, fxParams, arpParams, knobs });
  generate2OctaveKeyboard();
  initAllKnobs();
  initImageCanvas();
  visualizerSuite = new VisualizerSuite(null, null, null);
  fractalCanvas2D = new Fractal2DCanvas('mandelbrot-canvas-v2');
  initPresetUI();
  if (typeof FACTORY_PRESETS !== 'undefined' && FACTORY_PRESETS.length > 0) {
    loadPreset(FACTORY_PRESETS[0]);
  }
  initAudioRecorder();
  setupUIEventListeners();
  startMainAnimationLoop();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
