import type { Status } from '../status.js';

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      <p class="mute">jobs per night: failed, retried at all, then clean.</p>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>night</th><th>ok</th><th>retry</th><th>fail</th>
            </tr>
          </thead>
          <tbody>
            {status.nights.map((n) => (
              <tr>
                <td>
                  <a href={`/digest/${n.night}`}>{n.night}</a>
                  {n.counts ? '' : <span class="warn"> · unreadable</span>}
                </td>
                <td>{n.counts ? n.counts.ok : '—'}</td>
                <td class={n.counts && n.counts.retry > 0 ? 'warn' : undefined}>{n.counts ? n.counts.retry : '—'}</td>
                <td class={n.counts && n.counts.fail > 0 ? 'warn' : undefined}>{n.counts ? n.counts.fail : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
