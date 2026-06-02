/**
 * Voice recognition engines.
 *
 * Provides individual engine classes and a unified factory:
 *   import { WebSpeechEngine, TfjsEngine, createEngine, ENGINE_TYPE } from 'voicegis/engines';
 *
 * For backward compatibility, the legacy SpeechEngine class is also exported.
 *
 * @module engines
 */

import { WebSpeechEngine } from './WebSpeechEngine.js';
import { TfjsEngine } from './TfjsEngine.js';
import { WhisperEngine } from './WhisperEngine.js';
import { WhisperServerEngine } from './WhisperServerEngine.js';

export { WebSpeechEngine } from './WebSpeechEngine.js';
export { TfjsEngine } from './TfjsEngine.js';
export { WhisperEngine, WHISPER_STATE } from './WhisperEngine.js';
export { WhisperServerEngine, SERVER_STATE } from './WhisperServerEngine.js';

/** Canonical engine type identifiers. */
export const ENGINE_TYPE = {
  WEB_SPEECH: 'webspeech',
  TFJS: 'tfjs',
  WHISPER: 'whisper',
  SERVER: 'server',
};

/**
 * Factory: create the appropriate engine instance from a type string.
 *
 * @param {string} type - One of ENGINE_TYPE values
 * @param {object} options - Passed directly to the engine constructor
 * @returns {WebSpeechEngine|TfjsEngine|WhisperEngine|WhisperServerEngine}
 */
export function createEngine(type, options = {}) {
  switch (type) {
    case ENGINE_TYPE.WHISPER:
      return new WhisperEngine(options);
    case ENGINE_TYPE.SERVER:
      return new WhisperServerEngine(options);
    case ENGINE_TYPE.TFJS:
      return new TfjsEngine(options);
    case ENGINE_TYPE.WEB_SPEECH:
    default:
      return new WebSpeechEngine(options);
  }
}

// ---------------------------------------------------------------------------
// Backward-compatible SpeechEngine wrapper
// ---------------------------------------------------------------------------

/**
 * Legacy SpeechEngine — delegates to the appropriate engine implementation.
 * Consumers should migrate to importing individual engines directly.
 *
 * @deprecated Use WebSpeechEngine, TfjsEngine, or createEngine() instead.
 */
export class SpeechEngine {
  /**
   * @param {object} options
   * @param {function} [options.onResult]  - Called with (text: string, isFinal: boolean)
   * @param {function} [options.onError] - Called with (error: Error)
   * @param {function} [options.onStart] - Called when recognition starts
   * @param {function} [options.onEnd]   - Called when recognition ends
   * @param {string}   [options.engine]  - ENGINE_TYPE.WEB_SPEECH or ENGINE_TYPE.TFJS
   * @param {number}   [options.tfjsThreshold]  - Confidence threshold for TF.js (0–1)
   * @param {number}   [options.tfjsCooldownMs] - Min ms between consecutive TF.js results
   */
  constructor(options = {}) {
    this._engineType = options.engine || ENGINE_TYPE.WEB_SPEECH;
    this._options = options;
    this._delegate = null;
  }

  /** Returns the underlying engine type */
  get engine() { return this._engineType; }

  /**
   * Initialise the chosen engine. Must be called before start().
   * @returns {Promise<void>}
   */
  async init() {
    this._delegate = createEngine(this._engineType, this._options);
    await this._delegate.init();
  }

  /** Returns true if init() completed successfully. */
  get isInitialized() { return this._delegate?.isInitialized ?? false; }

  /** Returns true if currently listening. */
  get isListening() { return this._delegate?.isListening ?? false; }

  /** Start listening. */
  start() { this._delegate?.start(); }

  /** Stop listening. */
  stop() { this._delegate?.stop(); }

  /** Toggle between start and stop. */
  toggle() { this._delegate?.toggle(); }
}
