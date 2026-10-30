import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { DigestRow } from '../src/digest/types.js';

// runs/ is read-only (AGENTS.md), so anything not already on disk goes in a temp dir.
function tempRunsDir(night: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, `${night}.jsonl`), contents);
  return dir;
}

function row(night: { rows: DigestRow[] }, job: string): DigestRow {
  const found = night.rows.find((r) => r.job === job);
  if (!found) throw new Error(`no row for ${job}`);
  return found;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs and counts the truncated line as bad', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows).toHaveLength(5);
    expect(night?.badLines).toBe(1);
  });

  it('sorts the rows by job name', () => {
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('folds the retries, the last status and the last error', () => {
    if (!night) throw new Error('night missing');
    expect(row(night, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row(night, 'notes/backup')).toEqual({
      job: 'notes/backup',
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      firstAt: '2026-10-29T04:00:01+01:00',
      lastAt: '2026-10-29T04:00:01+01:00',
    });
  });

  it('keeps the first and last time of a job that ran all night', () => {
    if (!night) throw new Error('night missing');
    const sync = row(night, 'lane/sync');
    // The truncated line was lane/sync too: it is a bad line, so it counts in neither.
    expect(sync.runs).toBe(8);
    expect(sync.retries).toBe(1);
    expect(sync.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(sync.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });

  it('keeps the times exactly as the log has them, offset included', () => {
    if (!night) throw new Error('night missing');
    for (const r of night.rows) {
      expect(r.firstAt).toMatch(/\+01:00$/);
      expect(r.lastAt).toMatch(/\+01:00$/);
    }
  });

  it('keeps the row of a job whose owner is null', () => {
    if (!night) throw new Error('night missing');
    expect(row(night, 'digest/render')).toEqual({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });
  });
});

describe('readNight on the edges', () => {
  it('returns null when the night has no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('returns null when the runs dir itself is not there', () => {
    expect(readNight(join(tmpdir(), 'rig-no-such-runs-dir'), '2026-10-28')).toBeNull();
  });

  it('reads an empty file as no rows and no bad lines', () => {
    const dir = tempRunsDir('2026-10-30', '');
    expect(readNight(dir, '2026-10-30')).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
  });

  it('does not count blank lines as bad lines', () => {
    const dir = tempRunsDir(
      '2026-10-30',
      '\n{"at":"2026-10-30T01:00:00+02:00","job":"a","status":"ok","owner":"rook"}\n\n   \n',
    );
    const night = readNight(dir, '2026-10-30');
    expect(night?.badLines).toBe(0);
    expect(night?.rows).toHaveLength(1);
  });

  it('counts every unparseable line and still returns the rest', () => {
    const dir = tempRunsDir(
      '2026-10-30',
      [
        '{"at":"2026-10-30T01:00:00+02:00","job":"a","status":"ok","owner":"rook"}',
        'not json at all',
        '{"at":"2026-10-30T02:00:00+02:00","job":"a","status":"trunc',
        '{"at":"2026-10-30T03:00:00+02:00","job":"a","status":"ok","owner":"rook"}',
        '',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-10-30');
    expect(night?.badLines).toBe(2);
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]?.runs).toBe(2);
  });

  it('counts a line that parses but has the wrong shape as a bad line', () => {
    const dir = tempRunsDir(
      '2026-10-30',
      [
        '{"at":"2026-10-30T01:00:00+02:00","job":"a","status":"maybe","owner":"rook"}',
        '{"at":"2026-10-30T01:00:00+02:00","status":"ok","owner":"rook"}',
        '{"job":"a","status":"ok","owner":"rook"}',
        '{"at":"2026-10-30T01:00:00+02:00","job":"a","status":"ok","owner":7}',
        '[1,2,3]',
        '"a string"',
        '{"at":"2026-10-30T04:00:00+02:00","job":"a","status":"fail","owner":null,"error":"boom"}',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-10-30');
    expect(night?.badLines).toBe(6);
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'boom',
        firstAt: '2026-10-30T04:00:00+02:00',
        lastAt: '2026-10-30T04:00:00+02:00',
      },
    ]);
  });

  it('keeps an offset that is not the lane’s own', () => {
    const dir = tempRunsDir(
      '2026-10-30',
      '{"at":"2026-10-30T23:30:00-07:00","job":"a","status":"ok","owner":"rook"}\n',
    );
    expect(readNight(dir, '2026-10-30')?.rows[0]?.firstAt).toBe('2026-10-30T23:30:00-07:00');
  });
});
