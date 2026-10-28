/**
 * Fractal Sound Engine v2.0 — Sound Engine 3: Strange Attractor FM (Continuous RK4 Chaos)
 *
 * Solves 3D non-linear differential equations using 4th-order Runge-Kutta (RK4)
 * to modulate stereo FM synthesis and 3D particle visualizations:
 * - Lorenz Atmospheric Convection System
 * - Rössler Spiral Attractor
 * - Chua Non-Linear Diode Circuit
 * - Thomas Cyclically Symmetric Labyrinth
 * - Aizawa 3D Spherical Pulsar
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || Math.PI * 2;

  class StrangeAttractorDSP {
    /**
     * Computes instantaneous 3D derivatives (dx/dt, dy/dt, dz/dt) for the chosen attractor.
     * @param {string} type
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {Object} [params={}]
     * @returns {{dx: number, dy: number, dz: number}}
     */
    static derivatives(type, x, y, z, params = {}) {
      let dx = 0, dy = 0, dz = 0;
      const p = params || {};
      switch (type) {
        case 'lorenz': {
          const sigma = p.sigma || 10.0;
          const rho = p.rho || 28.0;
          const beta = p.beta || (8.0 / 3.0);
          dx = sigma * (y - x);
          dy = x * (rho - z) - y;
          dz = x * y - beta * z;
          break;
        }
        case 'rossler': {
          const a = p.rosslerA || 0.2;
          const b = p.rosslerB || 0.2;
          const c = p.rosslerC || 5.7;
          dx = -y - z;
          dy = x + a * y;
          dz = b + z * (x - c);
          break;
        }
        case 'chua': {
          const alpha = p.chuaAlpha || 15.6;
          const beta = p.chuaBeta || 28.0;
          const m0 = -1.143, m1 = -0.714;
          const g = m1 * x + 0.5 * (m0 - m1) * (Math.abs(x + 1) - Math.abs(x - 1));
          dx = alpha * (y - x - g);
          dy = x - y + z;
          dz = -beta * y;
          break;
        }
        case 'thomas': {
          const b = p.thomasB || 0.208186;
          dx = Math.sin(y) - b * x;
          dy = Math.sin(z) - b * y;
          dz = Math.sin(x) - b * z;
          break;
        }
        case 'aizawa': {
          const a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1;
          dx = (z - b) * x - d * y;
          dy = d * x + (z - b) * y;
          dz = c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + e * z) + f * z * (x * x * x);
          break;
        }
        default:
          dx = 10 * (y - x);
          dy = x * (28 - z) - y;
          dz = x * y - 2.666 * z;
      }
      return { dx, dy, dz };
    }

    /**
     * Advances the 3D state vector by dt using 4th-Order Runge-Kutta (RK4) integration.
     * @param {string} type
     * @param {{x: number, y: number, z: number}} state
     * @param {number} dt
     * @param {Object} [params={}]
     * @returns {{x: number, y: number, z: number}}
     */
    static rk4Step(type, state, dt, params = {}) {
      let { x, y, z } = state || { x: 0.1, y: 0.0, z: 0.0 };

      const k1 = this.derivatives(type, x, y, z, params);
      const k2 = this.derivatives(type, x + 0.5 * dt * k1.dx, y + 0.5 * dt * k1.dy, z + 0.5 * dt * k1.dz, params);
      const k3 = this.derivatives(type, x + 0.5 * dt * k2.dx, y + 0.5 * dt * k2.dy, z + 0.5 * dt * k2.dz, params);
      const k4 = this.derivatives(type, x + dt * k3.dx, y + dt * k3.dy, z + dt * k3.dz, params);

      x += (dt / 6.0) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
      y += (dt / 6.0) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy);
      z += (dt / 6.0) * (k1.dz + 2 * k2.dz + 2 * k3.dz + k4.dz);

      // Safeguard from numerical explosion
      if (isNaN(x) || Math.abs(x) > 1000) x = 0.1;
      if (isNaN(y) || Math.abs(y) > 1000) y = 0.1;
      if (isNaN(z) || Math.abs(z) > 1000) z = 0.1;

      return { x, y, z };
    }

    /**
     * Generates a continuous stereo AudioBuffer frequency-modulated by the chaotic attractor trajectory.
     * @param {AudioContext} audioCtx
     * @param {number} freq
     * @param {number} duration
     * @param {string} type
     * @param {Object} params
     * @returns {AudioBuffer|null}
     */
    static generateAttractorBuffer(audioCtx, freq, duration, type, params = {}) {
      if (!audioCtx) return null;
      const sampleRate = audioCtx.sampleRate;
      const numSamples = Math.floor(sampleRate * duration);
      const buffer = audioCtx.createBuffer(2, numSamples, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      let state = { x: 0.1, y: 0.0, z: 0.0 };
      const dt = (1.0 / sampleRate) * (params.attractorSpeed || 40.0);
      const fmDepth = params.fmDepth !== undefined ? params.fmDepth : 0.5;

      let phaseL = 0;
      let phaseR = 0;

      for (let i = 0; i < numSamples; i++) {
        state = this.rk4Step(type, state, dt, params);

        const normX = Math.max(-2.0, Math.min(2.0, state.x / 15.0));
        const normY = Math.max(-2.0, Math.min(2.0, state.y / 15.0));
        const normZ = Math.max(-2.0, Math.min(2.0, state.z / 25.0));

        const instantFreqL = freq * Math.pow(2, (normX * fmDepth * 1200) / 1200);
        const instantFreqR = freq * Math.pow(2, ((normY + normZ * 0.2) * fmDepth * 1200) / 1200);

        phaseL += (TWO_PI * instantFreqL) / sampleRate;
        phaseR += (TWO_PI * instantFreqR) / sampleRate;

        left[i] = Math.sin(phaseL);
        right[i] = Math.sin(phaseR);
      }

      return buffer;
    }

    static getEngineDescriptor() {
      return {
        id: 'attractor',
        aliases: ['lorenz', 'logistic'],
        name: '3. Attractor FM',
        type: 'buffer',
        lfoTargets: [
          { value: 'fmDepth', label: 'Dest: Attractor FM Depth' },
          { value: 'attractorSpeed', label: 'Dest: Orbit Speed' }
        ],
        createVoiceBuffer: (audioCtx, freq, params) => {
          const attractorType = params.attractorType || 'lorenz';
          return StrangeAttractorDSP.generateAttractorBuffer(audioCtx, freq, 2.5, attractorType, params);
        }
      };
    }
  }

  root.StrangeAttractorDSP = StrangeAttractorDSP;
  root.StrangeAttractorEngine = StrangeAttractorDSP;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StrangeAttractorDSP, StrangeAttractorEngine: StrangeAttractorDSP };
  }
})(typeof window !== 'undefined' ? window : globalThis);
