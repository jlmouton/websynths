/**
 * Fractal Sound Engine v2.0 — Effect Stage 2: West-Coast Non-Linear Wavefolder & Saturation
 *
 * Implements an AudioBus-compatible stage with `inputNode` and `outputNode`,
 * plus transfer curve caching to avoid redundant CPU allocations.
 */
(function (root) {
  'use strict';

  class WavefolderEffect {
    /**
     * @param {AudioContext} audioCtx
     */
    constructor(audioCtx) {
      this.id = 'drive';
      this.ctx = audioCtx;

      this.inputNode = this.ctx.createGain();
      this.outputNode = this.ctx.createGain();
      this.wavefolderNode = this.ctx.createWaveShaper();
      this.wavefolderNode.oversample = '4x';
      this.driveDryGain = this.ctx.createGain();
      this.driveWetGain = this.ctx.createGain();

      this._lastAmount = null;
      this.updateCurve(0.0);

      this.inputNode.connect(this.driveDryGain);
      this.inputNode.connect(this.wavefolderNode);
      this.wavefolderNode.connect(this.driveWetGain);
      this.driveDryGain.connect(this.outputNode);
      this.driveWetGain.connect(this.outputNode);
    }

    /**
     * Computes the 2048-sample asymmetric West-Coast folding curve (cached by amount).
     * @param {number} amount
     */
    updateCurve(amount = 0.0) {
      if (this._lastAmount === amount && this.wavefolderNode.curve) return;
      this._lastAmount = amount;

      const k = amount * 50;
      const nSamples = 2048;
      const curve = new Float32Array(nSamples);
      const deg = Math.PI / 180;

      for (let i = 0; i < nSamples; i++) {
        const x = (i * 2) / nSamples - 1;
        if (k === 0) {
          curve[i] = x;
        } else {
          const folded = Math.sin((k + 1) * x * Math.PI * 0.5);
          const sat = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
          curve[i] = 0.5 * folded + 0.5 * sat;
        }
      }
      this.wavefolderNode.curve = curve;
    }

    setMix(driveAmount = 0.0, bypassed = false) {
      const now = this.ctx.currentTime;
      const driveOn = !bypassed && driveAmount > 0;
      this.driveWetGain.gain.setTargetAtTime(driveOn ? 1.0 : 0.0, now, 0.01);
      this.driveDryGain.gain.setTargetAtTime(driveOn ? 0.0 : 1.0, now, 0.01);
    }
  }

  root.WavefolderEffect = WavefolderEffect;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WavefolderEffect };
  }
})(typeof window !== 'undefined' ? window : globalThis);
