import { useId, useMemo, useState } from "react";
import type { AdminData } from "../../types/database";
import { number, PERIODS, type Period } from "../../app/admin/utils";
import { cn } from "../../utils/cn";

export function ActivityChart({ data, period }: { data: AdminData; period: Period }) {
  const [metric, setMetric] = useState<"events" | "leads" | "bookings">("events");
  const [hover, setHover] = useState<number | null>(null);
  const gradient = useId().replace(/:/g, "");
  const series = useMemo(() => {
    const count = period === "24h" ? 12 : period === "7d" ? 14 : 15;
    const duration = PERIODS[period].milliseconds;
    const now = Date.now(), start = now - duration;
    const values = Array.from({ length: count }, (_, i) => ({ count: 0, date: new Date(start + (i + 0.5) * duration / count) }));
    data[metric].forEach((record) => {
      const index = Math.floor((Date.parse(record.created_at) - start) / duration * count);
      if (index >= 0 && index < count) values[index].count += 1;
    });
    return values;
  }, [data, period, metric]);
  const max = Math.max(10, Math.ceil(Math.max(...series.map((s) => s.count)) / 10) * 10);
  const points = series.map((item, index) => ({ x: 43 + index * (608 / (series.length - 1)), y: 171 - item.count / max * 142 }));
  const path = points.reduce((out, point, index) => {
    if (!index) return `M${point.x},${point.y}`;
    const previous = points[index - 1], half = (point.x - previous.x) / 2;
    return `${out} C${previous.x + half},${previous.y} ${point.x - half},${point.y} ${point.x},${point.y}`;
  }, "");
  const total = series.reduce((sum, item) => sum + item.count, 0);

  return <section className="activity-chart panel"><div className="chart-heading"><div><h2>System activity</h2><p>Work happening across {data.tenants.length === 1 ? "this workspace" : "your workspaces"}.</p></div><div className="chart-tabs" role="group" aria-label="Chart metric">{(["events", "leads", "bookings"] as const).map((type) => <button key={type} className={cn(metric === type && "active")} aria-pressed={metric === type} onClick={() => { setMetric(type); setHover(null); }}>{type === "events" ? "Actions" : type.charAt(0).toUpperCase() + type.slice(1)}</button>)}</div></div><div className="chart-summary"><span className="chart-total">{number(total)}</span><span>{metric === "events" ? "events processed" : `${metric} received`}</span><div className="chart-legend"><i/>{metric === "events" ? "System actions" : metric.charAt(0).toUpperCase() + metric.slice(1)}</div></div><div className="chart-plot" onMouseLeave={() => setHover(null)}><svg viewBox="0 0 680 213" role="img" aria-label={`${total} ${metric} over ${PERIODS[period].label.toLowerCase()}`}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--admin-accent)" stopOpacity="0.19"/><stop offset="100%" stopColor="var(--admin-accent)" stopOpacity="0.01"/></linearGradient></defs>{[0, 1, 2, 3].map((tick) => { const y = 171 - tick / 3 * 142; return <g key={tick}><line x1="42" y1={y} x2="657" y2={y} stroke="var(--admin-line)" strokeDasharray="3 5"/><text x="28" y={y + 3} textAnchor="end" fill="var(--admin-faint)" fontSize="10">{Math.round(tick * max / 3)}</text></g>; })}<path d={`${path} L651,171 L43,171 Z`} fill={`url(#${gradient})`}/><path key={`${metric}-${period}`} className="chart-line" d={path} fill="none" stroke="var(--admin-accent)" strokeWidth="2.4" strokeLinecap="round"/>{series.map((item, i) => (i % 2 === 0 || i === series.length - 1) && <text key={i} x={points[i].x} y="201" textAnchor="middle" fill="var(--admin-faint)" fontSize="10">{item.date.toLocaleDateString("en-US", period === "24h" ? { hour: "numeric" } : { month: "short", day: "numeric" }).replace(/^.*?, /, "")}</text>)}{hover !== null && <g><line x1={points[hover].x} x2={points[hover].x} y1="19" y2="171" stroke="var(--admin-accent)" strokeOpacity=".35" strokeDasharray="3 4"/><circle cx={points[hover].x} cy={points[hover].y} r="4.5" fill="var(--admin-accent)" stroke="var(--admin-surface)" strokeWidth="2"/></g>}{points.map((point, i) => <rect key={i} x={Math.max(30, point.x - 608 / series.length / 2)} y="15" width={608 / series.length + 5} height="160" fill="transparent" tabIndex={0} role="button" aria-label={`${series[i].date.toLocaleString()}: ${series[i].count} ${metric}`} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onMouseEnter={() => setHover(i)}/>)}</svg>{hover !== null && <div className="chart-tooltip" style={{ left: `${Math.max(12, Math.min(78, points[hover].x / 680 * 100))}%` }}><strong>{series[hover].count} {metric === "events" ? "actions" : metric}</strong><span>{series[hover].date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>}</div></section>;
}

export function Sparkline({ values, variant = 0 }: { values: number[]; variant?: number }) {
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => `${2 + i * 76 / Math.max(1, values.length - 1)},${29 - v / max * 24}`).join(" ");
  return <svg className="sparkline" viewBox="0 0 82 34" aria-hidden="true"><polyline points={points} fill="none" stroke={variant === 1 ? "#a8bba1" : "var(--admin-accent)"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}