/**
 * Fractal Sound Engine v2.0 — Web MIDI Controller Module
 *
 * Manages Web MIDI API hardware connection and parses Note On, Note Off,
 * Sustain Pedal (CC#64), and 14-Bit Pitch Bend messages.
 */
(function (root) {
  'use strict';

  class WebMIDIManager {
    /**
     * Binds the Connect Web MIDI button and attaches the message handler to all available MIDI inputs.
     * @param {Function} onMidiMessage - Callback (msg) => void
     * @param {string} [btnId='btn-midi-v2']
     */
    static setup(onMidiMessage, btnId = 'btn-midi-v2') {
      if (typeof document === 'undefined' || typeof navigator === 'undefined') return;
      const btnMidi = document.getElementById(btnId);
      if (!btnMidi || !navigator.requestMIDIAccess) return;

      if (btnMidi._midiBound) return;
      btnMidi._midiBound = true;

      btnMidi.addEventListener('click', (e) => {
        btnMidi.innerText = '⏳ Scanning MIDI...';
        navigator.requestMIDIAccess().then(
          (midiAccess) => {
            const inputs = Array.from(midiAccess.inputs.values());
            if (inputs.length > 0) {
              inputs.forEach(input => {
                input.onmidimessage = onMidiMessage;
              });
              btnMidi.innerText = `🎹 Connected (${inputs[0].name || 'MIDI Device'})`;
              btnMidi.classList.add('connected');
            } else {
              btnMidi.innerText = '⚠️ No MIDI Devices Found';
            }
          },
          () => {
            btnMidi.innerText = '⚠️ MIDI Permission Denied';
          }
        );
        if (e.target && e.target.blur) e.target.blur();
      });
    }

    /**
     * Converts a raw 7-bit MIDI velocity byte [1..127] into a normalized expressive velocity [0.12..1.0]
     * using an intermediate exponential curve (linear^1.45) with a gentle floor so pianissimo notes stay
     * audible while giving wide dynamic and timbral expressiveness across the keyboard.
     * @param {number} midiVelByte - Raw MIDI velocity (1..127)
     * @returns {number}
     */
    static midiVelocityToNormalized(midiVelByte) {
      const clamped = Math.max(1, Math.min(127, midiVelByte || 1));
      const linear = clamped / 127.0;
      return 0.12 + 0.88 * Math.pow(linear, 1.45);
    }

    /**
     * Processes a raw Web MIDI event message.
     * @param {MIDIMessageEvent|{data: number[]}} msg
     * @param {Object} context - { ensureAudioEngine, getVoiceManager, synthParams, arpParams, onKeyVisual }
     */
    static handleMessage(msg, context = {}) {
      if (!msg || !msg.data) return;
      const [status, data1, data2] = msg.data;
      const cmd = status >> 4;
      const { ensureAudioEngine, getVoiceManager, synthParams, arpParams, onKeyVisual } = context;

      if (cmd === 9 && data2 > 0) {
        // Note On (apply psychoacoustic exponential velocity curve)
        const velocity = WebMIDIManager.midiVelocityToNormalized(data2);
        if (arpParams && arpParams.enabled) {
          if (!arpParams.heldNotes.includes(data1)) arpParams.heldNotes.push(data1);
        } else {
          if (ensureAudioEngine) ensureAudioEngine();
          const vm = getVoiceManager ? getVoiceManager() : null;
          if (vm) vm.playNote(data1, velocity, synthParams);
          if (onKeyVisual) onKeyVisual(data1, true);
        }
      } else if (cmd === 8 || (cmd === 9 && data2 === 0)) {
        // Note Off
        if (arpParams && arpParams.enabled) {
          arpParams.heldNotes = arpParams.heldNotes.filter(n => n !== data1);
        } else {
          const vm = getVoiceManager ? getVoiceManager() : null;
          if (vm) vm.stopNote(data1, false, synthParams);
          if (onKeyVisual) onKeyVisual(data1, false);
        }
      } else if (cmd === 11 && data1 === 64) {
        // Sustain Pedal (CC #64)
        const vm = getVoiceManager ? getVoiceManager() : null;
        const isDown = data2 >= 64;
        if (vm) vm.handleSustainPedal(isDown, synthParams);
        if (typeof document !== 'undefined') {
          const lblPedal = document.getElementById('lbl-pedal-v2');
          if (lblPedal) lblPedal.innerText = isDown ? 'Pedal: ON' : 'Pedal: OFF';
        }
      } else if (cmd === 14) {
        // 14-Bit Pitch Bend
        const bendVal = ((data2 << 7) | data1) - 8192;
        if (synthParams) {
          synthParams.pitchBendCents = (bendVal / 8192.0) * 200.0; // +/- 2 semitones
        }
        const vm = getVoiceManager ? getVoiceManager() : null;
        if (vm) vm.updateActiveVoices(synthParams);
      }
    }
  }

  root.WebMIDIManager = WebMIDIManager;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WebMIDIManager };
  }
})(typeof window !== 'undefined' ? window : globalThis);
