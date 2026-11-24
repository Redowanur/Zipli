"use client";
import { motion } from "framer-motion";
import { useId, useMemo, useRef, useState } from "react";
import { fmt } from "@/lib/utils";

type Pt = { key: string; clicks: number };
const W = 640, H = 220, PX = 8, PT = 16, PB = 26;

function smooth(p: [number, number][]) {
  if (p.length < 2) return "";
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 1; i < p.length; i++) {
    const cx = (p[i - 1][0] + p[i][0]) / 2;
    d += ` C${cx},${p[i - 1][1]} ${cx},${p[i][1]} ${p[i][0]},${p[i][1]}`;
  }
  return d;
}

export function AreaChart({ data }: { data: Pt[] }) {
  const gid = useId();
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { pts, line, area, max } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.clicks));
    const nice = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
    const pts = data.map((d, i): [number, number] => [
      PX + (data.length === 1 ? (W - 2 * PX) / 2 : (i / (data.length - 1)) * (W - 2 * PX)),
      PT + (1 - d.clicks / nice) * (H - PT - PB),
    ]);
    const line = smooth(pts);
    const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${H - PB} L${pts[0][0]},${H - PB} Z` : "";
    return { pts, line, area, max: nice };
  }, [data]);

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !pts.length) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(pts[best][0] - x)) best = i; });
    setHover(best);
  };

  const h = hover !== null ? { p: pts[hover], d: data[hover] } : null;
  const labels = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => data.length && a.indexOf(v) === i);

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Clicks over time">
        <defs>
          <linearGradient id={`${gid}a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.45" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${gid}l`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => {
          const y = PT + (i / 4) * (H - PT - PB);
          return (
            <g key={i}>
              <line x1={PX} x2={W - PX} y1={y} y2={y} stroke="white" strokeOpacity={0.06} strokeDasharray="3 5" />
              <text x={PX + 2} y={y - 4} fontSize="10" fill="white" fillOpacity={0.3}>{fmt(Math.round(max * (1 - i / 4)))}</text>
            </g>
          );
        })}
        {area && <motion.path d={area} fill={`url(#${gid}a)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.4 }} />}
        {line && <motion.path d={line} fill="none" stroke={`url(#${gid}l)`} strokeWidth={2.6} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: "easeInOut" }} />}
        {labels.map((i) => (
          <text key={i} x={pts[i][0]} y={H - 6} fontSize="10" fill="white" fillOpacity={0.35} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>
            {new Date(data[i].key + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}
          </text>
        ))}
        {h && (
          <g pointerEvents="none">
            <line x1={h.p[0]} x2={h.p[0]} y1={PT} y2={H - PB} stroke="white" strokeOpacity={0.2} />
            <circle cx={h.p[0]} cy={h.p[1]} r={9} fill="#22d3ee" fillOpacity={0.2} />
            <circle cx={h.p[0]} cy={h.p[1]} r={4} fill="#22d3ee" stroke="#07070d" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div className="glass pointer-events-none absolute -translate-x-1/2 rounded-lg px-3 py-1.5 text-xs shadow-lg" style={{ left: `${(h.p[0] / W) * 100}%`, top: `${(Math.max(h.p[1] - 56, 0) / H) * 100}%` }}>
          <div className="text-white/50">{new Date(h.d.key + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}</div>
          <div className="font-semibold tabular-nums">{fmt(h.d.clicks)} clicks</div>
        </div>
      )}
    </div>
  );
}
