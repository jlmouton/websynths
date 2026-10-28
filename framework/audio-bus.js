/**
 * Fractal Sound Engine v2.0 — Framework Audio Bus
 *
 * Manages high-efficiency, zero-copy Web Audio API signal propagation across:
 * 1. Per-Voice Signal Chain: Sound Engine -> Detune/Unison & Sub-Bass -> ADSR Envelope -> Master Bus Entry
 * 2. Master Effects Pipeline: Filter -> Wavefolder -> Chorus -> Ping-Pong Delay -> FDN Reverb -> Limiter -> Master Gain -> Analyser -> Destination
 * 3. External Audio Taps: Lossless WAV Recorder & Visualizer Suite
 *
 * CPU Efficiency Design:
 * - Uses native Web Audio graph connections (`AudioNode.connect`) so 100% of audio sample
 *   propagation runs on the browser's dedicated C++/Rust audio rendering thread with zero JS per-sample overhead.
 */
(function (root) {
  'use strict';

  class AudioBus {
    /**
     * @param {AudioContext} audioCtx
     */
    constructor(audioCtx) {
      this.ctx = audioCtx;
      this.stages = []; // Ordered array of { id, inputNode, outputNode, module }
      this.taps = new Set();

      if (this.ctx) {
        this.masterGain = this.ctx.createGain();
        this.analyserNode = this.ctx.createAnalyser();
        this.analyserNode.fftSize = 2048;
        this.analyserNode.smoothingTimeConstant = 0.85;

        this.masterGain.connect(this.analyserNode);
        this.analyserNode.connect(this.ctx.destination);
      } else {
        this.masterGain = null;
        this.analyserNode = null;
      }
    }

    /**
     * Returns the entry AudioNode where polyphonic voices connect into the bus.
     * If stages are registered, connects to the first stage's inputNode; otherwise masterGain.
     * @returns {AudioNode|null}
     */
    getVoiceEntryNode() {
      if (this.stages.length > 0 && this.stages[0].inputNode) {
        return this.stages[0].inputNode;
      }
      return this.masterGain;
    }

    /**
     * Registers an ordered list of processing stages on the bus and wires their native Web Audio nodes.
     * Each stage must expose `inputNode` and `outputNode`.
     * @param {Array<{id: string, inputNode: AudioNode, outputNode: AudioNode}>} stageList
     */
    setStages(stageList) {
      this.stages = Array.isArray(stageList) ? stageList.filter(s => s && s.inputNode && s.outputNode) : [];
      this.rebuildChain();
    }

    /**
     * Appends a single stage to the master bus pipeline.
     * @param {{id: string, inputNode: AudioNode, outputNode: AudioNode}} stage
     */
    addStage(stage) {
      if (!stage || !stage.inputNode || !stage.outputNode) return;
      this.stages.push(stage);
      this.rebuildChain();
    }

    /**
     * Wires all registered stages in series into masterGain -> analyserNode -> destination.
     */
    rebuildChain() {
      if (!this.ctx || !this.masterGain) return;

      for (let i = 0; i < this.stages.length; i++) {
        const current = this.stages[i];
        try {
          current.outputNode.disconnect();
        } catch (e) {}

        if (i + 1 < this.stages.length) {
          current.outputNode.connect(this.stages[i + 1].inputNode);
        } else {
          current.outputNode.connect(this.masterGain);
        }
      }
    }

    /**
     * Propagates a single polyphonic voice through the per-voice modules into the Master Audio Bus:
     *   [Voice Unison/Sub Merger] -> [Voice ADSR Envelope Gain] -> [Master Bus Entry Node]
     * @param {AudioNode} voiceSourceMerger - Output of the Detune/Unison & Sub-Bass module
     * @param {GainNode} voiceEnvelopeGain - Output of the ADSR Envelope module
     * @param {AudioNode} [overrideTargetNode] - Optional explicit target node
     */
    routeVoice(voiceSourceMerger, voiceEnvelopeGain, overrideTargetNode) {
      if (!voiceSourceMerger || !voiceEnvelopeGain) return;
      voiceSourceMerger.connect(voiceEnvelopeGain);
      const target = overrideTargetNode || this.getVoiceEntryNode();
      if (target) {
        voiceEnvelopeGain.connect(target);
      }
    }

    /**
     * Connects an auxiliary tap node (e.g., MediaStreamAudioDestinationNode for WAV recording)
     * to the master bus output.
     * @param {AudioNode} tapNode
     */
    connectTap(tapNode) {
      if (!tapNode || !this.masterGain) return;
      this.masterGain.connect(tapNode);
      this.taps.add(tapNode);
    }

    /**
     * Sets the master output volume smoothly.
     * @param {number} volume - Normalized gain [0.0, 1.0]
     */
    setMasterVolume(volume) {
      if (!this.masterGain || !this.ctx) return;
      const clamped = Math.max(0.0, Math.min(1.5, volume));
      this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
    }
  }

  root.AudioBus = AudioBus;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioBus };
  }
})(typeof window !== 'undefined' ? window : globalThis);
