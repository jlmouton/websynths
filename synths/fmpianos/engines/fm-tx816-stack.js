/**
 * DX7 & Dexed 80s FM Pianos v1.0 — Engine 4: LA Studio TX816 Stereo Stack (80s Love Ballad)
 *
 * Models the legendary 1980s Los Angeles studio "TX816 Rack Stack" popularized by David Foster,
 * Whitney Houston, Chicago, and Toto — combining multiple detuned DX7 TF1 modules in wide stereo:
 *   - Module A (Left/Center): Warm Dyno-My-Piano Rhodes foundation (1:1 + 1:2 body)
 *   - Module B (Right/Wide): Crystal "FullTines" 14:1 & 7:1 glassy harmonic bell shimmer
 *   - Module C (Sub/Center): Octave-up/down warm electric grand & percussive attack snap
 *
 * Musician-Friendly Macro Controls:
 *   - stackSpread: Stereo TF1 module phase/detune width & multi-rack dimension
 *   - fosterGlass: Iconic 80s "David Foster" glassy 7:1 + 14:1 upper tine brilliance
 *   - balladWarmth: Rich mid-bass Rhodes body thickness & smooth velocity compression
 *   - attackSnap: Layered acoustic-electric hammer strike & pick transient
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

  class FMTX816StackEngine {
    static _getCacheKey(sampleRate, freq, stackSpread, fosterGlass, balladWarmth, attackSnap, velLayer) {
      return `${sampleRate}|${Math.round(freq * 10)}|${stackSpread.toFixed(2)}|${fosterGlass.toFixed(2)}|${balladWarmth.toFixed(2)}|${attackSnap.toFixed(2)}|${velLayer}`;
    }

    static generateTX816StackBuffer(audioCtx, freq, params = {}, velocity = 0.8) {
      if (!audioCtx) return null;
      const sampleRate = audioCtx.sampleRate;
      const safeFreq = Math.max(24, Math.min(sampleRate * 0.4, freq || 261.63));

      const stackSpread = Math.max(0.0, Math.min(1.0, params.stackSpread !== undefined ? params.stackSpread : 0.75));
      const fosterGlass = Math.max(0.0, Math.min(1.0, params.fosterGlass !== undefined ? params.fosterGlass : 0.72));
      const balladWarmth = Math.max(0.0, Math.min(1.0, params.balladWarmth !== undefined ? params.balladWarmth : 0.78));
      const attackSnap = Math.max(0.0, Math.min(1.0, params.attackSnap !== undefined ? params.attackSnap : 0.48));
      const vel = Math.max(0.10, Math.min(1.0, velocity !== undefined ? velocity : 0.8));
      const velLayer = Math.round(vel * 16);

      const cacheKey = FMTX816StackEngine._getCacheKey(sampleRate, safeFreq, stackSpread, fosterGlass, balladWarmth, attackSnap, velLayer);
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
      const nyquist14 = (14.0 * safeFreq < sampleRate * 0.43)
        ? 1.0 / (1.0 + Math.pow(safeFreq / 500.0, 1.8))
        : 0.0;
      const nyquist7 = (7.0 * safeFreq < sampleRate * 0.43)
        ? 1.0 / (1.0 + Math.pow(safeFreq / 900.0, 1.6))
        : 0.0;

      const velScale = 0.20 + 0.80 * Math.pow(vel, 1.35);

      // Module A: Warm Ballad Rhodes Body (Op2 -> Op1, 1:1 + feedback)
      const idxBodyPeak = (0.45 + balladWarmth * 1.95) * velScale * RAD_TO_IDX;
      const idxBodyFloor = (0.18 + balladWarmth * 0.42) * RAD_TO_IDX;
      const fbBody = (0.12 + balladWarmth * 0.38) * RAD_TO_IDX;

      // Module B: Foster Glassy Tines (Op4 14x + Op6 7x -> Op3 1x & 2x)
      const idxGlass14Peak = fosterGlass * 2.15 * velScale * nyquist14 * RAD_TO_IDX;
      const idxGlass14Floor = fosterGlass * 0.14 * nyquist14 * RAD_TO_IDX;
      const idxGlass7Peak = fosterGlass * 1.65 * velScale * nyquist7 * RAD_TO_IDX;
      const idxGlass7Floor = fosterGlass * 0.18 * nyquist7 * RAD_TO_IDX;

      // Module C: Attack Snap (Op5 4x transient)
      const idxSnapPeak = attackSnap * 2.8 * velScale * nyquist7 * RAD_TO_IDX;

      const envBodyDecay = Math.exp(-1.0 / (sampleRate * 0.16));
      const envGlassDecay = Math.exp(-1.0 / (sampleRate * 0.12));
      const envSnapDecay = Math.exp(-1.0 / (sampleRate * 0.022));

      let envBody = 1.0;
      let envGlass = 1.0;
      let envSnap = 1.0;

      let p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0;
      const inc1 = baseInc;
      const inc2 = baseInc * 2.0;
      const inc3 = baseInc * 4.0;
      const inc4 = baseInc * 7.0;
      const inc5 = baseInc * 14.0;

      let op1ModPrev = 0;
      const spreadPhase = Math.floor(TABLE_SIZE * (0.04 + stackSpread * 0.20));

      for (let n = 0; n < numSamples; n++) {
        // 1. Warm Ballad Body (1:1 + 2:1 octave warmth)
        const curBodyIdx = idxBodyFloor + (idxBodyPeak - idxBodyFloor) * envBody;
        const mod1 = SIN_TABLE[(p1 + fbBody * op1ModPrev) & TABLE_MASK];
        op1ModPrev = mod1;
        const modOct = SIN_TABLE[p2 & TABLE_MASK] * (0.25 * balladWarmth * RAD_TO_IDX);

        const bodyL = SIN_TABLE[(p1 + curBodyIdx * mod1 + modOct) & TABLE_MASK];
        const bodyR = SIN_TABLE[(p1 + curBodyIdx * mod1 * 0.95 - modOct + spreadPhase) & TABLE_MASK];

        // 2. Foster Glass Tines (7:1 + 14:1 dual-tier crystal overtones)
        const cur14Idx = idxGlass14Floor + (idxGlass14Peak - idxGlass14Floor) * envGlass;
        const cur7Idx = idxGlass7Floor + (idxGlass7Peak - idxGlass7Floor) * envGlass;
        const mod14 = SIN_TABLE[p5 & TABLE_MASK] * cur14Idx;
        const mod7 = SIN_TABLE[p4 & TABLE_MASK] * cur7Idx;

        const glassL = SIN_TABLE[(p1 + mod14 + mod7) & TABLE_MASK] * (0.22 + fosterGlass * 0.36);
        const glassR = SIN_TABLE[(p2 - mod14 + mod7 + spreadPhase) & TABLE_MASK] * (0.22 + fosterGlass * 0.36);

        // 3. Layered Electric Grand Attack Snap (4:1 transient)
        let snapOut = 0;
        if (envSnap > 0.002 && attackSnap > 0) {
          const mod4 = SIN_TABLE[p3 & TABLE_MASK] * idxSnapPeak * envSnap;
          snapOut = SIN_TABLE[(p2 + mod4) & TABLE_MASK] * attackSnap * 0.32 * envSnap;
        }

        const sigL = (bodyL * (0.55 + balladWarmth * 0.32) + glassL + snapOut) * 0.88;
        const sigR = (bodyR * (0.55 + balladWarmth * 0.32) + glassR + snapOut * 0.9) * 0.88;

        left[n] = sigL / (1.0 + (sigL >= 0 ? sigL : -sigL) * 0.62);
        right[n] = sigR / (1.0 + (sigR >= 0 ? sigR : -sigR) * 0.62);

        p1 += inc1;
        p2 += inc2;
        p3 += inc3;
        p4 += inc4;
        p5 += inc5;

        if (n < freezeSample) {
          envBody *= envBodyDecay;
          envGlass *= envGlassDecay;
        }
        envSnap *= envSnapDecay;
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
        id: 'fm_tx816_stack',
        name: '4. Stereo Ballad Stack (80s Layer)',
        type: 'buffer',
        loop: true,
        lfoTargets: [
          { value: 'stackSpread', label: 'Dest: Stereo Rack Width' },
          { value: 'fosterGlass', label: 'Dest: Glassy Dual Tines (7x+14x)' },
          { value: 'balladWarmth', label: 'Dest: Ballad Body Warmth' },
          { value: 'attackSnap', label: 'Dest: Layered Hammer Snap' }
        ],
        createVoiceBuffer: (audioCtx, freq, params, velocity) =>
          FMTX816StackEngine.generateTX816StackBuffer(audioCtx, freq, params, velocity)
      };
    }
  }

  root.FMTX816StackEngine = FMTX816StackEngine;
  root.REGISTERED_SYNTH_ENGINES = root.REGISTERED_SYNTH_ENGINES || [];
  if (!root.REGISTERED_SYNTH_ENGINES.includes(FMTX816StackEngine)) {
    root.REGISTERED_SYNTH_ENGINES.push(FMTX816StackEngine);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FMTX816StackEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
