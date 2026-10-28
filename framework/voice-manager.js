/**
 * Fractal Sound Engine v2.0 — Polyphonic Voice Manager
 *
 * Coordinates polyphonic voice allocation (up to 32 voices), priority voice stealing,
 * sustain pedal hold/release, Sound Engine selection, DetuneModule unison/sub-bass stacks,
 * EnvelopeModule ADSR scheduling, and AudioBus signal propagation.
 */
(function (root) {
  'use strict';

  class PolyphonicVoiceManager {
    /**
     * @param {AudioContext} audioCtx
     * @param {AudioFXEngine} fxEngine
     * @param {AudioBus} [audioBus]
     */
    constructor(audioCtx, fxEngine, audioBus) {
      this.ctx = audioCtx;
      this.fx = fxEngine;
      this.audioBus = audioBus || (fxEngine && fxEngine.audioBus) || null;
      this.maxPolyphony = 32;
      this.activeVoices = new Map(); // note -> voiceObject
      this.lastPlayedNote = null;
      this.isSustainPedalDown = false;

      // Register available sound engines
      this.engines = new Map();
      this.registerDefaultEngines();
    }

    registerDefaultEngines() {
      const engineClasses = [
        root.PolottiFASEngine || root.PolottiFAS,
        root.ComplexFractalEngine,
        root.StrangeAttractorEngine || root.StrangeAttractorDSP,
        root.HyperDroneEngine,
        root.OpticalImageEngine,
        root.CellularAutomataEngine,
        root.PinchedPluckedEngine,
        root.TappedStruckEngine,
        root.BowedViolinEngine,
        root.TouchedHarmonicEngine,
        root.SympatheticStringEngine,
        root.StiffStringEngine,
        root.DX7EPiano1Engine,
        root.FMCrystalBellEngine,
        root.FMWurliReedEngine,
        root.FMTX816StackEngine,
        root.FMLushPadEPEngine,
        root.FMPercClavEngine,
        ...(Array.isArray(root.REGISTERED_SYNTH_ENGINES) ? root.REGISTERED_SYNTH_ENGINES : [])
      ];

      for (const EngineCls of engineClasses) {
        if (!EngineCls) continue;
        if (typeof EngineCls.getEngineDescriptor === 'function') {
          this.registerEngine(EngineCls.getEngineDescriptor());
        } else if (EngineCls.id) {
          this.registerEngine(EngineCls);
        }
      }
    }

    static registerEngineClass(EngineCls) {
      root.REGISTERED_SYNTH_ENGINES = root.REGISTERED_SYNTH_ENGINES || [];
      if (!root.REGISTERED_SYNTH_ENGINES.includes(EngineCls)) {
        root.REGISTERED_SYNTH_ENGINES.push(EngineCls);
      }
    }

    registerEngine(descriptor) {
      if (!descriptor || !descriptor.id) return;
      this.engines.set(descriptor.id, descriptor);
      if (Array.isArray(descriptor.aliases)) {
        for (const alias of descriptor.aliases) {
          this.engines.set(alias, descriptor);
        }
      }
    }

    createPeriodicWaveForMode(synthParams, timestamp = (typeof performance !== 'undefined' ? performance.now() : 0)) {
      const mode = synthParams.mode || 'julia';
      const engine = this.engines.get(mode);
      if (engine && engine.type === 'wavetable' && typeof engine.createPeriodicWave === 'function') {
        return engine.createPeriodicWave(this.ctx, synthParams, timestamp);
      }

      // Fallback direct calls
      if (mode === 'polotti_fas') {
        return root.PolottiFAS.createPeriodicWave(this.ctx, synthParams);
      } else if (['julia', 'mandelbrot', 'fractal', 'burningship', 'newton', 'mandelbulb3d', 'sierpinski', 'koch'].includes(mode)) {
        return root.FractalWavetableDSP.createFractalPeriodicWave(this.ctx, synthParams);
      } else if (mode === 'drone') {
        return root.FractalWavetableDSP.createDroneWave(this.ctx, synthParams, timestamp);
      } else if (mode === 'image') {
        const imgCanvas = typeof document !== 'undefined' ? document.getElementById('image-canvas-v2') : null;
        return root.OpticalAndAutomataDSP.createImageWave(this.ctx, synthParams, imgCanvas);
      } else if (mode === 'automata') {
        return root.OpticalAndAutomataDSP.generateCellularAutomataWave(this.ctx, synthParams.cellularRule || 110);
      }
      return null;
    }

    playNote(note, velocity = 0.8, synthParams = {}) {
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      // Priority voice stealing: 1. Pedal-released notes -> 2. Oldest active voice
      if (this.activeVoices.size >= this.maxPolyphony && !this.activeVoices.has(note)) {
        let noteToSteal = null;
        for (const [vNote, vObj] of this.activeVoices.entries()) {
          if (vObj.isPendingRelease) {
            noteToSteal = vNote;
            break;
          }
        }
        if (noteToSteal === null) {
          noteToSteal = this.activeVoices.keys().next().value;
        }
        if (noteToSteal !== null && noteToSteal !== undefined) {
          this.stopNote(noteToSteal, true, synthParams);
        }
      }

      if (this.activeVoices.has(note)) {
        this.stopNote(note, true, synthParams);
      }

      const targetFreq = root.midiToFreq(note, synthParams.microtuningOffset || 0);
      const now = this.ctx.currentTime;

      // Portamento / Glide calculation via DetuneModule
      const { startFreq } = root.DetuneModule.computeGlide(targetFreq, this.lastPlayedNote, synthParams);

      // Per-voice ADSR Envelope via EnvelopeModule
      const voiceGain = root.EnvelopeModule.createVoiceEnvelope(this.ctx, velocity, synthParams);

      // Intermediate velocity dynamic scaling on voice masterMerger (~22 dB dynamic range
      // from soft pp to hard ff when combined with EnvelopeModule's velocity gain)
      const masterMerger = this.ctx.createGain();
      const clampedVel = Math.max(0.10, Math.min(1.0, velocity));
      const velDynamicScale = (0.25 + 0.75 * Math.pow(clampedVel, 1.15)) * 0.85;
      masterMerger.gain.setValueAtTime(velDynamicScale, now);

      const voiceObj = {
        note,
        targetFreq,
        startFreq,
        velocity,
        voiceGain,
        masterMerger,
        oscillators: [],
        subOscillators: [],
        bufferNodes: [],
        unisonNodes: [],
        subNode: null,
        currentMode: synthParams.mode || 'polotti_fas',
        currentUnisonCount: synthParams.unisonEnabled !== false ? (parseInt(synthParams.unisonCount) || 1) : 1,
        isPendingRelease: false,
        createdAt: now,
        updateVoiceParameters: (params) => {
          this.updateActiveVoices({ ...synthParams, ...params });
        }
      };

      this.instantiateVoiceOscillators(voiceObj, synthParams);

      // Route voice through AudioBus: [Voice Unison/Sub Merger] -> [Voice ADSR Gain] -> [Master Bus / Filter Entry]
      if (this.audioBus) {
        this.audioBus.routeVoice(voiceObj.masterMerger, voiceGain, this.fx ? this.fx.filterNode : undefined);
      } else {
        voiceObj.masterMerger.connect(voiceGain);
        if (this.fx && this.fx.filterNode) {
          voiceGain.connect(this.fx.filterNode);
        }
      }

      this.activeVoices.set(note, voiceObj);
      this.lastPlayedNote = note;
    }

    instantiateVoiceOscillators(voiceObj, synthParams = {}) {
      const now = this.ctx.currentTime;
      const freq = voiceObj.targetFreq;
      const glideTime = (synthParams.glideTime || 0) / 1000.0;
      const mode = synthParams.mode || 'polotti_fas';
      const unisonCount = synthParams.unisonEnabled !== false ? (parseInt(synthParams.unisonCount) || 1) : 1;
      const detuneSpread = synthParams.unisonEnabled !== false ? (synthParams.unisonDetune !== undefined ? synthParams.unisonDetune : 15) : 0;
      const stereoWidth = synthParams.unisonEnabled !== false ? ((synthParams.unisonStereo !== undefined ? synthParams.unisonStereo : 80) / 100.0) : 0;
      const pitchBendCents = synthParams.pitchBendCents || 0;

      voiceObj.currentMode = mode;
      voiceObj.currentUnisonCount = unisonCount;
      voiceObj.unisonNodes = [];
      voiceObj.bufferNodes = [];
      voiceObj.oscillators = [];
      voiceObj.subOscillators = [];

      // 1. Sub-Bass Core via DetuneModule
      root.DetuneModule.attachSubBass(this.ctx, voiceObj, synthParams);

      // 2. Super-Unison Detune Stack Layout via DetuneModule
      const { detuneRatios, panOffsets, voiceAmp } = root.DetuneModule.getUnisonLayout(unisonCount, stereoWidth);

      const engineDesc = this.engines.get(mode);
      const isBufferMode = (engineDesc && engineDesc.type === 'buffer') || (mode === 'attractor' || mode === 'lorenz' || mode === 'logistic');
      const sharedPeriodicWave = !isBufferMode ? this.createPeriodicWaveForMode(synthParams) : null;
      const sharedVoiceBuffer = (isBufferMode && engineDesc && typeof engineDesc.createVoiceBuffer === 'function')
        ? engineDesc.createVoiceBuffer(this.ctx, freq, synthParams, voiceObj.velocity)
        : null;

      const centerIdx = Math.floor(detuneRatios.length / 2);

      for (let m = 0; m < detuneRatios.length; m++) {
        const isPrimaryVoice = (m === centerIdx) || detuneRatios.length === 1;
        // For buffer-based physical waveguide modes, use asymmetric detune ratios on side voices
        // and keep the center voice dominant so 3-voice unison never creates a 1 + 2*cos(2*pi*df*t)
        // periodic comb-cancellation & ~250ms re-attack pulse train.
        const rawRatio = detuneRatios[m];
        const effectiveRatio = (isBufferMode && !isPrimaryVoice)
          ? (rawRatio < 0 ? rawRatio * 0.73 : rawRatio * 1.11)
          : rawRatio;
        const cents = (synthParams.unisonEnabled !== false ? effectiveRatio * detuneSpread : 0) + pitchBendCents;
        const panVal = synthParams.unisonEnabled !== false ? panOffsets[m] : 0;

        const effectiveVoiceAmp = (isBufferMode && detuneRatios.length > 1)
          ? (isPrimaryVoice ? 0.90 : 0.12 / Math.sqrt(detuneRatios.length - 1))
          : voiceAmp;

        const uGain = this.ctx.createGain();
        uGain.gain.setValueAtTime(effectiveVoiceAmp, now);

        let uPanner = null;
        if (this.ctx.createStereoPanner) {
          uPanner = this.ctx.createStereoPanner();
          uPanner.pan.setValueAtTime(panVal, now);
        }

        if (!isBufferMode) {
          const osc = this.ctx.createOscillator();
          if (sharedPeriodicWave) osc.setPeriodicWave(sharedPeriodicWave);
          osc.frequency.setValueAtTime(voiceObj.startFreq, now);
          if (glideTime > 0) osc.frequency.exponentialRampToValueAtTime(freq, now + glideTime);
          osc.detune.setValueAtTime(cents, now);
          osc.start(now);
          voiceObj.oscillators.push(osc);

          if (uPanner) { osc.connect(uPanner); uPanner.connect(uGain); }
          else { osc.connect(uGain); }

          voiceObj.unisonNodes.push({ osc, uGain, uPanner, detuneRatio: effectiveRatio, panOffset: panOffsets[m] });
        } else {
          let buffer = sharedVoiceBuffer;
          if (!buffer && root.StrangeAttractorDSP) {
            const attractorType = synthParams.attractorType || 'lorenz';
            buffer = root.StrangeAttractorDSP.generateAttractorBuffer(this.ctx, freq, 2.5, attractorType, synthParams);
          }
          const bufNode = this.ctx.createBufferSource();
          bufNode.buffer = buffer;
          bufNode.loop = engineDesc && engineDesc.loop !== undefined ? engineDesc.loop : true;
          let startOffset = 0;
          if (buffer && buffer._loopStart !== undefined && buffer._loopEnd !== undefined) {
            bufNode.loop = true;
            bufNode.loopStart = buffer._loopStart;
            bufNode.loopEnd = buffer._loopEnd;
            if (!isPrimaryVoice && buffer._loopEnd > buffer._loopStart) {
              const loopSpan = buffer._loopEnd - buffer._loopStart;
              startOffset = buffer._loopStart + (((m + 1) * 0.6180339887) % 1.0) * loopSpan;
            }
          }

          const bendRate = Math.pow(2, cents / 1200.0);
          bufNode.playbackRate.setValueAtTime(bendRate, now);
          if (startOffset > 0) {
            bufNode.start(now, startOffset);
          } else {
            bufNode.start(now);
          }
          voiceObj.bufferNodes.push({ bufNode, uGain, uPanner, detuneRatio: effectiveRatio, panOffset: panOffsets[m] });

          if (uPanner) { bufNode.connect(uPanner); uPanner.connect(uGain); }
          else { bufNode.connect(uGain); }
        }

        uGain.connect(voiceObj.masterMerger);
      }
    }

    updateActiveVoices(synthParams = {}, forceRebuild = false) {
      if (!this.ctx || this.activeVoices.size === 0) return;
      const mode = synthParams.mode || 'polotti_fas';
      const unisonCount = synthParams.unisonEnabled !== false ? (parseInt(synthParams.unisonCount) || 1) : 1;

      const engineDesc = this.engines.get(mode);
      const isBufferMode = (engineDesc && engineDesc.type === 'buffer') || (mode === 'attractor' || mode === 'lorenz' || mode === 'logistic');
      let sharedWave = null;
      if (!isBufferMode) {
        sharedWave = this.createPeriodicWaveForMode(synthParams);
      }

      for (const [, voiceObj] of this.activeVoices.entries()) {
        if (forceRebuild || voiceObj.currentMode !== mode || voiceObj.currentUnisonCount !== unisonCount) {
          this.rebuildVoiceSoundGenerators(voiceObj, synthParams);
          continue;
        }

        if (sharedWave) {
          for (const uNode of voiceObj.unisonNodes) {
            if (uNode.osc) {
              try { uNode.osc.setPeriodicWave(sharedWave); } catch (e) {}
            }
          }
        }

        root.DetuneModule.updateVoiceDetuneAndSub(this.ctx, voiceObj, synthParams);
      }
    }

    rebuildVoiceSoundGenerators(voiceObj, synthParams) {
      if (voiceObj.oscillators) {
        voiceObj.oscillators.forEach(osc => { try { osc.stop(); osc.disconnect(); } catch (e) {} });
      }
      if (voiceObj.subOscillators) {
        voiceObj.subOscillators.forEach(sub => { try { sub.osc.stop(); sub.osc.disconnect(); sub.gain.disconnect(); } catch (e) {} });
      }
      if (voiceObj.bufferNodes) {
        voiceObj.bufferNodes.forEach(b => {
          const node = b.bufNode || b;
          try { node.stop(); node.disconnect(); } catch (e) {}
        });
      }

      voiceObj.oscillators = [];
      voiceObj.subOscillators = [];
      voiceObj.bufferNodes = [];
      voiceObj.unisonNodes = [];
      voiceObj.subNode = null;

      this.instantiateVoiceOscillators(voiceObj, synthParams);
    }

    updateDroneWaves(synthParams, timestamp) {
      if (!this.ctx || this.activeVoices.size === 0) return;
      const droneWave = root.FractalWavetableDSP.createDroneWave(this.ctx, synthParams, timestamp);
      if (!droneWave) return;
      for (const voiceObj of this.activeVoices.values()) {
        if (voiceObj.currentMode === 'drone') {
          for (const uNode of voiceObj.unisonNodes) {
            if (uNode.osc) {
              try { uNode.osc.setPeriodicWave(droneWave); } catch (e) {}
            }
          }
        }
      }
    }

    stopNote(note, forceStop = false, synthParams = {}) {
      if (!this.activeVoices.has(note)) return;
      const voiceObj = this.activeVoices.get(note);

      if (this.isSustainPedalDown && !forceStop) {
        voiceObj.isPendingRelease = true;
        return;
      }

      const release = root.EnvelopeModule.triggerRelease(voiceObj.voiceGain, this.ctx, synthParams);

      setTimeout(() => {
        try {
          if (voiceObj.oscillators) voiceObj.oscillators.forEach(osc => { try { osc.stop(); osc.disconnect(); } catch (e) {} });
          if (voiceObj.subOscillators) voiceObj.subOscillators.forEach(sub => { try { sub.osc.stop(); sub.osc.disconnect(); sub.gain.disconnect(); } catch (e) {} });
          if (voiceObj.bufferNodes) voiceObj.bufferNodes.forEach(b => { const node = b.bufNode || b; try { node.stop(); node.disconnect(); } catch (e) {} });
          voiceObj.masterMerger.disconnect();
          voiceObj.voiceGain.disconnect();
        } catch (e) {}
      }, release * 1000 + 60);

      this.activeVoices.delete(note);
    }

    handleSustainPedal(isDown, synthParams) {
      this.isSustainPedalDown = isDown;
      if (!isDown) {
        this.activeVoices.forEach((voiceObj, note) => {
          if (voiceObj.isPendingRelease) {
            this.stopNote(note, true, synthParams);
          }
        });
      }
    }

    allNotesOff(synthParams) {
      this.activeVoices.forEach((v, note) => this.stopNote(note, true, synthParams));
      this.activeVoices.clear();
    }

    updateVoiceParameters(params, synthParamsRef = {}) {
      this.updateActiveVoices({ ...synthParamsRef, ...params });
    }
  }

  root.PolyphonicVoiceManager = PolyphonicVoiceManager;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PolyphonicVoiceManager };
  }
})(typeof window !== 'undefined' ? window : globalThis);
