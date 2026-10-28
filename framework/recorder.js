/**
 * Fractal Sound Engine v2.0 — Master Lossless WAV & Audio Recorder Module
 *
 * Connects to the Framework AudioBus master output to record live synthesizer
 * performances and trigger instant browser downloads.
 */
(function (root) {
  'use strict';

  class AudioRecorder {
    constructor() {
      this.mediaRecorder = null;
      this.recordedAudioChunks = [];
      this.isRecording = false;
    }

    /**
     * Starts recording from the given AudioContext and FX/AudioBus master output.
     * @param {AudioContext} audioCtx
     * @param {Object} fxEngine - Exposes `audioBus` or `masterGain`
     */
    start(audioCtx, fxEngine) {
      if (!audioCtx || !fxEngine) return;
      const dest = audioCtx.createMediaStreamDestination();
      if (fxEngine.audioBus && typeof fxEngine.audioBus.connectTap === 'function') {
        fxEngine.audioBus.connectTap(dest);
      } else if (fxEngine.masterGain) {
        fxEngine.masterGain.connect(dest);
      }

      this.recordedAudioChunks = [];
      this.mediaRecorder = new MediaRecorder(dest.stream);

      this.mediaRecorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          this.recordedAudioChunks.push(evt.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedAudioChunks, { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        if (typeof document !== 'undefined') {
          const a = document.createElement('a');
          a.href = url;
          a.download = `fractal_synth_${Date.now()}.wav`;
          a.click();
        }
        URL.revokeObjectURL(url);
      };

      this.mediaRecorder.start();
      this.isRecording = true;
    }

    /**
     * Stops an active recording session and triggers download.
     */
    stop() {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      this.isRecording = false;
    }
  }

  root.AudioRecorder = AudioRecorder;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioRecorder };
  }
})(typeof window !== 'undefined' ? window : globalThis);
