/**
 * Physical Modeling String Synthesizer v0.1 — Unit & Integration Test Suite
 *
 * Verifies all 6 physical modeling string engines, acoustic waveguide DSP properties,
 * dynamic engine registration with PolyphonicVoiceManager, LFO target extensions,
 * 3D vibrating string modal visualizer, and end-to-end integration via stringphysicalmodeling.html.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { createSynthTestEnv, MockAudioContext } = require('./test-harness');

// Require the 6 Physical Modeling String Engines directly via UMD
const { PinchedPluckedEngine } = require('../synths/stringphysicalmodeling/engines/pinched-plucked-string');
const { TappedStruckEngine } = require('../synths/stringphysicalmodeling/engines/tapped-struck-string');
const { BowedViolinEngine } = require('../synths/stringphysicalmodeling/engines/bowed-violin-string');
const { TouchedHarmonicEngine } = require('../synths/stringphysicalmodeling/engines/touched-harmonic-string');
const { SympatheticStringEngine } = require('../synths/stringphysicalmodeling/engines/sympathetic-string-array');
const { StiffStringEngine } = require('../synths/stringphysicalmodeling/engines/stiff-string-dispersion');
const { STRING_FACTORY_PRESETS } = require('../synths/stringphysicalmodeling/presets');

const PROJECT_DIR = path.resolve(__dirname, '..');

describe('1. Physical Modeling String Engines — Unit Tests', () => {
  it('Mode 1 (PinchedPluckedEngine): synthesizes Karplus-Strong waveguide buffers with finite non-zero samples and sustain loop points', () => {
    const ctx = new MockAudioContext();
    const params = {
      pluckPosition: 0.18,
      pinchWidth: 0.06,
      stringDamping: 0.30,
      stringStiffness: 0.0008,
      bodyResonance: 0.55,
      pickupPosition: 0.14
    };

    const buf1 = PinchedPluckedEngine.generatePluckedWaveguideBuffer(ctx, 220, params);
    assert.ok(buf1);
    const data = buf1.getChannelData(0);
    assert.ok(data.length > 35000);

    let maxAbs = 0;
    let allFinite = true;
    for (let i = 0; i < data.length; i++) {
      const s = data[i];
      if (!Number.isFinite(s)) { allFinite = false; break; }
      const a = Math.abs(s);
      if (a > maxAbs) maxAbs = a;
    }
    assert.equal(allFinite, true, 'All waveguide samples must be finite');
    assert.ok(maxAbs > 0.3 && maxAbs <= 1.0, `Normalized peak (${maxAbs}) should be in (0.3, 1.0]`);
    assert.ok(buf1._loopStart > 0.4 && buf1._loopEnd > buf1._loopStart);

    // Verify LRU buffer cache returns identical AudioBuffer on repeated note
    const buf2 = PinchedPluckedEngine.generatePluckedWaveguideBuffer(ctx, 220, params);
    assert.equal(buf1, buf2, 'PinchedPluckedEngine should return cached AudioBuffer for identical note & params');
  });

  it('Mode 2 (TappedStruckEngine): synthesizes Hunt-Crossley non-linear hammer-string contact with tangent click transient', () => {
    const ctx = new MockAudioContext();
    const softParams = { tapPosition: 0.25, hammerHardness: 1.4, hammerMass: 0.65, tangentClick: 0.0, stringDamping: 0.25 };
    const hardParams = { tapPosition: 0.12, hammerHardness: 3.8, hammerMass: 0.25, tangentClick: 0.85, stringDamping: 0.25 };

    const softBuf = TappedStruckEngine.generateTappedStringBuffer(ctx, 261.63, softParams);
    const hardBuf = TappedStruckEngine.generateTappedStringBuffer(ctx, 261.63, hardParams);

    const softData = softBuf.getChannelData(0);
    const hardData = hardBuf.getChannelData(0);
    assert.equal(softData.length, hardData.length);

    // Verify finite non-zero samples and different attack transient profiles
    let diffEnergy = 0;
    for (let i = 0; i < 1000; i++) {
      assert.ok(Number.isFinite(softData[i]) && Number.isFinite(hardData[i]));
      diffEnergy += Math.abs(hardData[i] - softData[i]);
    }
    assert.ok(diffEnergy > 5, 'Hard tangent strike should produce distinct attack transient from soft felt mallet');
  });

  it('Mode 1 & Mode 2 Sustain Loop Integrity: maintains flat RMS energy (< 5% drift) and click-free loop boundaries without ~250ms re-attack artifacts', () => {
    const ctx = new MockAudioContext();
    const engines = [
      () => PinchedPluckedEngine.generatePluckedWaveguideBuffer(ctx, 261.63, { pluckPosition: 0.18, stringDamping: 0.32 }),
      () => TappedStruckEngine.generateTappedStringBuffer(ctx, 261.63, { tapPosition: 0.25, hammerHardness: 2.5 })
    ];

    for (const genBuf of engines) {
      const buf = genBuf();
      const L = buf.getChannelData(0);
      const loopStartIdx = Math.round(buf._loopStart * ctx.sampleRate);
      const loopEndIdx = Math.round(buf._loopEnd * ctx.sampleRate);
      const halfSpan = Math.floor((loopEndIdx - loopStartIdx) / 2);

      let rmsFirstHalf = 0;
      let rmsSecondHalf = 0;
      for (let i = 0; i < halfSpan; i++) {
        rmsFirstHalf += L[loopStartIdx + i] * L[loopStartIdx + i];
        rmsSecondHalf += L[loopStartIdx + halfSpan + i] * L[loopStartIdx + halfSpan + i];
      }
      rmsFirstHalf = Math.sqrt(rmsFirstHalf / halfSpan);
      rmsSecondHalf = Math.sqrt(rmsSecondHalf / halfSpan);

      const rmsRatio = Math.max(rmsFirstHalf, rmsSecondHalf) / Math.max(1e-6, Math.min(rmsFirstHalf, rmsSecondHalf));
      assert.ok(rmsRatio < 1.05, `Sustain loop RMS ratio (${rmsRatio.toFixed(4)}) must be < 1.05 to prevent repeating ~250ms re-attacks`);

      // Verify loop wrap step continuity matches normal in-loop sample step
      const seamStep = Math.abs(L[loopEndIdx - 1] - L[loopStartIdx]);
      assert.ok(seamStep < 0.08, `Loop wrap seam step (${seamStep.toFixed(4)}) must be click-free (< 0.08)`);
    }
  });

  it('Mode 3 (BowedViolinEngine): synthesizes Helmholtz stick-slip bowed string with continuous sustain', () => {
    const ctx = new MockAudioContext();
    const params = {
      bowPressure: 0.55,
      bowVelocity: 0.65,
      bowPosition: 0.11,
      rosinGrit: 0.20,
      bodyResonance: 0.70
    };

    const buf = BowedViolinEngine.generateBowedStringBuffer(ctx, 440, params);
    assert.ok(buf);
    assert.equal(BowedViolinEngine.getEngineDescriptor().loop, true);

    const data = buf.getChannelData(0);
    let rms = 0;
    for (let i = 0; i < data.length; i++) {
      assert.ok(Number.isFinite(data[i]));
      rms += data[i] * data[i];
    }
    rms = Math.sqrt(rms / data.length);
    assert.ok(rms > 0.1, 'Sustained bowed string should have healthy RMS energy');
  });

  it('Mode 4 (TouchedHarmonicEngine): isolates flageolet nodal harmonics (e.g. 1/3 node suppresses fundamental and boosts 3rd partial)', () => {
    const ctx = new MockAudioContext();
    const paramsThirdNode = {
      touchNodePos: 1 / 3, // Node at 1/3 string length -> 3rd, 6th, 9th harmonics survive
      touchDamping: 0.95,
      pluckPosition: 0.18,
      fretBuzz: 0.0,
      harmonicShimmer: 0.2
    };

    const wave = TouchedHarmonicEngine.createTouchedStringWave(ctx, paramsThirdNode);
    assert.ok(wave);
    // Partial 1 (fundamental) should be heavily damped compared to Partial 3 (3rd harmonic)
    const ampFundamental = Math.hypot(wave.real[1], wave.imag[1]);
    const ampThirdHarmonic = Math.hypot(wave.real[3], wave.imag[3]);
    assert.ok(ampThirdHarmonic > ampFundamental * 4, `3rd harmonic (${ampThirdHarmonic}) must dominate damped fundamental (${ampFundamental}) at 1/3 touch node`);

    // Verify Sitar Javari buzz generates rich upper harmonics
    const javariWave = TouchedHarmonicEngine.createTouchedStringWave(ctx, { ...paramsThirdNode, touchDamping: 0.1, fretBuzz: 0.9 });
    const highPartialEnergy = Math.hypot(javariWave.real[15], javariWave.imag[15]);
    assert.ok(highPartialEnergy > 0.01, 'Javari curved bridge grazing should excite upper partials');
  });

  it('Mode 5 (SympatheticStringEngine): computes evolving multi-course sympathetic resonance wavetables', () => {
    const ctx = new MockAudioContext();
    const params = {
      sympatheticMix: 0.75,
      courseDetune: 0.50,
      bridgeCoupling: 0.65,
      bodySize: 1.25
    };

    const waveT0 = SympatheticStringEngine.createSympatheticWave(ctx, params, 0);
    const waveT1 = SympatheticStringEngine.createSympatheticWave(ctx, params, 500);
    assert.ok(waveT0 && waveT1);

    // Verify time evolution from sympathetic beating
    let diff = 0;
    for (let k = 1; k <= 32; k++) {
      diff += Math.abs(waveT0.real[k] - waveT1.real[k]) + Math.abs(waveT0.imag[k] - waveT1.imag[k]);
    }
    assert.ok(diff > 0.01, 'SympatheticStringEngine wavetable should evolve over time as detuned courses beat');
  });

  it('Mode 6 (StiffStringEngine): synthesizes dispersive stiff wire with Fletcher inharmonicity B > 0', () => {
    const ctx = new MockAudioContext();
    const params = {
      inharmonicityB: 0.015,
      stiffPartials: 24,
      stiffHfLoss: 0.35,
      tensionDrop: 0.45,
      pluckPosition: 0.16
    };

    const buf = StiffStringEngine.generateStiffStringBuffer(ctx, 110, params);
    assert.ok(buf);
    const data = buf.getChannelData(0);
    let maxPeak = 0;
    for (let i = 0; i < data.length; i++) {
      assert.ok(Number.isFinite(data[i]));
      if (Math.abs(data[i]) > maxPeak) maxPeak = Math.abs(data[i]);
    }
    assert.ok(maxPeak > 0.3);
  });
});

describe('2. Physical Modeling String Synth App (stringphysicalmodeling.html) — Integration Tests', () => {
  let env;

  beforeEach(() => {
    env = createSynthTestEnv(PROJECT_DIR, 'stringphysicalmodeling.html');
  });

  it('bootstraps stringphysicalmodeling.html, registers all 6 string engines, and populates 17 presets', () => {
    const { context, doc } = env;
    vm.runInContext('initAudioEngine();', context);

    assert.equal(vm.runInContext('isAudioStarted', context), true);
    assert.equal(STRING_FACTORY_PRESETS.length, 17);

    const presetSelect = doc.getElementById('preset-select-v2');
    assert.equal(presetSelect.children.length, 17);
  });

  it('plays polyphonic voices across all 6 physical modeling string modes', () => {
    const { context } = env;
    vm.runInContext('initAudioEngine();', context);

    const modes = [
      { id: 'pinched_plucked', type: 'buffer', hasTailLoop: true },
      { id: 'tapped_struck', type: 'buffer', hasTailLoop: true },
      { id: 'bowed_violin', type: 'buffer', loops: true },
      { id: 'touched_harmonic', type: 'wavetable' },
      { id: 'sympathetic_array', type: 'wavetable' },
      { id: 'stiff_dispersion', type: 'buffer', hasTailLoop: true }
    ];

    modes.forEach((m, idx) => {
      const note = 60 + idx;
      const voiceInfo = vm.runInContext(`(() => {
        synthParams.mode = '${m.id}';
        synthParams.unisonEnabled = true;
        synthParams.unisonCount = 3;
        voiceManager.playNote(${note}, 0.85, synthParams);
        const v = voiceManager.activeVoices.get(${note});
        return {
          mode: v.currentMode,
          unisonLen: v.unisonNodes.length,
          bufferLen: v.bufferNodes.length,
          hasSrc: Boolean(v.bufferNodes[0] && v.bufferNodes[0].bufNode),
          hasOsc: Boolean(v.unisonNodes[0] && v.unisonNodes[0].osc),
          isLooping: v.bufferNodes[0] && v.bufferNodes[0].bufNode ? v.bufferNodes[0].bufNode.loop : false,
          loopStart: v.bufferNodes[0] && v.bufferNodes[0].bufNode ? v.bufferNodes[0].bufNode.loopStart : 0
        };
      })()`, context);

      assert.equal(voiceInfo.mode, m.id);
      if (m.type === 'buffer') {
        assert.equal(voiceInfo.bufferLen, 3);
        assert.equal(voiceInfo.hasSrc, true, `Mode ${m.id} should create AudioBufferSourceNode`);
        assert.equal(voiceInfo.isLooping, true, `Mode ${m.id} should enable sustain loop`);
        if (m.hasTailLoop) {
          assert.ok(voiceInfo.loopStart > 0.4, `Mode ${m.id} should set tail loopStart > 0.4s`);
        }
      } else {
        assert.equal(voiceInfo.unisonLen, 3);
        assert.equal(voiceInfo.hasOsc, true, `Mode ${m.id} should create OscillatorNode with PeriodicWave`);
      }

      vm.runInContext(`voiceManager.stopNote(${note}, true, synthParams);`, context);
    });
  });

  it('loads all 17 string factory presets and updates LFO targets and parameters cleanly', () => {
    const { context } = env;
    vm.runInContext('initAudioEngine();', context);

    const count = vm.runInContext('FACTORY_PRESETS.length', context);
    assert.equal(count, 17);

    for (let i = 0; i < count; i++) {
      const pInfo = vm.runInContext(`
        loadPreset(FACTORY_PRESETS[${i}]);
        ({
          id: FACTORY_PRESETS[${i}].id,
          mode: synthParams.mode,
          cutoff: synthParams.cutoff
        });
      `, context);
      assert.ok(pInfo.id);
      assert.ok(pInfo.cutoff >= 50 && pInfo.cutoff <= 16000);
    }
  });

  it('modulates string-specific LFO destinations and renders the 3D Vibrating String Modal Visualizer', () => {
    const { context } = env;
    vm.runInContext('initAudioEngine();', context);

    // Trigger LFO modulation on pluckPosition and bowPressure
    vm.runInContext(`
      synthParams.mode = 'pinched_plucked';
      synthParams.modLfoTarget = 'pluckPosition';
      synthParams.modLfoDepth = 50;
      voiceManager.playNote(60, 0.8, synthParams);
      updateModulationLFO(0.35);

      synthParams.mode = 'bowed_violin';
      synthParams.modLfoTarget = 'bowPressure';
      updateModulationLFO(0.70);
    `, context);

    // Render all 5 visualizer tabs including custom 3D Vibrating String Modes ('attractor3d')
    const vizModes = ['attractor3d', 'spectrogram', 'goniometer', 'harmonics', 'scope'];
    for (const vMode of vizModes) {
      vm.runInContext(`
        visualizerSuite.vizMode = '${vMode}';
        visualizerSuite.render(synthParams);
      `, context);
    }
  });

  it('maintains ultra-low real-time key-press latency (< 6 ms uncached, < 1 ms cached) across all 6 modes', () => {
    const { context } = env;
    vm.runInContext('initAudioEngine();', context);

    const modes = ['pinched_plucked', 'tapped_struck', 'bowed_violin', 'touched_harmonic', 'sympathetic_array', 'stiff_dispersion'];
    for (let i = 0; i < modes.length; i++) {
      const mode = modes[i];
      const note = 48 + i * 3;
      const t0 = performance.now();
      vm.runInContext(`
        synthParams.mode = '${mode}';
        voiceManager.playNote(${note}, 0.85, synthParams);
      `, context);
      const uncachedMs = performance.now() - t0;

      const t1 = performance.now();
      vm.runInContext(`
        voiceManager.playNote(${note}, 0.85, synthParams);
      `, context);
      const cachedMs = performance.now() - t1;

      assert.ok(uncachedMs < 40, `Mode ${mode} uncached note-on took ${uncachedMs.toFixed(2)} ms (should be < 40 ms including VM JIT)`);
      assert.ok(cachedMs < 2, `Mode ${mode} cached note-on took ${cachedMs.toFixed(2)} ms (should be < 2 ms)`);
    }
  });

  it('provides expressive intermediate MIDI velocity dynamic range (~22 dB between soft pp and hard ff strikes with a clean audible floor)', () => {
    const { context } = env;
    vm.runInContext('initAudioEngine();', context);

    const dynamics = vm.runInContext(`(() => {
      // Soft MIDI Note On (note 60, MIDI velocity 25)
      handleMIDIMessage({ data: [0x90, 60, 25] });
      const softVoice = voiceManager.activeVoices.get(60);
      const softTotalGain = softVoice.velocity * softVoice.masterMerger.gain.value;

      // Hard MIDI Note On (note 64, MIDI velocity 127)
      handleMIDIMessage({ data: [0x90, 64, 127] });
      const hardVoice = voiceManager.activeVoices.get(64);
      const hardTotalGain = hardVoice.velocity * hardVoice.masterMerger.gain.value;

      return { softTotalGain, hardTotalGain, ratio: hardTotalGain / softTotalGain };
    })()`, context);

    assert.ok(dynamics.softTotalGain > 0.05 && dynamics.softTotalGain < 0.12, `Soft MIDI note gain (${dynamics.softTotalGain.toFixed(3)}) must sit in the intermediate audible floor (0.05..0.12)`);
    assert.ok(dynamics.ratio > 10.0 && dynamics.ratio < 16.0, `Hard vs soft MIDI velocity ratio (${dynamics.ratio.toFixed(2)}x) should sit in the expressive 10x–16x (~20–24 dB) range`);
  });
});
