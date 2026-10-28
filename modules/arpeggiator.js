/**
 * Fractal Sound Engine v2.0 — Generative Fractal Arpeggiator Module
 *
 * Implements traditional and mathematical fractal note sequencing:
 * - Up, Down, Up/Down, Random
 * - Euclidean E(5,8) rhythm generator
 * - Fibonacci spiral step offsets
 * - Thue-Morse bitwise parity sequence
 */
(function (root) {
  'use strict';

  class ArpeggiatorModule {
    /**
     * Computes the next MIDI note for the current arpeggiator step, or null if gated/skipped (e.g. Euclidean rest).
     * @param {Object} arpParams
     * @returns {number|null}
     */
    static selectStepNote(arpParams) {
      const notes = [...arpParams.heldNotes];
      if (notes.length === 0) return null;

      let noteToPlay = notes[0];
      const step = arpParams.currentStep;
      const octaves = Math.max(1, arpParams.octaves || 2);

      if (arpParams.mode === 'up') {
        const oct = Math.floor(step / notes.length) % octaves;
        const idx = step % notes.length;
        noteToPlay = notes[idx] + oct * 12;
      } else if (arpParams.mode === 'down') {
        const rev = [...notes].reverse();
        const oct = octaves - 1 - (Math.floor(step / notes.length) % octaves);
        const idx = step % notes.length;
        noteToPlay = rev[idx] + oct * 12;
      } else if (arpParams.mode === 'updown') {
        const fullList = [];
        for (let o = 0; o < octaves; o++) {
          for (const n of notes) fullList.push(n + o * 12);
        }
        for (let o = octaves - 1; o >= 0; o--) {
          for (let i = notes.length - 2; i > 0; i--) fullList.push(notes[i] + o * 12);
        }
        noteToPlay = fullList[step % fullList.length];
      } else if (arpParams.mode === 'random') {
        const randOct = Math.floor(Math.random() * octaves);
        const randIdx = Math.floor(Math.random() * notes.length);
        noteToPlay = notes[randIdx] + randOct * 12;
      } else if (arpParams.mode === 'euclidean') {
        const k = 5, n = 8;
        const isPulse = (Math.floor((step * k) / n) !== Math.floor(((step - 1) * k) / n));
        if (!isPulse) {
          return null;
        }
        noteToPlay = notes[step % notes.length];
      } else if (arpParams.mode === 'fibonacci') {
        const fib = [1, 2, 3, 5, 8, 13, 21];
        const offset = fib[step % fib.length] % (notes.length * octaves);
        noteToPlay = notes[offset % notes.length] + Math.floor(offset / notes.length) * 12;
      } else if (arpParams.mode === 'thue_morse') {
        let count = 0, temp = step;
        while (temp > 0) { count += temp & 1; temp >>= 1; }
        const oct = count % 2;
        noteToPlay = notes[step % notes.length] + oct * 12;
      }

      return noteToPlay;
    }

    /**
     * Advances the arpeggiator clock and triggers notes via the PolyphonicVoiceManager.
     * @param {number} nowTime - Current timestamp in seconds
     * @param {Object} arpParams
     * @param {Object} synthParams
     * @param {Object} voiceManager
     * @param {Function} [onKeyVisual] - Optional callback (note, active) => void
     */
    static update(nowTime, arpParams, synthParams, voiceManager, onKeyVisual) {
      if (!arpParams || !arpParams.enabled || arpParams.heldNotes.length === 0 || !voiceManager) return;

      const secondsPerBeat = 60.0 / Math.max(40, arpParams.rate || 120);
      const stepInterval = secondsPerBeat * (arpParams.division || 0.25);

      if (nowTime - arpParams.lastStepTime >= stepInterval) {
        arpParams.lastStepTime = nowTime;

        const noteToPlay = this.selectStepNote(arpParams);
        if (noteToPlay === null) {
          arpParams.currentStep++;
          return;
        }

        voiceManager.playNote(noteToPlay, 0.85, synthParams);
        if (onKeyVisual) onKeyVisual(noteToPlay, true);

        const gateDuration = stepInterval * (arpParams.gate || 0.8) * 1000;
        setTimeout(() => {
          voiceManager.stopNote(noteToPlay, false, synthParams);
          if (onKeyVisual) onKeyVisual(noteToPlay, false);
        }, gateDuration);

        arpParams.currentStep = (arpParams.currentStep + 1) % 64;
      }
    }
  }

  root.ArpeggiatorModule = ArpeggiatorModule;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ArpeggiatorModule };
  }
})(typeof window !== 'undefined' ? window : globalThis);
