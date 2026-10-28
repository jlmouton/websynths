/**
 * Fractal Sound Engine v2.0 — Mathematical Constants & Musical Scale Quantizer
 * UMD / Global-Namespace Module (compatible with file://, HTTP, and Node.js)
 */
(function (root) {
  'use strict';

  const TWO_PI = Math.PI * 2;
  const PHI = 1.618033988749895; // Golden Ratio

  /**
   * MIDI Pitch to Frequency Conversion (A4 = 440Hz, equal temperament or microtonal)
   * @param {number} note - MIDI note number (0 - 127)
   * @param {number} [microtuningOffset=0] - Fractional semitone offset
   * @returns {number} Frequency in Hz
   */
  function midiToFreq(note, microtuningOffset = 0) {
    return 440 * Math.pow(2, (note + microtuningOffset - 69) / 12);
  }

  /**
   * Scale Quantizer Definition Table
   */
  const MUSICAL_SCALES = {
    chromatic:        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    major:            [0, 2, 4, 5, 7, 9, 11],
    minor:            [0, 2, 3, 5, 7, 8, 10],
    harmonic_minor:   [0, 2, 3, 5, 7, 8, 11],
    dorian:           [0, 2, 3, 5, 7, 9, 10],
    phrygian:         [0, 1, 3, 5, 7, 8, 10],
    lydian:           [0, 2, 4, 6, 7, 9, 11],
    mixolydian:       [0, 2, 4, 5, 7, 9, 10],
    pentatonic_major: [0, 2, 4, 7, 9],
    pentatonic_minor: [0, 3, 5, 7, 10],
    blues:            [0, 3, 5, 6, 7, 10],
    hirajoshi:        [0, 2, 3, 7, 8],
    insen:            [0, 1, 5, 7, 10],
    golden_ratio:     [0, 1.618, 3.236, 4.854, 6.472, 8.090, 9.708, 11.326]
  };

  root.TWO_PI = TWO_PI;
  root.PHI = PHI;
  root.midiToFreq = midiToFreq;
  root.MUSICAL_SCALES = MUSICAL_SCALES;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TWO_PI, PHI, midiToFreq, MUSICAL_SCALES };
  }
})(typeof window !== 'undefined' ? window : globalThis);
