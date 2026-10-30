// Plan morning-digest § 2d. Route tests that drive the REAL readNight over a temp runs dir:
// no stub reader, so the file system and the parser sit behind the routes.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

type Body = { night: string; badLines: number; rows: DigestRow[] };

const entry = (at: string, job: string, status: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ at, job, status, ...extra });

const baseConfig = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  const write = (night: string, text: string) => writeFileSync(join(runsDir, `${night}.jsonl`), text);

  // Unsorted on purpose; lane/sync retries twice then goes ok.
  write(
    '2026-10-20',
    [
      entry('2026-10-20T23:00:06+01:00', 'lane/sync', 'retry', { owner: 'rook', error: 'upstream 503' }),
      entry('2026-10-20T23:10:00+01:00', 'backup/db', 'fail', { error: 'disk full' }),
      entry('2026-10-20T23:20:00+01:00', 'lane/sync', 'retry', { owner: 'rook' }),
      entry('2026-10-21T00:00:04+01:00', 'lane/sync', 'ok', { owner: 'rook' }),
    ].join('\n') + '\n',
  );

  write('2026-10-21', '');

  // Good rows around three kinds of bad line: not JSON, truncated, wrong shape. Plus a blank line
  // and a missing trailing newline, which must not count.
  write(
    '2026-10-22',
    [
      entry('2026-10-22T23:00:00+01:00', 'lane/sync', 'ok'),
      'this is not json',
      '',
      '{"at":"2026-10-22T23:05:00+01:00","job":"half/writ',
      JSON.stringify({ at: '2026-10-22T23:06:00+01:00', job: 'x', status: 'exploded' }),
      entry('2026-10-22T23:30:00+01:00', 'backup/db', 'ok'),
    ].join('\n'),
  );

  // A night that is only bad lines is still a night.
  write('2026-10-23', 'garbage\n[1,2]\n');

  // Not a file at all: a directory named like a night.
  mkdirSync(join(runsDir, '2026-10-24.jsonl'));

  app = createApp({ ...baseConfig, runsDir });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const page = async (night: string) => {
  const res = await app.request(`/digest/${night}`);
  return { res, html: await res.text() };
};
const api = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as Body };
};
const pageJobs = (html: string) => [...html.matchAll(/<tr><td>([^<]*)<\/td>/g)].map((m) => m[1]);

describe('digest routes over the real reader', () => {
  describe('a night that exists', () => {
    it('page: 200, folded rows sorted by job, offsets kept, no unreadable-line notice', async () => {
      const { res, html } = await page('2026-10-20');
      expect(res.status).toBe(200);
      expect(html).toContain('digest · 2026-10-20');
      expect(html.indexOf('backup/db')).toBeLessThan(html.indexOf('lane/sync'));
      expect(html).toContain('2026-10-20T23:00:06+01:00');
      expect(html).toContain('2026-10-21T00:00:04+01:00');
      expect(html).toContain('upstream 503');
      expect(html).toContain('disk full');
      expect(html).not.toContain('unreadable');
    });

    it('json: 200, envelope and folded rows from the file', async () => {
      const { res, body } = await api('2026-10-20');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(body).toEqual({
        night: '2026-10-20',
        badLines: 0,
        rows: [
          { job: 'backup/db', owner: null, runs: 1, retries: 0, lastStatus: 'fail', lastError: 'disk full', firstAt: '2026-10-20T23:10:00+01:00', lastAt: '2026-10-20T23:10:00+01:00' },
          { job: 'lane/sync', owner: 'rook', runs: 3, retries: 2, lastStatus: 'ok', lastError: 'upstream 503', firstAt: '2026-10-20T23:00:06+01:00', lastAt: '2026-10-21T00:00:04+01:00' },
        ],
      });
    });

    it('page and json list the same jobs in the same order', async () => {
      const { html } = await page('2026-10-20');
      const { body } = await api('2026-10-20');
      expect(pageJobs(html)).toEqual(['backup/db', 'lane/sync']);
      expect(body.rows.map((r) => r.job)).toEqual(pageJobs(html));
    });
  });

  describe('a night with no file', () => {
    it('page: 404', async () => {
      const { res, html } = await page('2026-10-01');
      expect(res.status).toBe(404);
      expect(html).toContain('no digest');
    });

    it('json: 404 with the error body', async () => {
      const { res, body } = await api('2026-10-01');
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(body).toEqual({ error: 'no digest', night: '2026-10-01' });
    });

    it('404s on both routes when the runs dir itself is missing', async () => {
      const gone = createApp({ ...baseConfig, runsDir: join(runsDir, 'nope') });
      expect((await gone.request('/digest/2026-10-20')).status).toBe(404);
      expect((await gone.request('/api/digest/2026-10-20')).status).toBe(404);
    });
  });

  describe('the empty night (a file with no lines)', () => {
    it('page: 200 and says nothing ran', async () => {
      const { res, html } = await page('2026-10-21');
      expect(res.status).toBe(200);
      expect(html).toContain('nothing ran');
      expect(html).not.toContain('<table>');
      expect(html).not.toContain('unreadable');
    });

    it('json: 200 with no rows and no bad lines', async () => {
      const { res, body } = await api('2026-10-21');
      expect(res.status).toBe(200);
      expect(body).toEqual({ night: '2026-10-21', badLines: 0, rows: [] });
    });
  });

  describe('a night with bad lines', () => {
    it('page: still renders the good rows and shows the unreadable-line count', async () => {
      const { res, html } = await page('2026-10-22');
      expect(res.status).toBe(200);
      expect(html).toContain('3 unreadable lines skipped');
      expect(pageJobs(html)).toEqual(['backup/db', 'lane/sync']);
      expect(html).not.toContain('nothing ran');
    });

    it('json: carries badLines and the good rows', async () => {
      const { res, body } = await api('2026-10-22');
      expect(res.status).toBe(200);
      expect(body.badLines).toBe(3);
      expect(body.rows.map((r) => [r.job, r.runs, r.lastStatus])).toEqual([
        ['backup/db', 1, 'ok'],
        ['lane/sync', 1, 'ok'],
      ]);
    });

    it('page and json agree on the count and the jobs', async () => {
      const { html } = await page('2026-10-22');
      const { body } = await api('2026-10-22');
      expect(html).toContain(`${body.badLines} unreadable lines skipped`);
      expect(body.rows.map((r) => r.job)).toEqual(pageJobs(html));
    });

    it('a night of only bad lines is 200 with nothing ran and the count', async () => {
      const { res, html } = await page('2026-10-23');
      expect(res.status).toBe(200);
      expect(html).toContain('2 unreadable lines skipped');
      expect(html).toContain('nothing ran');
      const { res: apiRes, body } = await api('2026-10-23');
      expect(apiRes.status).toBe(200);
      expect(body).toEqual({ night: '2026-10-23', badLines: 2, rows: [] });
    });
  });

  describe('a night that is not a readable file', () => {
    // Documents today's behaviour: a directory named like a night is EISDIR, which the reader
    // rethrows as a real I/O fault, so Hono answers 500 rather than 404.
    it('is a 500 on both routes (real I/O fault, not hidden behind a 404)', async () => {
      expect((await app.request('/digest/2026-10-24')).status).toBe(500);
      expect((await app.request('/api/digest/2026-10-24')).status).toBe(500);
    });
  });
});
