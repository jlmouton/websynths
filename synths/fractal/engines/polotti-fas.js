/**
 * Fractal Sound Engine v2.0 — Sound Engine 1: Polotti Fractal Additive Synthesis (EPFL TH2711)
 *
 * Implements:
 * - 1/f^alpha Fractional Brownian Motion (fBm) noise generation
 * - Fractal Interpolation Function (FIF) midpoint displacement waveforms
 * - Geometric partial spacing (gamma), fractal dimension (D), and spectral decay PeriodicWave synthesis
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || Math.PI * 2;

  class PolottiFAS {
    /**
     * Generates 1/f^alpha Fractional Brownian Motion (fBm) noise table.
     * Based on Pietro Polotti's thesis: natural acoustic instruments possess
     * stochastic spectral micro-modulations with power law S(f) ~ 1/f^(2H+1).
     * @param {number} [length=1024] - Number of samples
     * @param {number} [H=0.6] - Hurst parameter (0 < H < 1)
     * @returns {Float32Array}
     */
    static generateFBM(length = 1024, H = 0.6) {
      const fbm = new Float32Array(length);
      const numOctaves = 6;
      let maxAmp = 0;

      for (let oct = 0; oct < numOctaves; oct++) {
        const freq = Math.pow(2, oct);
        const amp = Math.pow(freq, -H);
        const phase = Math.random() * TWO_PI;

        for (let i = 0; i < length; i++) {
          fbm[i] += amp * Math.sin((TWO_PI * freq * i) / length + phase);
        }
        maxAmp += amp;
      }

      if (maxAmp > 0) {
        for (let i = 0; i < length; i++) {
          fbm[i] /= maxAmp;
        }
      }
      return fbm;
    }

    /**
     * Generates a Fractal Interpolation Function (FIF) waveform with controllable fractal dimension D.
     * D in [1.0, 2.0] where D = 2 - H.
     * @param {number} [size=512] - Wavetable size
     * @param {number} [fractalDim=1.35] - Fractal dimension (1.0 = smooth, 2.0 = rough)
     * @returns {Float32Array}
     */
    static generateFIFWaveform(size = 512, fractalDim = 1.35) {
      const wave = new Float32Array(size);
      const H = Math.max(0.05, Math.min(0.95, 2.0 - fractalDim));
      const scalingFactor = Math.pow(0.5, H);

      wave[0] = 0;
      wave[size - 1] = 0;

      function displace(left, right, depth, maxDepth, scale) {
        if (depth >= maxDepth || right - left <= 1) return;
        const mid = Math.floor((left + right) / 2);
        const rand = (Math.random() * 2 - 1) * scale;
        wave[mid] = (wave[left] + wave[right]) / 2 + rand;
        displace(left, mid, depth + 1, maxDepth, scale * scalingFactor);
        displace(mid, right, depth + 1, maxDepth, scale * scalingFactor);
      }

      displace(0, size - 1, 0, 9, 1.0);

      let peak = 0.001;
      for (let i = 0; i < size; i++) {
        if (Math.abs(wave[i]) > peak) peak = Math.abs(wave[i]);
      }
      for (let i = 0; i < size; i++) {
        wave[i] /= peak;
      }
      return wave;
    }

    /**
     * Computes PeriodicWave coefficients using Fractal Additive Partial Summation
     * with gamma ratio, fractal dimension, and fBm perturbation.
     * @param {AudioContext} audioCtx
     * @param {Object} params
     * @returns {PeriodicWave|null}
     */
    static createPeriodicWave(audioCtx, params = {}) {
      if (!audioCtx) return null;
      const tableSize = 256;
      const real = new Float32Array(tableSize);
      const imag = new Float32Array(tableSize);

      const gamma = params.fasGamma || 2.000;
      const harmonics = Math.min(tableSize / 2 - 1, params.fasHarmonics || 8);
      const decayA = params.fasDecay || 0.55;
      const fractalDim = params.fasDimension || 1.35;
      const fBmAmount = params.fasFbmAmount !== undefined ? params.fasFbmAmount : (params.fasFbm !== undefined ? params.fasFbm : 0.35);
      const H = Math.max(0.05, Math.min(0.95, 2.0 - fractalDim));

      const fbmNoise = this.generateFBM(tableSize, H);

      for (let k = 1; k <= harmonics; k++) {
        const effectiveIndex = Math.min(tableSize / 2 - 1, Math.max(1, Math.round(Math.pow(gamma, k - 1))));
        const baseAmp = Math.pow(decayA, k - 1) / Math.sqrt(k);
        const stochasticPerturbation = 1.0 + fBmAmount * fbmNoise[effectiveIndex % tableSize];
        const finalAmp = Math.max(0, baseAmp * stochasticPerturbation);

        const phase = (k * Math.PI * (1.0 - H)) + (fBmAmount * fbmNoise[(effectiveIndex * 3) % tableSize]);
        real[effectiveIndex] += finalAmp * Math.cos(phase);
        imag[effectiveIndex] += finalAmp * Math.sin(phase);
      }

      return audioCtx.createPeriodicWave(real, imag);
    }

    /**
     * Engine Descriptor for SynthFramework registration
     */
    static getEngineDescriptor() {
      return {
        id: 'polotti_fas',
        name: '1. Polotti FAS',
        type: 'wavetable',
        lfoTargets: [
          { value: 'fasDimension', label: 'Dest: FAS Dimension (D)' },
          { value: 'fasGamma', label: 'Dest: FAS Ratio (γ)' },
          { value: 'fasDecay', label: 'Dest: Spectral Decay' },
          { value: 'fasFbm', label: 'Dest: fBm Noise (H)' }
        ],
        createPeriodicWave: (audioCtx, params) => PolottiFAS.createPeriodicWave(audioCtx, params)
      };
    }
  }

  root.PolottiFAS = PolottiFAS;
  root.PolottiFASEngine = PolottiFAS;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PolottiFAS, PolottiFASEngine: PolottiFAS };
  }
})(typeof window !== 'undefined' ? window : globalThis);
