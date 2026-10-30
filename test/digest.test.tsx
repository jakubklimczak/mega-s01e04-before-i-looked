import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night, ReadNight } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const night: Night = {
  night: '2026-10-28',
  badLines: 0,
  rows: [
    { job: 'lane/sync', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T00:00:04+01:00' },
    { job: 'backup/db', owner: null, runs: 1, retries: 0, lastStatus: 'fail', lastError: 'disk full', firstAt: '2026-10-28T23:30:00+01:00', lastAt: '2026-10-28T23:30:00+01:00' },
  ],
};

const stub = (nights: Record<string, Night>): ReadNight => (_dir, n) => nights[n] ?? null;
const app = (nights: Record<string, Night>) => createApp(config, stub(nights));

describe('digest page', () => {
  it('renders rows sorted by job, marks warnings, keeps offsets, dashes nulls', async () => {
    const res = await app({ '2026-10-28': night }).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.indexOf('backup/db')).toBeLessThan(html.indexOf('lane/sync'));
    expect(html).toContain('2026-10-29T00:00:04+01:00');
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">fail</td>');
    expect(html).toContain('<span class="mute">—</span>');
    expect(html).not.toContain('<td></td>');
  });

  it('404s a night with no file', async () => {
    const res = await app({}).request('/digest/2026-10-01');
    expect(res.status).toBe(404);
  });

  it('404s a night that is not a date', async () => {
    const res = await app({}).request('/digest/..%2Fsecret');
    expect(res.status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app({ '2026-10-27': { night: '2026-10-27', rows: [], badLines: 0 } }).request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });
});
