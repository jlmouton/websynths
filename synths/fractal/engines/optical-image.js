/**
 * Fractal Sound Engine v2.0 — Sound Engine 5: Optical Image Harmonics Resynthesis
 *
 * Scans 2D image pixel luminance & RGB color channels into harmonic partials
 * along radial, horizontal, or vertical trajectories. Includes procedural
 * optical texture generation and custom image upload support.
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || Math.PI * 2;

  class OpticalImageEngine {
    /**
     * Samples pixel luminance/RGB along a scan trajectory and builds a PeriodicWave.
     * @param {AudioContext} audioCtx
     * @param {Object} params
     * @param {HTMLCanvasElement} [canvasElement]
     * @returns {PeriodicWave|null}
     */
    static createImageWave(audioCtx, params = {}, canvasElement) {
      if (!audioCtx) return null;
      const tableSize = 128;
      const real = new Float32Array(tableSize);
      const imag = new Float32Array(tableSize);

      const source = (root && root.imageBufferCanvas) || canvasElement;
      if (!source) {
        real[1] = 1.0;
        return audioCtx.createPeriodicWave(real, imag);
      }

      const ctx = source.getContext('2d');
      const w = source.width;
      const h = source.height;
      let imgData;
      try {
        imgData = ctx.getImageData(0, 0, w, h);
      } catch (e) {
        real[1] = 1.0;
        return audioCtx.createPeriodicWave(real, imag);
      }

      const data = imgData.data;
      const cx = params.imageCursorX !== undefined ? params.imageCursorX : Math.floor(w / 2);
      const cy = params.imageCursorY !== undefined ? params.imageCursorY : Math.floor(h / 2);
      const radius = params.imageRadius || 25;
      const contrast = (params.imageContrast || 100) / 100.0;
      const scanMode = params.imageScanMode || 'radial';
      const colorMode = params.imageColorMode || 'luminance';

      for (let k = 1; k < tableSize / 2; k++) {
        let px, py;
        if (scanMode === 'radial') {
          const angle = (TWO_PI * k) / (tableSize / 2);
          px = Math.round(cx + radius * Math.cos(angle));
          py = Math.round(cy + radius * Math.sin(angle));
        } else if (scanMode === 'horizontal') {
          const offset = ((k / (tableSize / 2)) * 2 - 1) * radius;
          px = Math.round(cx + offset);
          py = cy;
        } else {
          const offset = ((k / (tableSize / 2)) * 2 - 1) * radius;
          px = cx;
          py = Math.round(cy + offset);
        }

        px = Math.max(0, Math.min(w - 1, px));
        py = Math.max(0, Math.min(h - 1, py));

        const idx = (py * w + px) * 4;
        const r = data[idx] / 255.0;
        const g = data[idx + 1] / 255.0;
        const b = data[idx + 2] / 255.0;

        let val = 0.299 * r + 0.587 * g + 0.114 * b;
        if (colorMode === 'redblue') {
          val = (k % 2 === 0) ? r : b;
        } else if (colorMode === 'rgb') {
          val = (k % 3 === 0) ? r : (k % 3 === 1 ? g : b);
        }

        val = Math.pow(Math.max(0, Math.min(1, val)), 1.0 / contrast);
        const amp = (val / Math.pow(k, 0.75)) * 0.9;
        const phase = (TWO_PI * k) / tableSize;

        real[k] = amp * Math.cos(phase);
        imag[k] = amp * Math.sin(phase);
      }

      return audioCtx.createPeriodicWave(real, imag);
    }

    /**
     * Renders built-in procedural optical textures onto the offscreen buffer canvas.
     * @param {string} presetName
     * @param {HTMLCanvasElement} [bufferCanvas]
     */
    static renderTextureToBuffer(presetName, bufferCanvas) {
      const targetCanvas = bufferCanvas || root.imageBufferCanvas;
      if (!targetCanvas) return;
      const ctx = targetCanvas.getContext('2d');
      const w = targetCanvas.width;
      const h = targetCanvas.height;
      const imgData = ctx.createImageData(w, h);
      const data = imgData.data;

      if (presetName === 'preset_chladni') {
        const n = 3, m = 5;
        for (let y = 0; y < h; y++) {
          const ny = (y / h) * Math.PI;
          for (let x = 0; x < w; x++) {
            const nx = (x / w) * Math.PI;
            const val = Math.abs(Math.cos(n * nx) * Math.cos(m * ny) - Math.cos(m * nx) * Math.cos(n * ny));
            const intensity = Math.pow(val, 0.7);
            const idx = (y * w + x) * 4;
            data[idx] = Math.floor(intensity * 30);
            data[idx + 1] = Math.floor(intensity * 230);
            data[idx + 2] = Math.floor(intensity * 255);
            data[idx + 3] = 255;
          }
        }
      } else if (presetName === 'preset_interference') {
        const cx1 = w * 0.35, cy1 = h * 0.5;
        const cx2 = w * 0.65, cy2 = h * 0.5;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const d1 = Math.hypot(x - cx1, y - cy1);
            const d2 = Math.hypot(x - cx2, y - cy2);
            const v = (Math.sin(d1 * 0.35) + Math.sin(d2 * 0.35) + 2) / 4.0;
            const idx = (y * w + x) * 4;
            data[idx] = Math.floor(v * 255);
            data[idx + 1] = Math.floor(Math.sin(v * Math.PI) * 220);
            data[idx + 2] = Math.floor((1 - v) * 255);
            data[idx + 3] = 255;
          }
        }
      } else if (presetName === 'preset_grid') {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const isGrid = (x % 15 === 0 || y % 15 === 0 || (x + y) % 30 === 0);
            const idx = (y * w + x) * 4;
            data[idx] = isGrid ? 255 : 10;
            data[idx + 1] = isGrid ? 0 : 20;
            data[idx + 2] = isGrid ? 128 : 40;
            data[idx + 3] = 255;
          }
        }
      } else if (presetName === 'preset_mandelbrot') {
        for (let py = 0; py < h; py++) {
          const y0 = -1.2 + (py / h) * 2.4;
          for (let px = 0; px < w; px++) {
            const x0 = -1.8 + (px / w) * 2.4;
            let zx = 0, zy = 0, iter = 0;
            while (zx * zx + zy * zy <= 4 && iter < 32) {
              const xtemp = zx * zx - zy * zy + x0;
              zy = 2 * zx * zy + y0;
              zx = xtemp;
              iter++;
            }
            const norm = iter / 32;
            const idx = (py * w + px) * 4;
            data[idx] = Math.floor(Math.sin(norm * Math.PI) * 255);
            data[idx + 1] = Math.floor(norm * 220);
            data[idx + 2] = Math.floor((1 - norm) * 255);
            data[idx + 3] = 255;
          }
        }
      } else {
        // preset_nebula (default)
        const cx = w / 2, cy = h / 2;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dx = x - cx, dy = y - cy;
            const r = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const spiral = Math.sin(r * 0.15 - angle * 3);
            const v = Math.max(0, Math.min(1, (spiral + 1) / 2 * Math.exp(-r / 50)));
            const idx = (y * w + x) * 4;
            data[idx] = Math.floor(v * 255);
            data[idx + 1] = Math.floor(Math.pow(v, 1.5) * 150);
            data[idx + 2] = Math.floor(Math.sqrt(v) * 255);
            data[idx + 3] = 255;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
    }

    /**
     * Draws the composite image canvas with scan trajectory overlay.
     * @param {Object} synthParams
     * @param {HTMLCanvasElement} [displayCanvas]
     * @param {HTMLCanvasElement} [bufferCanvas]
     */
    static drawCompositeOverlay(synthParams = {}, displayCanvas, bufferCanvas) {
      const canvas = displayCanvas || (typeof document !== 'undefined' ? document.getElementById('image-canvas-v2') : null);
      const srcCanvas = bufferCanvas || root.imageBufferCanvas;
      if (!canvas || !srcCanvas) return;

      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;

      ctx.drawImage(srcCanvas, 0, 0, w, h);

      const cx = synthParams.imageCursorX !== undefined ? synthParams.imageCursorX : Math.floor(w / 2);
      const cy = synthParams.imageCursorY !== undefined ? synthParams.imageCursorY : Math.floor(h / 2);
      const radius = synthParams.imageRadius || 25;
      const scanMode = synthParams.imageScanMode || 'radial';

      ctx.save();
      ctx.strokeStyle = '#00e6ff';
      ctx.lineWidth = 1.5;

      if (scanMode === 'radial') {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (scanMode === 'horizontal') {
        ctx.beginPath();
        ctx.moveTo(Math.max(0, cx - radius), cy);
        ctx.lineTo(Math.min(w, cx + radius), cy);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx, Math.max(0, cy - radius));
        ctx.lineTo(cx, Math.min(h, cy + radius));
        ctx.stroke();
      }

      ctx.fillStyle = '#ff0080';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    static getEngineDescriptor() {
      return {
        id: 'image',
        name: '5. Optical Image',
        type: 'wavetable',
        lfoTargets: [
          { value: 'imageRadius', label: 'Dest: Scan Orbit Radius' },
          { value: 'imageCursorX', label: 'Dest: Scan Cursor X' }
        ],
        createPeriodicWave: (audioCtx, params) => {
          const imgCanvas = typeof document !== 'undefined' ? document.getElementById('image-canvas-v2') : null;
          return OpticalImageEngine.createImageWave(audioCtx, params, imgCanvas);
        }
      };
    }
  }

  root.OpticalImageEngine = OpticalImageEngine;
  root.OpticalAndAutomataDSP = root.OpticalAndAutomataDSP || {};
  root.OpticalAndAutomataDSP.createImageWave = OpticalImageEngine.createImageWave.bind(OpticalImageEngine);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OpticalImageEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
