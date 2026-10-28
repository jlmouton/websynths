/**
 * Fractal Sound Engine v2.0 — Effect Stage 6: Master Brickwall Limiter
 *
 * Fast lookahead dynamics compressor preventing digital clipping at the end of the FX chain.
 */
(function (root) {
  'use strict';

  class LimiterEffect {
    /**
     * @param {AudioContext} audioCtx
     */
    constructor(audioCtx) {
      this.id = 'limiter';
      this.ctx = audioCtx;

      this.limiterNode = this.ctx.createDynamicsCompressor();
      this.limiterNode.threshold.value = -1.5; // -1.5 dB ceiling so single notes stay uncompressed
      this.limiterNode.knee.value = 3.0;
      this.limiterNode.ratio.value = 12.0;
      this.limiterNode.attack.value = 0.003; // 3ms preserves initial transient punch
      this.limiterNode.release.value = 0.08; // 80ms smooth recovery

      this.inputNode = this.limiterNode;
      this.outputNode = this.limiterNode;
    }
  }

  root.LimiterEffect = LimiterEffect;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LimiterEffect };
  }
})(typeof window !== 'undefined' ? window : globalThis);
