/**
 * Fractal Sound Engine v2.0 — Real-Time Multi-Modal Visualizer Suite
 *
 * Visualizers Included:
 * 1. 3D Strange Attractor Particle Orbit Canvas (Interactive 3D Lorenz, Rössler, Chua, Thomas, Aizawa)
 * 2. Real-Time FFT Waterfall Spectrogram & Frequency Spectrum Curve
 * 3. Lissajous Stereo Goniometer (Vector Scope)
 * 4. 64-Partial Dynamic Harmonic Bar Spectrum
 * 5. Stabilized Zero-Crossing Waveform Oscilloscope
 */
(function (root) {
  'use strict';

  const TWO_PI = root.TWO_PI || (Math.PI * 2);

  class VisualizerSuite {
    constructor(audioCtx, analyserNode, fxEngine) {
      this.ctx = audioCtx || null;
      this.analyser = analyserNode || null;
      this.fx = fxEngine || null;

      this.activeVisualizerTab = 'attractor3d'; // 'attractor3d', 'spectrogram', 'goniometer', 'harmonics', 'scope'

      // Attractor 3D State
      this.currentAttractorType = 'lorenz';
      this.attractorParticles = [];
      this.maxParticles = 600;
      this.attractorRotX = 0.5;
      this.attractorRotY = 0.8;
      this.attractorZoom = 1.0;
      this.attractorState = { x: 0.1, y: 0.0, z: 0.0 };
      this.isDragging3D = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;

      // Spectrogram History Canvas Buffer
      if (typeof document !== 'undefined') {
        this.spectrogramBuffer = document.createElement('canvas');
        this.spectrogramBuffer.width = 500;
        this.spectrogramBuffer.height = 150;
        this.spectrogramCtx = this.spectrogramBuffer.getContext('2d');
      }

      // Data arrays
      const binCount = (this.analyser && this.analyser.frequencyBinCount) ? this.analyser.frequencyBinCount : 1024;
      const fftSize = (this.analyser && this.analyser.fftSize) ? this.analyser.fftSize : 2048;
      this.fftData = new Uint8Array(binCount);
      this.timeData = new Uint8Array(fftSize).fill(128);

      this.initCanvasElements();
      this.initEventListeners();
    }

    connectAnalyser(audioCtx, analyserNode, fxEngine) {
      this.ctx = audioCtx;
      this.analyser = analyserNode;
      this.fx = fxEngine;
      if (this.analyser) {
        this.fftData = new Uint8Array(this.analyser.frequencyBinCount);
        this.timeData = new Uint8Array(this.analyser.fftSize).fill(128);
      }
    }

    resetAttractorState(type) {
      switch (type) {
        case 'rossler':
          this.attractorState = { x: 0.1, y: 0.1, z: 0.1 };
          break;
        case 'chua':
        case 'thomas':
        case 'aizawa':
        case 'lorenz':
        default:
          this.attractorState = { x: 0.1, y: 0.0, z: 0.0 };
          break;
      }
      this.attractorParticles = [];
    }

    onPresetChanged(preset, synthParams) {
      const sParams = synthParams || (preset && preset.params) || {};
      const type = sParams.attractorType || 'lorenz';
      if (this.currentAttractorType !== type) {
        this.currentAttractorType = type;
        this.resetAttractorState(type);
      }
    }

    initCanvasElements() {
      if (typeof document === 'undefined') return;
      this.mainCanvas = document.getElementById('main-visualizer-canvas');
      if (this.mainCanvas) {
        this.mainCtx = this.mainCanvas.getContext('2d');
      }
    }

    initEventListeners() {
      if (!this.mainCanvas || typeof window === 'undefined') return;

      this.mainCanvas.addEventListener('mousedown', (e) => {
        this.isDragging3D = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging3D) return;
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.attractorRotY += dx * 0.01;
        this.attractorRotX += dy * 0.01;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      });

      window.addEventListener('mouseup', () => {
        this.isDragging3D = false;
      });

      this.mainCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.attractorZoom = Math.max(0.3, Math.min(3.0, this.attractorZoom - e.deltaY * 0.001));
      }, { passive: false });

      document.querySelectorAll('.viz-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.viz-tab-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          this.activeVisualizerTab = e.target.dataset.viz;
        });
      });
    }

    render(synthParams) {
      if (!this.mainCanvas) {
        this.initCanvasElements();
      }
      if (!this.mainCanvas || !this.mainCtx) return;

      const sParams = synthParams || root.synthParams || {};

      const rect = this.mainCanvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);
        if (this.mainCanvas.width !== targetW || this.mainCanvas.height !== targetH) {
          this.mainCanvas.width = targetW;
          this.mainCanvas.height = targetH;
        }
      }
      const w = this.mainCanvas.width;
      const h = this.mainCanvas.height;

      if (this.analyser) {
        this.analyser.getByteFrequencyData(this.fftData);
        this.analyser.getByteTimeDomainData(this.timeData);
      }

      this.mainCtx.fillStyle = '#0a0d14';
      this.mainCtx.fillRect(0, 0, w, h);

      switch (this.activeVisualizerTab) {
        case 'attractor3d':
          this.renderAttractor3D(w, h, sParams);
          break;
        case 'spectrogram':
          this.renderSpectrogram(w, h);
          break;
        case 'goniometer':
          this.renderGoniometer(w, h);
          break;
        case 'harmonics':
          this.renderHarmonicsBar(w, h);
          break;
        case 'scope':
        default:
          this.renderOscilloscope(w, h);
          break;
      }
    }

    renderAttractor3D(w, h, synthParams) {
      if (typeof root.CustomPrimaryVisualizer === 'function') {
        root.CustomPrimaryVisualizer(this, w, h, synthParams);
        return;
      }
      if (!root.StrangeAttractorDSP) {
        this.renderOscilloscope(w, h);
        return;
      }
      const ctx = this.mainCtx;
      const sParams = synthParams || {};
      const type = sParams.attractorType || 'lorenz';

      if (this.currentAttractorType !== type) {
        this.currentAttractorType = type;
        this.resetAttractorState(type);
      }

      const dt = 0.015;

      let sum = 0;
      if (this.timeData && this.timeData.length > 0) {
        for (let i = 0; i < this.timeData.length; i++) {
          const v = (this.timeData[i] - 128) / 128.0;
          sum += v * v;
        }
      }
      const rms = Math.sqrt(sum / Math.max(1, this.timeData.length));
      const audioScale = 1.0 + rms * 1.5;

      for (let s = 0; s < 3; s++) {
        this.attractorState = root.StrangeAttractorDSP.rk4Step(type, this.attractorState, dt, sParams);
        this.attractorParticles.push({
          x: this.attractorState.x,
          y: this.attractorState.y,
          z: this.attractorState.z,
          life: 1.0
        });
      }

      if (this.attractorParticles.length > this.maxParticles) {
        this.attractorParticles.splice(0, this.attractorParticles.length - this.maxParticles);
      }

      if (!this.isDragging3D) {
        this.attractorRotY += 0.005;
      }

      const cosY = Math.cos(this.attractorRotY), sinY = Math.sin(this.attractorRotY);
      const cosX = Math.cos(this.attractorRotX), sinX = Math.sin(this.attractorRotX);

      const fov = 350 * this.attractorZoom;
      const cx = w / 2;
      const cy = h / 2;

      ctx.lineWidth = 1.5;

      for (let i = 0; i < this.attractorParticles.length - 1; i++) {
        const p1 = this.attractorParticles[i];
        const p2 = this.attractorParticles[i + 1];

        p1.life = (i / this.attractorParticles.length);

        let x1, y1, z1;
        if (type === 'rossler') {
          x1 = p1.x * 8.0; y1 = p1.y * 8.0; z1 = (p1.z - 12) * 8.0;
        } else if (type === 'chua') {
          x1 = p1.x * 35.0; y1 = p1.y * 35.0; z1 = p1.z * 35.0;
        } else if (type === 'thomas') {
          x1 = p1.x * 40.0; y1 = p1.y * 40.0; z1 = p1.z * 40.0;
        } else if (type === 'aizawa') {
          x1 = p1.x * 55.0; y1 = p1.y * 55.0; z1 = (p1.z - 0.6) * 55.0;
        } else {
          x1 = p1.x * 4.5; y1 = p1.y * 4.5; z1 = (p1.z - 25) * 4.5;
        }

        let rx1 = x1 * cosY - z1 * sinY;
        let rz1 = x1 * sinY + z1 * cosY;
        let ry1 = y1 * cosX - rz1 * sinX;
        rz1 = y1 * sinX + rz1 * cosX;

        let x2, y2, z2;
        if (type === 'rossler') {
          x2 = p2.x * 8.0; y2 = p2.y * 8.0; z2 = (p2.z - 12) * 8.0;
        } else if (type === 'chua') {
          x2 = p2.x * 35.0; y2 = p2.y * 35.0; z2 = p2.z * 35.0;
        } else if (type === 'thomas') {
          x2 = p2.x * 40.0; y2 = p2.y * 40.0; z2 = p2.z * 40.0;
        } else if (type === 'aizawa') {
          x2 = p2.x * 55.0; y2 = p2.y * 55.0; z2 = (p2.z - 0.6) * 55.0;
        } else {
          x2 = p2.x * 4.5; y2 = p2.y * 4.5; z2 = (p2.z - 25) * 4.5;
        }

        let rx2 = x2 * cosY - z2 * sinY;
        let rz2 = x2 * sinY + z2 * cosY;
        let ry2 = y2 * cosX - rz2 * sinX;
        rz2 = y2 * sinX + rz2 * cosX;

        const denom1 = fov + rz1 + 200;
        const denom2 = fov + rz2 + 200;
        if (denom1 <= 10 || denom2 <= 10) continue;

        const scale1 = fov / denom1;
        const scale2 = fov / denom2;

        const sx1 = cx + rx1 * scale1 * audioScale;
        const sy1 = cy + ry1 * scale1 * audioScale;
        const sx2 = cx + rx2 * scale2 * audioScale;
        const sy2 = cy + ry2 * scale2 * audioScale;

        const alpha = p1.life * 0.9;
        const hue = (p1.life * 180 + (rms * 200)) % 360;
        ctx.strokeStyle = `hsla(${hue}, 95%, 60%, ${alpha})`;

        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(0, 230, 255, 0.7)';
      ctx.font = '11px monospace';
      ctx.fillText(`3D ATTRACTOR: ${type.toUpperCase()} • Drag to rotate, Scroll to zoom`, 12, 18);
    }

    renderSpectrogram(w, h) {
      const ctx = this.mainCtx;
      const numBins = Math.min(256, this.fftData.length);

      const sw = this.spectrogramBuffer.width;
      const sh = this.spectrogramBuffer.height;

      this.spectrogramCtx.drawImage(this.spectrogramBuffer, 0, 1, sw, sh - 1, 0, 0, sw, sh - 1);

      for (let i = 0; i < sw; i++) {
        const bin = Math.floor((i / sw) * numBins);
        const val = this.fftData[bin];
        const hue = (260 - (val / 255) * 260);
        const lit = (val / 255) * 60;
        this.spectrogramCtx.fillStyle = val > 5 ? `hsl(${hue}, 100%, ${lit}%)` : '#070a10';
        this.spectrogramCtx.fillRect(i, sh - 1, 1, 1);
      }

      ctx.drawImage(this.spectrogramBuffer, 0, 0, w, h);

      ctx.beginPath();
      ctx.strokeStyle = '#00e6ff';
      ctx.lineWidth = 2;

      const sliceW = w / numBins;
      for (let i = 0; i < numBins; i++) {
        const v = this.fftData[i] / 255.0;
        const y = h - v * (h * 0.85);
        const x = i * sliceW;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 230, 255, 0.7)';
      ctx.font = '11px monospace';
      ctx.fillText('FFT WATERFALL SPECTROGRAM (20 Hz — 20 kHz)', 12, 18);
    }

    renderGoniometer(w, h) {
      const ctx = this.mainCtx;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) - 20;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.33, 0, TWO_PI);
      ctx.arc(cx, cy, radius * 0.66, 0, TWO_PI);
      ctx.arc(cx, cy, radius, 0, TWO_PI);
      ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius); ctx.lineTo(cx + radius, cy);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(0, 230, 255, 0.15)';
      ctx.beginPath();
      ctx.moveTo(cx - radius * 0.7, cy - radius * 0.7);
      ctx.lineTo(cx + radius * 0.7, cy + radius * 0.7);
      ctx.moveTo(cx - radius * 0.7, cy + radius * 0.7);
      ctx.lineTo(cx + radius * 0.7, cy - radius * 0.7);
      ctx.stroke();

      ctx.strokeStyle = '#ff0080';
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const len = this.timeData.length;
      for (let i = 0; i < len; i += 2) {
        const left = (this.timeData[i] - 128) / 128.0;
        const right = (this.timeData[(i + 1) % len] - 128) / 128.0;

        const mid = (left + right) * 0.707;
        const side = (left - right) * 0.707;

        const px = cx + side * radius * 1.5;
        const py = cy - mid * radius * 1.5;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 0, 128, 0.7)';
      ctx.font = '11px monospace';
      ctx.fillText('LISSAJOUS STEREO GONIOMETER (M/S POLAR VECTOR)', 12, 18);
    }

    renderHarmonicsBar(w, h) {
      const ctx = this.mainCtx;
      const numBars = 64;
      const barWidth = (w - 30) / numBars;

      ctx.fillStyle = 'rgba(0, 230, 255, 0.7)';
      ctx.font = '11px monospace';
      ctx.fillText('64-PARTIAL FOURIER HARMONIC SPECTRUM', 12, 18);

      for (let i = 0; i < numBars; i++) {
        const bin = Math.floor(Math.pow(i / numBars, 1.4) * (this.fftData.length / 2));
        const val = this.fftData[bin] / 255.0;
        const barH = val * (h - 40);

        const x = 15 + i * barWidth;
        const y = h - 15 - barH;

        const grad = ctx.createLinearGradient(0, y, 0, h - 15);
        grad.addColorStop(0, '#ff0080');
        grad.addColorStop(0.5, '#00e6ff');
        grad.addColorStop(1, '#1a2233');

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth - 2, barH);
      }
    }

    renderOscilloscope(w, h) {
      const ctx = this.mainCtx;

      let zeroCross = 0;
      for (let i = 0; i < this.timeData.length / 2; i++) {
        if (this.timeData[i] < 128 && this.timeData[i + 1] >= 128) {
          zeroCross = i;
          break;
        }
      }

      ctx.strokeStyle = '#00e6ff';
      ctx.lineWidth = 2;
      ctx.beginPath();

      const renderLength = Math.floor(this.timeData.length / 2);
      const sliceWidth = w / renderLength;

      for (let i = 0; i < renderLength; i++) {
        const sampleIndex = zeroCross + i;
        const v = this.timeData[sampleIndex] / 128.0;
        const y = (v * h) / 2;
        const x = i * sliceWidth;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 230, 255, 0.7)';
      ctx.font = '11px monospace';
      ctx.fillText('STABILIZED TIME-DOMAIN OSCILLOSCOPE', 12, 18);
    }
  }

  root.VisualizerSuite = VisualizerSuite;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VisualizerSuite };
  }
})(typeof window !== 'undefined' ? window : globalThis);
