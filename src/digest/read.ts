// Plan morning-digest § 1. Reads runs/<night>.jsonl into one DigestRow per job.
// The night must still render when the log is half-written, so a line that doesn't
// parse is counted in badLines and never thrown.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { byJob } from './order.js';
import type { DigestRow, JobStatus, Night, ReadNight } from './types.js';

// One line of the log, after parsing. Parse at the edge, trust the types after (styleguide).
type LogEntry = {
  at: string;
  job: string;
  status: JobStatus;
  owner: string | null;
  error: string | null;
};

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A line is an entry only if it is JSON with the shape § 1 promises. Anything else is a bad line:
// JSON we can't trust is no better than JSON we can't parse.
function parseLine(line: string): LogEntry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  if (owner !== null && owner !== undefined && typeof owner !== 'string') return null;
  if (error !== null && error !== undefined && typeof error !== 'string') return null;

  return {
    at,
    job,
    status: status as JobStatus,
    owner: typeof owner === 'string' ? owner : null,
    error: typeof error === 'string' ? error : null,
  };
}

// The log is append-ordered, so the first line for a job is its first run and the last is its
// last. That beats comparing `at` strings, which carry their own offsets (styleguide: keep the
// offset, never convert to UTC).
function fold(entry: LogEntry, row: DigestRow | undefined): DigestRow {
  if (!row) {
    return {
      job: entry.job,
      owner: entry.owner,
      runs: 1,
      retries: entry.status === 'retry' ? 1 : 0,
      lastStatus: entry.status,
      lastError: entry.error,
      firstAt: entry.at,
      lastAt: entry.at,
    };
  }
  return {
    job: row.job,
    owner: entry.owner,
    runs: row.runs + 1,
    retries: row.retries + (entry.status === 'retry' ? 1 : 0),
    lastStatus: entry.status,
    // The most recent error of the night, kept even once a later run went ok: three retries on
    // "upstream 503" that end green still want to say what went wrong.
    lastError: entry.error ?? row.lastError,
    firstAt: row.firstAt,
    lastAt: entry.at,
  };
}

// null when the night has no file on disk, so the route can answer 404.
export const readNight: ReadNight = (runsDir: string, night: string): Night | null => {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    const code = isRecord(err) ? err['code'] : undefined;
    // Missing night: no file, or no runs dir at all. Anything else is a real I/O fault and ours
    // to raise, not to hide behind a 404.
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw err;
  }

  const perJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of text.split('\n')) {
    // A trailing newline is not a bad line, and neither is the blank one a writer left behind.
    if (line.trim() === '') continue;
    const entry = parseLine(line);
    if (!entry) {
      badLines += 1;
      continue;
    }
    perJob.set(entry.job, fold(entry, perJob.get(entry.job)));
  }

  const rows = [...perJob.values()].sort(byJob);

  return { night, rows, badLines };
};
