/**
 * Fractal Sound Engine v2.0 — Interactive 2D Fractal Map Canvas Controller
 *
 * Renders live 2D Mandelbrot, Julia, and Burning Ship escape-time boundary maps
 * with interactive complex-plane (cReal, cImag) crosshair positioning.
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || (Math.PI * 2);

  class Fractal2DCanvas {
    constructor(canvasId) {
      this.canvasId = canvasId || 'mandelbrot-canvas-v2';
      this.canvas = typeof document !== 'undefined' ? document.getElementById(this.canvasId) : null;
      if (this.canvas) {
        this.ctx = this.canvas.getContext('2d');
      }
      this.xMin = -2.1;
      this.xMax = 0.9;
      this.yMin = -1.2;
      this.yMax = 1.2;
      this.isDragging = false;
    }

    render(synthParams) {
      if (!this.canvas && typeof document !== 'undefined') {
        this.canvas = document.getElementById(this.canvasId || 'mandelbrot-canvas-v2');
        if (this.canvas) this.ctx = this.canvas.getContext('2d');
      }
      if (!this.canvas || !this.ctx) return;

      const sParams = synthParams || root.synthParams || {};
      const w = this.canvas.width;
      const h = this.canvas.height;
      const imgData = this.ctx.createImageData(w, h);
      const data = imgData.data;

      const setType = sParams.fractalSet || 'julia';
      const cReal = sParams.cReal !== undefined ? sParams.cReal : -0.70;
      const cImag = sParams.cImag !== undefined ? sParams.cImag : 0.27;
      const maxIter = 24;

      for (let py = 0; py < h; py++) {
        const y0 = this.yMin + (py / h) * (this.yMax - this.yMin);
        for (let px = 0; px < w; px++) {
          const x0 = this.xMin + (px / w) * (this.xMax - this.xMin);
          let iter = 0;

          if (setType === 'mandelbrot' || setType === 'burningship') {
            let zx = 0.0, zy = 0.0;
            for (let i = 0; i < maxIter; i++) {
              const x2 = setType === 'burningship'
                ? (Math.abs(zx) * Math.abs(zx) - Math.abs(zy) * Math.abs(zy) + x0)
                : (zx * zx - zy * zy + x0);
              const y2 = setType === 'burningship'
                ? (2 * Math.abs(zx) * Math.abs(zy) + y0)
                : (2 * zx * zy + y0);
              zx = x2; zy = y2;
              if (zx * zx + zy * zy > 4.0) break;
              iter++;
            }
          } else {
            let zx = x0, zy = y0;
            for (let i = 0; i < maxIter; i++) {
              const x2 = zx * zx - zy * zy + cReal;
              const y2 = 2 * zx * zy + cImag;
              zx = x2; zy = y2;
              if (zx * zx + zy * zy > 4.0) break;
              iter++;
            }
          }

          const idx = (py * w + px) * 4;
          if (iter === maxIter) {
            data[idx] = 10; data[idx + 1] = 14; data[idx + 2] = 22; data[idx + 3] = 255;
          } else {
            const norm = iter / maxIter;
            data[idx] = Math.floor(Math.sin(norm * Math.PI) * 255);
            data[idx + 1] = Math.floor(norm * 220);
            data[idx + 2] = 255;
            data[idx + 3] = 255;
          }
        }
      }
      this.ctx.putImageData(imgData, 0, 0);

      // Draw Crosshair
      const targetX = ((cReal - this.xMin) / (this.xMax - this.xMin)) * w;
      const targetY = ((cImag - this.yMin) / (this.yMax - this.yMin)) * h;

      this.ctx.strokeStyle = '#ff0080';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(targetX, targetY, 6, 0, TWO_PI);
      this.ctx.stroke();

      this.ctx.strokeStyle = '#00e6ff';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(targetX - 9, targetY); this.ctx.lineTo(targetX + 9, targetY);
      this.ctx.moveTo(targetX, targetY - 9); this.ctx.lineTo(targetX, targetY + 9);
      this.ctx.stroke();
    }
  }

  root.Fractal2DCanvas = Fractal2DCanvas;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Fractal2DCanvas };
  }
})(typeof window !== 'undefined' ? window : globalThis);
