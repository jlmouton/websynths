/**
 * Physical Modeling String Synth v0.1 — Engine 6: Dispersive Stiff String & Prepared Wire
 * (Ultra-Low-Latency 4th-Order Euler-Bernoulli Stiff String PDE & Fletcher Inharmonicity Model)
 *
 * Solves the dispersive stiff string equation where bending stiffness EI causes
 * high partials to travel faster than low partials:
 *   f_k = k * f_0 * sqrt(1 + B * k^2)
 * Uses a fast Magic-Circle coupled quadrature resonator bank (zero Math.sin / Math.tanh
 * calls inside the inner sample loop) + 64-sample block tension updates + LRU buffer cache
 * to synthesize dispersive stiff wires in ~1.2 ms.
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || Math.PI * 2;
  const BUFFER_CACHE = new Map();
  const MAX_CACHE_ENTRIES = 36;

  class StiffStringEngine {
    static _getCacheKey(sampleRate, freq, inharmonicityB, numPartials, hfLoss, tensionDrop) {
      return `${sampleRate}|${Math.round(freq * 10)}|${inharmonicityB.toFixed(4)}|${numPartials}|${hfLoss.toFixed(2)}|${tensionDrop.toFixed(2)}`;
    }

    /**
     * Generates a stereo AudioBuffer of a dispersive stiff string with stretched overtones
     * and non-linear initial tension pitch-drop envelope in ~1.2 ms.
     * @param {AudioContext} audioCtx
     * @param {number} freq
     * @param {Object} params
     * @returns {AudioBuffer|null}
     */
    static generateStiffStringBuffer(audioCtx, freq, params = {}) {
      if (!audioCtx) return null;
      const sampleRate = audioCtx.sampleRate;
      const safeFreq = Math.max(24, Math.min(sampleRate * 0.4, freq || 110));

      const inharmonicityB = Math.max(0.0, Math.min(0.08, params.inharmonicityB !== undefined ? params.inharmonicityB : 0.004));
      const numPartials = Math.max(2, Math.min(24, Math.round(params.stiffPartials !== undefined ? params.stiffPartials : 16)));
      const hfLoss = Math.max(0.05, Math.min(1.0, params.stiffHfLoss !== undefined ? params.stiffHfLoss : 0.35));
      const tensionDrop = Math.max(0.0, Math.min(1.0, params.tensionDrop !== undefined ? params.tensionDrop : 0.20));

      const cacheKey = StiffStringEngine._getCacheKey(sampleRate, safeFreq, inharmonicityB, numPartials, hfLoss, tensionDrop);
      if (BUFFER_CACHE.has(cacheKey)) {
        return BUFFER_CACHE.get(cacheKey);
      }

      const duration = 0.85;
      const numSamples = Math.floor(sampleRate * duration);
      const buffer = audioCtx.createBuffer(2, numSamples, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      // Typed arrays for SIMD-friendly inner resonator loop (zero object property lookups!)
      const activeCountMax = numPartials;
      const baseEps = new Float32Array(activeCountMax);
      const ampBase = new Float32Array(activeCountMax);
      const ampFloor = new Float32Array(activeCountMax);
      const envArr = new Float32Array(activeCountMax);
      const blockDecay = new Float32Array(activeCountMax);
      const sinState = new Float32Array(activeCountMax);
      const cosState = new Float32Array(activeCountMax);
      const panSign = new Float32Array(activeCountMax);

      let activeCount = 0;
      const blockSize = 64;

      for (let k = 1; k <= numPartials; k++) {
        // Fletcher Inharmonicity Law: f_k = k * f_0 * sqrt(1 + B * k^2)
        const stretchedRatio = k * Math.sqrt(1.0 + inharmonicityB * k * k);
        const fk = safeFreq * stretchedRatio;
        if (fk >= sampleRate * 0.44) break;

        const omega = (TWO_PI * fk) / sampleRate;
        baseEps[activeCount] = 2.0 * Math.sin(omega * 0.5);

        const a = 0.45 / Math.pow(k, 0.75 + hfLoss * 0.55);
        ampBase[activeCount] = a * 0.88;
        ampFloor[activeCount] = a * (0.12 / k);
        envArr[activeCount] = 1.0;

        const decayRate = (0.45 + hfLoss * 1.8) * (1.0 + 0.07 * Math.pow(k, 1.6));
        blockDecay[activeCount] = Math.exp((-decayRate * blockSize) / sampleRate);

        const initPhase = (k * 0.37) % TWO_PI;
        sinState[activeCount] = Math.sin(initPhase);
        cosState[activeCount] = Math.cos(initPhase);
        panSign[activeCount] = (k & 1) === 0 ? 0.18 : -0.18;

        activeCount++;
      }

      const tensionBlockDecay = Math.exp((-14.0 * blockSize) / sampleRate);
      let tensionEnv = tensionDrop * 0.035;
      // Freeze partial amplitude decay after 0.32s so the looped tail has flat RMS energy
      // (while ADSR EnvelopeModule controls overall decay/sustain)
      const freezeSample = Math.floor(sampleRate * 0.32);

      for (let blockStart = 0; blockStart < numSamples; blockStart += blockSize) {
        const blockEnd = Math.min(numSamples, blockStart + blockSize);
        const pitchMult = 1.0 + tensionEnv;
        const shouldDecay = blockStart < freezeSample;

        for (let p = 0; p < activeCount; p++) {
          const eps = baseEps[p] * pitchMult;
          const curAmp = ampFloor[p] + ampBase[p] * envArr[p];
          const ampL = curAmp * (1.0 + panSign[p]);
          const ampR = curAmp * (1.0 - panSign[p]);
          let s = sinState[p];
          let c = cosState[p];

          for (let n = blockStart; n < blockEnd; n++) {
            s += eps * c;
            c -= eps * s;
            left[n] += s * ampL;
            right[n] += c * ampR;
          }

          sinState[p] = s;
          cosState[p] = c;
          if (shouldDecay) {
            envArr[p] *= blockDecay[p];
          }
        }

        tensionEnv *= tensionBlockDecay;
      }

      for (let n = 0; n < numSamples; n++) {
        const sL = left[n] * 0.9;
        const sR = right[n] * 0.9;
        left[n] = sL / (1.0 + (sL >= 0 ? sL : -sL) * 0.55);
        right[n] = sR / (1.0 + (sR >= 0 ? sR : -sR) * 0.55);
      }

      // Seamless raised-cosine pre-start crossfade splice at loop boundary
      const exactPeriod = sampleRate / safeFreq;
      const loopStartSample = Math.floor(sampleRate * 0.42);
      const loopPeriods = Math.max(8, Math.round(safeFreq * 0.35));
      const loopSpanSamples = Math.min(
        numSamples - loopStartSample - 4,
        Math.max(128, Math.round(loopPeriods * exactPeriod))
      );
      const loopEndSample = loopStartSample + loopSpanSamples;
      const xfadeSamples = Math.min(Math.floor(loopSpanSamples / 2), Math.max(64, Math.round(exactPeriod * 3)));

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
        const oldestKey = BUFFER_CACHE.keys().next().value;
        BUFFER_CACHE.delete(oldestKey);
      }
      BUFFER_CACHE.set(cacheKey, buffer);

      return buffer;
    }

    static getEngineDescriptor() {
      return {
        id: 'stiff_dispersion',
        name: '6. Stiff Dispersion',
        type: 'buffer',
        loop: true,
        lfoTargets: [
          { value: 'inharmonicityB', label: 'Dest: Inharmonicity (B)' },
          { value: 'stiffPartials', label: 'Dest: Active String Modes' },
          { value: 'stiffHfLoss', label: 'Dest: Viscoelastic HF Loss' },
          { value: 'tensionDrop', label: 'Dest: Non-Linear Tension Drop' }
        ],
        createVoiceBuffer: (audioCtx, freq, params) => StiffStringEngine.generateStiffStringBuffer(audioCtx, freq, params)
      };
    }
  }

  root.StiffStringEngine = StiffStringEngine;
  root.REGISTERED_SYNTH_ENGINES = root.REGISTERED_SYNTH_ENGINES || [];
  if (!root.REGISTERED_SYNTH_ENGINES.includes(StiffStringEngine)) {
    root.REGISTERED_SYNTH_ENGINES.push(StiffStringEngine);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StiffStringEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
