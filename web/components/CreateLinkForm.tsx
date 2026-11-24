"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Link } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, gradientBtn } from "@/lib/utils";

export function CreateLinkForm({ onCreated, disabledReason }: { onCreated: (l: Link) => void; disabledReason?: string }) {
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [expires, setExpires] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const l = await api.createLink({
        url, alias: alias || undefined,
        expires_at: expires ? new Date(expires).toISOString() : undefined,
      });
      onCreated(l);
      navigator.clipboard?.writeText(l.short_url).catch(() => {});
      toast.success("Link created and copied to clipboard");
      setUrl(""); setAlias(""); setExpires("");
    } catch (ex) { setErr(ex instanceof Error ? ex.message : "Could not create link"); }
    finally { setBusy(false); }
  }

  const message = err || disabledReason;
  return (
    <Card>
      <CardContent>
        <form onSubmit={submit}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input required placeholder="Paste a long URL, e.g. https://example.com/very/long/path" value={url} onChange={(e) => setUrl(e.target.value)}
              aria-label="Destination URL" disabled={!!disabledReason} className="h-10 flex-1" />
            <Button type="submit" size="lg" disabled={busy || !!disabledReason} className={cn("h-10 px-6 sm:w-40", gradientBtn)}>
              {busy && <Loader2 className="animate-spin" />}Shorten
            </Button>
          </div>
          <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(!open)} className="mt-2 text-muted-foreground" aria-expanded={open}>
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} /> Custom alias &amp; expiry
          </Button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28 }} className="overflow-hidden">
                <div className="grid gap-4 pt-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="alias">Custom alias</Label>
                    <Input id="alias" placeholder="my-launch" pattern="[0-9A-Za-z_\-]{3,32}" title="3–32 letters, digits, - or _" value={alias} onChange={(e) => setAlias(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="exp">Expires at</Label>
                    <Input id="exp" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {message && (
            <Alert variant="destructive" className="mt-3" role="alert">
              <AlertCircle /><AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
