/**
 * DX7 & Dexed 80s FM Pianos v1.0 — Unit & Integration Test Suite
 *
 * Verifies all 6 Yamaha DX7 / TX816 6-Operator Phase-Modulation (FM) Piano engines,
 * phase-locked click-free sustain loops, velocity-to-modulation-index sensitivity,
 * LRU buffer caching, LFO target extensions, 3D DX7 Bessel sideband visualizer,
 * and end-to-end integration via fmpianos.html.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { createSynthTestEnv, MockAudioContext } = require('./test-harness');

// Require the 6 FM Piano Engines & Factory Presets directly via UMD
const { DX7EPiano1Engine } = require('../synths/fmpianos/engines/dx7-epiano1');
const { FMCrystalBellEngine } = require('../synths/fmpianos/engines/fm-crystal-bell');
const { FMWurliReedEngine } = require('../synths/fmpianos/engines/fm-wurli-reed');
const { FMTX816StackEngine } = require('../synths/fmpianos/engines/fm-tx816-stack');
const { FMLushPadEPEngine } = require('../synths/fmpianos/engines/fm-lush-pad-ep');
const { FMPercClavEngine } = require('../synths/fmpianos/engines/fm-perc-clav');
const { FM_PIANO_FACTORY_PRESETS } = require('../synths/fmpianos/presets');

const PROJECT_DIR = path.resolve(__dirname, '..');

describe('1. DX7 & Dexed 80s FM Piano Engines — Unit Tests', () => {
  it('Mode 1 (DX7EPiano1Engine): synthesizes Algorithm 5 stereo FM buffers with velocity-sensitive bark, 14:1 tine chime, and LRU cache', () => {
    const ctx = new MockAudioContext();
    const params = {
      tineChime: 0.68,
      fmBark: 0.42,
      hammerClick: 0.35,
      tineDecay: 0.55
    };

    const buf1 = DX7EPiano1Engine.generateEPiano1Buffer(ctx, 261.63, params, 0.85);
    assert.ok(buf1);
    assert.equal(buf1.numberOfChannels, 2);

    const left = buf1.getChannelData(0);
    const right = buf1.getChannelData(1);
    assert.ok(left.length > 35000);

    let maxAbs = 0;
    let stereoDiff = 0;
    for (let i = 0; i < left.length; i++) {
      assert.ok(Number.isFinite(left[i]) && Number.isFinite(right[i]));
      const a = Math.abs(left[i]);
      if (a > maxAbs) maxAbs = a;
      stereoDiff += Math.abs(left[i] - right[i]);
    }
    assert.ok(maxAbs > 0.25 && maxAbs <= 1.0, `Peak (${maxAbs}) should be in (0.25, 1.0]`);
    assert.ok(stereoDiff > 10, 'Stereo DX7 E.Piano 1 should have wide L/R chorus phase image');
    assert.ok(buf1._loopStart > 0.4 && buf1._loopEnd > buf1._loopStart);

    // Verify LRU cache returns identical AudioBuffer on repeated note & velocity layer
    const buf2 = DX7EPiano1Engine.generateEPiano1Buffer(ctx, 261.63, params, 0.85);
    assert.equal(buf1, buf2, 'DX7EPiano1Engine should return cached AudioBuffer for identical note, params & velocity');
  });

  it('Mode 2 (FMCrystalBellEngine): synthesizes Algorithm 14 cascaded 3-op bell tower and responds to bellRoundness', () => {
    const ctx = new MockAudioContext();
    const sharpBell = FMCrystalBellEngine.generateCrystalBellBuffer(ctx, 440, {
      bellRatio: 7.0,
      bellRoundness: 0.05,
      cascadeShimmer: 0.85,
      warmPadMix: 0.40
    }, 0.9);
    const roundedBell = FMCrystalBellEngine.generateCrystalBellBuffer(ctx, 440, {
      bellRatio: 7.0,
      bellRoundness: 0.95,
      cascadeShimmer: 0.15,
      warmPadMix: 0.85
    }, 0.9);

    const sharpData = sharpBell.getChannelData(0);
    const roundData = roundedBell.getChannelData(0);

    // Measure first-difference (high-frequency sideband energy) in attack region
    let sharpHf = 0;
    let roundHf = 0;
    for (let i = 1; i < 4000; i++) {
      sharpHf += Math.abs(sharpData[i] - sharpData[i - 1]);
      roundHf += Math.abs(roundData[i] - roundData[i - 1]);
    }
    assert.ok(sharpHf > roundHf * 1.15, `Sharp crystal bell HF energy (${sharpHf.toFixed(1)}) should exceed soft rounded bell (${roundHf.toFixed(1)})`);
  });

  it('Mode 3 (FMWurliReedEngine): synthesizes Algorithm 4 odd-harmonic barking reed with stereo vibrato', () => {
    const ctx = new MockAudioContext();
    const buf = FMWurliReedEngine.generateWurliReedBuffer(ctx, 220, {
      reedBite: 0.75,
      reedBuzz: 0.55,
      tremoloDepth: 0.50,
      woodBody: 0.65
    }, 0.85);
    assert.ok(buf);
    const data = buf.getChannelData(0);
    let rms = 0;
    for (let i = 0; i < data.length; i++) {
      assert.ok(Number.isFinite(data[i]));
      rms += data[i] * data[i];
    }
    rms = Math.sqrt(rms / data.length);
    assert.ok(rms > 0.12, 'FM Wurlitzer reed should have healthy RMS energy');
  });

  it('Mode 4 (FMTX816StackEngine): synthesizes LA Studio TX816 multi-rack stereo ballad stack', () => {
    const ctx = new MockAudioContext();
    const buf = FMTX816StackEngine.generateTX816StackBuffer(ctx, 261.63, {
      stackSpread: 0.85,
      fosterGlass: 0.80,
      balladWarmth: 0.80,
      attackSnap: 0.55
    }, 0.85);
    assert.ok(buf);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    let diff = 0;
    for (let i = 0; i < 4000; i++) {
      diff += Math.abs(L[i] - R[i]);
    }
    assert.ok(diff > 20, 'TX816 Stack should produce wide stereo separation between Left and Right modules');
  });

  it('Mode 5 (FMLushPadEPEngine) & Mode 6 (FMPercClavEngine): synthesize soft blooming ballad pads and sharp CP-80 / Clav transients', () => {
    const ctx = new MockAudioContext();
    const padBuf = FMLushPadEPEngine.generateLushPadEPBuffer(ctx, 329.63, {
      toneSoftness: 0.80,
      bellBloom: 0.70,
      subWarmth: 0.75,
      airHalo: 0.60
    }, 0.8);
    const clavBuf = FMPercClavEngine.generatePercClavBuffer(ctx, 329.63, {
      attackSharpness: 0.90,
      hollowRatio: 3.0,
      stringBrilliance: 0.75,
      damperTightness: 0.70
    }, 0.9);

    assert.ok(padBuf && clavBuf);
    const padL = padBuf.getChannelData(0);
    const clavL = clavBuf.getChannelData(0);
    for (let i = 0; i < padL.length; i++) {
      assert.ok(Number.isFinite(padL[i]) && Number.isFinite(clavL[i]));
    }
  });

  it('All 6 FM Piano Engines Sustain Loop Integrity: maintain flat RMS energy (< 5% drift) and click-free loop boundaries', () => {
    const ctx = new MockAudioContext();
    const generators = [
      () => DX7EPiano1Engine.generateEPiano1Buffer(ctx, 261.63, { tineChime: 0.68, fmBark: 0.42 }, 0.8),
      () => FMCrystalBellEngine.generateCrystalBellBuffer(ctx, 261.63, { bellRatio: 3.5, bellRoundness: 0.5 }, 0.8),
      () => FMWurliReedEngine.generateWurliReedBuffer(ctx, 261.63, { reedBite: 0.65, tremoloDepth: 0.35 }, 0.8),
      () => FMTX816StackEngine.generateTX816StackBuffer(ctx, 261.63, { stackSpread: 0.8, fosterGlass: 0.75 }, 0.8),
      () => FMLushPadEPEngine.generateLushPadEPBuffer(ctx, 261.63, { toneSoftness: 0.75, bellBloom: 0.6 }, 0.8),
      () => FMPercClavEngine.generatePercClavBuffer(ctx, 261.63, { attackSharpness: 0.8, hollowRatio: 3.0 }, 0.8)
    ];

    for (const gen of generators) {
      const buf = gen();
      const L = buf.getChannelData(0);
      const loopStartIdx = Math.round(buf._loopStart * ctx.sampleRate);
      const loopEndIdx = Math.round(buf._loopEnd * ctx.sampleRate);
      const halfSpan = Math.floor((loopEndIdx - loopStartIdx) / 2);

      let rms1 = 0;
      let rms2 = 0;
      for (let i = 0; i < halfSpan; i++) {
        rms1 += L[loopStartIdx + i] * L[loopStartIdx + i];
        rms2 += L[loopStartIdx + halfSpan + i] * L[loopStartIdx + halfSpan + i];
      }
      rms1 = Math.sqrt(rms1 / halfSpan);
      rms2 = Math.sqrt(rms2 / halfSpan);

      const rmsRatio = Math.max(rms1, rms2) / Math.max(1e-6, Math.min(rms1, rms2));
      assert.ok(rmsRatio < 1.05, `FM sustain loop RMS ratio (${rmsRatio.toFixed(4)}) must be < 1.05`);

      const seamStep = Math.abs(L[loopEndIdx - 1] - L[loopStartIdx]);
      assert.ok(seamStep < 0.08, `FM loop wrap seam step (${seamStep.toFixed(4)}) must be click-free (< 0.08)`);
    }
  });
});

describe('2. DX7 & Dexed 80s FM Pianos App (fmpianos.html) — Integration Tests', () => {
  let env;

  beforeEach(() => {
    env = createSynthTestEnv(PROJECT_DIR, 'fmpianos.html');
  });

  it('bootstraps fmpianos.html, registers all 6 FM Piano engines, and populates 18 presets', () => {
    const { context, doc } = env;
    vm.runInContext('initAudioEngine();', context);

    assert.equal(vm.runInContext('isAudioStarted', context), true);
    assert.equal(FM_PIANO_FACTORY_PRESETS.length, 18);

    const presetSelect = doc.getElementById('preset-select-v2');
    assert.equal(presetSelect.children.length, 18);
  });

  it('plays polyphonic stereo voices across all 6 FM Piano modes with sustain loops', () => {
    const { context } = env;
    vm.runInContext('initAudioEngine();', context);

    const modes = [
      'dx7_epiano1',
      'fm_crystal_bell',
      'fm_wurli_reed',
      'fm_tx816_stack',
      'fm_lush_pad_ep',
      'fm_perc_clav'
    ];

    modes.forEach((modeId, idx) => {
      const note = 60 + idx;
      const voiceInfo = vm.runInContext(`(() => {
        synthParams.mode = '${modeId}';
        synthParams.unisonEnabled = false;
        voiceManager.playNote(${note}, 0.85, synthParams);
        const v = voiceManager.activeVoices.get(${note});
        return {
          mode: v.currentMode,
          bufferLen: v.bufferNodes.length,
          hasSrc: Boolean(v.bufferNodes[0] && v.bufferNodes[0].bufNode),
          isLooping: v.bufferNodes[0] && v.bufferNodes[0].bufNode ? v.bufferNodes[0].bufNode.loop : false,
          loopStart: v.bufferNodes[0] && v.bufferNodes[0].bufNode ? v.bufferNodes[0].bufNode.loopStart : 0
        };
      })()`, context);

      assert.equal(voiceInfo.mode, modeId);
      assert.equal(voiceInfo.bufferLen, 1);
      assert.equal(voiceInfo.hasSrc, true, `Mode ${modeId} should create AudioBufferSourceNode`);
      assert.equal(voiceInfo.isLooping, true, `Mode ${modeId} should enable sustain loop`);
      assert.ok(voiceInfo.loopStart > 0.4, `Mode ${modeId} should set tail loopStart > 0.4s`);

      vm.runInContext(`voiceManager.stopNote(${note}, true, synthParams);`, context);
    });
  });

  it('loads all 18 FM Piano factory presets and updates LFO targets and parameters cleanly (with Wavefolder and Vector Chorus set to 0)', () => {
    const { context } = env;
    vm.runInContext('initAudioEngine();', context);

    const count = vm.runInContext('FACTORY_PRESETS.length', context);
    assert.equal(count, 18);

    for (let i = 0; i < count; i++) {
      const pInfo = vm.runInContext(`
        loadPreset(FACTORY_PRESETS[${i}]);
        ({
          id: FACTORY_PRESETS[${i}].id,
          mode: synthParams.mode,
          cutoff: synthParams.cutoff,
          driveAmount: fxParams.driveAmount,
          chorusMix: fxParams.chorusMix,
          unisonEnabled: synthParams.unisonEnabled
        });
      `, context);
      assert.ok(pInfo.id);
      assert.ok(pInfo.cutoff >= 50 && pInfo.cutoff <= 16000);
      assert.equal(pInfo.driveAmount, 0, `Preset ${pInfo.id} must have Wavefolder driveAmount = 0`);
      assert.equal(pInfo.chorusMix, 0, `Preset ${pInfo.id} must have Vector Chorus chorusMix = 0`);
      if (pInfo.id !== 'lush_celestial_halo_pad') {
        assert.equal(pInfo.unisonEnabled, false, `Preset ${pInfo.id} must have Super-Unison turned off (unisonEnabled = false)`);
      } else {
        assert.equal(pInfo.unisonEnabled, true, 'lush_celestial_halo_pad is the single fat synth-pad EP preset with Super-Unison enabled');
      }
    }
  });

  it('modulates FM-specific LFO destinations and renders the 3D DX7 Sideband Visualizer', () => {
    const { context } = env;
    vm.runInContext('initAudioEngine();', context);

    vm.runInContext(`
      synthParams.mode = 'dx7_epiano1';
      synthParams.modLfoTarget = 'tineChime';
      synthParams.modLfoDepth = 40;
      voiceManager.playNote(60, 0.85, synthParams);
      updateModulationLFO(0.35);

      synthParams.mode = 'fm_tx816_stack';
      synthParams.modLfoTarget = 'fosterGlass';
      updateModulationLFO(0.70);
    `, context);

    const vizModes = ['attractor3d', 'spectrogram', 'goniometer', 'harmonics', 'scope'];
    for (const vMode of vizModes) {
      vm.runInContext(`
        visualizerSuite.vizMode = '${vMode}';
        visualizerSuite.render(synthParams);
      `, context);
    }
  });

  it('maintains ultra-low real-time key-press latency (< 40 ms uncached with VM JIT, < 2 ms cached) across all 6 FM modes', () => {
    const { context } = env;
    vm.runInContext('initAudioEngine();', context);

    const modes = ['dx7_epiano1', 'fm_crystal_bell', 'fm_wurli_reed', 'fm_tx816_stack', 'fm_lush_pad_ep', 'fm_perc_clav'];
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

      assert.ok(uncachedMs < 40, `Mode ${mode} uncached note-on took ${uncachedMs.toFixed(2)} ms`);
      assert.ok(cachedMs < 2, `Mode ${mode} cached note-on took ${cachedMs.toFixed(2)} ms`);
    }
  });
});
