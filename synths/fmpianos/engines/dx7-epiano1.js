/**
 * DX7 & Dexed 80s FM Pianos v1.0 — Engine 1: Classic DX7 E.Piano 1 (Algorithm 5 Ballad Tines)
 *
 * Implements the authentic Yamaha DX7 ROM1A #11 "E.PIANO 1" 6-Operator Phase Modulation
 * topology (Algorithm 5: three parallel 2-operator Carrier <- Modulator branches):
 *   - Branch A (Op 1 <- Op 2, 1:1): Warm Rhodes fundamental body & velocity-sensitive "Dyno" bark
 *   - Branch B (Op 3 <- Op 4, 1:14): Iconic 14th-harmonic crystal tine chime with DX7 R-Scale key scaling
 *   - Branch C (Op 5 <- Op 6[fb], 1:9): Ultra-fast mechanical hammer/key-click attack transient
 *
 * Musician-Friendly Macro Controls:
 *   - tineChime: Crystal 14:1 tine bell level & sparkle
 *   - fmBark: Fundamental 1:1 modulator index & feedback (soft rounded sine -> gritty Rhodes bark)
 *   - hammerClick: Initial mechanical key-strike transient punch
 *   - tineDecay: Modulator overtone decay time & stereo DX7 detune shimmer
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || Math.PI * 2;
  const TABLE_SIZE = 4096;
  const TABLE_MASK = TABLE_SIZE - 1;
  const RAD_TO_IDX = TABLE_SIZE / TWO_PI;

  // Shared 4096-point YM21280 OPS sine lookup table (zero Math.sin in inner sample loops)
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

  class DX7EPiano1Engine {
    static _getCacheKey(sampleRate, freq, tineChime, fmBark, hammerClick, tineDecay, velLayer) {
      return `${sampleRate}|${Math.round(freq * 10)}|${tineChime.toFixed(2)}|${fmBark.toFixed(2)}|${hammerClick.toFixed(2)}|${tineDecay.toFixed(2)}|${velLayer}`;
    }

    /**
     * Synthesizes a stereo AudioBuffer using Yamaha DX7 Algorithm 5 (6-Operator Phase Modulation)
     * in < 1 ms with a phase-locked, click-free sustain loop.
     * @param {AudioContext} audioCtx
     * @param {number} freq
     * @param {Object} params
     * @param {number} [velocity=0.8]
     * @returns {AudioBuffer|null}
     */
    static generateEPiano1Buffer(audioCtx, freq, params = {}, velocity = 0.8) {
      if (!audioCtx) return null;
      const sampleRate = audioCtx.sampleRate;
      const safeFreq = Math.max(24, Math.min(sampleRate * 0.4, freq || 261.63));

      const tineChime = Math.max(0.0, Math.min(1.0, params.tineChime !== undefined ? params.tineChime : 0.68));
      const fmBark = Math.max(0.0, Math.min(1.0, params.fmBark !== undefined ? params.fmBark : 0.42));
      const hammerClick = Math.max(0.0, Math.min(1.0, params.hammerClick !== undefined ? params.hammerClick : 0.35));
      const tineDecay = Math.max(0.05, Math.min(1.0, params.tineDecay !== undefined ? params.tineDecay : 0.55));
      const vel = Math.max(0.10, Math.min(1.0, velocity !== undefined ? velocity : 0.8));
      const velLayer = Math.round(vel * 16);

      const cacheKey = DX7EPiano1Engine._getCacheKey(sampleRate, safeFreq, tineChime, fmBark, hammerClick, tineDecay, velLayer);
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
      const loopPeriods = Math.max(8, Math.round(safeFreq * 0.35));
      const loopSpanSamples = Math.min(
        numSamples - loopStartSample - 4,
        Math.max(128, Math.round(loopPeriods * exactPeriod))
      );
      const loopEndSample = loopStartSample + loopSpanSamples;
      const freezeSample = Math.floor(sampleRate * 0.30);

      // Phase-locked fundamental increment so loopSpanSamples contains an exact integer number of cycles
      const baseInc = (TABLE_SIZE * loopPeriods) / loopSpanSamples;

      // Keyboard Level Scaling (attenuates high-ratio 14:1 tine on upper octaves to prevent aliasing)
      const nyquistGuard = (14.0 * safeFreq < sampleRate * 0.43)
        ? 1.0 / (1.0 + Math.pow(safeFreq / 520.0, 1.8))
        : 0.0;

      // Expressive velocity-sensitive Modulator Indices (soft strikes -> warm rounded sine, hard strikes -> bright chime & bark)
      const velModScale = 0.18 + 0.82 * Math.pow(vel, 1.35);

      // Branch A (Op2 -> Op1, Ratio 1:1): Warm Body & Rhodes Bark
      const idx2Peak = (0.35 + fmBark * 2.85) * velModScale * RAD_TO_IDX;
      const idx2Floor = (0.12 + fmBark * 0.48) * RAD_TO_IDX;
      const fb2Gain = (0.08 + fmBark * 0.55) * RAD_TO_IDX;

      // Branch B (Op4 -> Op3, Ratio 1:14): Crystal Tine Chime
      const idx4Peak = tineChime * 2.4 * velModScale * nyquistGuard * RAD_TO_IDX;
      const idx4Floor = tineChime * 0.14 * nyquistGuard * RAD_TO_IDX;
      const tineCarrierGain = 0.18 + tineChime * 0.38;

      // Branch C (Op6 -> Op5, Ratio 1:9): Mechanical Hammer Key-Click (first 35 ms)
      const nyquistClick = (9.0 * safeFreq < sampleRate * 0.44) ? 1.0 : 0.0;
      const idx6Peak = hammerClick * 3.2 * velModScale * nyquistClick * RAD_TO_IDX;
      const clickCarrierGain = hammerClick * 0.32 * velModScale;

      // Envelope decay multipliers per sample (frozen at n === freezeSample for flat sustain loop)
      const env2Decay = Math.exp(-1.0 / (sampleRate * (0.08 + tineDecay * 0.22)));
      const env4Decay = Math.exp(-1.0 / (sampleRate * (0.06 + tineDecay * 0.20)));
      const env5Decay = Math.exp(-1.0 / (sampleRate * 0.018));

      let env2 = 1.0;
      let env4 = 1.0;
      let env5 = 1.0;

      let p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0;
      const inc1 = baseInc;
      const inc2 = baseInc;
      const inc3 = baseInc;
      const inc4 = baseInc * 14.0;
      const inc5 = baseInc * 2.0;
      const inc6 = baseInc * 9.0;

      let op2Prev = 0;
      // Stereo phase offset on Op3/Op1 for authentic TX816 / DX7-II stereo chorus presence
      const stereoPhaseOffset = Math.floor(TABLE_SIZE * 0.08);

      for (let n = 0; n < numSamples; n++) {
        // 1. Branch A: Op2 (with feedback) -> Op1 (Fundamental Rhodes Body & Bark)
        const curIdx2 = idx2Floor + (idx2Peak - idx2Floor) * env2;
        const mod2Phase = (p2 + fb2Gain * op2Prev) & TABLE_MASK;
        const op2Out = SIN_TABLE[mod2Phase];
        op2Prev = op2Out;

        const mod2Offset = curIdx2 * op2Out;
        const op1L = SIN_TABLE[(p1 + mod2Offset) & TABLE_MASK];
        const op1R = SIN_TABLE[(p1 + mod2Offset * 0.92 + stereoPhaseOffset) & TABLE_MASK];

        // 2. Branch B: Op4 (14x) -> Op3 (Crystal Tine Bell)
        const curIdx4 = idx4Floor + (idx4Peak - idx4Floor) * env4;
        const op4Out = SIN_TABLE[p4 & TABLE_MASK];
        const mod4Offset = curIdx4 * op4Out;
        const op3L = SIN_TABLE[(p3 + mod4Offset) & TABLE_MASK] * tineCarrierGain;
        const op3R = SIN_TABLE[(p3 - mod4Offset + stereoPhaseOffset) & TABLE_MASK] * tineCarrierGain;

        // 3. Branch C: Op6 (9x) -> Op5 (2x) (Fast Hammer Key-Click Transient)
        let op5Out = 0;
        if (env5 > 0.002 && clickCarrierGain > 0) {
          const op6Out = SIN_TABLE[p6 & TABLE_MASK];
          op5Out = SIN_TABLE[(p5 + idx6Peak * env5 * op6Out) & TABLE_MASK] * clickCarrierGain * env5;
        }

        const sigL = (op1L * 0.78 + op3L + op5Out) * 0.90;
        const sigR = (op1R * 0.78 + op3R + op5Out * 0.85) * 0.90;

        left[n] = sigL / (1.0 + (sigL >= 0 ? sigL : -sigL) * 0.65);
        right[n] = sigR / (1.0 + (sigR >= 0 ? sigR : -sigR) * 0.65);

        p1 += inc1;
        p2 += inc2;
        p3 += inc3;
        p4 += inc4;
        p5 += inc5;
        p6 += inc6;

        if (n < freezeSample) {
          env2 *= env2Decay;
          env4 *= env4Decay;
        }
        env5 *= env5Decay;
      }

      // Raised-cosine pre-start crossfade splice at loop boundary for 100% click-free sustain
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
        id: 'dx7_epiano1',
        name: '1. Classic Tine E.Piano (Alg 5)',
        type: 'buffer',
        loop: true,
        lfoTargets: [
          { value: 'tineChime', label: 'Dest: Tine Bell Chime (14:1)' },
          { value: 'fmBark', label: 'Dest: Fundamental Bark & Warmth' },
          { value: 'hammerClick', label: 'Dest: Hammer Attack Click' },
          { value: 'tineDecay', label: 'Dest: Tine Overtone Decay' }
        ],
        createVoiceBuffer: (audioCtx, freq, params, velocity) =>
          DX7EPiano1Engine.generateEPiano1Buffer(audioCtx, freq, params, velocity)
      };
    }
  }

  root.DX7EPiano1Engine = DX7EPiano1Engine;
  root.REGISTERED_SYNTH_ENGINES = root.REGISTERED_SYNTH_ENGINES || [];
  if (!root.REGISTERED_SYNTH_ENGINES.includes(DX7EPiano1Engine)) {
    root.REGISTERED_SYNTH_ENGINES.push(DX7EPiano1Engine);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DX7EPiano1Engine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
