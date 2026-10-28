/**
 * Deterministic Browser DOM, Canvas 2D, Web MIDI & Web Audio API Test Harness
 * Executes the synthesizer scripts inside a shared browser-like VM context
 * loaded directly from index.html <script> tags.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
    this.defaultValue = defaultValue;
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: 'setValueAtTime', value, time });
  }

  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: 'linearRampToValueAtTime', value, time });
  }

  exponentialRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: 'exponentialRampToValueAtTime', value, time });
  }

  setTargetAtTime(value, time, timeConstant) {
    this.value = value;
    this.events.push({ type: 'setTargetAtTime', value, time, timeConstant });
  }

  cancelScheduledValues(time) {
    this.events.push({ type: 'cancelScheduledValues', time });
  }
}

class MockAudioNode {
  constructor(name, ctx) {
    this.nodeType = name;
    this.context = ctx;
    this.connections = [];
    this.disconnected = false;
  }

  connect(dest, output = 0, input = 0) {
    this.connections.push({ dest, output, input });
    return dest;
  }

  disconnect() {
    this.disconnected = true;
    this.connections = [];
  }
}

class MockAudioBuffer {
  constructor(numberOfChannels, length, sampleRate) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = [];
    for (let c = 0; c < numberOfChannels; c++) {
      this.channels.push(new Float32Array(length));
    }
  }

  getChannelData(channel) {
    return this.channels[channel];
  }
}

class MockPeriodicWave {
  constructor(real, imag) {
    this.real = new Float32Array(real);
    this.imag = new Float32Array(imag);
  }
}

class MockAudioContext {
  constructor() {
    this.sampleRate = 44100;
    this.currentTime = 0.0;
    this.state = 'running';
    this.destination = new MockAudioNode('AudioDestinationNode', this);
    this.createdNodes = [];
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }

  createPeriodicWave(real, imag) {
    return new MockPeriodicWave(real, imag);
  }

  createBuffer(numberOfChannels, length, sampleRate) {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource() {
    const node = new MockAudioNode('AudioBufferSourceNode', this);
    node.buffer = null;
    node.loop = false;
    node.playbackRate = new MockAudioParam(1.0);
    node.started = false;
    node.stopped = false;
    node.start = (when = 0) => { node.started = true; node.startTime = when; };
    node.stop = (when = 0) => { node.stopped = true; node.stopTime = when; };
    this.createdNodes.push(node);
    return node;
  }

  createOscillator() {
    const node = new MockAudioNode('OscillatorNode', this);
    node.type = 'sine';
    node.frequency = new MockAudioParam(440);
    node.detune = new MockAudioParam(0);
    node.periodicWave = null;
    node.started = false;
    node.stopped = false;
    node.setPeriodicWave = (wave) => {
      node.periodicWave = wave;
      node.type = 'custom';
    };
    node.start = (when = 0) => { node.started = true; node.startTime = when; };
    node.stop = (when = 0) => { node.stopped = true; node.stopTime = when; };
    this.createdNodes.push(node);
    return node;
  }

  createGain() {
    const node = new MockAudioNode('GainNode', this);
    node.gain = new MockAudioParam(1.0);
    this.createdNodes.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new MockAudioNode('BiquadFilterNode', this);
    node.type = 'lowpass';
    node.frequency = new MockAudioParam(350);
    node.Q = new MockAudioParam(1.0);
    node.gain = new MockAudioParam(0.0);
    this.createdNodes.push(node);
    return node;
  }

  createWaveShaper() {
    const node = new MockAudioNode('WaveShaperNode', this);
    node.curve = null;
    node.oversample = 'none';
    this.createdNodes.push(node);
    return node;
  }

  createDelay(maxDelayTime = 1.0) {
    const node = new MockAudioNode('DelayNode', this);
    node.maxDelayTime = maxDelayTime;
    node.delayTime = new MockAudioParam(0.0);
    this.createdNodes.push(node);
    return node;
  }

  createConvolver() {
    const node = new MockAudioNode('ConvolverNode', this);
    node.buffer = null;
    node.normalize = true;
    this.createdNodes.push(node);
    return node;
  }

  createDynamicsCompressor() {
    const node = new MockAudioNode('DynamicsCompressorNode', this);
    node.threshold = new MockAudioParam(-24);
    node.knee = new MockAudioParam(30);
    node.ratio = new MockAudioParam(12);
    node.attack = new MockAudioParam(0.003);
    node.release = new MockAudioParam(0.25);
    this.createdNodes.push(node);
    return node;
  }

  createChannelMerger(numberOfInputs = 2) {
    const node = new MockAudioNode('ChannelMergerNode', this);
    node.numberOfInputs = numberOfInputs;
    this.createdNodes.push(node);
    return node;
  }

  createStereoPanner() {
    const node = new MockAudioNode('StereoPannerNode', this);
    node.pan = new MockAudioParam(0.0);
    this.createdNodes.push(node);
    return node;
  }

  createAnalyser() {
    const node = new MockAudioNode('AnalyserNode', this);
    node.fftSize = 2048;
    Object.defineProperty(node, 'frequencyBinCount', {
      get() { return Math.floor(node.fftSize / 2); }
    });
    node.smoothingTimeConstant = 0.8;
    node.getByteFrequencyData = (array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(128 * Math.exp(-i / 64));
      }
    };
    node.getByteTimeDomainData = (array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(128 + 60 * Math.sin((2 * Math.PI * i) / 64));
      }
    };
    this.createdNodes.push(node);
    return node;
  }

  createMediaStreamDestination() {
    const node = new MockAudioNode('MediaStreamAudioDestinationNode', this);
    node.stream = { id: 'mock-media-stream' };
    this.createdNodes.push(node);
    return node;
  }
}

class MockCanvas2DContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
    this.drawCalls = [];
    const w = canvas.width || 300;
    const h = canvas.height || 150;
    this._pixelBuffer = new Uint8ClampedArray(w * h * 4);
  }

  _ensureBuffer() {
    const w = this.canvas.width || 300;
    const h = this.canvas.height || 150;
    if (this._pixelBuffer.length !== w * h * 4) {
      this._pixelBuffer = new Uint8ClampedArray(w * h * 4);
    }
  }

  createImageData(w, h) {
    return {
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4)
    };
  }

  putImageData(imgData, dx, dy) {
    this._ensureBuffer();
    if (imgData && imgData.data) {
      const len = Math.min(this._pixelBuffer.length, imgData.data.length);
      this._pixelBuffer.set(imgData.data.subarray(0, len));
    }
    this.drawCalls.push({ op: 'putImageData', dx, dy });
  }

  getImageData(sx, sy, sw, sh) {
    this._ensureBuffer();
    const out = new Uint8ClampedArray(sw * sh * 4);
    const len = Math.min(out.length, this._pixelBuffer.length);
    out.set(this._pixelBuffer.subarray(0, len));
    return { width: sw, height: sh, data: out };
  }

  drawImage(img, ...args) {
    this.drawCalls.push({ op: 'drawImage', args });
  }

  fillRect(x, y, w, h) {
    this.drawCalls.push({ op: 'fillRect', x, y, w, h });
  }

  strokeRect(x, y, w, h) {
    this.drawCalls.push({ op: 'strokeRect', x, y, w, h });
  }

  clearRect(x, y, w, h) {
    this.drawCalls.push({ op: 'clearRect', x, y, w, h });
  }

  beginPath() { this.drawCalls.push({ op: 'beginPath' }); }
  moveTo(x, y) { this.drawCalls.push({ op: 'moveTo', x, y }); }
  lineTo(x, y) { this.drawCalls.push({ op: 'lineTo', x, y }); }
  arc(x, y, r, s, e) { this.drawCalls.push({ op: 'arc', x, y, r, s, e }); }
  stroke() { this.drawCalls.push({ op: 'stroke' }); }
  fill() { this.drawCalls.push({ op: 'fill' }); }
  fillText(text, x, y) { this.drawCalls.push({ op: 'fillText', text, x, y }); }
  save() { this.drawCalls.push({ op: 'save' }); }
  restore() { this.drawCalls.push({ op: 'restore' }); }

  createLinearGradient(x0, y0, x1, y1) {
    return {
      addColorStop: () => {}
    };
  }
}

class MockElement {
  constructor(tagName = 'DIV', doc = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = doc;
    this.id = '';
    this.name = '';
    this.type = '';
    this.value = '';
    this.checked = false;
    this.selected = false;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parentElement = null;
    this.listeners = {};
    this._className = '';
    this._classSet = new Set();
    this._innerText = '';
    this._innerHTML = '';
    this.width = this.tagName === 'CANVAS' ? 300 : 100;
    this.height = this.tagName === 'CANVAS' ? 150 : 40;
    this._ctx2d = null;

    this.classList = {
      add: (...cls) => cls.forEach(c => { if (c) this._classSet.add(c); }),
      remove: (...cls) => cls.forEach(c => this._classSet.delete(c)),
      contains: (c) => this._classSet.has(c),
      toggle: (c) => {
        if (this._classSet.has(c)) { this._classSet.delete(c); return false; }
        this._classSet.add(c); return true;
      }
    };
  }

  get className() {
    return Array.from(this._classSet).join(' ');
  }

  set className(val) {
    this._className = val || '';
    this._classSet = new Set((val || '').split(/\s+/).filter(Boolean));
  }

  get innerText() {
    return this._innerText;
  }

  set innerText(val) {
    this._innerText = String(val ?? '');
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = String(val ?? '');
    if (val === '') {
      this.children = [];
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    if (this.ownerDocument && child.id) {
      this.ownerDocument._registerElement(child);
    }
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION') {
      if (child.selected || this.value === '') {
        this.value = child.value;
      }
    }
    return child;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  dispatchEvent(event) {
    const evt = {
      target: this,
      currentTarget: this,
      preventDefault: () => {},
      stopPropagation: () => {},
      clientX: 50,
      clientY: 25,
      deltaY: -10,
      ...event
    };
    const handlers = this.listeners[evt.type] || [];
    handlers.forEach(fn => fn(evt));
  }

  click(extra = {}) {
    this.dispatchEvent({ type: 'click', ...extra });
  }

  blur() {
    if (this.ownerDocument && this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr._matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: this.width || 200,
      height: this.height || 100
    };
  }

  getContext(type) {
    if (type === '2d') {
      if (!this._ctx2d) {
        this._ctx2d = new MockCanvas2DContext(this);
      }
      return this._ctx2d;
    }
    return null;
  }

  _matches(selector) {
    const parts = selector.split(',').map(s => s.trim());
    for (const part of parts) {
      if (part.startsWith('#')) {
        if (this.id === part.slice(1)) return true;
      } else if (part.startsWith('.')) {
        const clsMatch = part.match(/^\.([\w-]+)(?:\[data-note="(\d+)"\])?$/);
        if (clsMatch) {
          const hasCls = this.classList.contains(clsMatch[1]);
          if (!hasCls) continue;
          if (clsMatch[2] !== undefined) {
            if (String(this.dataset.note) === clsMatch[2]) return true;
          } else {
            return true;
          }
        }
      } else if (part.startsWith('input[name="synth-mode-v2"]')) {
        if (this.tagName === 'INPUT' && this.name === 'synth-mode-v2') {
          const valMatch = part.match(/\[value="([^"]+)"\]/);
          if (!valMatch || this.value === valMatch[1]) return true;
        }
      } else if (this.tagName === part.toUpperCase()) {
        return true;
      }
    }
    return false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child._matches(selector)) results.push(child);
        visit(child);
      }
    };
    visit(this);
    return results;
  }
}

class MockDocument {
  constructor() {
    this.readyState = 'complete';
    this.elementsById = new Map();
    this.allElements = [];
    this.body = new MockElement('BODY', this);
    this.activeElement = this.body;
    this.listeners = {};
  }

  createElement(tag) {
    const el = new MockElement(tag, this);
    this.allElements.push(el);
    return el;
  }

  _registerElement(el) {
    if (el.id) this.elementsById.set(el.id, el);
    if (!this.allElements.includes(el)) this.allElements.push(el);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return this.allElements.filter(el => el._matches(selector));
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }
}

function populateDOMFromHTML(doc, htmlContent) {
  // Parse all elements with id="..."
  const tagRegex = /<([a-zA-Z0-9]+)\s+([^>]+)>/g;
  let match;
  while ((match = tagRegex.exec(htmlContent)) !== null) {
    const tag = match[1].toUpperCase();
    const attrs = match[2];

    const idMatch = attrs.match(/\bid="([^"]+)"/);
    const classMatch = attrs.match(/\bclass="([^"]+)"/);
    const nameMatch = attrs.match(/\bname="([^"]+)"/);
    const valueMatch = attrs.match(/\bvalue="([^"]+)"/);
    const typeMatch = attrs.match(/\btype="([^"]+)"/);
    const widthMatch = attrs.match(/\bwidth="(\d+)"/);
    const heightMatch = attrs.match(/\bheight="(\d+)"/);
    const vizMatch = attrs.match(/\bdata-viz="([^"]+)"/);
    const checked = /\bchecked\b/.test(attrs);

    if (idMatch || classMatch || nameMatch || vizMatch) {
      const el = doc.createElement(tag);
      if (idMatch) el.id = idMatch[1];
      if (classMatch) el.className = classMatch[1];
      if (nameMatch) el.name = nameMatch[1];
      if (valueMatch) el.value = valueMatch[1];
      if (typeMatch) el.type = typeMatch[1];
      if (widthMatch) el.width = parseInt(widthMatch[1], 10);
      if (heightMatch) el.height = parseInt(heightMatch[1], 10);
      if (vizMatch) el.dataset.viz = vizMatch[1];
      el.checked = checked;

      // If it is a knob-control, attach child .knob-progress and .knob-val
      if (el.classList.contains('knob-control')) {
        const progress = doc.createElement('CIRCLE');
        progress.className = 'knob-progress';
        const valSpan = doc.createElement('SPAN');
        valSpan.className = 'knob-val';
        el.appendChild(progress);
        el.appendChild(valSpan);
      }

      doc._registerElement(el);
      doc.body.appendChild(el);
    }
  }
}

function createSynthTestEnv(projectDir = path.resolve(__dirname, '..'), htmlFilename = 'fractalsynths.html') {
  const indexHtmlPath = path.join(projectDir, htmlFilename);
  const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

  const doc = new MockDocument();
  populateDOMFromHTML(doc, htmlContent);

  const windowListeners = {};
  const rafCallbacks = [];
  let midiInputDevice = {
    name: 'Virtual Test MIDI Keyboard',
    onmidimessage: null
  };

  class MockMediaRecorder {
    constructor(stream) {
      this.stream = stream;
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      if (this.ondataavailable) {
        this.ondataavailable({ data: { size: 1024 } });
      }
      if (this.onstop) {
        this.onstop();
      }
    }
  }

  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Array,
    Object,
    Set,
    Map,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    Promise,
    Float32Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Int32Array,
    parseFloat,
    parseInt,
    isNaN,
    isFinite,
    setTimeout: (fn, delay) => {
      // Track scheduled timeouts without hanging tests
      sandbox._scheduledTimeouts.push({ fn, delay });
      return sandbox._scheduledTimeouts.length;
    },
    clearTimeout: () => {},
    performance: {
      now: () => 1000
    },
    requestAnimationFrame: (cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    },
    prompt: () => null,
    Blob: class MockBlob {
      constructor(parts, opts) {
        this.parts = parts;
        this.type = opts ? opts.type : '';
      }
    },
    URL: {
      createObjectURL: () => 'blob:mock-wav-url',
      revokeObjectURL: () => {}
    },
    MediaRecorder: MockMediaRecorder,
    FileReader: class MockFileReader {
      readAsDataURL() {
        if (this.onload) this.onload({ target: { result: 'data:image/png;base64,AAA' } });
      }
    },
    Image: class MockImage {
      constructor() {
        this.width = 100;
        this.height = 100;
      }
      set src(val) {
        this._src = val;
        if (this.onload) this.onload();
      }
    },
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    navigator: {
      requestMIDIAccess: () => Promise.resolve({
        inputs: new Map([['input-1', midiInputDevice]])
      })
    },
    document: doc,
    devicePixelRatio: 1,
    addEventListener: (type, fn) => {
      if (!windowListeners[type]) windowListeners[type] = [];
      windowListeners[type].push(fn);
    },
    dispatchWindowEvent: (evt) => {
      const handlers = windowListeners[evt.type] || [];
      handlers.forEach(fn => fn({
        preventDefault: () => {},
        stopPropagation: () => {},
        target: doc.body,
        ...evt
      }));
    },
    _scheduledTimeouts: [],
    _rafCallbacks: rafCallbacks,
    _midiInputDevice: midiInputDevice,
    _MockAudioContext: MockAudioContext
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);

  // Extract all <script src="..."> in order from index.html
  const scriptRegex = /<script[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g;
  const loadedScripts = [];
  let scriptMatch;
  while ((scriptMatch = scriptRegex.exec(htmlContent)) !== null) {
    const relPath = scriptMatch[1];
    const fullPath = path.join(projectDir, relPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, context, { filename: fullPath });
    loadedScripts.push(relPath);
  }

  // Helper to evaluate expressions inside the VM lexical scope
  const evaluate = (expr) => vm.runInContext(expr, context);

  return {
    sandbox,
    context,
    doc,
    loadedScripts,
    evaluate,
    flushTimeouts: () => {
      const pending = [...sandbox._scheduledTimeouts];
      sandbox._scheduledTimeouts.length = 0;
      pending.forEach(t => t.fn());
    },
    stepAnimationFrame: (timestampMs = 1000) => {
      const currentCbs = [...rafCallbacks];
      rafCallbacks.length = 0;
      currentCbs.forEach(cb => cb(timestampMs));
    }
  };
}

module.exports = {
  createSynthTestEnv,
  MockAudioContext,
  MockAudioNode,
  MockAudioParam,
  MockPeriodicWave,
  MockAudioBuffer
};
