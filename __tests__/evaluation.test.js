/**
 * evaluation.test.js — unit tests for src/evaluation.js
 */

import { EvaluationTracker } from '../src/evaluation.js';

function makeTracker() {
  return new EvaluationTracker();
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('EvaluationTracker — initial state', () => {
  test('starts with empty records', () => {
    const t = makeTracker();
    expect(t.records).toHaveLength(0);
  });

  test('getStats() returns zero-values when no records', () => {
    const s = makeTracker().getStats();
    expect(s.total).toBe(0);
    expect(s.recognized).toBe(0);
    expect(s.unknown).toBe(0);
    expect(s.accuracy).toBeNull();
    expect(s.avgConfidence).toBeNull();
    expect(s.avgLatency).toBeNull();
    expect(s.sessionDurationMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// recordCommand
// ---------------------------------------------------------------------------

describe('EvaluationTracker — recordCommand', () => {
  test('adds a record', () => {
    const t = makeTracker();
    t.recordCommand({ raw: 'zoom in', intent: 'zoom_in', confidence: 0.9, latency: 10 });
    expect(t.records).toHaveLength(1);
  });

  test('assigns sequential ids', () => {
    const t = makeTracker();
    const r1 = t.recordCommand({ raw: 'zoom in',  intent: 'zoom_in',  confidence: 0.9 });
    const r2 = t.recordCommand({ raw: 'zoom out', intent: 'zoom_out', confidence: 0.8 });
    expect(r1.id).toBe(1);
    expect(r2.id).toBe(2);
  });

  test('stores provided fields', () => {
    const t = makeTracker();
    const r = t.recordCommand({
      raw: 'go to paris',
      intent: 'go_to',
      payload: { place: 'paris' },
      confidence: 0.9,
      latency: 42,
    });
    expect(r.raw).toBe('go to paris');
    expect(r.intent).toBe('go_to');
    expect(r.payload).toEqual({ place: 'paris' });
    expect(r.confidence).toBe(0.9);
    expect(r.latency).toBe(42);
    expect(r.userCorrected).toBe(false);
  });

  test('defaults missing fields gracefully', () => {
    const t = makeTracker();
    const r = t.recordCommand({});
    expect(r.raw).toBe('');
    expect(r.intent).toBe('unknown');
    expect(r.confidence).toBe(0);
    expect(r.latency).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

describe('EvaluationTracker — getStats', () => {
  test('counts total, recognized, unknown', () => {
    const t = makeTracker();
    t.recordCommand({ intent: 'zoom_in',  confidence: 0.9 });
    t.recordCommand({ intent: 'go_to',    confidence: 0.8 });
    t.recordCommand({ intent: 'unknown',  confidence: 0.0 });

    const s = t.getStats();
    expect(s.total).toBe(3);
    expect(s.recognized).toBe(2);
    expect(s.unknown).toBe(1);
  });

  test('calculates accuracy', () => {
    const t = makeTracker();
    t.recordCommand({ intent: 'zoom_in', confidence: 1.0 });
    t.recordCommand({ intent: 'zoom_in', confidence: 1.0 });
    t.recordCommand({ intent: 'unknown', confidence: 0.0 });
    // accuracy = (2 recognized - 0 corrected) / 3 total
    const s = t.getStats();
    expect(s.accuracy).toBeCloseTo(2 / 3, 5);
  });

  test('calculates avgConfidence', () => {
    const t = makeTracker();
    t.recordCommand({ intent: 'zoom_in', confidence: 0.8 });
    t.recordCommand({ intent: 'zoom_in', confidence: 0.6 });
    const s = t.getStats();
    expect(s.avgConfidence).toBeCloseTo(0.7, 5);
  });

  test('calculates avgLatency from records that have latency', () => {
    const t = makeTracker();
    t.recordCommand({ intent: 'zoom_in', confidence: 1, latency: 100 });
    t.recordCommand({ intent: 'zoom_in', confidence: 1, latency: 200 });
    const s = t.getStats();
    expect(s.avgLatency).toBeCloseTo(150, 5);
  });

  test('avgLatency is null when no latency recorded', () => {
    const t = makeTracker();
    t.recordCommand({ intent: 'zoom_in', confidence: 1 });
    expect(t.getStats().avgLatency).toBeNull();
  });

  test('intentBreakdown counts each intent', () => {
    const t = makeTracker();
    t.recordCommand({ intent: 'zoom_in' });
    t.recordCommand({ intent: 'zoom_in' });
    t.recordCommand({ intent: 'go_to' });
    const s = t.getStats();
    expect(s.intentBreakdown.zoom_in).toBe(2);
    expect(s.intentBreakdown.go_to).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// markCorrection
// ---------------------------------------------------------------------------

describe('EvaluationTracker — markCorrection', () => {
  test('marks the most recent record', () => {
    const t = makeTracker();
    t.recordCommand({ intent: 'zoom_in', confidence: 0.9 });
    t.markCorrection('zoom_out');
    expect(t.records[0].userCorrected).toBe(true);
    expect(t.records[0].correction).toBe('zoom_out');
  });

  test('marks a record by id', () => {
    const t = makeTracker();
    const r1 = t.recordCommand({ intent: 'zoom_in', confidence: 0.9 });
    t.recordCommand({ intent: 'go_to', confidence: 0.8 });
    t.markCorrection('zoom_out', r1.id);
    expect(t.records[0].userCorrected).toBe(true);
    expect(t.records[1].userCorrected).toBe(false);
  });

  test('correction reduces effective accuracy', () => {
    const t = makeTracker();
    t.recordCommand({ intent: 'zoom_in', confidence: 1.0 });
    t.recordCommand({ intent: 'zoom_in', confidence: 1.0 });
    t.markCorrection('zoom_out'); // mark latest as wrong
    // accuracy = (2 recognized - 1 corrected) / 2 total = 0.5
    expect(t.getStats().accuracy).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

describe('EvaluationTracker — reset', () => {
  test('clears all records', () => {
    const t = makeTracker();
    t.recordCommand({ intent: 'zoom_in', confidence: 1 });
    t.reset();
    expect(t.records).toHaveLength(0);
    expect(t.getStats().total).toBe(0);
  });

  test('resets session timer', () => {
    const t = makeTracker();
    const before = t._startTime;
    t.reset();
    expect(t._startTime).toBeGreaterThanOrEqual(before);
  });
});

// ---------------------------------------------------------------------------
// exportJSON / exportCSV
// ---------------------------------------------------------------------------

describe('EvaluationTracker — export', () => {
  test('exportJSON produces valid JSON with records and stats', () => {
    const t = makeTracker();
    t.recordCommand({ raw: 'zoom in', intent: 'zoom_in', confidence: 0.9, latency: 20 });
    const json = JSON.parse(t.exportJSON());
    expect(json.records).toHaveLength(1);
    expect(json.stats.total).toBe(1);
    expect(json.exportedAt).toBeTruthy();
  });

  test('exportCSV has header and one data row', () => {
    const t = makeTracker();
    t.recordCommand({ raw: 'zoom in', intent: 'zoom_in', confidence: 0.9, latency: 20 });
    const csv = t.exportCSV();
    const lines = csv.split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[1]).toContain('zoom_in');
  });

  test('exportCSV escapes double-quotes in raw text', () => {
    const t = makeTracker();
    t.recordCommand({ raw: 'he said "hello"', intent: 'unknown', confidence: 0 });
    const csv = t.exportCSV();
    expect(csv).toContain('""hello""');
  });
});
