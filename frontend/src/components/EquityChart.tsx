import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { formatDateTime, formatShortDate, formatSignedPercent } from "../lib/format";
import type { EquityPoint } from "../types";

const HEIGHT = 208;
const PADDING = { top: 12, right: 104, bottom: 26, left: 52 };
const LABEL_GAP = 16;

const SERIES = [
  { key: "strategy", label: "Strateji (maliyet dahil)", short: "Strateji", color: "var(--series-1)" },
  { key: "buy_hold", label: "Al-tut", short: "Al-tut", color: "var(--series-2)" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 0.01;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => span / s <= count) ?? rough;
  const ticks: number[] = [];
  for (let value = Math.floor(min / step) * step; value <= max + step / 2; value += step) {
    ticks.push(Number(value.toFixed(12)));
  }
  return ticks;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

export function EquityChart({ points }: { points: EquityPoint[] }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const data = useMemo(
    () =>
      points.map((point) => ({
        time: new Date(point.time).getTime(),
        label: point.time,
        strategy: point.strategy - 1,
        buy_hold: point.buy_hold - 1,
      })),
    [points],
  );

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const scales = useMemo(() => {
    if (data.length < 2) return null;
    const values = data.flatMap((d) => [d.strategy, d.buy_hold]).concat(0);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const [yMin, yMax] = [ticks[0], ticks[ticks.length - 1]];
    const [tStart, tEnd] = [data[0].time, data[data.length - 1].time];
    return {
      ticks,
      x: (time: number) => PADDING.left + ((time - tStart) / (tEnd - tStart || 1)) * plotWidth,
      y: (value: number) => PADDING.top + (1 - (value - yMin) / (yMax - yMin || 1)) * plotHeight,
    };
  }, [data, plotWidth, plotHeight]);

  if (!scales) return null;

  const path = (key: SeriesKey) =>
    data.map((d, i) => `${i ? "L" : "M"}${scales.x(d.time).toFixed(1)},${scales.y(d[key]).toFixed(1)}`).join("");

  const last = data[data.length - 1];
  const endY = SERIES.map((series) => scales.y(last[series.key]));
  const showEndLabels = Math.abs(endY[0] - endY[1]) >= LABEL_GAP;

  const nearestIndex = (clientX: number, bounds: DOMRect) => {
    const time = data[0].time + ((clientX - bounds.left - PADDING.left) / (plotWidth || 1)) * (last.time - data[0].time);
    let best = 0;
    for (let i = 1; i < data.length; i += 1) {
      if (Math.abs(data[i].time - time) < Math.abs(data[best].time - time)) best = i;
    }
    return best;
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    setActive(nearestIndex(event.clientX, event.currentTarget.getBoundingClientRect()));
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setActive((current) => Math.min(data.length - 1, Math.max(0, (current ?? data.length - 1) + step)));
  };

  const focused = active === null ? null : data[active];
  const focusX = focused ? scales.x(focused.time) : 0;
  const summary = SERIES.map((series) => `${series.label} ${formatSignedPercent(last[series.key])}`).join(", ");

  return (
    <div className="equity-chart">
      <ul className="chart-legend">
        {SERIES.map((series) => (
          <li key={series.key}>
            <i className="line-key" style={{ background: series.color }} />
            {series.label}
          </li>
        ))}
      </ul>

      <div className="chart-frame" ref={ref}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Kümülatif getiri: ${summary}. Değerler için sol ve sağ ok tuşlarını kullanın.`}
            tabIndex={0}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(data.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={handleKeyDown}
          >
            {scales.ticks.map((tick) => (
              <g key={tick}>
                <line
                  className={tick === 0 ? "chart-zero" : "chart-grid"}
                  x1={PADDING.left}
                  x2={PADDING.left + plotWidth}
                  y1={scales.y(tick)}
                  y2={scales.y(tick)}
                />
                <text className="chart-axis" x={PADDING.left - 8} y={scales.y(tick)} textAnchor="end" dominantBaseline="middle">
                  {formatSignedPercent(tick)}
                </text>
              </g>
            ))}

            <text className="chart-axis" x={PADDING.left} y={HEIGHT - 6} textAnchor="start">
              {formatShortDate(data[0].label)}
            </text>
            <text className="chart-axis" x={PADDING.left + plotWidth} y={HEIGHT - 6} textAnchor="end">
              {formatShortDate(last.label)}
            </text>

            {[...SERIES].reverse().map((series) => (
              <path key={series.key} className="chart-line" d={path(series.key)} stroke={series.color} />
            ))}

            {SERIES.map((series, i) => (
              <g key={series.key}>
                <circle className="chart-dot" cx={scales.x(last.time)} cy={endY[i]} r={4} fill={series.color} />
                {showEndLabels && (
                  <text className="chart-end-label" x={scales.x(last.time) + 10} y={endY[i]} dominantBaseline="middle">
                    {series.short} {formatSignedPercent(last[series.key])}
                  </text>
                )}
              </g>
            ))}

            {focused && (
              <g>
                <line className="chart-crosshair" x1={focusX} x2={focusX} y1={PADDING.top} y2={PADDING.top + plotHeight} />
                {SERIES.map((series) => (
                  <circle
                    key={series.key}
                    className="chart-dot"
                    cx={focusX}
                    cy={scales.y(focused[series.key])}
                    r={4}
                    fill={series.color}
                  />
                ))}
              </g>
            )}
          </svg>
        )}

        {focused && (
          <div
            className="chart-tooltip"
            style={focusX > width / 2 ? { right: width - focusX + 12 } : { left: focusX + 12 }}
            aria-hidden="true"
          >
            <span className="chart-tooltip__time">{formatDateTime(focused.label)} UTC</span>
            {SERIES.map((series) => (
              <span key={series.key} className="chart-tooltip__row">
                <i className="line-key" style={{ background: series.color }} />
                <strong>{formatSignedPercent(focused[series.key])}</strong>
                <span>{series.short}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <details className="chart-table">
        <summary>Tablo görünümü</summary>
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Zaman (UTC)</th>
                {SERIES.map((series) => (
                  <th key={series.key}>{series.short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <td>{formatDateTime(d.label)}</td>
                  {SERIES.map((series) => (
                    <td key={series.key} className="is-number">
                      {formatSignedPercent(d[series.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
