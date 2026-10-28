/**
 * Fractal Sound Engine v2.0 — ADSR Amplitude Envelope Generator Module
 *
 * Manages per-voice Attack, Decay, Sustain, and Release gain envelopes
 * as well as the real-time graphical ADSR envelope canvas renderer.
 */
(function (root) {
  'use strict';

  class EnvelopeModule {
    /**
     * Creates and schedules a per-voice ADSR GainNode on Note-On.
     * @param {AudioContext} audioCtx
     * @param {number} velocity - Note velocity [0.0, 1.0]
     * @param {Object} synthParams - { attack, decay, sustain }
     * @returns {GainNode}
     */
    static createVoiceEnvelope(audioCtx, velocity = 0.8, synthParams = {}) {
      const now = audioCtx.currentTime;
      const voiceGain = audioCtx.createGain();

      const attack = Math.max(0.002, synthParams.attack || 0.03);
      const decay = Math.max(0.01, synthParams.decay || 0.15);
      const sustain = Math.max(0.0, Math.min(1.0, synthParams.sustain !== undefined ? synthParams.sustain : 0.7));

      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(velocity, now + attack);
      voiceGain.gain.linearRampToValueAtTime(velocity * sustain, now + attack + decay);

      return voiceGain;
    }

    /**
     * Schedules the exponential Release phase on Note-Off and returns the release duration in seconds.
     * @param {GainNode} voiceGain
     * @param {AudioContext} audioCtx
     * @param {Object} synthParams - { release }
     * @returns {number} releaseDurationSeconds
     */
    static triggerRelease(voiceGain, audioCtx, synthParams = {}) {
      const now = audioCtx.currentTime;
      const release = Math.max(0.005, synthParams.release !== undefined ? synthParams.release : 0.3);

      voiceGain.gain.cancelScheduledValues(now);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, now);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + release);

      return release;
    }

    /**
     * Renders the graphical ADSR curve onto `#adsr-canvas-v2`.
     * @param {Object} synthParams
     * @param {string} [canvasId='adsr-canvas-v2']
     */
    static renderADSRCanvas(synthParams = {}, canvasId = 'adsr-canvas-v2') {
      if (typeof document === 'undefined') return;
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Background grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 30; x < w; x += 40) {
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
      }
      for (let y = 15; y < h; y += 20) {
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      ctx.stroke();

      const attack = Math.max(0.002, synthParams.attack || 0.04);
      const decay = Math.max(0.01, synthParams.decay || 0.18);
      const sustain = Math.max(0.0, Math.min(1.0, synthParams.sustain !== undefined ? synthParams.sustain : 0.7));
      const release = Math.max(0.005, synthParams.release || 0.35);

      const sustainTime = 0.5; // fixed visual sustain plateau duration
      const totalTime = attack + decay + sustainTime + release;

      const padX = 14;
      const padY = 10;
      const graphW = w - padX * 2;
      const graphH = h - padY * 2;

      const x0 = padX;
      const y0 = h - padY;

      const xA = x0 + (attack / totalTime) * graphW;
      const yA = padY;

      const xD = xA + (decay / totalTime) * graphW;
      const yD = y0 - sustain * graphH;

      const xS = xD + (sustainTime / totalTime) * graphW;
      const yS = yD;

      const xR = xS + (release / totalTime) * graphW;
      const yR = y0;

      const grad = ctx.createLinearGradient(0, padY, 0, y0);
      grad.addColorStop(0, 'rgba(0, 230, 255, 0.35)');
      grad.addColorStop(0.6, 'rgba(255, 0, 128, 0.2)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(xA, yA);
      ctx.lineTo(xD, yD);
      ctx.lineTo(xS, yS);
      ctx.lineTo(xR, yR);
      ctx.lineTo(x0, y0);
      ctx.fillStyle = grad;
      ctx.fill();

      const strokeGrad = ctx.createLinearGradient(x0, 0, xR, 0);
      strokeGrad.addColorStop(0, '#00e6ff');
      strokeGrad.addColorStop(0.5, '#d946ef');
      strokeGrad.addColorStop(1, '#ff0080');

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(xA, yA);
      ctx.lineTo(xD, yD);
      ctx.lineTo(xS, yS);
      ctx.lineTo(xR, yR);
      ctx.strokeStyle = strokeGrad;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#00e6ff';
      ctx.beginPath(); ctx.arc(xA, yA, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(xD, yD, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(xS, yS, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(xR, yR, 3.5, 0, Math.PI * 2); ctx.fill();

      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      const yDecayMid = Math.max(padY + 10, Math.min(y0 - 12, (yA + yD) * 0.5));
      if (w > 200) {
        ctx.fillText('ATTACK', x0 + 2, y0 - 4);
        ctx.fillText('DECAY', xA + 4, yDecayMid);
        ctx.fillText(`SUSTAIN (${Math.round(sustain * 100)}%)`, xD + 4, Math.max(16, yD - 4));
        ctx.fillText('RELEASE', xS + 4, y0 - 4);
      } else {
        ctx.fillText('A', x0 + 2, y0 - 4);
        ctx.fillText('D', xA + 2, yDecayMid);
        ctx.fillText(`S:${Math.round(sustain * 100)}%`, xD + 2, Math.max(14, yD - 4));
        ctx.fillText('R', xS + 2, y0 - 4);
      }
    }
  }

  root.EnvelopeModule = EnvelopeModule;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EnvelopeModule };
  }
})(typeof window !== 'undefined' ? window : globalThis);
