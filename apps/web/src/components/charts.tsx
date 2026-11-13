import type { DomainScore, TimelinePoint } from "@pathfinder/shared-types";
import { dimensionLabels } from "@pathfinder/design-system";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtDate } from "@/lib/format";

const axis = { stroke: "var(--pf-text-muted)", fontSize: 12 };
const tooltipStyle = { background: "var(--pf-surface)", border: "1px solid var(--pf-border)", borderRadius: 12, color: "var(--pf-text)" };

export function TrendChart({ data, height = 240 }: { data: TimelinePoint[] | Array<{ week: string; average_score: number }>; height?: number }) {
  const rows = (data as Array<Record<string, unknown>>).map((d) => ({
    label: fmtDate((d.period_start ?? d.week) as string, { day: "numeric", month: "short" }),
    score: d.average_score as number | null, actions: (d.actions ?? d.count) as number,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="var(--pf-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={axis} tickLine={false} />
        <YAxis domain={[0, 100]} tick={axis} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="score" name="Average score" stroke="var(--pf-primary)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DomainBars({ scores, height = 260 }: { scores: DomainScore[]; height?: number }) {
  const rows = scores.map((s) => ({ name: (s.domain_name ?? "").split(" ")[0], skill: s.skill_score ?? 0, interest: s.interest_score ?? 0, color: s.domain_color ?? "#6366f1", measured: s.skill_score !== null }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="var(--pf-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={axis} tickLine={false} interval={0} />
        <YAxis domain={[0, 100]} tick={axis} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v ? v.toFixed(0) : "not yet measured", n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} payload={[{ value: "Interest (your choice)", type: "square", color: "var(--pf-accent)" }, { value: "Demonstrated skill", type: "square", color: "var(--pf-primary)" }]} />
        <Bar dataKey="interest" name="Interest (your choice)" fill="var(--pf-accent)" radius={[6, 6, 0, 0]} />
        <Bar dataKey="skill" name="Demonstrated skill" radius={[6, 6, 0, 0]}>
          {rows.map((r) => <Cell key={r.name} fill={r.color} fillOpacity={r.measured ? 1 : 0.15} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DimensionRadar({ score, height = 260 }: { score: DomainScore; height?: number }) {
  const rows = (score.dimensions as Array<{ key: string; value: number | null }>).map((d) => ({ dim: dimensionLabels[d.key] ?? d.key, value: d.value ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={rows} outerRadius="72%">
        <PolarGrid stroke="var(--pf-border)" />
        <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: "var(--pf-text-muted)" }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={score.domain_color ?? "var(--pf-primary)"} fill={score.domain_color ?? "var(--pf-primary)"} fillOpacity={0.25} />
        <Tooltip contentStyle={tooltipStyle} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function SimpleBars({ data, height = 240, color = "var(--pf-primary)" }: { data: Array<{ name: string; value: number; color?: string }>; height?: number; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="var(--pf-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={axis} tickLine={false} interval={0} />
        <YAxis tick={axis} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>{data.map((d) => <Cell key={d.name} fill={d.color ?? color} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
