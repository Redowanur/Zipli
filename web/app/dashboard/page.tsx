"use client";
import { motion } from "framer-motion";
import { AlertTriangle, BarChart3, Copy, Link2, Loader2, MoreHorizontal, Power, QrCode, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { AreaChart } from "@/components/AreaChart";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { QRModal } from "@/components/QRModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type Link as LinkT, type Overview } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, fillDays, host, timeAgo } from "@/lib/utils";

const enter = (delay: number) => ({
  initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

function Stat({ label, value, sub, delay }: { label: string; value: number; sub?: string; delay: number }) {
  return (
    <motion.div {...enter(delay)}>
      <Card className="h-full">
        <CardHeader><CardDescription>{label}</CardDescription></CardHeader>
        <CardContent>
          <AnimatedNumber value={value} className="block text-3xl font-semibold tracking-tight" />
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { user, linkLimit, retentionDays } = useAuth();
  const DAYS = Math.min(30, retentionDays); // window shown on this page
  const [links, setLinks] = useState<LinkT[] | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [q, setQ] = useState("");
  const [qr, setQr] = useState<LinkT | null>(null);
  const [toDelete, setToDelete] = useState<LinkT | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, o] = await Promise.all([api.links(), api.overview(DAYS).catch(() => null)]);
      setLinks(l.links); setOv(o);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); setLinks([]); }
  }, [DAYS]);
  useEffect(() => { load(); }, [load]);

  const atLimit = links !== null && links.length >= linkLimit;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (links ?? []).filter((l) => !s || l.code.toLowerCase().includes(s) || l.target_url.toLowerCase().includes(s));
  }, [links, q]);
  const series = useMemo(() => fillDays(ov?.timeseries ?? [], DAYS), [ov, DAYS]);
  const active = links?.filter((l) => !l.disabled).length ?? 0;
  const usePct = linkLimit ? Math.min(100, ((links?.length ?? 0) / linkLimit) * 100) : 0;

  async function copy(l: LinkT) {
    await navigator.clipboard.writeText(l.short_url).catch(() => {});
    toast.success("Copied " + l.short_url.replace(/^https?:\/\//, ""));
  }
  async function toggle(l: LinkT) {
    try {
      await api.setDisabled(l.code, !l.disabled);
      setLinks((s) => s!.map((x) => (x.code === l.code ? { ...x, disabled: !l.disabled } : x)));
      toast.success(l.disabled ? "Link enabled" : "Link disabled");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteLink(toDelete.code);
      setLinks((s) => s!.filter((x) => x.code !== toDelete.code));
      toast.success("Link deleted");
      setToDelete(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to delete"); }
    finally { setDeleting(false); }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          {user?.email} <Badge variant="secondary" className="capitalize">{user?.plan} plan</Badge>
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Clicks (${DAYS} days)`} value={ov?.total_clicks ?? 0} delay={0} />
        <Stat label="Unique visitors" value={ov?.unique_visitors ?? 0} sub={`${DAYS} days`} delay={0.08} />
        <Stat label="Active links" value={active} sub={`${links?.length ?? 0} total`} delay={0.16} />
        <motion.div {...enter(0.24)}>
          <Card className="h-full">
            <CardHeader><CardDescription>Plan usage</CardDescription></CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums tracking-tight">{links?.length ?? 0}
                <span className="text-lg text-muted-foreground"> / {linkLimit >= 1e9 ? "∞" : linkLimit.toLocaleString()}</span>
              </div>
              <Progress value={usePct} className={cn("mt-3 h-1.5", usePct > 85 ? "[&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-rose-500" : "[&>div]:bg-gradient-to-r [&>div]:from-violet [&>div]:to-cyan")} aria-label="Plan usage" />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div {...enter(0.3)} className="mt-4"><CreateLinkForm onCreated={(l) => setLinks((s) => [l, ...(s ?? [])])}
        disabledReason={atLimit ? "You've reached your plan's link limit. Delete a link or upgrade to add more." : undefined} /></motion.div>

      <motion.div {...enter(0.36)} className="mt-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Clicks over the last {DAYS} days</CardTitle></CardHeader>
          <CardContent>{ov === null && links === null ? <Skeleton className="h-52" /> : <AreaChart data={series} />}</CardContent>
        </Card>
      </motion.div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Your links</h2>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Search links…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search links" />
          </div>
        </div>

        {links === null ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : shown.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary"><Link2 className="size-6" /></div>
              <p className="font-medium">{links.length === 0 ? "No links yet" : "No links match your search"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{links.length === 0 ? "Paste a URL above to create your first short link." : "Try a different search."}</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Link</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="hidden md:table-cell">Created</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((l) => (
                  <TableRow key={l.code} className={cn("animate-in fade-in slide-in-from-top-1 duration-300", l.disabled && "opacity-60")}>
                    <TableCell className="max-w-0 pl-4 sm:max-w-xs">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-semibold text-primary uppercase">
                          {host(l.target_url).replace(/^www\./, "")[0]}
                        </div>
                        <div className="min-w-0">
                          <button onClick={() => copy(l)} className="block max-w-full truncate font-medium hover:text-cyan" title="Click to copy">{l.short_url.replace(/^https?:\/\//, "")}</button>
                          <div className="truncate text-xs text-muted-foreground" title={l.target_url}>{l.target_url}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-base font-semibold tabular-nums">{(ov?.by_link[l.code] ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{timeAgo(l.created_at)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {l.disabled ? <Badge variant="outline" className="border-amber-400/40 text-amber-300">Disabled</Badge>
                        : l.expires_at ? <Badge variant="outline">Expires {new Date(l.expires_at).toLocaleDateString()}</Badge>
                        : <Badge variant="outline" className="border-emerald-400/30 text-emerald-300">Active</Badge>}
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="outline" size="sm"><Link href={`/dashboard/${encodeURIComponent(l.code)}`}><BarChart3 data-icon="inline-start" />Analytics</Link></Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${l.code}`}><MoreHorizontal /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => copy(l)}><Copy />Copy link</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setQr(l)}><QrCode />QR code</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggle(l)}><Power />{l.disabled ? "Enable" : "Disable"}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(l)}><Trash2 />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      <QRModal url={qr?.short_url ?? null} code={qr?.code ?? ""} onClose={() => setQr(null)} />

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && !deleting && setToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive"><AlertTriangle className="size-5" /></div>
            <DialogTitle>Delete this link?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{toDelete?.short_url.replace(/^https?:\/\//, "")}</span> will stop redirecting immediately and cannot be recovered.
              Anyone using it will see a 404. Click history for it stays in your analytics until it ages out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}Delete link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
