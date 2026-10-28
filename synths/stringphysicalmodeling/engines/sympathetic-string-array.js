/**
 * Physical Modeling String Synth v0.1 — Engine 5: Sympathetic String Array & Acoustic Body
 *
 * Models multi-string sympathetic resonance (12-String Guitar, Concert Harp, Harpsichord Choir,
 * Hardanger Fiddle, Sarangi) coupled through an acoustic bridge and spruce/maple soundboard:
 * - Coupled string courses with time-evolving phase beating (two-stage bridge coupling)
 * - Octave & fifth sympathetic string resonance
 * - Tunable wooden soundboard body size (from small lute/violin to grand concert harp/cello)
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || Math.PI * 2;

  class SympatheticStringEngine {
    /**
     * Computes a time-evolving PeriodicWave representing coupled multi-course strings
     * and sympathetic resonator strings through an acoustic soundboard.
     * @param {AudioContext} audioCtx
     * @param {Object} params
     * @param {number} [timestamp=performance.now()]
     * @returns {PeriodicWave|null}
     */
    static createSympatheticWave(audioCtx, params = {}, timestamp = (typeof performance !== 'undefined' ? performance.now() : 0)) {
      if (!audioCtx) return null;
      const tableSize = 256;
      const real = new Float32Array(tableSize);
      const imag = new Float32Array(tableSize);

      const sympMix = Math.max(0.0, Math.min(1.0, params.sympatheticMix !== undefined ? params.sympatheticMix : 0.55));
      const courseDetune = Math.max(0.0, Math.min(1.0, params.courseDetune !== undefined ? params.courseDetune : 0.35));
      const bridgeCoupling = Math.max(0.0, Math.min(1.0, params.bridgeCoupling !== undefined ? params.bridgeCoupling : 0.50));
      const bodySize = Math.max(0.2, Math.min(2.0, params.bodySize !== undefined ? params.bodySize : 1.0));

      const tSec = timestamp / 1000.0;
      const beatRate = 0.15 + courseDetune * 1.6;

      for (let k = 1; k < tableSize / 2; k++) {
        // Primary string partial + coupled twin course beating at bridge
        const coursePhaseDiff = tSec * beatRate * TWO_PI * Math.sqrt(k) * (0.4 + bridgeCoupling * 0.6);
        const primaryAmp = (1.0 + 0.75 * Math.cos(coursePhaseDiff)) / Math.pow(k, 1.15);

        // Sympathetic strings resonate strongly at octaves (k = 2, 4, 8), fifths (k = 3, 6, 12), and major thirds (k = 5, 10)
        const isSympatheticNode = (k % 2 === 0 || k % 3 === 0 || k % 5 === 0);
        const sympAmp = isSympatheticNode
          ? sympMix * (0.95 / Math.pow(k, 0.85)) * (0.65 + 0.35 * Math.sin(coursePhaseDiff * 0.7 + k))
          : sympMix * (0.20 / Math.pow(k, 1.1));

        // Soundboard body size shifts resonant peaks (larger bodySize boosts lower harmonics, smaller boosts upper)
        const targetHarmonic = Math.max(1.0, 6.0 / bodySize);
        const bodyFormant = 1.0 + 0.85 * Math.exp(-Math.pow((k - targetHarmonic) / (3.5 * bodySize), 2));

        const totalAmp = (primaryAmp + sympAmp) * bodyFormant * 0.5;
        real[k] = totalAmp * Math.cos(coursePhaseDiff * 0.5);
        imag[k] = totalAmp * Math.sin(coursePhaseDiff * 0.5);
      }

      return audioCtx.createPeriodicWave(real, imag);
    }

    static getEngineDescriptor() {
      return {
        id: 'sympathetic_array',
        name: '5. Sympathetic Array',
        type: 'wavetable',
        continuousUpdate: true,
        lfoTargets: [
          { value: 'sympatheticMix', label: 'Dest: Sympathetic Resonance' },
          { value: 'courseDetune', label: 'Dest: Course Detune Beating' },
          { value: 'bridgeCoupling', label: 'Dest: Bridge Energy Coupling' },
          { value: 'bodySize', label: 'Dest: Acoustic Body Size' }
        ],
        createPeriodicWave: (audioCtx, params, timestamp) => SympatheticStringEngine.createSympatheticWave(audioCtx, params, timestamp)
      };
    }
  }

  root.SympatheticStringEngine = SympatheticStringEngine;
  root.REGISTERED_SYNTH_ENGINES = root.REGISTERED_SYNTH_ENGINES || [];
  if (!root.REGISTERED_SYNTH_ENGINES.includes(SympatheticStringEngine)) {
    root.REGISTERED_SYNTH_ENGINES.push(SympatheticStringEngine);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SympatheticStringEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
