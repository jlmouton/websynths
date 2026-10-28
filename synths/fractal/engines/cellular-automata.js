/**
 * Fractal Sound Engine v2.0 — Sound Engine 6: Wolfram 1D Elementary Cellular Automata
 *
 * Synthesizes fractal overtone spectra by evolving 1D binary cellular automata
 * across Wolfram rules (e.g., Rule 30 chaotic, Rule 90 Sierpinski, Rule 110 Turing-complete, Rule 150).
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || Math.PI * 2;

  class CellularAutomataEngine {
    /**
     * Generates a PeriodicWave whose harmonic amplitudes are masked by a 1D Cellular Automaton.
     * @param {AudioContext} audioCtx
     * @param {number} [rule=110] - Wolfram 8-bit rule (0 - 255)
     * @param {number} [steps=64] - Grid width
     * @returns {PeriodicWave|null}
     */
    static generateCellularAutomataWave(audioCtx, rule = 110, steps = 64) {
      if (!audioCtx) return null;
      const tableSize = 128;
      const real = new Float32Array(tableSize);
      const imag = new Float32Array(tableSize);

      let row = new Uint8Array(steps);
      row[Math.floor(steps / 2)] = 1; // Initial single center cell seed

      for (let s = 0; s < 16; s++) {
        const nextRow = new Uint8Array(steps);
        for (let i = 0; i < steps; i++) {
          const left = i > 0 ? row[i - 1] : row[steps - 1];
          const center = row[i];
          const right = i < steps - 1 ? row[i + 1] : row[0];
          const pattern = (left << 2) | (center << 1) | right;
          nextRow[i] = (rule & (1 << pattern)) ? 1 : 0;
        }
        row = nextRow;
      }

      for (let k = 1; k < Math.min(tableSize / 2, steps); k++) {
        const active = row[k % steps];
        const amp = (active ? 0.8 : 0.05) / Math.sqrt(k);
        const phase = (TWO_PI * k) / tableSize;
        real[k] = amp * Math.cos(phase);
        imag[k] = amp * Math.sin(phase);
      }

      return audioCtx.createPeriodicWave(real, imag);
    }

    static getEngineDescriptor() {
      return {
        id: 'automata',
        name: '6. Automata',
        type: 'wavetable',
        lfoTargets: [
          { value: 'automataRule', label: 'Dest: Automata Rule' }
        ],
        createPeriodicWave: (audioCtx, params) => {
          const rule = params.cellularRule !== undefined ? params.cellularRule : 110;
          return CellularAutomataEngine.generateCellularAutomataWave(audioCtx, rule, 64);
        }
      };
    }
  }

  root.CellularAutomataEngine = CellularAutomataEngine;
  root.OpticalAndAutomataDSP = root.OpticalAndAutomataDSP || {};
  root.OpticalAndAutomataDSP.generateCellularAutomataWave = CellularAutomataEngine.generateCellularAutomataWave.bind(CellularAutomataEngine);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CellularAutomataEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
