/**
 * Dedicated Modular Architecture & AudioBus Unit Tests
 * Verifies each extracted module in isolation, UMD exports, AudioBus signal propagation,
 * and CPU-efficiency caching optimizations.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MockAudioContext } = require('./test-harness');

// Require extracted modules directly via CommonJS UMD exports
const { TWO_PI, PHI, midiToFreq, MUSICAL_SCALES } = require('../framework/math-scales');
const { AudioBus } = require('../framework/audio-bus');
const { RotaryKnob, isTypingInText } = require('../framework/ui-controls');
const { PianoKeyboard } = require('../framework/keyboard');
const { WebMIDIManager } = require('../framework/midi');
const { AudioRecorder } = require('../framework/recorder');
const { PresetManager } = require('../framework/preset-manager');
const { PolyphonicVoiceManager } = require('../framework/voice-manager');
const { SynthFramework } = require('../framework/synth-framework');

const { PolottiFAS } = require('../synths/fractal/engines/polotti-fas');
const { ComplexFractalEngine } = require('../synths/fractal/engines/complex-fractal');
const { StrangeAttractorDSP } = require('../synths/fractal/engines/strange-attractor');
const { HyperDroneEngine } = require('../synths/fractal/engines/hyper-drone');
const { OpticalImageEngine } = require('../synths/fractal/engines/optical-image');
const { CellularAutomataEngine } = require('../synths/fractal/engines/cellular-automata');

const { EnvelopeModule } = require('../modules/envelope');
const { DetuneModule } = require('../modules/detune');
const { LFOModule, LFO_TARGET_DEFINITIONS } = require('../modules/lfo');
const { ArpeggiatorModule } = require('../modules/arpeggiator');

const { FilterEffect } = require('../effects/filter');
const { WavefolderEffect } = require('../effects/wavefolder');
const { ChorusEffect } = require('../effects/chorus');
const { PingPongDelayEffect } = require('../effects/delay');
const { ReverbEffect } = require('../effects/reverb');
const { LimiterEffect } = require('../effects/limiter');
const { AudioFXEngine } = require('../effects/fx-engine');

const { VisualizerSuite } = require('../visualizers/visualizer-suite');
const { Fractal2DCanvas } = require('../visualizers/fractal-2d-canvas');

describe('Modular Architecture, AudioBus Routing & CPU Efficiency Tests', () => {
  it('exports all 24 extracted modules cleanly via UMD', () => {
    assert.ok(TWO_PI > 6.28 && PHI > 1.618);
    assert.equal(typeof midiToFreq, 'function');
    assert.ok(MUSICAL_SCALES);
    assert.equal(typeof AudioBus, 'function');
    assert.equal(typeof RotaryKnob, 'function');
    assert.equal(typeof isTypingInText, 'function');
    assert.equal(typeof PianoKeyboard, 'function');
    assert.equal(typeof WebMIDIManager, 'function');
    assert.equal(typeof AudioRecorder, 'function');
    assert.equal(typeof PresetManager, 'function');
    assert.equal(typeof PolyphonicVoiceManager, 'function');
    assert.equal(typeof SynthFramework, 'function');

    // 6 Sound Engines
    assert.equal(typeof PolottiFAS.getEngineDescriptor, 'function');
    assert.equal(typeof ComplexFractalEngine.getEngineDescriptor, 'function');
    assert.equal(typeof StrangeAttractorDSP.getEngineDescriptor, 'function');
    assert.equal(typeof HyperDroneEngine.getEngineDescriptor, 'function');
    assert.equal(typeof OpticalImageEngine.getEngineDescriptor, 'function');
    assert.equal(typeof CellularAutomataEngine.getEngineDescriptor, 'function');

    // 4 Voice & Modulation Modules
    assert.equal(typeof EnvelopeModule.createVoiceEnvelope, 'function');
    assert.equal(typeof DetuneModule.getUnisonLayout, 'function');
    assert.equal(typeof LFOModule.computeWaveform, 'function');
    assert.ok(LFO_TARGET_DEFINITIONS.polotti_fas);
    assert.equal(typeof ArpeggiatorModule.selectStepNote, 'function');

    // 6 Effect Stages + FX Engine
    assert.equal(typeof FilterEffect, 'function');
    assert.equal(typeof WavefolderEffect, 'function');
    assert.equal(typeof ChorusEffect, 'function');
    assert.equal(typeof PingPongDelayEffect, 'function');
    assert.equal(typeof ReverbEffect, 'function');
    assert.equal(typeof LimiterEffect, 'function');
    assert.equal(typeof AudioFXEngine, 'function');

    // 2 Visualizer Modules
    assert.equal(typeof VisualizerSuite, 'function');
    assert.equal(typeof Fractal2DCanvas, 'function');
  });

  it('propagates audio through AudioBus from voice entry across all effect stages to destination and taps', () => {
    const ctx = new MockAudioContext();
    const bus = new AudioBus(ctx);

    const filterStage = new FilterEffect(ctx);
    const wavefolderStage = new WavefolderEffect(ctx);
    const chorusStage = new ChorusEffect(ctx);
    const delayStage = new PingPongDelayEffect(ctx);
    const reverbStage = new ReverbEffect(ctx);
    const limiterStage = new LimiterEffect(ctx);

    bus.setStages([
      filterStage,
      wavefolderStage,
      chorusStage,
      delayStage,
      reverbStage,
      limiterStage
    ]);

    // Verify entry node is filterStage.inputNode
    assert.equal(bus.getVoiceEntryNode(), filterStage.inputNode);

    // Verify serial stage chaining on native Web Audio nodes
    assert.equal(filterStage.outputNode.connections[0].dest, wavefolderStage.inputNode);
    assert.equal(wavefolderStage.outputNode.connections[0].dest, chorusStage.inputNode);
    assert.equal(chorusStage.outputNode.connections[0].dest, delayStage.inputNode);
    assert.equal(delayStage.outputNode.connections[0].dest, reverbStage.inputNode);
    assert.equal(reverbStage.outputNode.connections[0].dest, limiterStage.inputNode);
    assert.equal(limiterStage.outputNode.connections[0].dest, bus.masterGain);

    // Verify masterGain -> analyserNode -> destination
    assert.equal(bus.masterGain.connections[0].dest, bus.analyserNode);
    assert.equal(bus.analyserNode.connections[0].dest, ctx.destination);

    // Route a voice through the bus
    const voiceMerger = ctx.createGain();
    const voiceEnvelope = EnvelopeModule.createVoiceEnvelope(ctx, 0.9, { attack: 0.02, decay: 0.1, sustain: 0.8 });
    bus.routeVoice(voiceMerger, voiceEnvelope);

    assert.equal(voiceMerger.connections[0].dest, voiceEnvelope);
    assert.equal(voiceEnvelope.connections[0].dest, filterStage.inputNode);

    // Connect a recorder tap
    const tap = ctx.createMediaStreamDestination();
    bus.connectTap(tap);
    assert.ok(bus.taps.has(tap));
    assert.ok(bus.masterGain.connections.some(c => c.dest === tap));

    // Set master volume
    bus.setMasterVolume(0.65);
    assert.ok(Math.abs(bus.masterGain.gain.value - 0.65) < 1e-6);
  });

  it('caches Wavefolder curves and Reverb impulse buffers when parameters are unchanged to save CPU', () => {
    const ctx = new MockAudioContext();

    // 1. Wavefolder curve caching
    const wf = new WavefolderEffect(ctx);
    wf.updateCurve(0.4);
    const firstCurveRef = wf.wavefolderNode.curve;
    wf.updateCurve(0.4); // Same drive amount
    assert.equal(wf.wavefolderNode.curve, firstCurveRef, 'Wavefolder should reuse cached Float32Array when driveAmount is unchanged');
    wf.updateCurve(0.7); // Different drive amount
    assert.notEqual(wf.wavefolderNode.curve, firstCurveRef, 'Wavefolder should compute new curve when driveAmount changes');

    // 2. Reverb impulse buffer caching
    const rev = new ReverbEffect(ctx);
    rev.updateImpulse(2.5, 2.0);
    const firstBufferRef = rev.convolverNode.buffer;
    rev.updateImpulse(2.5, 2.0); // Same duration & decay
    assert.equal(rev.convolverNode.buffer, firstBufferRef, 'Reverb should reuse cached AudioBuffer when duration and decay are unchanged');
    rev.updateImpulse(3.5, 2.0); // New duration
    assert.notEqual(rev.convolverNode.buffer, firstBufferRef, 'Reverb should generate new AudioBuffer when duration changes');
  });
});
