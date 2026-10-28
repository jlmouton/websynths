/**
 * Fractal Sound Engine v2.0 — Configurable Multi-Destination LFO Module
 *
 * Provides periodic and fractal (fBm) low-frequency modulation across global FX
 * and mode-specific synthesis targets at 60 FPS.
 */
(function (root) {
  'use strict';

  const LFO_TARGET_DEFINITIONS = {
    global: [
      { value: 'none', label: 'Dest: None' },
      { value: 'cutoff', label: 'Dest: Filter Cutoff' },
      { value: 'resonance', label: 'Dest: Filter Resonance' },
      { value: 'reverbMix', label: 'Dest: Reverb Mix' },
      { value: 'delayMix', label: 'Dest: Delay Mix' },
      { value: 'driveAmount', label: 'Dest: Wavefolder / Sat' },
      { value: 'unisonDetune', label: 'Dest: Unison Detune' }
    ],
    polotti_fas: [
      { value: 'fasDimension', label: 'Dest: FAS Dimension (D)' },
      { value: 'fasGamma', label: 'Dest: FAS Ratio (γ)' },
      { value: 'fasDecay', label: 'Dest: Spectral Decay' },
      { value: 'fasFbm', label: 'Dest: fBm Noise (H)' }
    ],
    julia: [
      { value: 'cReal', label: 'Dest: Complex cReal (X)' },
      { value: 'cImag', label: 'Dest: Complex cImag (Y)' },
      { value: 'fractalZoom', label: 'Dest: Fractal Zoom' },
      { value: 'angle3D', label: 'Dest: 3D Projection Angle' }
    ],
    attractor: [
      { value: 'fmDepth', label: 'Dest: Attractor FM Depth' },
      { value: 'attractorSpeed', label: 'Dest: Orbit Speed' }
    ],
    drone: [
      { value: 'droneMorph', label: 'Dest: Dual Morph' },
      { value: 'droneSwirl', label: 'Dest: Swirl LFO Rate' }
    ],
    image: [
      { value: 'imageRadius', label: 'Dest: Scan Orbit Radius' },
      { value: 'imageCursorX', label: 'Dest: Scan Cursor X' }
    ],
    automata: [
      { value: 'automataRule', label: 'Dest: Automata Rule' }
    ]
  };

  const CUSTOM_LFO_HANDLERS = {};

  class LFOModule {
    /**
     * Registers LFO target definitions and optional modulation handlers for a custom synthesis mode.
     * @param {string} modeId
     * @param {Array<{value: string, label: string, handler?: Function}>} targets
     */
    static registerModeTargets(modeId, targets = []) {
      LFO_TARGET_DEFINITIONS[modeId] = targets.map(t => ({ value: t.value, label: t.label }));
      for (const t of targets) {
        if (typeof t.handler === 'function') {
          CUSTOM_LFO_HANDLERS[t.value] = t.handler;
        }
      }
    }

    /**
     * Registers a custom modulation handler for a specific target parameter name.
     * @param {string} targetValue
     * @param {Function} handlerFn - (modVal, context) => void
     */
    static registerTargetHandler(targetValue, handlerFn) {
      CUSTOM_LFO_HANDLERS[targetValue] = handlerFn;
    }
    /**
     * Evaluates the normalized LFO waveform [-1.0, +1.0] for a given shape and phase.
     * @param {string} shape - 'sine' | 'triangle' | 'sawtooth' | 'square' | 'fbm'
     * @param {number} t - Phase in radians (2 * PI * rate * time)
     * @returns {number}
     */
    static computeWaveform(shape, t) {
      if (shape === 'sine') {
        return Math.sin(t);
      } else if (shape === 'triangle') {
        return Math.abs((t % (Math.PI * 2)) / Math.PI - 1) * 2 - 1;
      } else if (shape === 'sawtooth') {
        return ((t % (Math.PI * 2)) / Math.PI) - 1;
      } else if (shape === 'square') {
        return Math.sin(t) >= 0 ? 1 : -1;
      } else if (shape === 'fbm') {
        return Math.sin(t) * 0.6 + Math.sin(t * 2.7) * 0.3 + Math.sin(t * 7.1) * 0.1;
      }
      return 0;
    }

    /**
     * Updates the `#lfo-target-select-v2` dropdown options dynamically based on active synthesis mode.
     * @param {string} mode
     * @param {Object} synthParams
     * @param {string} [selectId='lfo-target-select-v2']
     */
    static updateTargetOptions(mode, synthParams = {}, selectId = 'lfo-target-select-v2') {
      if (typeof document === 'undefined') return;
      const select = document.getElementById(selectId);
      if (!select) return;

      const currentVal = synthParams.modLfoTarget || 'cutoff';
      const modeKey = mode || synthParams.mode || 'polotti_fas';
      const targetList = [
        ...LFO_TARGET_DEFINITIONS.global,
        ...(LFO_TARGET_DEFINITIONS[modeKey] || LFO_TARGET_DEFINITIONS.polotti_fas)
      ];

      select.innerHTML = '';
      let hasCurrent = false;

      targetList.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.value;
        opt.innerText = t.label;
        if (t.value === currentVal) {
          opt.selected = true;
          hasCurrent = true;
        }
        select.appendChild(opt);
      });

      if (!hasCurrent) {
        select.value = 'cutoff';
        synthParams.modLfoTarget = 'cutoff';
      }
    }

    /**
     * Applies 60 FPS LFO modulation to the configured target parameter.
     * @param {number} nowTime - Time in seconds
     * @param {Object} context - { isAudioStarted, audioCtx, synthParams, fxParams, fxEngine, voiceManager, fractalCanvas2D }
     */
    static updateModulation(nowTime, context = {}) {
      const { isAudioStarted, audioCtx, synthParams, fxParams, fxEngine, voiceManager, fractalCanvas2D } = context;
      if (!isAudioStarted || !synthParams || !synthParams.modLfoDepth || synthParams.modLfoTarget === 'none') return;

      const rate = synthParams.modLfoRate || 1.5;
      const depth = (synthParams.modLfoDepth || 0) / 100.0;
      const shape = synthParams.modLfoShape || 'sine';
      const target = synthParams.modLfoTarget || 'cutoff';

      const t = nowTime * rate * Math.PI * 2;
      const wave = this.computeWaveform(shape, t);
      const modVal = wave * depth;
      const audioNow = audioCtx ? audioCtx.currentTime : 0;

      // 1. Global Filter & FX Targets
      if (target === 'cutoff') {
        if (fxEngine && fxEngine.filterNode && !fxEngine.fxBypass.master) {
          const baseFreq = synthParams.cutoff || 4500;
          const modFreq = Math.max(50, Math.min(18000, baseFreq * Math.pow(2, modVal * 2)));
          fxEngine.filterNode.frequency.setTargetAtTime(modFreq, audioNow, 0.02);
        }
      } else if (target === 'resonance') {
        if (fxEngine && fxEngine.filterNode && !fxEngine.fxBypass.master) {
          const baseQ = synthParams.resonance !== undefined ? synthParams.resonance : 1.2;
          const modQ = Math.max(0.1, Math.min(18.0, baseQ + modVal * 6.0));
          fxEngine.filterNode.Q.setTargetAtTime(modQ, audioNow, 0.02);
        }
      } else if (target === 'reverbMix') {
        if (fxEngine && fxEngine.reverbWetGain && !fxEngine.fxBypass.master) {
          const baseMix = fxParams && fxParams.reverbMix !== undefined ? fxParams.reverbMix : 0.30;
          const modMix = Math.max(0, Math.min(1.0, baseMix + modVal * 0.4));
          fxEngine.reverbWetGain.gain.setTargetAtTime(modMix, audioNow, 0.02);
        }
      } else if (target === 'delayMix') {
        if (fxEngine && fxEngine.delayWetGain && !fxEngine.fxBypass.master) {
          const baseMix = fxParams && fxParams.delayMix !== undefined ? fxParams.delayMix : 0.20;
          const modMix = Math.max(0, Math.min(1.0, baseMix + modVal * 0.35));
          fxEngine.delayWetGain.gain.setTargetAtTime(modMix, audioNow, 0.02);
        }
      } else if (target === 'driveAmount') {
        if (fxEngine && !fxEngine.fxBypass.master) {
          const baseDrive = fxParams && fxParams.driveAmount !== undefined ? fxParams.driveAmount : 0;
          const modDrive = Math.max(0, Math.min(100, baseDrive + modVal * 50));
          fxEngine.updateWavefolderCurve(modDrive);
        }
      } else if (target === 'unisonDetune') {
        if (voiceManager) {
          const baseDetune = synthParams.unisonDetune || 15;
          const modDetune = Math.max(0, Math.min(50, baseDetune + modVal * 25));
          voiceManager.updateActiveVoices({ ...synthParams, unisonDetune: modDetune });
        }
      }
      // 2. Mode 1: Polotti FAS Targets
      else if (target === 'fasDimension') {
        if (voiceManager && synthParams.mode === 'polotti_fas') {
          const baseD = synthParams.fasDimension || 1.35;
          const modD = Math.max(1.0, Math.min(1.95, baseD + modVal * 0.45));
          voiceManager.updateActiveVoices({ ...synthParams, fasDimension: modD });
        }
      } else if (target === 'fasGamma') {
        if (voiceManager && synthParams.mode === 'polotti_fas') {
          const baseG = synthParams.fasGamma || 2.0;
          const modG = Math.max(1.1, Math.min(3.5, baseG + modVal * 1.0));
          voiceManager.updateActiveVoices({ ...synthParams, fasGamma: modG });
        }
      } else if (target === 'fasDecay') {
        if (voiceManager && synthParams.mode === 'polotti_fas') {
          const baseDecay = synthParams.fasDecay || 0.55;
          const modDecay = Math.max(0.1, Math.min(1.5, baseDecay + modVal * 0.4));
          voiceManager.updateActiveVoices({ ...synthParams, fasDecay: modDecay });
        }
      } else if (target === 'fasFbm') {
        if (voiceManager && synthParams.mode === 'polotti_fas') {
          const baseFbm = synthParams.fasFbm || 0.35;
          const modFbm = Math.max(0, Math.min(1.0, baseFbm + modVal * 0.4));
          voiceManager.updateActiveVoices({ ...synthParams, fasFbm: modFbm });
        }
      }
      // 3. Mode 2: 2D/3D Complex Fractals Targets
      else if (target === 'cReal') {
        if (voiceManager && synthParams.mode === 'julia') {
          const baseC = synthParams.cReal || -0.7;
          const modC = Math.max(-1.8, Math.min(0.8, baseC + modVal * 0.5));
          voiceManager.updateActiveVoices({ ...synthParams, cReal: modC });
          if (fractalCanvas2D) fractalCanvas2D.render({ ...synthParams, cReal: modC });
        }
      } else if (target === 'cImag') {
        if (voiceManager && synthParams.mode === 'julia') {
          const baseC = synthParams.cImag || 0.27;
          const modC = Math.max(-1.0, Math.min(1.0, baseC + modVal * 0.5));
          voiceManager.updateActiveVoices({ ...synthParams, cImag: modC });
          if (fractalCanvas2D) fractalCanvas2D.render({ ...synthParams, cImag: modC });
        }
      } else if (target === 'fractalZoom') {
        if (voiceManager && synthParams.mode === 'julia') {
          const baseZ = synthParams.zoom || 1.0;
          const modZ = Math.max(0.1, Math.min(5.0, baseZ * Math.pow(2, modVal * 2)));
          voiceManager.updateActiveVoices({ ...synthParams, zoom: modZ });
          if (fractalCanvas2D) fractalCanvas2D.render({ ...synthParams, zoom: modZ });
        }
      } else if (target === 'angle3D') {
        if (voiceManager && synthParams.mode === 'julia') {
          const baseA = synthParams.angle3D || 45;
          const modA = (baseA + modVal * 180 + 360) % 360;
          voiceManager.updateActiveVoices({ ...synthParams, angle3D: modA });
        }
      }
      // 4. Mode 3: Attractor FM Targets
      else if (target === 'fmDepth') {
        if (voiceManager && synthParams.mode === 'attractor') {
          const baseFM = synthParams.fmDepth || 0.5;
          const modFM = Math.max(0, Math.min(2.5, baseFM + modVal * 1.0));
          voiceManager.updateActiveVoices({ ...synthParams, fmDepth: modFM });
        }
      } else if (target === 'attractorSpeed') {
        if (voiceManager && synthParams.mode === 'attractor') {
          const baseSpd = synthParams.attractorSpeed || 35.0;
          const modSpd = Math.max(5, Math.min(100, baseSpd + modVal * 30.0));
          voiceManager.updateActiveVoices({ ...synthParams, attractorSpeed: modSpd });
        }
      }
      // 5. Mode 4: Hyper-Drone Targets
      else if (target === 'droneMorph') {
        if (voiceManager && synthParams.mode === 'drone') {
          const baseM = synthParams.droneMorph !== undefined ? synthParams.droneMorph : 0.5;
          const modM = Math.max(0, Math.min(1.0, baseM + modVal * 0.5));
          voiceManager.updateActiveVoices({ ...synthParams, droneMorph: modM });
        }
      } else if (target === 'droneSwirl') {
        if (voiceManager && synthParams.mode === 'drone') {
          const baseS = synthParams.droneSwirl || 0.25;
          const modS = Math.max(0.05, Math.min(2.0, baseS + modVal * 0.5));
          synthParams.droneSwirl = modS;
        }
      }
      // 6. Mode 5: Optical Image Targets
      else if (target === 'imageRadius') {
        if (voiceManager && synthParams.mode === 'image') {
          const baseR = synthParams.imageRadius || 25;
          const modR = Math.max(5, Math.min(60, baseR + modVal * 25));
          voiceManager.updateActiveVoices({ ...synthParams, imageRadius: modR });
        }
      } else if (target === 'imageCursorX') {
        if (voiceManager && synthParams.mode === 'image') {
          const baseCX = synthParams.imageCursorX !== undefined ? synthParams.imageCursorX : 60;
          const modCX = Math.max(0, Math.min(200, baseCX + modVal * 50));
          voiceManager.updateActiveVoices({ ...synthParams, imageCursorX: modCX });
        }
      }
      // 7. Mode 6: Cellular Automata Targets
      else if (target === 'automataRule') {
        if (voiceManager && synthParams.mode === 'automata') {
          const baseRule = synthParams.cellularRule !== undefined ? synthParams.cellularRule : 110;
          const modRule = Math.max(0, Math.min(255, Math.round(baseRule + modVal * 20)));
          voiceManager.updateActiveVoices({ ...synthParams, cellularRule: modRule });
        }
      }
      // 8. Custom Registered Synth Mode Targets
      else if (typeof CUSTOM_LFO_HANDLERS[target] === 'function') {
        CUSTOM_LFO_HANDLERS[target](modVal, context);
      }
    }
  }

  root.LFO_TARGET_DEFINITIONS = LFO_TARGET_DEFINITIONS;
  root.LFOModule = LFOModule;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LFO_TARGET_DEFINITIONS, LFOModule };
  }
})(typeof window !== 'undefined' ? window : globalThis);
