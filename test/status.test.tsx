import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('links every night on disk to a digest that renders', async () => {
    const app = createApp(config);
    const html = await (await app.request('/')).text();
    const hrefs = [...html.matchAll(/href="(\/digest\/[^"]+)"/g)].map((m) => m[1] as string);
    expect(hrefs).toEqual(['/digest/2026-10-28', '/digest/2026-10-27']);
    for (const href of hrefs) expect((await app.request(href)).status).toBe(200);
  });

  it('keeps a night that vanished before the read, with dashes', async () => {
    const app = createApp(config, () => null);
    const html = await (await app.request('/')).text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('<td>—</td><td>—</td><td>—</td>');
  });

  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
