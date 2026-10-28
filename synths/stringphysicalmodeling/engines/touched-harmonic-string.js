/**
 * Physical Modeling String Synth v0.1 — Engine 4: Touched String (Flageolet Harmonics & Javari Fret Buzz)
 *
 * Models what happens when a vibrating string is lightly touched by a finger at a node
 * or grazes against a curved bridge/fret (Sitar Javari, Tanpura, Guqin, Guitar Flageolet):
 * - Nodal Touch Selective Damping: Partials with sin(k * pi * nodePos) != 0 are damped by touchDamping,
 *   isolating pure crystalline harmonic overtones (1/2 octave, 1/3 fifth, 1/4 2nd octave, 1/5 major 3rd, etc.)
 * - Curved Bridge / Fret Grazing (Javari Buzz): Non-linear spatial clipping regenerates shimmering high partials.
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || Math.PI * 2;

  class TouchedHarmonicEngine {
    /**
     * Computes a PeriodicWave modeling a touched string with nodal flageolet isolation
     * and curved-bridge/fret grazing buzz.
     * @param {AudioContext} audioCtx
     * @param {Object} params
     * @returns {PeriodicWave|null}
     */
    static createTouchedStringWave(audioCtx, params = {}) {
      if (!audioCtx) return null;
      const tableSize = 256;
      const real = new Float32Array(tableSize);
      const imag = new Float32Array(tableSize);

      // Node fraction (default 0.50 = 2nd harmonic octave so played C sounds as C)
      const touchNode = Math.max(0.10, Math.min(0.50, params.touchNodePos !== undefined ? params.touchNodePos : 0.50));
      const touchDamping = Math.max(0.0, Math.min(1.0, params.touchDamping !== undefined ? params.touchDamping : 0.55));
      const fretBuzz = Math.max(0.0, Math.min(1.0, params.fretBuzz !== undefined ? params.fretBuzz : 0.20));
      const shimmer = Math.max(0.0, Math.min(1.0, params.harmonicShimmer !== undefined ? params.harmonicShimmer : 0.45));

      for (let k = 1; k < tableSize / 2; k++) {
        // How much partial k moves at the finger touch point: |sin(k * pi * touchNode)|
        // When sin(k * pi * touchNode) == 0, the finger sits at a stationary node -> zero damping!
        const antinodeDisplacement = Math.abs(Math.sin(k * Math.PI * touchNode));
        let nodalSurvival = Math.exp(-touchDamping * 7.5 * antinodeDisplacement * antinodeDisplacement);

        // Preserve a strong fundamental (k=1) pitch anchor unless touchDamping is pushed to >85% isolation,
        // so non-octave touch nodes (1/3 fifth, 1/5 third) color the harmonic timbre without transposing the played note!
        if (k === 1 && touchDamping < 0.88) {
          const fundamentalAnchor = 0.85 * (1.0 - touchDamping * 0.85);
          nodalSurvival = Math.max(nodalSurvival, fundamentalAnchor);
        }

        // Base string roll-off + shimmer high-partial extension
        const baseDecay = 1.0 / Math.pow(k, 1.25 - shimmer * 0.55);

        // Javari curved bridge / fret grazing adds odd/even parabolic phase-modulated overtones
        const buzzBoost = fretBuzz > 0
          ? 1.0 + fretBuzz * 2.2 * Math.abs(Math.cos(k * 0.75)) * Math.exp(-k / 36.0)
          : 1.0;

        const amp = nodalSurvival * baseDecay * buzzBoost;
        const phase = k * fretBuzz * 0.4;
        real[k] = amp * Math.sin(phase);
        imag[k] = amp * Math.cos(phase);
      }

      return audioCtx.createPeriodicWave(real, imag);
    }

    static getEngineDescriptor() {
      return {
        id: 'touched_harmonic',
        name: '4. Touched / Flageolet',
        type: 'wavetable',
        lfoTargets: [
          { value: 'touchNodePos', label: 'Dest: Finger Touch Node (1/N)' },
          { value: 'touchDamping', label: 'Dest: Finger Touch Damping' },
          { value: 'fretBuzz', label: 'Dest: Fret / Javari Bridge Buzz' },
          { value: 'harmonicShimmer', label: 'Dest: Harmonic Shimmer' }
        ],
        createPeriodicWave: (audioCtx, params) => TouchedHarmonicEngine.createTouchedStringWave(audioCtx, params)
      };
    }
  }

  root.TouchedHarmonicEngine = TouchedHarmonicEngine;
  root.REGISTERED_SYNTH_ENGINES = root.REGISTERED_SYNTH_ENGINES || [];
  if (!root.REGISTERED_SYNTH_ENGINES.includes(TouchedHarmonicEngine)) {
    root.REGISTERED_SYNTH_ENGINES.push(TouchedHarmonicEngine);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TouchedHarmonicEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
