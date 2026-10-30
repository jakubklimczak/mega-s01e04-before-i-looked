import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight as defaultReadNight } from './digest/read.js';
import type { DigestRow, ReadNight } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

// Counts are per job, not per log line, and they partition the night's jobs: a job that failed
// counts as fail, one that retried at all counts as retry even if it ended ok, the rest are ok.
// Counting by last status alone would leave retry at 0 for a night full of retries, which is
// the one thing someone scanning the board at breakfast needs to see.
export type Counts = { ok: number; retry: number; fail: number };

// counts is null when the night could not be read (file gone since the listing, or an I/O fault).
export type NightSummary = { night: string; counts: Counts | null };

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function countJobs(rows: DigestRow[]): Counts {
  const counts: Counts = { ok: 0, retry: 0, fail: 0 };
  for (const row of rows) {
    if (row.lastStatus === 'fail') counts.fail += 1;
    else if (row.retries > 0 || row.lastStatus === 'retry') counts.retry += 1;
    else counts.ok += 1;
  }
  return counts;
}

// The listing and the read are two moments: a night can vanish between them. It stays on the
// board with no counts rather than breaking it.
export function summarizeNight(runsDir: string, night: string, readNight: ReadNight): NightSummary {
  try {
    const digest = readNight(runsDir, night);
    return { night, counts: digest ? countJobs(digest.rows) : null };
  } catch {
    return { night, counts: null };
  }
}

export function readStatus(config: RigConfig, readNight: ReadNight = defaultReadNight): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => summarizeNight(config.runsDir, n, readNight)),
  };
}
