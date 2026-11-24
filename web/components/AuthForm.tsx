"use client";
import { motion } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn, gradientBtn } from "@/lib/utils";

const GOOGLE_ERRORS: Record<string, string> = {
  google_unconfigured: "Google sign-in isn't set up on this server yet.",
  google_cancelled: "Google sign-in was cancelled.",
  google_conflict: "This email is already linked to a different Google account.",
  google_failed: "Google sign-in failed. Please try again.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-4">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isReg = mode === "register";
  const { signIn, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setErr(GOOGLE_ERRORS[code] ?? "Sign-in failed. Please try again.");
  }, []);
  useEffect(() => { if (!loading && user) router.replace("/dashboard"); }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await signIn(email, password, isReg); router.replace("/dashboard"); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-5 py-12">
      <motion.div className="w-full" initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <Card className="[--card-spacing:--spacing(7)]">
          <form onSubmit={submit} className="contents">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold tracking-tight">{isReg ? "Create your account" : "Welcome back"}</CardTitle>
              <CardDescription>{isReg ? "Free forever for up to 25 links." : "Log in to manage your links."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button type="button" variant="outline" size="lg" className="h-10 w-full" onClick={() => { setBusy(true); window.location.href = "/api/auth/google"; }}>
                <GoogleMark />Continue with Google
              </Button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Separator className="flex-1" />or<Separator className="flex-1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" required placeholder="you@example.com" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete={isReg ? "new-password" : "current-password"} required minLength={8} maxLength={72}
                  placeholder={isReg ? "At least 8 characters" : "Your password"} className="h-10" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {err && (
                <Alert variant="destructive" role="alert">
                  <AlertCircle />
                  <AlertDescription>{err}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="flex-col gap-4 border-0 bg-transparent">
              <Button type="submit" size="lg" disabled={busy} className={cn("h-10 w-full", gradientBtn)}>
                {busy && <Loader2 className="animate-spin" />}{isReg ? "Create account" : "Log in"}
              </Button>
              <p className="text-sm text-muted-foreground">
                {isReg ? "Already have an account?" : "New here?"}{" "}
                <Link className="font-medium text-primary hover:underline" href={isReg ? "/login" : "/register"}>{isReg ? "Log in" : "Create an account"}</Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </main>
  );
}
