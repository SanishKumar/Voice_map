/**
 * evaluation.js
 * Tracks voice command recognition accuracy and map action latency.
 *
 * Usage:
 *   const tracker = new EvaluationTracker();
 *   tracker.recordCommand({ raw, intent, payload, confidence, latency });
 *   tracker.getStats();
 *   tracker.exportJSON();
 */

/**
 * @typedef {Object} CommandRecord
 * @property {number} id
 * @property {number} timestamp
 * @property {string} raw
 * @property {string} intent
 * @property {any} payload
 * @property {number} confidence
 * @property {number} latency
 * @property {boolean} userCorrected
 * @property {string} correction
 */

export class EvaluationTracker {
  constructor() {
    /** @type {CommandRecord[]} */
    this.records = [];
    this._startTime = Date.now();
  }

  /**
   * Record a parsed voice command and its execution result.
   *
   * @param {object} opts
   * @param {string}  opts.raw        - Raw recognised text
   * @param {string}  opts.intent     - Resolved intent (from INTENT enum)
   * @param {object}  opts.payload    - Intent payload
   * @param {number}  opts.confidence - Parser confidence 0–1
   * @param {number}  [opts.latency]  - Map action execution time in ms
   * @param {boolean} [opts.userCorrected] - True if user marked this as wrong
   * @param {string}  [opts.correction]    - User-provided correct intent
   */
  recordCommand(opts) {
    const record = {
      id: this.records.length + 1,
      timestamp: Date.now(),
      raw: opts.raw || '',
      intent: opts.intent || 'unknown',
      payload: opts.payload || {},
      confidence: opts.confidence ?? 0,
      latency: opts.latency ?? null,
      userCorrected: opts.userCorrected ?? false,
      correction: opts.correction || null,
    };
    this.records.push(record);
    return record;
  }

  /**
   * Mark the most recent command (or by id) as user-corrected.
   * @param {string} correction - The correct intent
   * @param {number} [id]       - Record id; defaults to latest
   */
  markCorrection(correction, id) {
    const record = id
      ? this.records.find((r) => r.id === id)
      : this.records[this.records.length - 1];
    if (record) {
      record.userCorrected = true;
      record.correction = correction;
    }
  }

  /**
   * @typedef {Object} Stats
   * @property {number} total
   * @property {number} recognized
   * @property {number} unknown
   * @property {number} corrected
   * @property {number|null} accuracy
   * @property {number|null} avgConfidence
   * @property {number|null} avgLatency
   * @property {number} sessionDurationMs
   * @property {Record<string, number>} intentBreakdown
   */

  /**
   * Compute summary statistics.
   * @returns {Stats}
   */
  getStats() {
    const total = this.records.length;
    if (total === 0) {
      return {
        total: 0,
        recognized: 0,
        unknown: 0,
        corrected: 0,
        accuracy: null,
        avgConfidence: null,
        avgLatency: null,
        intentBreakdown: /** @type {Record<string, number>} */ ({}),
        sessionDurationMs: Date.now() - this._startTime,
      };
    }

    const recognized = this.records.filter((r) => r.intent !== 'unknown').length;
    const corrected = this.records.filter((r) => r.userCorrected).length;
    const withLatency = this.records.filter((r) => r.latency !== null);
    const avgLatency =
      withLatency.length > 0
        ? withLatency.reduce((s, r) => s + r.latency, 0) / withLatency.length
        : null;
    const avgConfidence =
      this.records.reduce((s, r) => s + r.confidence, 0) / total;

    // Accuracy = (recognized − corrected) / total
    const accuracy = total > 0 ? (recognized - corrected) / total : null;

    // Intent breakdown
    /** @type {Record<string, number>} */
    const intentBreakdown = {};
    for (const r of this.records) {
      intentBreakdown[r.intent] = (intentBreakdown[r.intent] || 0) + 1;
    }

    return {
      total,
      recognized,
      unknown: total - recognized,
      corrected,
      accuracy: accuracy !== null ? Math.max(0, accuracy) : null,
      avgConfidence,
      avgLatency,
      intentBreakdown,
      sessionDurationMs: Date.now() - this._startTime,
    };
  }

  /**
   * Export all records and stats to a JSON string.
   * @returns {string}
   */
  exportJSON() {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        stats: this.getStats(),
        records: this.records,
      },
      null,
      2
    );
  }

  /**
   * Export records as a CSV string.
   * @returns {string}
   */
  exportCSV() {
    const headers = ['id', 'timestamp', 'raw', 'intent', 'confidence', 'latency', 'userCorrected', 'correction'];
    const rows = this.records.map((r) =>
      [
        r.id,
        r.timestamp,
        `"${r.raw.replace(/"/g, '""')}"`,
        r.intent,
        r.confidence.toFixed(3),
        r.latency !== null ? r.latency.toFixed(2) : '',
        r.userCorrected,
        r.correction || '',
      ].join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  /** Clear all records and reset the session timer. */
  reset() {
    this.records = [];
    this._startTime = Date.now();
  }
}
