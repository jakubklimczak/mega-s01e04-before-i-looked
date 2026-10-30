import type { DigestRow, Night } from '../digest/types.js';

const dash = <span class="mute">—</span>;

// Plain code-unit order, so the page and any other reader sort the same way.
const byJob = (a: DigestRow, b: DigestRow) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0);

export function DigestPage({ digest }: { digest: Night }) {
  const rows = [...digest.rows].sort(byJob);
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.badLines > 0 && (
        <p class="warn">{digest.badLines} unreadable line{digest.badLines === 1 ? '' : 's'} skipped</p>
      )}
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.job}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td class={r.retries >= 3 ? 'warn' : undefined}>{r.retries}</td>
                <td class={r.lastStatus === 'fail' ? 'warn' : undefined}>{r.lastStatus}</td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
