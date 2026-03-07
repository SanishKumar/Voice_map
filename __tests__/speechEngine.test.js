/**
 * speechEngine.test.js — unit tests for src/speechEngine.js
 *
 * SpeechEngine depends on browser globals (window.SpeechRecognition,
 * window.speechCommands). These are mocked here for Node / Jest.
 */

import { jest } from '@jest/globals';
import { SpeechEngine, ENGINE_TYPE } from '../src/speechEngine.js';

// ---------------------------------------------------------------------------
// Helpers / mock factory
// ---------------------------------------------------------------------------

/** Create a minimal mock of the TF.js speech-commands recognizer. */
function makeTfjsMock() {
  return {
    ensureModelLoaded: jest.fn().mockResolvedValue(undefined),
    listen: jest.fn(),
    stopListening: jest.fn(),
    isListening: jest.fn().mockReturnValue(false),
    wordLabels: jest.fn().mockReturnValue(['_background_noise_', '_unknown_', 'up', 'down', 'left', 'right']),
  };
}

/** Install a mock of window.speechCommands. */
function installTfjsMock(recognizerMock) {
  globalThis.window = globalThis.window || {};
  globalThis.window.speechCommands = {
    create: jest.fn().mockReturnValue(recognizerMock),
  };
}

/** Create a minimal Web Speech API mock. */
function installWebSpeechMock() {
  const rec = {
    continuous: false,
    interimResults: false,
    lang: '',
    maxAlternatives: 1,
    start: jest.fn(),
    stop: jest.fn(),
    onresult: null,
    onerror: null,
    onend: null,
  };
  const MockRecognition = jest.fn(() => rec);
  globalThis.window = globalThis.window || {};
  globalThis.window.SpeechRecognition = MockRecognition;
  delete globalThis.window.webkitSpeechRecognition;
  return rec;
}

// ---------------------------------------------------------------------------
// ENGINE_TYPE constant
// ---------------------------------------------------------------------------

describe('ENGINE_TYPE', () => {
  test('has WEB_SPEECH and TFJS values', () => {
    expect(ENGINE_TYPE.WEB_SPEECH).toBe('webspeech');
    expect(ENGINE_TYPE.TFJS).toBe('tfjs');
  });
});

// ---------------------------------------------------------------------------
// Constructor defaults
// ---------------------------------------------------------------------------

describe('SpeechEngine — constructor', () => {
  test('defaults to Web Speech API engine', () => {
    const e = new SpeechEngine({});
    expect(e.engineType).toBe(ENGINE_TYPE.WEB_SPEECH);
  });

  test('raises tfjsThreshold default to 0.85', () => {
    const e = new SpeechEngine({});
    expect(e.tfjsThreshold).toBe(0.85);
  });

  test('tfjsCooldownMs defaults to 1500', () => {
    const e = new SpeechEngine({});
    expect(e.tfjsCooldownMs).toBe(1500);
  });

  test('accepts custom threshold', () => {
    const e = new SpeechEngine({ tfjsThreshold: 0.9 });
    expect(e.tfjsThreshold).toBe(0.9);
  });

  test('accepts custom cooldown', () => {
    const e = new SpeechEngine({ tfjsCooldownMs: 2000 });
    expect(e.tfjsCooldownMs).toBe(2000);
  });

  test('isListening starts false', () => {
    const e = new SpeechEngine({});
    expect(e.isListening).toBe(false);
  });

  test('isInitialized starts false', () => {
    const e = new SpeechEngine({});
    expect(e.isInitialized).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// init — Web Speech API
// ---------------------------------------------------------------------------

describe('SpeechEngine — init() Web Speech', () => {
  beforeEach(() => installWebSpeechMock());

  test('sets isInitialized to true', async () => {
    const e = new SpeechEngine({ engine: ENGINE_TYPE.WEB_SPEECH });
    await e.init();
    expect(e.isInitialized).toBe(true);
  });

  test('throws if Web Speech API not available', async () => {
    delete globalThis.window.SpeechRecognition;
    delete globalThis.window.webkitSpeechRecognition;
    const e = new SpeechEngine({ engine: ENGINE_TYPE.WEB_SPEECH });
    await expect(e.init()).rejects.toThrow(/not supported/i);
  });
});

// ---------------------------------------------------------------------------
// init — TF.js
// ---------------------------------------------------------------------------

describe('SpeechEngine — init() TF.js', () => {
  let mockRecognizer;

  beforeEach(() => {
    mockRecognizer = makeTfjsMock();
    installTfjsMock(mockRecognizer);
  });

  test('loads the model and sets isInitialized', async () => {
    const e = new SpeechEngine({ engine: ENGINE_TYPE.TFJS });
    await e.init();
    expect(mockRecognizer.ensureModelLoaded).toHaveBeenCalledTimes(1);
    expect(e.isInitialized).toBe(true);
  });

  test('throws if speechCommands global is missing', async () => {
    delete globalThis.window.speechCommands;
    const e = new SpeechEngine({ engine: ENGINE_TYPE.TFJS });
    await expect(e.init()).rejects.toThrow(/not loaded/i);
  });
});

// ---------------------------------------------------------------------------
// start / stop / toggle
// ---------------------------------------------------------------------------

describe('SpeechEngine — start/stop (Web Speech)', () => {
  let recMock;

  beforeEach(() => {
    recMock = installWebSpeechMock();
  });

  test('calling start() before init() fires onError', () => {
    const onError = jest.fn();
    const e = new SpeechEngine({ engine: ENGINE_TYPE.WEB_SPEECH, onError });
    e.start();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toMatch(/not initialised/i);
  });

  test('start() sets isListening and calls onStart', async () => {
    const onStart = jest.fn();
    const e = new SpeechEngine({ engine: ENGINE_TYPE.WEB_SPEECH, onStart });
    await e.init();
    e.start();
    expect(e.isListening).toBe(true);
    expect(onStart).toHaveBeenCalled();
  });

  test('stop() clears isListening and calls onEnd', async () => {
    const onEnd = jest.fn();
    const e = new SpeechEngine({ engine: ENGINE_TYPE.WEB_SPEECH, onEnd });
    await e.init();
    e.start();
    e.stop();
    expect(e.isListening).toBe(false);
    expect(onEnd).toHaveBeenCalled();
  });

  test('toggle() starts then stops', async () => {
    const e = new SpeechEngine({ engine: ENGINE_TYPE.WEB_SPEECH });
    await e.init();
    e.toggle();
    expect(e.isListening).toBe(true);
    e.toggle();
    expect(e.isListening).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TF.js debouncing
// ---------------------------------------------------------------------------

describe('SpeechEngine — TF.js debounce', () => {
  let mockRecognizer;
  let capturedCallback;

  beforeEach(() => {
    mockRecognizer = makeTfjsMock();
    // Capture the listen callback so we can invoke it directly in tests.
    mockRecognizer.listen = jest.fn((cb) => { capturedCallback = cb; });
    mockRecognizer.isListening = jest.fn().mockReturnValue(true);
    installTfjsMock(mockRecognizer);
  });

  /** Fire a TF.js result frame with the given word at max score. */
  function fireWord(word, score = 0.95) {
    const words = mockRecognizer.wordLabels();
    const scores = new Array(words.length).fill(0);
    const idx = words.indexOf(word);
    if (idx !== -1) scores[idx] = score;
    capturedCallback({ scores });
  }

  test('fires onResult for a high-confidence word', async () => {
    const onResult = jest.fn();
    const e = new SpeechEngine({
      engine: ENGINE_TYPE.TFJS,
      onResult,
      tfjsThreshold: 0.85,
      tfjsCooldownMs: 1500,
    });
    await e.init();
    e.start();

    fireWord('up', 0.95);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('zoom in', true);
  });

  test('debounces repeated identical words within cooldown', async () => {
    const onResult = jest.fn();
    const e = new SpeechEngine({
      engine: ENGINE_TYPE.TFJS,
      onResult,
      tfjsThreshold: 0.85,
      tfjsCooldownMs: 1500,
    });
    await e.init();
    e.start();

    fireWord('up', 0.95);
    fireWord('up', 0.95); // same word, immediately — should be debounced
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  test('allows same word after cooldown expires', async () => {
    const onResult = jest.fn();
    const e = new SpeechEngine({
      engine: ENGINE_TYPE.TFJS,
      onResult,
      tfjsThreshold: 0.85,
      tfjsCooldownMs: 0, // zero cooldown for test
    });
    await e.init();
    e.start();

    fireWord('up', 0.95);
    fireWord('up', 0.95); // should fire again because cooldown is 0
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  test('rejects word below threshold', async () => {
    const onResult = jest.fn();
    const e = new SpeechEngine({
      engine: ENGINE_TYPE.TFJS,
      onResult,
      tfjsThreshold: 0.85,
    });
    await e.init();
    e.start();

    fireWord('up', 0.5); // below threshold
    expect(onResult).not.toHaveBeenCalled();
  });

  test('rejects _background_noise_', async () => {
    const onResult = jest.fn();
    // Add _background_noise_ to the word list for this test
    mockRecognizer.wordLabels = jest.fn().mockReturnValue(['_background_noise_', 'up']);
    const e = new SpeechEngine({
      engine: ENGINE_TYPE.TFJS,
      onResult,
      tfjsThreshold: 0.5,
    });
    await e.init();
    e.start();

    const scores = [0.99, 0.01]; // _background_noise_ wins
    capturedCallback({ scores });
    expect(onResult).not.toHaveBeenCalled();
  });
});
