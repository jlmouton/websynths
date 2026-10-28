/**
 * Fractal Sound Engine v2.0 — Web Synthesizer Framework Coordinator
 *
 * Orchestrates the AudioContext, AudioBus, PolyphonicVoiceManager, Sound Engines,
 * Envelope/Detune/LFO/Arpeggiator modules, Studio Effects Rack, Visualizer Suite,
 * Web MIDI, Piano/QWERTY Keyboard, Master Volume, Preset Manager, and WAV Recorder.
 */
(function (root) {
  'use strict';

  class SynthFramework {
    constructor(config = {}) {
      this.synthParams = config.synthParams || {};
      this.fxParams = config.fxParams || {};
      this.arpParams = config.arpParams || {};
      this.knobs = config.knobs || {};

      this.audioCtx = null;
      this.audioBus = null;
      this.fxEngine = null;
      this.voiceManager = null;
      this.visualizerSuite = null;
      this.fractalCanvas2D = null;
      this.recorder = new root.AudioRecorder();

      this.isAudioStarted = false;
      this.currentOctave = 3;
      this.activeHeldNotes = new Set();
      this.savedPatchA = null;
    }

    /**
     * Initializes Web Audio API context, AudioBus, FX Pipeline, Voice Manager, Visualizers, and Web MIDI.
     */
    initAudioEngine(callbacks = {}) {
      if (this.isAudioStarted && this.audioCtx) return this;

      const AudioContextClass = root.AudioContext || root.webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // 1. Initialize Framework AudioBus
      this.audioBus = new root.AudioBus(this.audioCtx);

      // 2. Initialize FX Engine on the AudioBus
      this.fxEngine = new root.AudioFXEngine(this.audioCtx, this.audioBus);

      // 3. Initialize Polyphonic Voice Manager routed into AudioBus
      this.voiceManager = new root.PolyphonicVoiceManager(this.audioCtx, this.fxEngine, this.audioBus);

      // 4. Connect Visualizers to AudioBus Analyser
      if (this.visualizerSuite) {
        this.visualizerSuite.connectAnalyser(this.audioCtx, this.audioBus.analyserNode, this.fxEngine);
      } else {
        this.visualizerSuite = new root.VisualizerSuite(this.audioCtx, this.audioBus.analyserNode, this.fxEngine);
      }

      if (!this.fractalCanvas2D && root.Fractal2DCanvas) {
        this.fractalCanvas2D = new root.Fractal2DCanvas('mandelbrot-canvas-v2');
      }

      this.isAudioStarted = true;

      if (typeof document !== 'undefined') {
        const btnStart = document.getElementById('btn-audio-start-v2');
        if (btnStart) {
          btnStart.innerText = '✓ Audio Engine Running';
          btnStart.classList.add('active');
        }
      }

      if (callbacks.onInitialized) {
        callbacks.onInitialized(this);
      }

      return this;
    }

    /**
     * Executes one frame of the 60 FPS synthesizer modulation, sequencing, and visualization loop.
     * @param {number} timestampMs
     * @param {Function} [onKeyVisual]
     */
    tickFrame(timestampMs, onKeyVisual) {
      const nowTime = timestampMs / 1000.0;

      // 1. Generative Arpeggiator
      if (this.arpParams && this.arpParams.enabled) {
        root.ArpeggiatorModule.update(nowTime, this.arpParams, this.synthParams, this.voiceManager, onKeyVisual);
      }

      // 2. Configurable Multi-Destination LFO
      if (this.isAudioStarted && this.synthParams && this.synthParams.modLfoDepth && this.synthParams.modLfoTarget !== 'none') {
        root.LFOModule.updateModulation(nowTime, {
          isAudioStarted: this.isAudioStarted,
          audioCtx: this.audioCtx,
          synthParams: this.synthParams,
          fxParams: this.fxParams,
          fxEngine: this.fxEngine,
          voiceManager: this.voiceManager,
          fractalCanvas2D: this.fractalCanvas2D
        });
      }

      // 3. Hyper-Drone Continuous 60 FPS Swirl (only when voices are active in drone mode)
      if (this.voiceManager && this.isAudioStarted && this.synthParams.mode === 'drone' && this.voiceManager.activeVoices.size > 0) {
        this.voiceManager.updateDroneWaves(this.synthParams, timestampMs);
      }

      // 4. Real-Time Visualizer Suite
      if (this.visualizerSuite) {
        this.visualizerSuite.render(this.synthParams);
      }
    }
  }

  root.SynthFramework = SynthFramework;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SynthFramework };
  }
})(typeof window !== 'undefined' ? window : globalThis);
