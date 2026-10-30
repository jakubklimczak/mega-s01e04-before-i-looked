import { serve } from '@hono/node-server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { lane } from '../src/lane.js';

// Plan morning-digest § 3. Runs rig, fetches one page over HTTP and saves it as one file: a
// command, so the copy a reviewer reads is reproducible and nobody has to use "save as"
// (ADR 0001 — the page is self-contained, so one file is the whole page).
//
//   pnpm preview                      -> preview/digest-2026-10-28.html
//   pnpm preview 2026-10-27 out.html
//
// The saved page carries whatever LANE_MARKER says, "no marker set" included: that is how § 4
// takes the marker off a preview that is already public (ADR 0003).

const night = process.argv[2] ?? '2026-10-28';
const out = process.argv[3] ?? `preview/digest-${night}.html`;

const server = serve({ fetch: createApp(loadConfig()).fetch, port: 0 });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('rig did not report a port');

const res = await fetch(`http://127.0.0.1:${address.port}/digest/${night}`);
const html = await res.text();
server.close();

if (res.status !== 200) {
  console.error(`rig answered ${res.status} for /digest/${night} — nothing saved`);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out} · ${html.length} bytes · marker: ${lane().marker ?? 'no marker set'}`);
