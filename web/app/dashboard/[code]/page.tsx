"use client";
import { motion } from "framer-motion";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { AreaChart } from "@/components/AreaChart";
import { BarList } from "@/components/BarList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type Stats } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { countryName, fillDays, flag } from "@/lib/utils";

const RANGES = [7, 30, 90, 365];
const LABEL: Record<number, string> = { 7: "7d", 30: "30d", 90: "90d", 365: "1y" };

export default function LinkAnalytics() {
  const { code: raw } = useParams<{ code: string }>();
  const code = decodeURIComponent(raw);
  const { retentionDays } = useAuth();
  const [days, setDays] = useState(7);
  const [st, setSt] = useState<Stats | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    setSt(null);
    api.stats(code, days)
      .then((s) => live && setSt(s))
      .catch((e) => { if (!live) return; if (e?.status === 404) setMissing(true); else toast.error(e.message ?? "Failed to load"); });
    return () => { live = false; };
  }, [code, days]);

  const series = useMemo(() => fillDays(st?.timeseries ?? [], days), [st, days]);
  const b = (x: { key: string; clicks: number }[] | undefined) => (x ?? []).map((i) => ({ label: i.key, clicks: i.clicks }));

  if (missing) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold">Link not found</h1>
        <Button asChild variant="outline" className="mt-5"><Link href="/dashboard"><ArrowLeft data-icon="inline-start" />Back to dashboard</Link></Button>
      </main>
    );
  }

  const stats: [string, number | undefined][] = [
    ["Total clicks", st?.total_clicks],
    ["Unique visitors", st?.unique_visitors],
    ["Clicks per visitor", st && st.unique_visitors ? Math.round((st.total_clicks / st.unique_visitors) * 10) / 10 : 0],
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground"><Link href="/dashboard"><ArrowLeft data-icon="inline-start" />All links</Link></Button>
      <div className="mb-8 mt-3 flex flex-wrap items-end justify-between gap-4">
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold tracking-tight">
          <span className="text-muted-foreground">/</span>{code}
        </motion.h1>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList aria-label="Date range">
            {RANGES.map((r) => (
              <TabsTrigger key={r} value={String(r)} disabled={r > retentionDays} title={r > retentionDays ? "Upgrade your plan for longer history" : undefined}>
                {LABEL[r]}{r > retentionDays && <Lock className="size-3" />}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(([label, v], i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card>
              <CardHeader><CardDescription>{label}</CardDescription></CardHeader>
              <CardContent>
                {st ? (i === 2 ? <span className="block text-3xl font-semibold tabular-nums">{String(v)}</span> : <AnimatedNumber value={v ?? 0} className="block text-3xl font-semibold" />) : <Skeleton className="h-9 w-24" />}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Clicks over time</CardTitle></CardHeader>
          <CardContent>{st ? <AreaChart key={days} data={series} /> : <Skeleton className="h-52" />}</CardContent>
        </Card>
      </motion.div>

      {st && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <BarList title="Top referrers" items={b(st.referrers)} />
          <BarList title="Countries" items={st.countries.map((c) => ({ label: countryName(c.key), clicks: c.clicks, icon: <span>{flag(c.key)}</span> }))} />
          <BarList title="Devices" items={b(st.devices)} />
          <BarList title="Browsers" items={b(st.browsers)} />
          <BarList title="Operating systems" items={b(st.os)} />
        </div>
      )}
    </main>
  );
}
