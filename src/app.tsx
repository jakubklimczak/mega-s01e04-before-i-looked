import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight as defaultReadNight } from './digest/read.js';
import type { DigestRow, ReadNight } from './digest/types.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

// Plain code-unit order, the same as the page's, so the JSON and the page never disagree (ADR 0001).
const byJob = (a: DigestRow, b: DigestRow) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0);

export function createApp(config: RigConfig = loadConfig(), readNight: ReadNight = defaultReadNight) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config, readNight)} />
      </Layout>,
    ),
  );

  // Agents read this one. Envelope: { night, badLines, rows }, rows sorted by job.
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    // Same guard as the page: only a plain date reaches the reader.
    const digest = /^\d{4}-\d{2}-\d{2}$/.test(night) ? readNight(config.runsDir, night) : null;
    if (!digest) return c.json({ error: 'no digest', night }, 404);
    return c.json({ night: digest.night, badLines: digest.badLines, rows: [...digest.rows].sort(byJob) });
  });

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    // The night names a file in runs/: only a plain date gets as far as the reader.
    const digest = /^\d{4}-\d{2}-\d{2}$/.test(night) ? readNight(config.runsDir, night) : null;
    if (!digest) {
      return c.html(
        <Layout title="not found" lane={lane()}>
          <h1>no digest</h1>
          <p class="mute">no log for {night}</p>
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <DigestPage digest={digest} />
      </Layout>,
    );
  });

  return app;
}
