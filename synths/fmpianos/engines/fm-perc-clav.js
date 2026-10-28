/**
 * DX7 & Dexed 80s FM Pianos v1.0 — Engine 6: Sharp-Attack FM Clav, CP-80 & Mallet (Algorithm 7)
 *
 * Implements Yamaha DX7 Algorithm 7 for sharp-attack percussive keyboard instruments
 * (Yamaha CP-80 Electric Grand, Funky FM Clavinet, Marimba/Vibes Mallet & DX Harpsichord):
 *   - Uses high-velocity transient modulators with selectable integer harmonic ratios (1:2, 1:3, 1:4, 1:5)
 *     and Operator 6 feedback to sculpt woody hollow mallets, biting clavinet picks, or metallic CP-80 strings.
 *
 * Musician-Friendly Macro Controls:
 *   - attackSharpness: Initial pick/hammer transient bite & velocity punch
 *   - hollowRatio: Harmonic C:M ratio (2.0 CP-80 -> 3.0 Hollow Clav/Wood -> 4.0 Bright Clav -> 6.0 Metallic)
 *   - stringBrilliance: Upper string/harpsichord feedback & harmonic edge
 *   - damperTightness: Controls how quickly the bright transient snaps down into the sustain body
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

  class FMPercClavEngine {
    static _getCacheKey(sampleRate, freq, attackSharpness, hollowRatio, stringBrilliance, damperTightness, velLayer) {
      return `${sampleRate}|${Math.round(freq * 10)}|${attackSharpness.toFixed(2)}|${hollowRatio.toFixed(2)}|${stringBrilliance.toFixed(2)}|${damperTightness.toFixed(2)}|${velLayer}`;
    }

    static generatePercClavBuffer(audioCtx, freq, params = {}, velocity = 0.8) {
      if (!audioCtx) return null;
      const sampleRate = audioCtx.sampleRate;
      const safeFreq = Math.max(24, Math.min(sampleRate * 0.4, freq || 261.63));

      const attackSharpness = Math.max(0.0, Math.min(1.0, params.attackSharpness !== undefined ? params.attackSharpness : 0.75));
      const hollowRatio = Math.max(1.0, Math.min(8.0, params.hollowRatio !== undefined ? params.hollowRatio : 3.0));
      const stringBrilliance = Math.max(0.0, Math.min(1.0, params.stringBrilliance !== undefined ? params.stringBrilliance : 0.58));
      const damperTightness = Math.max(0.0, Math.min(1.0, params.damperTightness !== undefined ? params.damperTightness : 0.60));
      const vel = Math.max(0.10, Math.min(1.0, velocity !== undefined ? velocity : 0.8));
      const velLayer = Math.round(vel * 16);

      const cacheKey = FMPercClavEngine._getCacheKey(sampleRate, safeFreq, attackSharpness, hollowRatio, stringBrilliance, damperTightness, velLayer);
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
      const effectiveRatio = Math.max(1.0, Math.round(hollowRatio * 2.0) / 2.0);
      const nyquistScale = (effectiveRatio * safeFreq < sampleRate * 0.43)
        ? 1.0 / (1.0 + Math.pow((effectiveRatio * safeFreq) / 4800.0, 1.6))
        : 0.0;

      const velScale = 0.18 + 0.82 * Math.pow(vel, 1.35);

      // Algorithm 7: Op6[fb] -> Op5 + Op4 -> Op3 (Sharp Clav/CP-80 String Stack) + Op2 -> Op1 (Resonant Body)
      const fb6Gain = (0.15 + stringBrilliance * 0.68) * RAD_TO_IDX;
      const idxSharpPeak = (0.65 + attackSharpness * 3.1) * velScale * nyquistScale * RAD_TO_IDX;
      const idxSharpFloor = (0.18 + stringBrilliance * 0.55) * nyquistScale * RAD_TO_IDX;

      const idxBodyPeak = (0.45 + stringBrilliance * 1.6) * velScale * RAD_TO_IDX;
      const idxBodyFloor = (0.20 + (1.0 - damperTightness) * 0.35) * RAD_TO_IDX;

      // Damper tightness controls how snappy the initial transient decay is
      const transientTime = 0.025 + (1.0 - damperTightness) * 0.11;
      const bodyTime = 0.07 + (1.0 - damperTightness) * 0.16;
      const envSharpDecay = Math.exp(-1.0 / (sampleRate * transientTime));
      const envBodyDecay = Math.exp(-1.0 / (sampleRate * bodyTime));

      let envSharp = 1.0;
      let envBody = 1.0;

      let p1 = 0, p2 = 0, p3 = 0, p5 = 0, p6 = 0;
      const inc1 = baseInc;
      const inc2 = baseInc * 2.0;
      const inc3 = baseInc;
      const inc5 = baseInc * effectiveRatio;
      const inc6 = baseInc * (effectiveRatio + 1.0);

      let op6Prev = 0;
      const stereoShift = Math.floor(TABLE_SIZE * 0.10);

      for (let n = 0; n < numSamples; n++) {
        // Branch A: Op6[fb] -> Op5 (effectiveRatio) -> Op3 (Sharp Pick/Hammer Transient & Hollow Harmonics)
        const op6Phase = (p6 + fb6Gain * op6Prev) & TABLE_MASK;
        const op6Out = SIN_TABLE[op6Phase];
        op6Prev = op6Out;

        const curSharpIdx = idxSharpFloor + (idxSharpPeak - idxSharpFloor) * envSharp;
        const op5Out = SIN_TABLE[(p5 + op6Out * curSharpIdx * 0.55) & TABLE_MASK];
        const mod3Offset = curSharpIdx * op5Out;

        const clavL = SIN_TABLE[(p3 + mod3Offset) & TABLE_MASK];
        const clavR = SIN_TABLE[(p3 - mod3Offset * 0.92 + stereoShift) & TABLE_MASK];

        // Branch B: Op2 (2x) -> Op1 (1x) CP-80 / Clav String Body
        const curBodyIdx = idxBodyFloor + (idxBodyPeak - idxBodyFloor) * envBody;
        const op2Out = SIN_TABLE[p2 & TABLE_MASK];
        const bodyL = SIN_TABLE[(p1 + curBodyIdx * op2Out) & TABLE_MASK];
        const bodyR = SIN_TABLE[(p1 + curBodyIdx * op2Out + stereoShift) & TABLE_MASK];

        const sigL = (clavL * 0.65 + bodyL * 0.55) * 0.90;
        const sigR = (clavR * 0.65 + bodyR * 0.55) * 0.90;

        left[n] = sigL / (1.0 + (sigL >= 0 ? sigL : -sigL) * 0.62);
        right[n] = sigR / (1.0 + (sigR >= 0 ? sigR : -sigR) * 0.62);

        p1 += inc1;
        p2 += inc2;
        p3 += inc3;
        p5 += inc5;
        p6 += inc6;

        if (n < freezeSample) {
          envSharp *= envSharpDecay;
          envBody *= envBodyDecay;
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
        id: 'fm_perc_clav',
        name: '6. Sharp Electric Grand, Clav & Mallet (Alg 7)',
        type: 'buffer',
        loop: true,
        lfoTargets: [
          { value: 'attackSharpness', label: 'Dest: Strike / Pick Sharpness' },
          { value: 'hollowRatio', label: 'Dest: Hollow Harmonic Ratio (C:M)' },
          { value: 'stringBrilliance', label: 'Dest: String Feedback Brilliance' },
          { value: 'damperTightness', label: 'Dest: Transient Damper Tightness' }
        ],
        createVoiceBuffer: (audioCtx, freq, params, velocity) =>
          FMPercClavEngine.generatePercClavBuffer(audioCtx, freq, params, velocity)
      };
    }
  }

  root.FMPercClavEngine = FMPercClavEngine;
  root.REGISTERED_SYNTH_ENGINES = root.REGISTERED_SYNTH_ENGINES || [];
  if (!root.REGISTERED_SYNTH_ENGINES.includes(FMPercClavEngine)) {
    root.REGISTERED_SYNTH_ENGINES.push(FMPercClavEngine);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FMPercClavEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
