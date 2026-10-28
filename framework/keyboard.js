/**
 * Fractal Sound Engine v2.0 — Interactive 2-Octave Touch & QWERTY Keyboard Module
 *
 * Manages the on-screen velocity-sensitive 2-octave piano keyboard, octave shifting,
 * and 2-octave QWERTY computer keyboard note input.
 */
(function (root) {
  'use strict';

  const QWERTY_LOWER_MAP = {
    'KeyZ': 0, 'KeyS': 1, 'KeyX': 2, 'KeyD': 3, 'KeyC': 4,
    'KeyV': 5, 'KeyG': 6, 'KeyB': 7, 'KeyH': 8, 'KeyN': 9,
    'KeyJ': 10, 'KeyM': 11, 'Comma': 12
  };

  const QWERTY_UPPER_MAP = {
    'KeyQ': 12, 'Digit2': 13, 'KeyW': 14, 'Digit3': 15, 'KeyE': 16,
    'KeyR': 17, 'Digit5': 18, 'KeyT': 19, 'Digit6': 20, 'KeyY': 21,
    'Digit7': 22, 'KeyU': 23, 'KeyI': 24, 'Digit9': 25, 'KeyO': 26,
    'Digit0': 27, 'KeyP': 28
  };

  class PianoKeyboard {
    /**
     * Renders the 2-octave interactive piano keyboard into `#piano-keyboard-v2`.
     * @param {Object} options - { getOctave, onNoteOn, onNoteOff, containerId }
     */
    static generate2OctaveKeyboard(options = {}) {
      if (typeof document === 'undefined') return;
      const containerId = options.containerId || 'piano-keyboard-v2';
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '';

      const currentOctave = options.getOctave ? options.getOctave() : 3;
      const startNote = currentOctave * 12 + 12; // C3 = 48
      const numNotes = 25; // 2 full octaves + top C
      const isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

      let whiteCount = 0;
      for (let n = startNote; n < startNote + numNotes; n++) {
        if (!isBlack(n)) whiteCount++;
      }

      const whiteWidthPct = 100 / whiteCount;
      const blackWidthPct = whiteWidthPct * 0.65;
      let whiteIdx = 0;

      for (let n = startNote; n < startNote + numNotes; n++) {
        const key = document.createElement('div');
        key.dataset.note = n;
        const name = noteNames[n % 12];
        const oct = Math.floor(n / 12) - 1;

        if (!isBlack(n)) {
          key.className = 'piano-key white';
          key.style.left = `${whiteIdx * whiteWidthPct}%`;
          key.style.width = `${whiteWidthPct}%`;

          const label = document.createElement('span');
          label.className = 'key-label';
          label.innerText = `${name}${oct}`;
          key.appendChild(label);
          whiteIdx++;
        } else {
          key.className = 'piano-key black';
          const leftPos = (whiteIdx - 0.325) * whiteWidthPct;
          key.style.left = `${leftPos}%`;
          key.style.width = `${blackWidthPct}%`;

          const label = document.createElement('span');
          label.className = 'key-label';
          label.innerText = name;
          key.appendChild(label);
        }

        const handleDown = (e) => {
          e.preventDefault();
          const rect = key.getBoundingClientRect();
          const clickY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
          const normY = rect.height > 0 ? clickY / rect.height : 0.8;
          const velocity = Math.max(0.18, Math.min(1.0, 0.18 + 0.82 * Math.pow(normY, 1.25)));
          if (options.onNoteOn) {
            options.onNoteOn(n, velocity, key);
          }
        };

        const handleUp = (e) => {
          e.preventDefault();
          if (options.onNoteOff) {
            options.onNoteOff(n, key);
          }
        };

        key.addEventListener('pointerdown', handleDown);
        key.addEventListener('pointerup', handleUp);
        key.addEventListener('pointerleave', handleUp);
        key.addEventListener('pointercancel', handleUp);

        container.appendChild(key);
      }
    }

    /**
     * Highlights or unhighlights a piano key element by MIDI note number.
     * @param {number} note
     * @param {boolean} active
     */
    static setKeyActive(note, active) {
      if (typeof document === 'undefined') return;
      const key = document.querySelector(`.piano-key[data-note="${note}"]`);
      if (key) {
        if (active) key.classList.add('active');
        else key.classList.remove('active');
      }
    }

    /**
     * Maps a KeyboardEvent.code to a semitone offset [0..28], or undefined if not a musical key.
     * @param {string} code
     * @returns {number|undefined}
     */
    static getSemitoneForKeyCode(code) {
      let semitone = QWERTY_LOWER_MAP[code];
      if (semitone === undefined) semitone = QWERTY_UPPER_MAP[code];
      return semitone;
    }
  }

  root.QWERTY_LOWER_MAP = QWERTY_LOWER_MAP;
  root.QWERTY_UPPER_MAP = QWERTY_UPPER_MAP;
  root.PianoKeyboard = PianoKeyboard;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QWERTY_LOWER_MAP, QWERTY_UPPER_MAP, PianoKeyboard };
  }
})(typeof window !== 'undefined' ? window : globalThis);
