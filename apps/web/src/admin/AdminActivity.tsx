import { useState } from 'react';
import type { ReactElement } from 'react';
import { contentApi, type DailyCount } from '../content';
import { useAsync } from './useAsync';

const RANGES = [7, 30, 90] as const;

/** Signed-in people per day, as a bar chart (with a table view). */
export function AdminActivity(): ReactElement {
  const [days, setDays] = useState<number>(30);
  const activity = useAsync(() => contentApi.activity(days), `activity-${days}`);
  const data = activity.data;

  return (
    <div>
      <h1 className="page-title">Activity</h1>
      <p className="admin-help">
        How many signed-in people used the site each day (Israel time). Someone who comes back
        several times in a day, on any device, counts once that day. Visitors who don’t sign in
        aren’t counted.
      </p>
      <div className="chart-filters" role="group" aria-label="Period">
        {RANGES.map((n) => (
          <button key={n} type="button" className="btn" aria-pressed={days === n} onClick={(): void => setDays(n)}>
            {n} days
          </button>
        ))}
      </div>
      {activity.error && <p className="error" role="alert">{activity.error}</p>}
      {!data ? (
        !activity.error && <p className="empty">Loading…</p>
      ) : (
        <>
          <div className="stat">
            <span className="stat-value">{data.people}</span>
            <span className="stat-label">
              different {data.people === 1 ? 'person' : 'people'} signed in over the last {data.days.length} days ·{' '}
              {(data.days[data.days.length - 1] as DailyCount).count} today
            </span>
          </div>
          <BarChart days={data.days} />
          <details className="chart-table">
            <summary>Show as a table</summary>
            <table>
              <thead>
                <tr><th scope="col">Day</th><th scope="col">People signed in</th></tr>
              </thead>
              <tbody>
                {[...data.days].reverse().map((d) => (
                  <tr key={d.day}><td>{longDay(d.day)}</td><td>{d.count}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}

const W = 720;
const H = 240;
const M = { top: 12, right: 8, bottom: 28, left: 36 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

/** One column per day, growing from a single baseline; hover or focus a day for its count. */
export function BarChart({ days }: { readonly days: readonly DailyCount[] }): ReactElement {
  const [hover, setHover] = useState<number | null>(null);
  const ticks = yTicks(Math.max(...days.map((d) => d.count)));
  const top = ticks[ticks.length - 1] as number;
  const band = PLOT_W / days.length;
  const barW = Math.min(24, band - 2);
  const y = (v: number): number => M.top + PLOT_H - (v / top) * PLOT_H;
  const every = Math.ceil(days.length / 6);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Signed-in people per day">
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="chart-axis" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = M.left + i * band + (band - barW) / 2;
          const labelled = (days.length - 1 - i) % every === 0;
          return (
            <g key={d.day}>
              {d.count > 0 && <path className="chart-bar" d={column(x, y(d.count), barW, y(0))} />}
              {labelled && (
                <text className="chart-axis" x={x + barW / 2} y={H - 8} textAnchor="middle">{shortDay(d.day)}</text>
              )}
              <rect
                className="chart-hit"
                x={M.left + i * band}
                y={M.top}
                width={band}
                height={PLOT_H}
                tabIndex={0}
                aria-label={`${longDay(d.day)}: ${people(d.count)}`}
                onMouseEnter={(): void => setHover(i)}
                onFocus={(): void => setHover(i)}
                onMouseLeave={(): void => setHover(null)}
                onBlur={(): void => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="chart-tooltip"
          role="status"
          style={{ left: `${((M.left + (hover + 0.5) * band) / W) * 100}%`, top: `${(y((days[hover] as DailyCount).count) / H) * 100}%` }}
        >
          <strong>{people((days[hover] as DailyCount).count)}</strong>
          <span>{longDay((days[hover] as DailyCount).day)}</span>
        </div>
      )}
    </div>
  );
}

/** Clean whole-number ticks from 0 up to at least `max` (at most ~5 of them). */
export function yTicks(max: number): number[] {
  const rough = Math.max(1, max) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, ([1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) as number));
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/** A column with a 4px rounded top and a square foot on the baseline. */
function column(x: number, top: number, width: number, base: number): string {
  const r = Math.min(4, width / 2, base - top);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`;
}

const people = (n: number): string => `${n} ${n === 1 ? 'person' : 'people'}`;
const asDate = (day: string): Date => new Date(`${day}T00:00:00Z`);
const shortDay = (day: string): string => asDate(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDay = (day: string): string =>
  asDate(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
