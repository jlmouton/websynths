/**
 * Fractal Sound Engine v2.0 — Sound Engine 2: 2D & 3D Complex Fractal Wavetables
 *
 * Implements bandlimited harmonic escape-time synthesis across 7 fractal topologies:
 * - Julia Set 2D
 * - Mandelbrot Boundary
 * - Burning Ship Non-Linear
 * - Newton-Raphson Roots (z^3 - 1 = 0)
 * - Mandelbulb 3D Spherical Projection
 * - Sierpinski Gasket Bitwise Self-Similarity
 * - Koch Snowflake Overtone Cascade
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || Math.PI * 2;

  class ComplexFractalEngine {
    /**
     * Generates a bandlimited PeriodicWave from 2D/3D fractal orbit escape times.
     * @param {AudioContext} audioCtx
     * @param {Object} params
     * @returns {PeriodicWave|null}
     */
    static createFractalPeriodicWave(audioCtx, params = {}) {
      if (!audioCtx) return null;
      const tableSize = 256;
      const real = new Float32Array(tableSize);
      const imag = new Float32Array(tableSize);
      const setType = params.fractalSet || 'julia';
      const cReal = params.cReal !== undefined ? params.cReal : -0.70;
      const cImag = params.cImag !== undefined ? params.cImag : 0.27;
      const zoom = Math.max(0.1, params.zoom || 1.0);
      const maxIter = params.maxIter || 16;
      const rad3D = ((params.angle3D || 45) * Math.PI) / 180.0;
      const rScale = 1.5 / zoom;

      for (let k = 1; k < tableSize / 2; k++) {
        const theta = (TWO_PI * k) / tableSize;
        let iter = 0;

        if (setType === 'mandelbrot' || setType === 'burningship') {
          let zx = rScale * Math.cos(theta);
          let zy = rScale * Math.sin(theta);
          for (let i = 0; i < maxIter; i++) {
            const x2 = setType === 'burningship'
              ? (Math.abs(zx) * Math.abs(zx) - Math.abs(zy) * Math.abs(zy) + cReal)
              : (zx * zx - zy * zy + cReal);
            const y2 = setType === 'burningship'
              ? (2 * Math.abs(zx) * Math.abs(zy) + cImag)
              : (2 * zx * zy + cImag);
            zx = x2; zy = y2;
            if (zx * zx + zy * zy > 4.0) break;
            iter++;
          }
        } else if (setType === 'julia') {
          let zx = rScale * Math.cos(theta);
          let zy = rScale * Math.sin(theta);
          for (let i = 0; i < maxIter; i++) {
            const x2 = zx * zx - zy * zy + cReal;
            const y2 = 2 * zx * zy + cImag;
            zx = x2; zy = y2;
            if (zx * zx + zy * zy > 4.0) break;
            iter++;
          }
        } else if (setType === 'newton') {
          let zx = rScale * Math.cos(theta) + cReal;
          let zy = rScale * Math.sin(theta) + cImag;
          for (let i = 0; i < maxIter; i++) {
            const r2 = zx * zx + zy * zy;
            if (r2 < 1e-6) break;
            const zx2 = zx * zx - zy * zy;
            const zy2 = 2 * zx * zy;
            const den = 3 * (zx2 * zx2 + zy2 * zy2);
            if (den === 0) break;
            zx = (2 / 3) * zx + (zx2) / den;
            zy = (2 / 3) * zy - (zy2) / den;
            iter++;
          }
        } else if (setType === 'mandelbulb3d') {
          const cosA = Math.cos(rad3D), sinA = Math.sin(rad3D);
          let rx = (rScale * Math.cos(theta) * cosA) + cReal;
          let ry = (rScale * Math.sin(theta) * sinA) + cImag;
          let rz = cReal * 0.5;
          let x = rx, y = ry, z = rz;
          const n = 8.0;

          for (let i = 0; i < maxIter; i++) {
            const r = Math.hypot(x, y, z);
            if (r > 2.0 || r < 1e-6) break;
            const th = Math.acos(Math.max(-1.0, Math.min(1.0, z / r))) * n;
            const ph = Math.atan2(y, x) * n;
            const powR = Math.pow(r, n);
            x = powR * Math.sin(th) * Math.cos(ph) + rx;
            y = powR * Math.sin(th) * Math.sin(ph) + ry;
            z = powR * Math.cos(th) + rz;
            iter++;
          }
        } else if (setType === 'sierpinski') {
          const px = Math.floor(Math.abs(Math.cos(theta) * zoom * 64 + cReal * 32));
          const py = Math.floor(Math.abs(Math.sin(theta) * zoom * 64 + cImag * 32));
          iter = (px & py) === 0 ? maxIter : Math.floor(maxIter * 0.25);
        } else if (setType === 'koch') {
          const harmonicStep = Math.pow(4 / 3, k % 5);
          iter = Math.floor(((Math.sin(theta * harmonicStep) + 1) / 2) * maxIter);
        } else {
          iter = Math.floor((Math.abs(Math.sin(theta * cReal * 4.0) + Math.cos(theta * cImag * 4.0)) / 2.0) * maxIter);
        }

        const amp = ((iter + 1) / (maxIter + 1)) / (k * Math.pow(1.0 + k / 64.0, 1.2));
        real[k] = amp * Math.cos(theta);
        imag[k] = amp * Math.sin(theta);
      }

      return audioCtx.createPeriodicWave(real, imag);
    }

    static getEngineDescriptor() {
      return {
        id: 'julia',
        aliases: ['mandelbrot', 'fractal', 'burningship', 'newton', 'mandelbulb3d', 'sierpinski', 'koch'],
        name: '2. 2D/3D Sets',
        type: 'wavetable',
        lfoTargets: [
          { value: 'cReal', label: 'Dest: Complex cReal (X)' },
          { value: 'cImag', label: 'Dest: Complex cImag (Y)' },
          { value: 'fractalZoom', label: 'Dest: Fractal Zoom' },
          { value: 'angle3D', label: 'Dest: 3D Projection Angle' }
        ],
        createPeriodicWave: (audioCtx, params) => ComplexFractalEngine.createFractalPeriodicWave(audioCtx, params)
      };
    }
  }

  root.ComplexFractalEngine = ComplexFractalEngine;
  root.FractalWavetableDSP = root.FractalWavetableDSP || {};
  root.FractalWavetableDSP.createFractalPeriodicWave = ComplexFractalEngine.createFractalPeriodicWave.bind(ComplexFractalEngine);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ComplexFractalEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
