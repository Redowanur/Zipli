"use client";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { AlertCircle, ArrowRight, BarChart3, Check, Copy, Globe, Link2, Loader2, QrCode, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { HeroMachine } from "@/components/HeroMachine";
import { ZipWord } from "@/components/ZipWord";
import { api, ApiError, type Link as LinkT } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, gradientBtn } from "@/lib/utils";

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } };
const rise: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

const FEATURES = [
  { icon: Zap, title: "Instant redirects", text: "Hot links are served straight from Redis, so visitors reach the destination without waiting on a database." },
  { icon: BarChart3, title: "Real-time analytics", text: "Clicks, unique visitors, referrers, countries, devices and browsers, updated within seconds." },
  { icon: ShieldCheck, title: "Never blocks a click", text: "Tracking is asynchronous through Kafka. Even if analytics is down, redirects keep working." },
  { icon: Link2, title: "Custom aliases", text: "Pick a memorable slug, set an expiry date, or switch a link off in one click." },
  { icon: QrCode, title: "Instant QR codes", text: "Every link gets a crisp, downloadable QR code for print, packaging and posters." },
  { icon: Globe, title: "Built to scale", text: "Stateless Go APIs behind a load balancer. Add replicas whenever traffic grows." },
];

function HeroShortener() {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<LinkT | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true); setCopied(false);
    try {
      // Signed-in users get the link in their dashboard; guests get a 7-day link.
      setResult(user ? await api.createLink({ url }) : await api.shortenPublic(url));
    } catch (ex) {
      const rate = ex instanceof ApiError && ex.status === 429;
      setErr(rate ? "Too many requests. Please wait a moment, or sign up for higher limits." : ex instanceof Error ? ex.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.short_url).catch(() => {});
    setCopied(true); toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto mt-12 max-w-2xl text-left">
      <Card className="p-0 transition-shadow focus-within:ring-primary/60">
        <form onSubmit={submit} className="flex flex-col gap-2 p-2 sm:flex-row">
          <Input
            value={url} onChange={(e) => setUrl(e.target.value)} required aria-label="Long URL to shorten" type="text" inputMode="url"
            placeholder="Paste your long URL here…" autoComplete="off"
            className="h-12 w-full flex-none border-0 sm:flex-1 bg-transparent px-4 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <Button type="submit" disabled={busy} className={cn("h-12 w-full px-7 text-base sm:w-44", gradientBtn)}>
            {busy && <Loader2 className="animate-spin" />}Shorten
          </Button>
        </form>
      </Card>

      <AnimatePresence mode="wait">
        {err && (
          <motion.div key="err" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3">
            <Alert variant="destructive" role="alert"><AlertCircle /><AlertDescription>{err}</AlertDescription></Alert>
          </motion.div>
        )}
        {result && !err && (
          <motion.div key={result.code} initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }} className="mt-4">
            <Card className="ring-emerald-400/30">
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Badge variant="outline" className="border-emerald-400/30 text-emerald-300"><Check /> Your short link is ready</Badge>
                    <a href={result.short_url} target="_blank" rel="noreferrer" className="mt-2 block truncate font-mono text-lg font-semibold hover:text-cyan">
                      {result.short_url.replace(/^https?:\/\//, "")}
                    </a>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{result.target_url}</div>
                  </div>
                  <Button onClick={copy} variant={copied ? "secondary" : "default"} size="lg" className={cn("min-w-28", !copied && gradientBtn)}>
                    {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied ? "Copied" : "Copy link"}
                  </Button>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  {user
                    ? <>Saved to your account. <Link href="/dashboard" className="text-cyan hover:underline">View in dashboard →</Link></>
                    : <>Guest links expire in 7 days and have no stats. <Link href="/register" className="text-cyan hover:underline">Create a free account</Link> to keep links and track clicks.</>}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      {!result && !err && <p className="mt-3 text-center text-xs text-muted-foreground">No account needed · Free · Redirects in milliseconds</p>}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  return (
    <main className="overflow-x-clip">
      <div className="relative">
        {/* decorative illustration behind the hero copy */}
        <HeroMachine className="pointer-events-none absolute bottom-0 left-0 z-0 h-[270px] w-full" />
      <section className="relative z-10 mx-auto max-w-5xl px-5 pb-64 pt-20 text-center sm:pt-28">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={rise}>
            <Badge variant="outline" className="h-7 gap-2 bg-card px-4 text-xs font-normal text-muted-foreground backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Go · Redis · Kafka · ClickHouse
            </Badge>
          </motion.div>
          <motion.h1 variants={rise} className="mx-auto mt-7 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
            <ZipWord /> long links<br /><span className="text-gradient">down to size.</span>
          </motion.h1>
          <motion.p variants={rise} className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Create memorable short URLs, redirect in milliseconds, and see exactly who clicks, from where and on what device.
          </motion.p>
          <motion.div variants={rise} className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild className={cn("h-11 px-7 text-base", gradientBtn)}><Link href={user ? "/dashboard" : "/register"}>{user ? "Open dashboard" : "Start for free"}<ArrowRight data-icon="inline-end" /></Link></Button>
            <Button asChild variant="outline" className="h-11 px-7 text-base"><Link href="/pricing">See pricing</Link></Button>
          </motion.div>
          <motion.div variants={rise}><HeroShortener /></motion.div>
        </motion.div>
      </section>
      </div>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything you need, nothing in the way
        </motion.h2>
        <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <motion.div key={f.title} variants={rise} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
              <Card className="group relative h-full transition-colors hover:ring-primary/40">
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary"><f.icon className="size-5" /></div>
                  <CardTitle className="text-base">{f.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{f.text}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">The redirect path stays tiny</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">Analytics rides a separate lane, so counting a click never slows the click down.</p>
        <Card className="mt-10 [--card-spacing:--spacing(7)]">
          <CardContent>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {["Edge / Nginx", "Go API", "Redis", "Postgres"].map((s, i, a) => (
                <div key={s} className="flex items-center gap-2 sm:gap-3">
                  <motion.div initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}>
                    <Badge variant="secondary" className="h-9 px-4 text-sm font-medium">{s}</Badge>
                  </motion.div>
                  {i < a.length - 1 && <ArrowRight className="size-4 text-cyan" />}
                </div>
              ))}
            </div>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><Separator className="flex-1" />async, off the hot path<Separator className="flex-1" /></div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {["Kafka", "ClickHouse", "Your dashboard"].map((s, i, a) => (
                <div key={s} className="flex items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="h-9 border-primary/40 bg-primary/10 px-4 text-sm font-medium">{s}</Badge>
                  {i < a.length - 1 && <ArrowRight className="size-4 text-primary" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-28 pt-8">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Card className="relative text-center [--card-spacing:--spacing(12)]">
            <CardHeader className="relative items-center">
              <CardTitle className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to shorten your first link?</CardTitle>
              <CardDescription>Free plan includes 25 links and QR codes. No card required.</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <Button asChild className={cn("h-11 px-8 text-base", gradientBtn)}><Link href="/register">Create free account</Link></Button>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">© {new Date().getFullYear()} Zipli</footer>
    </main>
  );
}
