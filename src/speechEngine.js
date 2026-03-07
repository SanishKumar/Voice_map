/**
 * speechEngine.js
 * Manages voice recognition using two strategies:
 *
 *  1. Web Speech API  — full-sentence online/offline recognition (primary)
 *  2. TensorFlow.js Speech Commands — lightweight offline keyword spotting
 *
 * Usage:
 *   const engine = new SpeechEngine({ onResult, onError, onStart, onEnd });
 *   await engine.init();
 *   engine.start();
 *   engine.stop();
 */

export const ENGINE_TYPE = {
  WEB_SPEECH: 'webspeech',
  TFJS: 'tfjs',
};

/**
 * Maps TF.js speech-command keywords to plain English phrases
 * so the command parser can handle them uniformly.
 */
const TFJS_KEYWORD_MAP = {
  up: 'zoom in',
  down: 'zoom out',
  left: 'pan left',
  right: 'pan right',
  go: 'go to',
  stop: 'stop',
  yes: 'confirm',
  no: 'cancel',
};

export class SpeechEngine {
  /**
   * @param {object} options
   * @param {function} options.onResult  - Called with (text: string, isFinal: boolean)
   * @param {function} [options.onError] - Called with (error: Error)
   * @param {function} [options.onStart] - Called when recognition starts
   * @param {function} [options.onEnd]   - Called when recognition ends
   * @param {string}   [options.engine]  - ENGINE_TYPE.WEB_SPEECH or ENGINE_TYPE.TFJS
   * @param {number}   [options.tfjsThreshold] - Confidence threshold for TF.js (0–1)
   */
  constructor(options = {}) {
    this.onResult = options.onResult || (() => {});
    this.onError = options.onError || ((e) => console.error('[SpeechEngine]', e));
    this.onStart = options.onStart || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.engineType = options.engine || ENGINE_TYPE.WEB_SPEECH;
    this.tfjsThreshold = options.tfjsThreshold ?? 0.75;

    this._recognition = null; // Web Speech API instance
    this._tfjsModel = null;   // TF.js speech commands model
    this._isListening = false;
    this._restartOnEnd = false;
    this._initialized = false; // Set to true after init() succeeds
  }

  /**
   * Initialise the chosen engine. Must be called before start().
   * @returns {Promise<void>}
   */
  async init() {
    this._initialized = false;
    if (this.engineType === ENGINE_TYPE.TFJS) {
      await this._initTFJS();
    } else {
      this._initWebSpeech();
    }
    this._initialized = true;
  }

  /** Returns true if init() completed successfully. */
  get isInitialized() {
    return this._initialized;
  }

  /** Start listening. */
  start() {
    if (!this._initialized) {
      this.onError(new Error('Speech engine not initialised. Call init() first.'));
      return;
    }
    if (this._isListening) return;
    this._isListening = true;
    this._restartOnEnd = true;
    this.onStart();

    if (this.engineType === ENGINE_TYPE.TFJS) {
      this._startTFJS();
    } else {
      this._startWebSpeech();
    }
  }

  /** Stop listening. */
  stop() {
    this._isListening = false;
    this._restartOnEnd = false;

    if (this.engineType === ENGINE_TYPE.TFJS) {
      this._stopTFJS();
    } else {
      this._stopWebSpeech();
    }
    this.onEnd();
  }

  /** Toggle between start and stop. */
  toggle() {
    if (this._isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  get isListening() {
    return this._isListening;
  }

  // ---------------------------------------------------------------------------
  // Web Speech API
  // ---------------------------------------------------------------------------

  _initWebSpeech() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error(
        'Web Speech API is not supported in this browser. ' +
          'Try Chrome or Edge, or switch to the TF.js engine.'
      );
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        this.onResult(finalTranscript.trim(), true);
      } else if (interimTranscript) {
        this.onResult(interimTranscript.trim(), false);
      }
    };

    rec.onerror = (event) => {
      // 'no-speech' is non-fatal; others may need attention
      if (event.error !== 'no-speech') {
        this.onError(new Error(`Speech recognition error: ${event.error}`));
      }
    };

    rec.onend = () => {
      if (this._restartOnEnd && this._isListening) {
        // Auto-restart for continuous listening
        try {
          rec.start();
        } catch (_) {
          // Already started
        }
      }
    };

    this._recognition = rec;
  }

  _startWebSpeech() {
    if (!this._recognition) {
      this._initWebSpeech();
    }
    try {
      this._recognition.start();
    } catch (e) {
      // InvalidStateError means it's already running
      if (!e.message.includes('already started')) {
        this.onError(e);
      }
    }
  }

  _stopWebSpeech() {
    if (this._recognition) {
      try {
        this._recognition.stop();
      } catch (_) {}
    }
  }

  // ---------------------------------------------------------------------------
  // TensorFlow.js Speech Commands
  // ---------------------------------------------------------------------------

  async _initTFJS() {
    // speechCommands is loaded as a global from CDN
    const speechCommands = window.speechCommands;
    if (!speechCommands) {
      throw new Error(
        'TensorFlow.js speech-commands library not loaded. ' +
          'Make sure the CDN script is included before initialising.'
      );
    }

    const recognizer = speechCommands.create('BROWSER_FFT');
    await recognizer.ensureModelLoaded();
    this._tfjsModel = recognizer;
  }

  _startTFJS() {
    if (!this._tfjsModel) {
      this.onError(new Error('TF.js model not initialised. Call init() first.'));
      return;
    }

    this._tfjsModel.listen(
      (result) => {
        const scores = result.scores;
        const words = this._tfjsModel.wordLabels();
        let maxScore = 0;
        let bestWord = '';

        for (let i = 0; i < scores.length; i++) {
          if (scores[i] > maxScore) {
            maxScore = scores[i];
            bestWord = words[i];
          }
        }

        if (maxScore >= this.tfjsThreshold && bestWord && bestWord !== '_background_noise_') {
          const mapped = TFJS_KEYWORD_MAP[bestWord] || bestWord;
          this.onResult(mapped, true);
        }
      },
      {
        includeSpectrogram: false,
        probabilityThreshold: this.tfjsThreshold,
        invokeCallbackOnNoiseAndUnknown: false,
        overlapFactor: 0.5,
      }
    );
  }

  _stopTFJS() {
    if (this._tfjsModel && this._tfjsModel.isListening()) {
      this._tfjsModel.stopListening();
    }
  }
}
