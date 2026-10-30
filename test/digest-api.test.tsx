import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, Night, ReadNight } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const row = (job: string): DigestRow => ({
  job, owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
  firstAt: '2026-10-28T23:00:00+01:00', lastAt: '2026-10-28T23:00:00+01:00',
});

// Deliberately unsorted, with a capital and a slash, so code-unit order is exercised.
const night: Night = {
  night: '2026-10-28',
  badLines: 2,
  rows: [row('lane/sync'), row('backup/db'), row('Zed'), row('alpha')],
};

const stub: ReadNight = (_dir, n) => (n === night.night ? night : null);
const app = createApp(config, stub);

type Body = { night: string; badLines: number; rows: DigestRow[] };

describe('digest json', () => {
  it('returns the envelope with rows', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(2);
    expect(body.rows).toHaveLength(4);
    expect(body.rows[0]).toEqual(row('Zed'));
  });

  it('lists the same jobs in the same order as the page', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    const body = (await (await app.request('/api/digest/2026-10-28')).json()) as Body;
    // First cell of each body row is the job.
    const pageJobs = [...html.matchAll(/<tr><td>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(pageJobs.length).toBeGreaterThan(0);
    expect(body.rows.map((r) => r.job)).toEqual(pageJobs);
  });

  it('404s as JSON for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-10-01');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'no digest', night: '2026-10-01' });
  });

  it('404s as JSON for a night that is not a date', async () => {
    const res = await app.request('/api/digest/..%2Fsecret');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
