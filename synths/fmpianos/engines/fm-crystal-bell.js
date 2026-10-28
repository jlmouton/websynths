/**
 * DX7 & Dexed 80s FM Pianos v1.0 — Engine 2: 80s Crystal Bell & Celeste (Algorithm 14 Cascade)
 *
 * Implements the Yamaha DX7 Algorithm 14 cascaded 3-operator bell tower + 2-operator warm body:
 *   - Branch A (Op 6[fb] -> Op 5 -> Op 3): 3-stage cascaded FM bell generator producing rich
 *     Bessel J_n sideband halos with tunable C:M harmonic ratio (2, 3, 3.5, 5, 7, 11, 14)
 *   - Branch B (Op 2 -> Op 1): Rounded, warm electric piano body foundation underneath the bell
 *
 * Musician-Friendly Macro Controls:
 *   - bellRatio: Modulator harmonic ratio (2.0 Octave -> 3.5 Tubular -> 7.0 Celeste -> 14.0 Crystal)
 *   - bellRoundness: Softens upper FM sidebands for a warm, rounded bell vs. diamond-sharp chime
 *   - cascadeShimmer: 3rd-stage cascade modulator depth (Op 6 -> Op 5 -> Op 3 halo)
 *   - warmPadMix: Warm fundamental electric piano body blend underneath the bell
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || Math.PI * 2;
  const TABLE_SIZE = 4096;
  const TABLE_MASK = TABLE_SIZE - 1;
  const RAD_TO_IDX = TABLE_SIZE / TWO_PI;

  const SIN_TABLE = root.DX7_SIN_TABLE || (function () {
    const tbl = new Float32Array(TABLE_SIZE);
    for (let i = 0; i < TABLE_SIZE; i++) {
      tbl[i] = Math.sin((i * TWO_PI) / TABLE_SIZE);
    }
    root.DX7_SIN_TABLE = tbl;
    return tbl;
  })();

  const BUFFER_CACHE = new Map();
  const MAX_CACHE_ENTRIES = 48;

  class FMCrystalBellEngine {
    static _getCacheKey(sampleRate, freq, bellRatio, bellRoundness, cascadeShimmer, warmPadMix, velLayer) {
      return `${sampleRate}|${Math.round(freq * 10)}|${bellRatio.toFixed(2)}|${bellRoundness.toFixed(2)}|${cascadeShimmer.toFixed(2)}|${warmPadMix.toFixed(2)}|${velLayer}`;
    }

    static generateCrystalBellBuffer(audioCtx, freq, params = {}, velocity = 0.8) {
      if (!audioCtx) return null;
      const sampleRate = audioCtx.sampleRate;
      const safeFreq = Math.max(24, Math.min(sampleRate * 0.4, freq || 261.63));

      const bellRatio = Math.max(1.0, Math.min(16.0, params.bellRatio !== undefined ? params.bellRatio : 7.0));
      const bellRoundness = Math.max(0.0, Math.min(1.0, params.bellRoundness !== undefined ? params.bellRoundness : 0.60));
      const cascadeShimmer = Math.max(0.0, Math.min(1.0, params.cascadeShimmer !== undefined ? params.cascadeShimmer : 0.45));
      const warmPadMix = Math.max(0.0, Math.min(1.0, params.warmPadMix !== undefined ? params.warmPadMix : 0.65));
      const vel = Math.max(0.10, Math.min(1.0, velocity !== undefined ? velocity : 0.8));
      const velLayer = Math.round(vel * 16);

      const cacheKey = FMCrystalBellEngine._getCacheKey(sampleRate, safeFreq, bellRatio, bellRoundness, cascadeShimmer, warmPadMix, velLayer);
      if (BUFFER_CACHE.has(cacheKey)) {
        return BUFFER_CACHE.get(cacheKey);
      }

      const duration = 0.85;
      const numSamples = Math.floor(sampleRate * duration);
      const buffer = audioCtx.createBuffer(2, numSamples, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      const exactPeriod = sampleRate / safeFreq;
      const loopStartSample = Math.floor(sampleRate * 0.42);
      const loopPeriods = Math.max(8, Math.round(safeFreq * 0.175) * 2);
      const loopSpanSamples = Math.min(
        numSamples - loopStartSample - 4,
        Math.max(128, Math.round(loopPeriods * exactPeriod))
      );
      const loopEndSample = loopStartSample + loopSpanSamples;
      const freezeSample = Math.floor(sampleRate * 0.30);

      const baseInc = (TABLE_SIZE * loopPeriods) / loopSpanSamples;
      // Quantize ratio during sustain or use nearest half-integer so 2*loopPeriods locks phase
      const effectiveRatio = Math.max(1.0, Math.round(bellRatio * 2.0) / 2.0);
      const nyquistScale = (effectiveRatio * safeFreq < sampleRate * 0.43)
        ? 1.0 / (1.0 + Math.pow((effectiveRatio * safeFreq) / 4500.0, 1.6))
        : 0.0;

      const velScale = 0.22 + 0.78 * Math.pow(vel, 1.30);
      const brightness = 1.0 - bellRoundness * 0.78;

      // Cascaded Bell Stack: Op6 -> Op5 -> Op3
      const idx5Peak = (0.45 + brightness * 2.4) * velScale * nyquistScale * RAD_TO_IDX;
      const idx5Floor = (0.15 + brightness * 0.35) * nyquistScale * RAD_TO_IDX;
      const idx6Peak = cascadeShimmer * (0.3 + brightness * 1.8) * velScale * nyquistScale * RAD_TO_IDX;

      // Warm Body Stack: Op2 -> Op1 (1:1 rounded electric piano foundation)
      const idx2Peak = (0.25 + (1.0 - bellRoundness) * 0.9) * velScale * RAD_TO_IDX;
      const idx2Floor = 0.15 * RAD_TO_IDX;

      const envBellDecay = Math.exp(-1.0 / (sampleRate * (0.10 + bellRoundness * 0.18)));
      const envCascadeDecay = Math.exp(-1.0 / (sampleRate * 0.09));
      let envBell = 1.0;
      let envCascade = 1.0;

      let p1 = 0, p2 = 0, p3 = 0, p5 = 0, p6 = 0;
      const inc1 = baseInc;
      const inc2 = baseInc;
      const inc3 = baseInc;
      const inc5 = baseInc * effectiveRatio;
      const inc6 = baseInc * 2.0;

      const stereoShift = Math.floor(TABLE_SIZE * 0.12);

      for (let n = 0; n < numSamples; n++) {
        // Cascaded Bell: Op6 -> Op5 -> Op3
        const op6Out = SIN_TABLE[p6 & TABLE_MASK] * idx6Peak * envCascade;
        const op5Out = SIN_TABLE[(p5 + op6Out) & TABLE_MASK];
        const curIdx5 = idx5Floor + (idx5Peak - idx5Floor) * envBell;
        const mod5Offset = curIdx5 * op5Out;

        const bellL = SIN_TABLE[(p3 + mod5Offset) & TABLE_MASK];
        const bellR = SIN_TABLE[(p3 - mod5Offset + stereoShift) & TABLE_MASK];

        // Warm Rounded Body: Op2 -> Op1
        const curIdx2 = idx2Floor + (idx2Peak - idx2Floor) * envBell;
        const op2Out = SIN_TABLE[p2 & TABLE_MASK];
        const bodyL = SIN_TABLE[(p1 + curIdx2 * op2Out) & TABLE_MASK] * warmPadMix;
        const bodyR = SIN_TABLE[(p1 + curIdx2 * op2Out + stereoShift) & TABLE_MASK] * warmPadMix;

        const sigL = (bellL * 0.65 + bodyL * 0.65) * 0.92;
        const sigR = (bellR * 0.65 + bodyR * 0.65) * 0.92;

        left[n] = sigL / (1.0 + (sigL >= 0 ? sigL : -sigL) * 0.6);
        right[n] = sigR / (1.0 + (sigR >= 0 ? sigR : -sigR) * 0.6);

        p1 += inc1;
        p2 += inc2;
        p3 += inc3;
        p5 += inc5;
        p6 += inc6;

        if (n < freezeSample) {
          envBell *= envBellDecay;
          envCascade *= envCascadeDecay;
        }
      }

      const xfadeSamples = Math.min(Math.floor(loopSpanSamples / 2), Math.max(32, Math.round(exactPeriod * 2)));
      for (let i = 0; i < xfadeSamples; i++) {
        const w = 0.5 * (1.0 - Math.cos((Math.PI * (i + 1)) / xfadeSamples));
        const oneMinusW = 1.0 - w;
        const idxEnd = loopEndSample - xfadeSamples + i;
        const idxPreStart = loopStartSample - xfadeSamples + i;
        left[idxEnd] = oneMinusW * left[idxEnd] + w * left[idxPreStart];
        right[idxEnd] = oneMinusW * right[idxEnd] + w * right[idxPreStart];
      }

      buffer._loopStart = loopStartSample / sampleRate;
      buffer._loopEnd = loopEndSample / sampleRate;

      if (BUFFER_CACHE.size >= MAX_CACHE_ENTRIES) {
        BUFFER_CACHE.delete(BUFFER_CACHE.keys().next().value);
      }
      BUFFER_CACHE.set(cacheKey, buffer);

      return buffer;
    }

    static getEngineDescriptor() {
      return {
        id: 'fm_crystal_bell',
        name: '2. Crystal Bell & Celeste (Alg 14)',
        type: 'buffer',
        loop: true,
        lfoTargets: [
          { value: 'bellRatio', label: 'Dest: Bell Harmonic Ratio (C:M)' },
          { value: 'bellRoundness', label: 'Dest: Bell Roundness / Softness' },
          { value: 'cascadeShimmer', label: 'Dest: Cascade Overtone Halo' },
          { value: 'warmPadMix', label: 'Dest: Warm Body Foundation' }
        ],
        createVoiceBuffer: (audioCtx, freq, params, velocity) =>
          FMCrystalBellEngine.generateCrystalBellBuffer(audioCtx, freq, params, velocity)
      };
    }
  }

  root.FMCrystalBellEngine = FMCrystalBellEngine;
  root.REGISTERED_SYNTH_ENGINES = root.REGISTERED_SYNTH_ENGINES || [];
  if (!root.REGISTERED_SYNTH_ENGINES.includes(FMCrystalBellEngine)) {
    root.REGISTERED_SYNTH_ENGINES.push(FMCrystalBellEngine);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FMCrystalBellEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
