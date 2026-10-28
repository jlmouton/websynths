/**
 * Fractal Sound Engine v2.0 — Preset Bank, Patch Mutator & State A/B Manager
 *
 * Manages loading factory presets, 25% randomized patch mutation, and Slot A store/recall.
 */
(function (root) {
  'use strict';

  class PresetManager {
    /**
     * Applies a preset object to synthParams, fxParams, and arpParams, and synchronizes all UI controls & active voices.
     * @param {Object} preset
     * @param {Object} context
     */
    static loadPreset(preset, context = {}) {
      if (!preset || !preset.params) return;
      const {
        synthParams,
        fxParams,
        arpParams,
        syncKnobValuesFromParams,
        updateLFOTargetOptions,
        renderImageTexture,
        fxEngine,
        voiceManager,
        visualizerSuite,
        fractalCanvas2D
      } = context;

      if (synthParams) Object.assign(synthParams, preset.params);
      if (fxParams) Object.assign(fxParams, preset.params);

      if (arpParams) {
        if (preset.params.arpMode) {
          arpParams.mode = preset.params.arpMode;
        }
        if (preset.params.arpRate) {
          if (typeof preset.params.arpRate === 'string') {
            if (preset.params.arpRate === '16n') arpParams.division = 0.25;
            else if (preset.params.arpRate === '8n') arpParams.division = 0.5;
            else if (preset.params.arpRate === '4n') arpParams.division = 1.0;
            else if (preset.params.arpRate === '32n') arpParams.division = 0.125;
            const num = parseFloat(preset.params.arpRate);
            if (!isNaN(num) && num > 0) arpParams.rate = num;
          } else if (typeof preset.params.arpRate === 'number') {
            arpParams.rate = preset.params.arpRate;
          }
        }
        if (preset.params.arpOctaves) {
          arpParams.octaves = preset.params.arpOctaves;
        }
        if (preset.params.arpEnabled !== undefined) {
          arpParams.enabled = preset.params.arpEnabled;
          if (typeof document !== 'undefined') {
            const toggleArp = document.getElementById('toggle-arp-v2');
            if (toggleArp) toggleArp.checked = arpParams.enabled;
          }
        }
      }

      if (syncKnobValuesFromParams) syncKnobValuesFromParams();

      if (typeof document !== 'undefined' && synthParams) {
        const modeRadio = document.querySelector(`input[name="synth-mode-v2"][value="${synthParams.mode}"]`);
        if (modeRadio) modeRadio.checked = true;

        document.querySelectorAll('.mode-panel-v2').forEach(panel => panel.classList.add('hidden'));
        const targetPanel = document.getElementById(`panel-${synthParams.mode}-v2`);
        if (targetPanel) targetPanel.classList.remove('hidden');

        const setSelect = document.getElementById('fractal-set-select-v2');
        if (setSelect && synthParams.fractalSet) setSelect.value = synthParams.fractalSet;

        const attractorSelect = document.getElementById('attractor-type-select-v2');
        if (attractorSelect && synthParams.attractorType) attractorSelect.value = synthParams.attractorType;

        const subWaveSelect = document.getElementById('sub-wave-select-v2');
        if (subWaveSelect && synthParams.subWave) subWaveSelect.value = synthParams.subWave;

        const subOctSelect = document.getElementById('sub-octave-select-v2');
        if (subOctSelect && synthParams.subOctave) subOctSelect.value = String(synthParams.subOctave);

        const arpModeSelect = document.getElementById('arp-mode-select-v2');
        if (arpModeSelect && arpParams && arpParams.mode) arpModeSelect.value = arpParams.mode;

        const lfoShapeSelect = document.getElementById('lfo-shape-select-v2');
        if (lfoShapeSelect && synthParams.modLfoShape) lfoShapeSelect.value = synthParams.modLfoShape;

        if (updateLFOTargetOptions) updateLFOTargetOptions(synthParams.mode || 'polotti_fas');
        const lfoTargetSelect = document.getElementById('lfo-target-select-v2');
        if (lfoTargetSelect && synthParams.modLfoTarget) lfoTargetSelect.value = synthParams.modLfoTarget;

        const filterTypeSelect = document.getElementById('filter-type-select-v2');
        if (filterTypeSelect && synthParams.filterType) filterTypeSelect.value = synthParams.filterType;

        const toggleUnison = document.getElementById('toggle-unison-v2');
        if (toggleUnison) toggleUnison.checked = synthParams.unisonEnabled !== false;

        const toggleMasterFX = document.getElementById('toggle-fx-master-v2');
        if (toggleMasterFX && fxParams) toggleMasterFX.checked = fxParams.fxEnabled !== false;

        const imagePresetSelect = document.getElementById('image-preset-select-v2');
        if (imagePresetSelect && synthParams.imagePreset) imagePresetSelect.value = synthParams.imagePreset;

        const imageScanSelect = document.getElementById('image-scan-mode-v2');
        if (imageScanSelect && synthParams.imageScanMode) imageScanSelect.value = synthParams.imageScanMode;

        const lblPreset = document.getElementById('lbl-current-preset-v2');
        if (lblPreset) lblPreset.innerText = preset.name;
      }

      if (renderImageTexture && synthParams) {
        renderImageTexture(synthParams.imagePreset || 'preset_nebula');
      }

      if (fxEngine) {
        fxEngine.updateParams(fxParams, synthParams);
      }

      if (voiceManager) {
        voiceManager.updateActiveVoices(synthParams, true);
      }

      if (visualizerSuite && visualizerSuite.onPresetChanged) {
        visualizerSuite.onPresetChanged(preset, synthParams);
      }

      if (fractalCanvas2D) {
        fractalCanvas2D.render(synthParams);
      }
    }

    /**
     * Mutates key synthesis parameters by +/- 25%.
     * @param {Object} synthParams
     * @param {number} [amount=0.25]
     */
    static mutatePatch(synthParams, amount = 0.25) {
      if (!synthParams) return;
      synthParams.cutoff = Math.round(Math.max(100, Math.min(12000, synthParams.cutoff * (1 + (Math.random() * 2 - 1) * amount))));
      synthParams.fasDimension = parseFloat(Math.max(1.0, Math.min(1.9, (synthParams.fasDimension || 1.35) + (Math.random() * 2 - 1) * amount * 0.4)).toFixed(2));
      synthParams.fasGamma = parseFloat(Math.max(1.1, Math.min(3.5, (synthParams.fasGamma || 2.0) + (Math.random() * 2 - 1) * amount)).toFixed(3));
      synthParams.cReal = parseFloat(Math.max(-1.8, Math.min(0.8, (synthParams.cReal || -0.7) + (Math.random() * 2 - 1) * amount * 0.3)).toFixed(2));
      synthParams.cImag = parseFloat(Math.max(-1.0, Math.min(1.0, (synthParams.cImag || 0.27) + (Math.random() * 2 - 1) * amount * 0.3)).toFixed(2));
      synthParams.unisonDetune = Math.round(Math.max(0, Math.min(50, (synthParams.unisonDetune || 15) * (1 + (Math.random() * 2 - 1) * amount))));
      synthParams.attack = parseFloat(Math.max(0.005, Math.min(2.0, (synthParams.attack || 0.04) * (1 + (Math.random() * 2 - 1) * amount))).toFixed(3));
      synthParams.decay = parseFloat(Math.max(0.01, Math.min(2.5, (synthParams.decay || 0.18) * (1 + (Math.random() * 2 - 1) * amount))).toFixed(3));
    }
  }

  root.PresetManager = PresetManager;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PresetManager };
  }
})(typeof window !== 'undefined' ? window : globalThis);
