"use client";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PLANS, formatBDT } from "@/lib/plans";
import { cn, gradientBtn } from "@/lib/utils";

export default function Pricing() {
  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-16">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Simple pricing, in <span className="text-gradient">৳ BDT</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Start free. Upgrade when your links and traffic grow. Prices are per month.</p>
      </motion.div>

      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -8 }}
            transition={{ duration: 0.6, delay: 0.1 + i * 0.1, ease: [0.16, 1, 0.3, 1] }} className="relative">
            {p.highlight && <Badge className={cn("absolute -top-3 left-1/2 z-10 -translate-x-1/2", gradientBtn)}>Most popular</Badge>}
            <Card className={cn("h-full [--card-spacing:--spacing(6)]", p.highlight && "ring-primary/70")}>
              <CardHeader>
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <CardDescription>{p.blurb}</CardDescription>
                <div className="flex items-baseline gap-1 pt-3">
                  {p.price === null ? <span className="text-3xl font-semibold">Custom</span> : (
                    <><span className="text-4xl font-semibold tabular-nums">{formatBDT(p.price)}</span><span className="text-sm text-muted-foreground">/mo</span></>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <Separator className="mb-5" />
                <ul className="space-y-3 text-sm">
                  {p.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-cyan" />
                      <span>{f.text}{f.soon && <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px] uppercase">soon</Badge>}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="border-0 bg-transparent">
                <Button asChild size="lg" variant={p.highlight ? "default" : "outline"} className={cn("h-10 w-full", p.highlight && gradientBtn)}>
                  <Link href="/register">{p.id === "free" ? "Start free" : p.price === null ? "Talk to us" : "Start free, upgrade later"}</Link>
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
        Paid checkout (bKash, Nagad and cards) is not live yet. Every account starts on Free today, and paid plans will unlock when billing launches.
      </p>
    </main>
  );
}
