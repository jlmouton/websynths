/**
 * DX7 & Dexed 80s FM Pianos v1.0 — Engine 3: FM Wurlitzer 200A & Barking Reed (Algorithm 4)
 *
 * Models an electromagnetic reed piano (Wurlitzer 200A / DX7 "WURLI" & "REED E.P") using
 * Yamaha DX7 Algorithm 4 (two parallel 3-operator cascades with cross-feedback):
 *   - Stack A (Op 3 -> Op 2 -> Op 1): 2:1 & 3:1 odd-harmonic reed modulator ratios that produce
 *     the signature hollow, asymmetrically barking Wurlitzer reed growl when played hard.
 *   - Stack B (Op 6[fb] -> Op 5 -> Op 4): Metallic reed-hammer strike & warm resonant wood cabinet.
 *
 * Musician-Friendly Macro Controls:
 *   - reedBite: Velocity-driven 2:1 & 3:1 odd-harmonic reed bark & growl
 *   - reedBuzz: Operator 6 feedback & upper metallic reed buzz
 *   - tremoloDepth: Classic Wurlitzer stereo vibrato/tremolo modulator depth
 *   - woodBody: Warm lower-register cabinet resonance vs. nasal reed bite
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

  class FMWurliReedEngine {
    static _getCacheKey(sampleRate, freq, reedBite, reedBuzz, tremoloDepth, woodBody, velLayer) {
      return `${sampleRate}|${Math.round(freq * 10)}|${reedBite.toFixed(2)}|${reedBuzz.toFixed(2)}|${tremoloDepth.toFixed(2)}|${woodBody.toFixed(2)}|${velLayer}`;
    }

    static generateWurliReedBuffer(audioCtx, freq, params = {}, velocity = 0.8) {
      if (!audioCtx) return null;
      const sampleRate = audioCtx.sampleRate;
      const safeFreq = Math.max(24, Math.min(sampleRate * 0.4, freq || 261.63));

      const reedBite = Math.max(0.0, Math.min(1.0, params.reedBite !== undefined ? params.reedBite : 0.62));
      const reedBuzz = Math.max(0.0, Math.min(1.0, params.reedBuzz !== undefined ? params.reedBuzz : 0.45));
      const tremoloDepth = Math.max(0.0, Math.min(1.0, params.tremoloDepth !== undefined ? params.tremoloDepth : 0.38));
      const woodBody = Math.max(0.0, Math.min(1.0, params.woodBody !== undefined ? params.woodBody : 0.65));
      const vel = Math.max(0.10, Math.min(1.0, velocity !== undefined ? velocity : 0.8));
      const velLayer = Math.round(vel * 16);

      const cacheKey = FMWurliReedEngine._getCacheKey(sampleRate, safeFreq, reedBite, reedBuzz, tremoloDepth, woodBody, velLayer);
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
      const nyquistGuard = (5.0 * safeFreq < sampleRate * 0.43)
        ? 1.0 / (1.0 + Math.pow(safeFreq / 750.0, 1.6))
        : 0.0;

      // Reeds respond nonlinearly to velocity (soft strikes stay warm, hard strikes bark strongly)
      const velBarkScale = 0.16 + 0.84 * Math.pow(vel, 1.40);

      // Op2 (2:1 ratio) & Op3 (3:1 ratio) into Op1 (1:1 carrier) for odd/even reed asymmetry
      const idx2Peak = (0.40 + reedBite * 2.55) * velBarkScale * RAD_TO_IDX;
      const idx2Floor = (0.18 + reedBite * 0.52) * RAD_TO_IDX;
      const idx3Peak = (0.15 + reedBuzz * 1.65) * velBarkScale * nyquistGuard * RAD_TO_IDX;
      const idx3Floor = (0.05 + reedBuzz * 0.22) * nyquistGuard * RAD_TO_IDX;

      // Op6[fb] -> Op5 -> Op4: Wood body & reed transient chirp (5:1 strike + 1:1 warm wood)
      const fb6Gain = (0.12 + reedBuzz * 0.62) * RAD_TO_IDX;
      const idx5Peak = (0.25 + (1.0 - woodBody) * 0.85) * velBarkScale * RAD_TO_IDX;
      const idx5Floor = 0.14 * RAD_TO_IDX;
      const strikePeak = (0.25 + reedBite * 1.8) * velBarkScale * nyquistGuard * RAD_TO_IDX;

      const envBiteDecay = Math.exp(-1.0 / (sampleRate * 0.11));
      const envStrikeDecay = Math.exp(-1.0 / (sampleRate * 0.024));
      let envBite = 1.0;
      let envStrike = 1.0;

      let p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0;
      const inc1 = baseInc;
      const inc2 = baseInc * 2.0;
      const inc3 = baseInc * 3.0;
      const inc4 = baseInc;
      const inc5 = baseInc;
      const inc6 = baseInc * 5.0;

      let op6Prev = 0;
      // Built-in phase-locked stereo tremolo/chorus cycle (1 full cycle across loopSpanSamples)
      const tremoloInc = TABLE_SIZE / loopSpanSamples;
      let pTrem = 0;
      const stereoOffset = Math.floor(TABLE_SIZE * 0.09);

      for (let n = 0; n < numSamples; n++) {
        // Stack A: Op3 (3x) -> Op2 (2x) -> Op1 (1x) Barking Wurlitzer Reed
        const curIdx3 = idx3Floor + (idx3Peak - idx3Floor) * envBite;
        const op3Out = SIN_TABLE[p3 & TABLE_MASK] * curIdx3;
        const op2Out = SIN_TABLE[(p2 + op3Out) & TABLE_MASK];
        const curIdx2 = idx2Floor + (idx2Peak - idx2Floor) * envBite;
        const reedMod = curIdx2 * op2Out;

        const reedL = SIN_TABLE[(p1 + reedMod) & TABLE_MASK];
        const reedR = SIN_TABLE[(p1 + reedMod * 0.94 + stereoOffset) & TABLE_MASK];

        // Stack B: Op6 (5x + feedback) -> Op5 (1x) -> Op4 (1x) Warm Wood & Mechanical Chiff
        const op6Phase = (p6 + fb6Gain * op6Prev) & TABLE_MASK;
        const op6Out = SIN_TABLE[op6Phase];
        op6Prev = op6Out;

        const op5Mod = strikePeak * envStrike * op6Out;
        const op5Out = SIN_TABLE[(p5 + op5Mod) & TABLE_MASK];
        const curIdx5 = idx5Floor + (idx5Peak - idx5Floor) * envBite;
        const woodOut = SIN_TABLE[(p4 + curIdx5 * op5Out) & TABLE_MASK] * woodBody;

        // Classic Wurlitzer stereo vibrato pan modulation (phase-locked to sustain loop)
        const tremSin = SIN_TABLE[pTrem & TABLE_MASK] * tremoloDepth * 0.28;
        const gainL = 1.0 + tremSin;
        const gainR = 1.0 - tremSin;

        const sigL = (reedL * 0.72 + woodOut * 0.58) * gainL * 0.88;
        const sigR = (reedR * 0.72 + woodOut * 0.58) * gainR * 0.88;

        left[n] = sigL / (1.0 + (sigL >= 0 ? sigL : -sigL) * 0.65);
        right[n] = sigR / (1.0 + (sigR >= 0 ? sigR : -sigR) * 0.65);

        p1 += inc1;
        p2 += inc2;
        p3 += inc3;
        p4 += inc4;
        p5 += inc5;
        p6 += inc6;
        pTrem += tremoloInc;

        if (n < freezeSample) {
          envBite *= envBiteDecay;
        }
        envStrike *= envStrikeDecay;
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
        id: 'fm_wurli_reed',
        name: '3. Barking Reed E.Piano (Alg 4)',
        type: 'buffer',
        loop: true,
        lfoTargets: [
          { value: 'reedBite', label: 'Dest: Reed Bite & Odd-Harmonic Growl' },
          { value: 'reedBuzz', label: 'Dest: Reed Harmonic Buzz (Op 6 FB)' },
          { value: 'tremoloDepth', label: 'Dest: Stereo Vibrato Depth' },
          { value: 'woodBody', label: 'Dest: Warm Cabinet Resonance' }
        ],
        createVoiceBuffer: (audioCtx, freq, params, velocity) =>
          FMWurliReedEngine.generateWurliReedBuffer(audioCtx, freq, params, velocity)
      };
    }
  }

  root.FMWurliReedEngine = FMWurliReedEngine;
  root.REGISTERED_SYNTH_ENGINES = root.REGISTERED_SYNTH_ENGINES || [];
  if (!root.REGISTERED_SYNTH_ENGINES.includes(FMWurliReedEngine)) {
    root.REGISTERED_SYNTH_ENGINES.push(FMWurliReedEngine);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FMWurliReedEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
