/**
 * DX7 & Dexed 80s FM Pianos v1.0 — Engine 5: Soft Rounded Ballad EP & Dream Pad (Algorithm 16)
 *
 * Implements Yamaha DX7 Algorithm 16 (multiple parallel modulator branches summing into a warm
 * central carrier, plus a soft blooming bell halo):
 *   - Designed specifically for soft, rounded, pillowy 80s love-song intros where harsh transients
 *     are replaced by a velvety bell bloom ("Lately", "Twin Peaks", "Careless Whisper" pads).
 *   - Uses a non-zero attack swell on the upper harmonic modulator (`bellBloom`) so the overtones
 *     gently blossom *after* the key is pressed.
 *
 * Musician-Friendly Macro Controls:
 *   - toneSoftness: Rounds off upper FM Bessel sidebands for a warm, pillowy electric piano
 *   - bellBloom: Swelling harmonic overtone bloom (modulator attack swell after key strike)
 *   - subWarmth: Sub-octave (0.5x) & fundamental (1.0x) velvet pad foundation
 *   - airHalo: Shimmering 4:1 & 6:1 stereo celestial harmonic halo
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

  class FMLushPadEPEngine {
    static _getCacheKey(sampleRate, freq, toneSoftness, bellBloom, subWarmth, airHalo, velLayer) {
      return `${sampleRate}|${Math.round(freq * 10)}|${toneSoftness.toFixed(2)}|${bellBloom.toFixed(2)}|${subWarmth.toFixed(2)}|${airHalo.toFixed(2)}|${velLayer}`;
    }

    static generateLushPadEPBuffer(audioCtx, freq, params = {}, velocity = 0.8) {
      if (!audioCtx) return null;
      const sampleRate = audioCtx.sampleRate;
      const safeFreq = Math.max(24, Math.min(sampleRate * 0.4, freq || 261.63));

      const toneSoftness = Math.max(0.0, Math.min(1.0, params.toneSoftness !== undefined ? params.toneSoftness : 0.72));
      const bellBloom = Math.max(0.0, Math.min(1.0, params.bellBloom !== undefined ? params.bellBloom : 0.58));
      const subWarmth = Math.max(0.0, Math.min(1.0, params.subWarmth !== undefined ? params.subWarmth : 0.68));
      const airHalo = Math.max(0.0, Math.min(1.0, params.airHalo !== undefined ? params.airHalo : 0.52));
      const vel = Math.max(0.10, Math.min(1.0, velocity !== undefined ? velocity : 0.8));
      const velLayer = Math.round(vel * 16);

      const cacheKey = FMLushPadEPEngine._getCacheKey(sampleRate, safeFreq, toneSoftness, bellBloom, subWarmth, airHalo, velLayer);
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
      // Even number of loopPeriods guarantees sub-octave (0.5x) locks phase across loopSpanSamples
      const loopPeriods = Math.max(8, Math.round(safeFreq * 0.175) * 2);
      const loopSpanSamples = Math.min(
        numSamples - loopStartSample - 4,
        Math.max(128, Math.round(loopPeriods * exactPeriod))
      );
      const loopEndSample = loopStartSample + loopSpanSamples;
      const freezeSample = Math.floor(sampleRate * 0.30);

      const baseInc = (TABLE_SIZE * loopPeriods) / loopSpanSamples;
      const nyquistHalo = (6.0 * safeFreq < sampleRate * 0.43)
        ? 1.0 / (1.0 + Math.pow(safeFreq / 750.0, 1.6))
        : 0.0;

      const velScale = 0.22 + 0.78 * Math.pow(vel, 1.30);
      const brightness = 1.0 - toneSoftness * 0.72;

      // Algorithm 16: Op2 (1x), Op3 (2x), Op5 (4x), Op6 (6x) converging into Carrier Op1
      const idx2Peak = (0.28 + brightness * 1.35) * velScale * RAD_TO_IDX;
      const idx2Floor = (0.14 + brightness * 0.30) * RAD_TO_IDX;
      const idxBloomTarget = bellBloom * (0.35 + brightness * 1.45) * velScale * RAD_TO_IDX;
      const idxHalo = airHalo * (0.25 + brightness * 1.15) * velScale * nyquistHalo * RAD_TO_IDX;

      const envDecay = Math.exp(-1.0 / (sampleRate * (0.14 + toneSoftness * 0.16)));
      const bloomAttackRate = 1.0 - Math.exp(-1.0 / (sampleRate * 0.085));

      let envMain = 1.0;
      let envBloom = 0.0;

      let pSub = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p6 = 0;
      const incSub = baseInc * 0.5;
      const inc1 = baseInc;
      const inc2 = baseInc * 2.0;
      const inc3 = baseInc * 3.0;
      const inc4 = baseInc * 4.0;
      const inc6 = baseInc * 6.0;

      const stereoOffset = Math.floor(TABLE_SIZE * 0.14);

      for (let n = 0; n < numSamples; n++) {
        // 1. Warm rounded 1:1 modulator + blooming 2:1 & 3:1 bell modulators
        const curIdx2 = idx2Floor + (idx2Peak - idx2Floor) * envMain;
        const mod1 = SIN_TABLE[p1 & TABLE_MASK] * curIdx2;
        const mod2 = SIN_TABLE[p2 & TABLE_MASK] * (idxBloomTarget * envBloom);
        const mod3 = SIN_TABLE[p3 & TABLE_MASK] * (idxBloomTarget * 0.45 * envBloom);

        // 2. Air Halo (4:1 & 6:1 stereo bell shimmer)
        const mod4 = SIN_TABLE[p4 & TABLE_MASK] * idxHalo * envMain;
        const mod6 = SIN_TABLE[p6 & TABLE_MASK] * idxHalo * 0.65 * envBloom;

        const carrierL = SIN_TABLE[(p1 + mod1 + mod2 + mod4) & TABLE_MASK];
        const carrierR = SIN_TABLE[(p1 + mod1 + mod3 + mod6 + stereoOffset) & TABLE_MASK];

        // 3. Velvet Sub-Octave & Fundamental Pad Foundation
        const subWave = SIN_TABLE[pSub & TABLE_MASK];
        const padL = SIN_TABLE[(p1 + subWave * 0.35 * RAD_TO_IDX) & TABLE_MASK] * subWarmth * 0.58;
        const padR = SIN_TABLE[(p1 - subWave * 0.35 * RAD_TO_IDX + stereoOffset) & TABLE_MASK] * subWarmth * 0.58;

        const sigL = (carrierL * 0.68 + padL) * 0.90;
        const sigR = (carrierR * 0.68 + padR) * 0.90;

        left[n] = sigL / (1.0 + (sigL >= 0 ? sigL : -sigL) * 0.58);
        right[n] = sigR / (1.0 + (sigR >= 0 ? sigR : -sigR) * 0.58);

        pSub += incSub;
        p1 += inc1;
        p2 += inc2;
        p3 += inc3;
        p4 += inc4;
        p6 += inc6;

        if (n < freezeSample) {
          envMain *= envDecay;
          envBloom += (1.0 - envBloom) * bloomAttackRate;
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
        id: 'fm_lush_pad_ep',
        name: '5. Soft Rounded Ballad EP & Pad (Alg 16)',
        type: 'buffer',
        loop: true,
        lfoTargets: [
          { value: 'toneSoftness', label: 'Dest: Velvet Tone Softness' },
          { value: 'bellBloom', label: 'Dest: Harmonic Bell Bloom' },
          { value: 'subWarmth', label: 'Dest: Sub-Octave Pad Warmth' },
          { value: 'airHalo', label: 'Dest: Celestial Air Halo (4x+6x)' }
        ],
        createVoiceBuffer: (audioCtx, freq, params, velocity) =>
          FMLushPadEPEngine.generateLushPadEPBuffer(audioCtx, freq, params, velocity)
      };
    }
  }

  root.FMLushPadEPEngine = FMLushPadEPEngine;
  root.REGISTERED_SYNTH_ENGINES = root.REGISTERED_SYNTH_ENGINES || [];
  if (!root.REGISTERED_SYNTH_ENGINES.includes(FMLushPadEPEngine)) {
    root.REGISTERED_SYNTH_ENGINES.push(FMLushPadEPEngine);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FMLushPadEPEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
