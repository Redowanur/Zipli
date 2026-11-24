"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fmt } from "@/lib/utils";

export type BarItem = { label: string; clicks: number; icon?: ReactNode };

export function BarList({ title, items, empty = "No data yet" }: { title: string; items: BarItem[]; empty?: string }) {
  const total = items.reduce((a, b) => a + b.clicks, 0);
  const max = Math.max(1, ...items.map((i) => i.clicks));
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 80); return () => clearTimeout(t); }, []);

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-3.5">
            {items.map((it, i) => (
              <li key={it.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex min-w-0 items-center gap-2 truncate">{it.icon}<span className="truncate">{it.label}</span></span>
                  <span className="ml-3 shrink-0 tabular-nums text-muted-foreground">{fmt(it.clicks)} <span className="opacity-60">· {Math.round((it.clicks / total) * 100)}%</span></span>
                </div>
                <Progress value={ready ? (it.clicks / max) * 100 : 0} className="h-1.5 [&>div]:bg-gradient-to-r [&>div]:from-violet [&>div]:to-cyan [&>div]:duration-1000"
                  style={{ transitionDelay: `${i * 70}ms` }} aria-label={`${it.label}: ${it.clicks} clicks`} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
