/**
 * Comprehensive Unit & Integration Test Suite for Fractal Sound Engine v2.0
 * Runs via `node --test tests/synth.test.js` both BEFORE and AFTER refactoring.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createSynthTestEnv, MockAudioContext } = require('./test-harness');

describe('Fractal Sound Engine v2.0 — Core & Modular Test Suite', () => {
  let env;
  let win;

  beforeEach(() => {
    env = createSynthTestEnv();
    win = env.sandbox;
  });

  // =========================================================================
  // 1. MATH & MUSICAL SCALE QUANTIZER UTILITIES
  // =========================================================================
  describe('1. Math & Musical Scale Utilities', () => {
    it('converts MIDI notes to equal-tempered and microtonal frequencies via midiToFreq', () => {
      assert.equal(typeof win.midiToFreq, 'function');
      assert.ok(Math.abs(win.midiToFreq(69) - 440.0) < 1e-6, 'A4 (69) should be 440Hz');
      assert.ok(Math.abs(win.midiToFreq(60) - 261.625565) < 1e-4, 'C4 (60) should be ~261.63Hz');
      assert.ok(Math.abs(win.midiToFreq(57) - 220.0) < 1e-6, 'A3 (57) should be 220Hz');
      assert.ok(Math.abs(win.midiToFreq(69, 12) - 880.0) < 1e-5, '+12 microtuning offset doubles frequency');
    });

    it('exposes MUSICAL_SCALES including chromatic, modes, pentatonic, Japanese, and golden_ratio', () => {
      assert.ok(win.MUSICAL_SCALES);
      assert.deepEqual(Array.from(win.MUSICAL_SCALES.chromatic), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      assert.deepEqual(Array.from(win.MUSICAL_SCALES.major), [0, 2, 4, 5, 7, 9, 11]);
      assert.deepEqual(Array.from(win.MUSICAL_SCALES.pentatonic_minor), [0, 3, 5, 7, 10]);
      assert.equal(win.MUSICAL_SCALES.golden_ratio.length, 8);
      assert.ok(Math.abs(win.MUSICAL_SCALES.golden_ratio[1] - 1.618) < 1e-3);
    });
  });

  // =========================================================================
  // 2. SOUND ENGINE 1: POLOTTI FRACTAL ADDITIVE SYNTHESIS (FAS)
  // =========================================================================
  describe('2. Sound Engine 1: Polotti Fractal Additive Synthesis (PolottiFAS)', () => {
    it('generates normalized 1/f^alpha Fractional Brownian Motion (fBm) noise', () => {
      const fbm = win.PolottiFAS.generateFBM(512, 0.65);
      assert.equal(fbm.length, 512);
      let maxAbs = 0;
      for (let i = 0; i < fbm.length; i++) {
        assert.ok(!Number.isNaN(fbm[i]), 'Sample should not be NaN');
        if (Math.abs(fbm[i]) > maxAbs) maxAbs = Math.abs(fbm[i]);
      }
      assert.ok(maxAbs > 0 && maxAbs <= 1.0001, 'fBm should be normalized within [-1, 1]');
    });

    it('generates Fractal Interpolation Function (FIF) waveforms normalized to peak 1.0', () => {
      const fif = win.PolottiFAS.generateFIFWaveform(256, 1.4);
      assert.equal(fif.length, 256);
      assert.equal(fif[0], 0);
      assert.equal(fif[255], 0);
      let peak = 0;
      for (let i = 0; i < fif.length; i++) {
        if (Math.abs(fif[i]) > peak) peak = Math.abs(fif[i]);
      }
      assert.ok(Math.abs(peak - 1.0) < 1e-4, 'FIF waveform should be normalized to peak 1.0');
    });

    it('creates a PeriodicWave with geometric gamma spacing and fractal dimension', () => {
      const ctx = new MockAudioContext();
      const wave = win.PolottiFAS.createPeriodicWave(ctx, {
        fasGamma: 2.0,
        fasHarmonics: 8,
        fasDecay: 0.6,
        fasDimension: 1.35,
        fasFbmAmount: 0.35
      });
      assert.ok(wave);
      assert.equal(wave.real.length, 256);
      assert.equal(wave.imag.length, 256);
      // Fundamental index 1 (2^0 = 1) and octave harmonics (2, 4, 8, 16...) should have non-zero energy
      const mag1 = Math.hypot(wave.real[1], wave.imag[1]);
      const mag2 = Math.hypot(wave.real[2], wave.imag[2]);
      assert.ok(mag1 > 0, 'Fundamental partial should have non-zero amplitude');
      assert.ok(mag2 > 0, 'Second geometric partial should have non-zero amplitude');
    });
  });

  // =========================================================================
  // 3. SOUND ENGINE 2: 2D & 3D COMPLEX FRACTAL WAVETABLES
  // =========================================================================
  describe('3. Sound Engine 2: 2D & 3D Complex Fractals (FractalWavetableDSP & Fractal2DCanvas)', () => {
    it('creates bandlimited PeriodicWaves for all 7 complex/geometric fractal equations', () => {
      const ctx = new MockAudioContext();
      const sets = ['julia', 'mandelbrot', 'burningship', 'newton', 'mandelbulb3d', 'sierpinski', 'koch'];

      for (const fractalSet of sets) {
        const wave = win.FractalWavetableDSP.createFractalPeriodicWave(ctx, {
          fractalSet,
          cReal: -0.7,
          cImag: 0.27,
          zoom: 1.2,
          maxIter: 16,
          angle3D: 45
        });
        assert.ok(wave, `Should create wave for ${fractalSet}`);
        assert.equal(wave.real.length, 256);
        let energy = 0;
        for (let k = 1; k < 128; k++) {
          energy += Math.hypot(wave.real[k], wave.imag[k]);
        }
        assert.ok(energy > 0, `Fractal set ${fractalSet} should produce non-zero harmonic energy`);
      }
    });

    it('renders the interactive 2D Mandelbrot/Julia canvas and crosshair', () => {
      const canvasCtrl = new win.Fractal2DCanvas('mandelbrot-canvas-v2');
      canvasCtrl.render({ fractalSet: 'julia', cReal: -0.5, cImag: 0.3 });
      assert.ok(canvasCtrl.ctx.drawCalls.some(c => c.op === 'putImageData'));
      assert.ok(canvasCtrl.ctx.drawCalls.some(c => c.op === 'arc'));
    });
  });

  // =========================================================================
  // 4. SOUND ENGINE 3: STRANGE ATTRACTOR FM (RK4 CHAOS)
  // =========================================================================
  describe('4. Sound Engine 3: Strange Attractor FM (StrangeAttractorDSP)', () => {
    it('integrates Lorenz, Rössler, Chua, Thomas, and Aizawa attractors via RK4 without NaN', () => {
      const types = ['lorenz', 'rossler', 'chua', 'thomas', 'aizawa'];
      for (const type of types) {
        let state = { x: 0.1, y: 0.1, z: 0.1 };
        for (let i = 0; i < 50; i++) {
          state = win.StrangeAttractorDSP.rk4Step(type, state, 0.01, {});
        }
        assert.ok(Number.isFinite(state.x) && Number.isFinite(state.y) && Number.isFinite(state.z), `RK4 state for ${type} must remain finite`);
        assert.ok(Math.abs(state.x) <= 1000 && Math.abs(state.y) <= 1000 && Math.abs(state.z) <= 1000);
      }
    });

    it('safeguards RK4 against numerical explosion', () => {
      const state = win.StrangeAttractorDSP.rk4Step('lorenz', { x: 1e9, y: NaN, z: -1e9 }, 0.1, {});
      assert.equal(state.x, 0.1);
      assert.equal(state.y, 0.1);
      assert.equal(state.z, 0.1);
    });

    it('generates stereo FM audio buffers modulated by chaotic attractor trajectories', () => {
      const ctx = new MockAudioContext();
      const buf = win.StrangeAttractorDSP.generateAttractorBuffer(ctx, 220, 0.1, 'lorenz', {
        attractorSpeed: 35.0,
        fmDepth: 0.5
      });
      assert.ok(buf);
      assert.equal(buf.numberOfChannels, 2);
      assert.equal(buf.length, Math.floor(44100 * 0.1));
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      let rmsL = 0, rmsR = 0;
      for (let i = 0; i < left.length; i++) {
        rmsL += left[i] * left[i];
        rmsR += right[i] * right[i];
      }
      assert.ok(rmsL > 0 && rmsR > 0, 'Stereo channels should contain synthesized FM waveform');
    });
  });

  // =========================================================================
  // 5. SOUND ENGINE 4: HYPER-DRONE
  // =========================================================================
  describe('5. Sound Engine 4: Hyper-Drone Engine', () => {
    it('creates morphing dual-Julia drone wavetables with time-evolving swirl', () => {
      const ctx = new MockAudioContext();
      const waveT0 = win.FractalWavetableDSP.createDroneWave(ctx, {
        droneMorph: 0.25,
        droneSwirlRate: 0.5,
        droneSpectral: 8,
        droneSub: 0.6
      }, 0);
      const waveT1 = win.FractalWavetableDSP.createDroneWave(ctx, {
        droneMorph: 0.75,
        droneSwirlRate: 0.5,
        droneSpectral: 8,
        droneSub: 0.6
      }, 1000);

      assert.ok(waveT0 && waveT1);
      assert.notDeepEqual(waveT0.real, waveT1.real, 'Drone wavetable should evolve with morph and timestamp');
    });
  });

  // =========================================================================
  // 6. SOUND ENGINE 5: OPTICAL IMAGE HARMONICS
  // =========================================================================
  describe('6. Sound Engine 5: Optical Image Harmonics Resynthesis', () => {
    it('creates PeriodicWaves from image canvas across radial, horizontal, and vertical scan modes', () => {
      const ctx = new MockAudioContext();
      const scanModes = ['radial', 'horizontal', 'vertical'];
      const colorModes = ['luminance', 'redblue', 'rgb'];

      for (const imageScanMode of scanModes) {
        for (const imageColorMode of colorModes) {
          const wave = win.OpticalAndAutomataDSP.createImageWave(ctx, {
            imageScanMode,
            imageColorMode,
            imageRadius: 25,
            imageContrast: 110,
            imageCursorX: 60,
            imageCursorY: 60
          });
          assert.ok(wave);
          assert.equal(wave.real.length, 128);
        }
      }
    });

    it('renders all built-in optical textures (nebula, chladni, interference, grid, mandelbrot)', () => {
      const presets = ['preset_nebula', 'preset_chladni', 'preset_interference', 'preset_grid', 'preset_mandelbrot'];
      for (const preset of presets) {
        env.evaluate(`renderImageTexture(${JSON.stringify(preset)})`);
        const imgCtx = win.imageBufferCanvas.getContext('2d');
        assert.ok(imgCtx.drawCalls.some(c => c.op === 'putImageData'));
      }
    });
  });

  // =========================================================================
  // 7. SOUND ENGINE 6: WOLFRAM 1D CELLULAR AUTOMATA
  // =========================================================================
  describe('7. Sound Engine 6: Wolfram 1D Cellular Automata', () => {
    it('generates distinct harmonic masks for Rules 30, 90, 110, and 150', () => {
      const ctx = new MockAudioContext();
      const wave30 = win.OpticalAndAutomataDSP.generateCellularAutomataWave(ctx, 30, 64);
      const wave90 = win.OpticalAndAutomataDSP.generateCellularAutomataWave(ctx, 90, 64);
      const wave110 = win.OpticalAndAutomataDSP.generateCellularAutomataWave(ctx, 110, 64);

      assert.ok(wave30 && wave90 && wave110);
      assert.equal(wave110.real.length, 128);
      assert.notDeepEqual(wave90.real, wave110.real, 'Rule 90 and Rule 110 should produce distinct overtone spectra');
    });
  });

  // =========================================================================
  // 8. ADSR ENVELOPE GENERATOR MODULE
  // =========================================================================
  describe('8. ADSR Amplitude Envelope Generator', () => {
    it('schedules Attack, Decay, Sustain on playNote and exponential Release on stopNote', () => {
      env.evaluate('initAudioEngine()');
      const vm = env.evaluate('voiceManager');
      const params = env.evaluate('synthParams');
      params.attack = 0.05;
      params.decay = 0.20;
      params.sustain = 0.60;
      params.release = 0.40;

      vm.playNote(60, 0.8, params);
      const voice = vm.activeVoices.get(60);
      assert.ok(voice, 'Voice 60 should be active');

      const gainEvents = voice.voiceGain.gain.events;
      assert.equal(gainEvents[0].type, 'setValueAtTime');
      assert.equal(gainEvents[1].type, 'linearRampToValueAtTime');
      assert.ok(Math.abs(gainEvents[1].value - 0.8) < 1e-6, 'Attack ramps to velocity');
      assert.equal(gainEvents[2].type, 'linearRampToValueAtTime');
      assert.ok(Math.abs(gainEvents[2].value - 0.8 * 0.6) < 1e-6, 'Decay ramps to velocity * sustain');

      // Stop note and verify Release ramp
      vm.stopNote(60, false, params);
      assert.equal(vm.activeVoices.has(60), false);
      assert.ok(gainEvents.some(e => e.type === 'exponentialRampToValueAtTime' && e.value === 0.0001));
      env.flushTimeouts();
    });

    it('renders the ADSR envelope visualization canvas when parameters change', () => {
      const adsrCanvas = env.doc.getElementById('adsr-canvas-v2');
      const ctx = adsrCanvas.getContext('2d');
      ctx.drawCalls.length = 0;

      const attackKnob = env. evaluate('knobs.adsrAttack');
      attackKnob.setValue(0.25);
      assert.ok(ctx.drawCalls.some(c => c.op === 'stroke'), 'ADSR canvas should redraw stroke curve');
    });
  });

  // =========================================================================
  // 9. DETUNE, SUPER-UNISON & SUB-BASS MODULE
  // =========================================================================
  describe('9. Super-Unison Detune Stack, Sub-Bass & Portamento Glide', () => {
    it('allocates exact unison oscillator count, detune spread, stereo panning, and sub-bass oscillator', () => {
      env.evaluate('initAudioEngine()');
      const vm = env.evaluate('voiceManager');
      const params = env.evaluate('synthParams');
      params.mode = 'polotti_fas';
      params.unisonEnabled = true;
      params.unisonCount = 5;
      params.unisonDetune = 20;
      params.unisonStereo = 80;
      params.subLevel = 0.5;
      params.subOctave = 12;
      params.subWave = 'triangle';

      vm.playNote(60, 0.9, params);
      const voice = vm.activeVoices.get(60);
      assert.equal(voice.unisonNodes.length, 5, 'Should create 5 unison voices');
      assert.equal(voice.subOscillators.length, 1, 'Should create 1 sub-bass oscillator');
      assert.equal(voice.subNode.osc.type, 'triangle');

      // Check symmetric detune cents: [-20, -10, 0, +10, +20]
      const detunes = Array.from(voice.unisonNodes, n => n.osc.detune.value === 0 ? 0 : n.osc.detune.value);
      assert.deepEqual(detunes, [-20, -10, 0, 10, 20]);

      // Check portamento glide on second note
      params.glideTime = 100;
      vm.playNote(72, 0.9, params);
      const voice72 = vm.activeVoices.get(72);
      const freqEvents = voice72.unisonNodes[0].osc.frequency.events;
      assert.ok(freqEvents.some(e => e.type === 'exponentialRampToValueAtTime'), 'Glide should schedule exponential frequency ramp');
    });

    it(' collapses unison to 1 centered voice and mutes sub-bass when unisonEnabled is false', () => {
      env.evaluate('initAudioEngine()');
      const vm = env.evaluate('voiceManager');
      const params = env.evaluate('synthParams');
      params.unisonEnabled = false;
      params.unisonCount = 5;

      vm.playNote(60, 0.8, params);
      const voice = vm.activeVoices.get(60);
      assert.equal(voice.unisonNodes.length, 1);
      assert.equal(voice.subNode.gain.gain.value, 0);
    });
  });

  // =========================================================================
  // 10. STUDIO AUDIO EFFECTS PIPELINE
  // =========================================================================
  describe('10. Studio Audio Effects Pipeline (AudioFXEngine)', () => {
    it('constructs the complete serial FX chain and updates Filter, Wavefolder, Chorus, Delay, Reverb, and Bypass', () => {
      const ctx = new MockAudioContext();
      const fx = new win.AudioFXEngine(ctx);

      assert.ok(fx.filterNode);
      assert.ok(fx.wavefolderNode);
      assert.ok(fx.chorusDelayL && fx.chorusDelayR);
      assert.ok(fx.delayNodeL && fx.delayNodeR);
      assert.ok(fx.convolverNode);
      assert.ok(fx.limiterNode);
      assert.ok(fx.masterGain);
      assert.ok(fx.analyserNode);

      // Update FX parameters
      fx.updateParams({
        driveAmount: 0.5,
        chorusMix: 0.4,
        delayMix: 0.35,
        delayTime: 400,
        delayFeedback: 0.5,
        reverbMix: 0.6,
        reverbSize: 3.0
      }, {
        cutoff: 2500,
        resonance: 4.5,
        filterType: 'bandpass'
      });

      assert.equal(fx.filterNode.type, 'bandpass');
      assert.equal(fx.filterNode.frequency.value, 2500);
      assert.equal(fx.filterNode.Q.value, 4.5);
      assert.ok(Math.abs(fx.delayNodeL.delayTime.value - 0.4) < 1e-6);
      assert.ok(Math.abs(fx.delayNodeR.delayTime.value - 0.6) < 1e-6);

      // Test Master FX Bypass
      fx.setMasterFXBypass(true, { driveAmount: 0.5, chorusMix: 0.4, delayMix: 0.35, reverbMix: 0.6 }, { cutoff: 2500 });
      assert.equal(fx.filterNode.frequency.value, 20000);
      assert.equal(fx.chorusWetGain.gain.value, 0);
      assert.equal(fx.delayWetGain.gain.value, 0);
      assert.equal(fx.reverbWetGain.gain.value, 0);
    });
  });

  // =========================================================================
  // 11. CONFIGURABLE MULTI-DESTINATION LFO
  // =========================================================================
  describe('11. Configurable Multi-Destination Modulation LFO', () => {
    it('updates context-aware LFO target options per synthesis mode and modulates parameters', () => {
      env.evaluate('initAudioEngine()');
      const lfoSelect = env.doc.getElementById('lfo-target-select-v2');

      env.evaluate('updateLFOTargetOptions("polotti_fas")');
      assert.ok(lfoSelect.children.some(opt => opt.value === 'fasDimension'));

      env.evaluate('updateLFOTargetOptions("julia")');
      assert.ok(lfoSelect.children.some(opt => opt.value === 'cReal'));

      env.evaluate('updateLFOTargetOptions("attractor")');
      assert.ok(lfoSelect.children.some(opt => opt.value === 'fmDepth'));

      // Modulate filter cutoff across LFO shapes
      const shapes = ['sine', 'triangle', 'sawtooth', 'square', 'fbm'];
      const fx = env.evaluate('fxEngine');
      for (const shape of shapes) {
        env.evaluate(`synthParams.modLfoShape = ${JSON.stringify(shape)}; synthParams.modLfoTarget = 'cutoff'; synthParams.modLfoDepth = 50; synthParams.cutoff = 4000;`);
        env.evaluate('updateModulationLFO(0.17)');
        assert.ok(fx.filterNode.frequency.value > 50 && fx.filterNode.frequency.value <= 18000);
      }
    });
  });

  // =========================================================================
  // 12. GENERATIVE ARPEGGIATOR & SEQUENCER
  // =========================================================================
  describe('12. Generative Fractal Arpeggiator', () => {
    it('steps through held notes in Up, Down, Up/Down, Random, Euclidean, Fibonacci, and Thue-Morse modes', () => {
      env.evaluate('initAudioEngine()');
      const vm = env.evaluate('voiceManager');
      const arp = env.evaluate('arpParams');

      arp.enabled = true;
      arp.rate = 120;
      arp.division = 0.25;
      arp.octaves = 2;
      arp.heldNotes = [60, 64, 67];

      const modes = ['up', 'down', 'updown', 'random', 'euclidean', 'fibonacci', 'thue_morse'];
      let simTime = 1.0;

      for (const mode of modes) {
        arp.mode = mode;
        arp.currentStep = 2; // Step 2 is an active pulse in Euclidean E(5,8) (floor(10/8)=1 !== floor(5/8)=0)
        arp.lastStepTime = 0;
        simTime += 1.0;
        env.evaluate(`updateArpeggiator(${simTime})`);
        assert.ok(vm.activeVoices.size > 0, `Arpeggiator mode ${mode} should trigger a voice`);
        env.flushTimeouts();
      }
    });
  });

  // =========================================================================
  // 13. MULTI-MODAL VISUALIZER SUITE
  // =========================================================================
  describe('13. Real-Time Visualizer Suite', () => {
    it('renders all 5 visualizer tabs (attractor3d, spectrogram, goniometer, harmonics, scope)', () => {
      env.evaluate('initAudioEngine()');
      const viz = env.evaluate('visualizerSuite');
      const tabs = ['attractor3d', 'spectrogram', 'goniometer', 'harmonics', 'scope'];

      for (const tab of tabs) {
        viz.activeVisualizerTab = tab;
        viz.mainCtx.drawCalls.length = 0;
        viz.render(env.evaluate('synthParams'));
        assert.ok(viz.mainCtx.drawCalls.length > 0, `Visualizer tab ${tab} should issue canvas draw calls`);
      }
    });
  });

  // =========================================================================
  // 14. FRAMEWORK: POLYPHONY, MIDI, KEYBOARD, RECORDER & PRESETS
  // =========================================================================
  describe('14. Web Synthesizer Framework (Polyphony, MIDI, Recorder, Presets, UI)', () => {
    it('enforces 32-voice polyphony with priority voice stealing and sustain pedal support', () => {
      env.evaluate('initAudioEngine()');
      const vm = env.evaluate('voiceManager');
      const params = env.evaluate('synthParams');

      // Hold sustain pedal and play 32 notes
      vm.handleSustainPedal(true, params);
      for (let n = 36; n < 36 + 32; n++) {
        vm.playNote(n, 0.8, params);
      }
      assert.equal(vm.activeVoices.size, 32);

      // Release note 40 while pedal is down -> becomes pending release
      vm.stopNote(40, false, params);
      assert.equal(vm.activeVoices.get(40).isPendingRelease, true);
      assert.equal(vm.activeVoices.size, 32);

      // Play 33rd note -> steals note 40 (pending release priority)
      vm.playNote(90, 0.8, params);
      assert.equal(vm.activeVoices.size, 32);
      assert.equal(vm.activeVoices.has(40), false, 'Pending-release voice 40 should be stolen first');
      assert.equal(vm.activeVoices.has(90), true);

      // Release sustain pedal -> stops remaining pending voices
      vm.stopNote(90, false, params);
      vm.handleSustainPedal(false, params);
      assert.equal(vm.activeVoices.has(90), false);
      env.flushTimeouts();
    });

    it('handles Web MIDI Note On, Note Off, Sustain Pedal (CC#64), and 14-bit Pitch Bend', () => {
      env.evaluate('initAudioEngine()');
      const vm = env.evaluate('voiceManager');
      const params = env.evaluate('synthParams');

      // Note On (0x90, note 60, vel 100)
      env.evaluate('handleMIDIMessage({ data: [0x90, 60, 100] })');
      assert.equal(vm.activeVoices.has(60), true);

      // Pitch Bend (0xE0, lsb 0, msb 96 -> +1.5 semitones)
      env.evaluate('handleMIDIMessage({ data: [0xE0, 0, 96] })');
      assert.ok(params.pitchBendCents > 0);

      // Sustain Pedal ON (0xB0, 64, 127)
      env.evaluate('handleMIDIMessage({ data: [0xB0, 64, 127] })');
      assert.equal(vm.isSustainPedalDown, true);

      // Sustain Pedal OFF (0xB0, 64, 0) & Note Off (0x80, 60, 0)
      env.evaluate('handleMIDIMessage({ data: [0xB0, 64, 0] })');
      env.evaluate('handleMIDIMessage({ data: [0x80, 60, 0] })');
      assert.equal(vm.activeVoices.has(60), false);
      env.flushTimeouts();
    });

    it('handles QWERTY keyboard events, Preset loading, Patch Mutation, and WAV Recording', () => {
      env.evaluate('initAudioEngine()');
      const vm = env.evaluate('voiceManager');

      // Press KeyZ (C3 = note 48)
      win.dispatchWindowEvent({ type: 'keydown', code: 'KeyZ', repeat: false });
      assert.equal(vm.activeVoices.has(48), true);

      // Release KeyZ
      win.dispatchWindowEvent({ type: 'keyup', code: 'KeyZ' });
      assert.equal(vm.activeVoices.has(48), false);

      // Load all factory presets without error
      const presets = env.evaluate('FACTORY_PRESETS');
      assert.ok(presets.length >= 15);
      for (const p of presets) {
        env.evaluate(`loadPreset(${JSON.stringify(p)})`);
        assert.equal(env.evaluate('synthParams.mode'), p.params.mode);
      }

      // Mutate button
      const btnMutate = env.doc.getElementById('btn-mutate-v2');
      btnMutate.click();
      assert.equal(env.doc.getElementById('lbl-current-preset-v2').innerText, '🎲 Mutated Patch (25%)');

      // Record WAV start & stop
      const btnRec = env.doc.getElementById('btn-record-v2');
      btnRec.click();
      assert.equal(env.evaluate('isRecording'), true);
      btnRec.click();
      assert.equal(env.evaluate('isRecording'), false);
      env.flushTimeouts();
    });
  });
});
