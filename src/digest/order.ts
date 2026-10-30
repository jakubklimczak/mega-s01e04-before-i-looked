import type { DigestRow } from './types.js';

// The one job order for a night. Plain code-unit comparison, not localeCompare, so no machine's
// locale can reorder a night: the page and the JSON must never disagree (ADR 0001).
export const byJob = (a: DigestRow, b: DigestRow): number => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
