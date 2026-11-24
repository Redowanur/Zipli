"use client";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { tokenStore } from "@/lib/api";

// Landing page after Google sign-in. The API puts our session token in the URL
// fragment (never sent to servers or logged); store it and do a full load so
// the auth provider fetches the user.
export default function AuthCallback() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (token) {
      tokenStore.set(token);
      window.location.replace("/dashboard");
    } else {
      window.location.replace("/login?error=google_failed");
    }
  }, []);
  return (
    <main className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 size-5 animate-spin" /> Signing you in…
    </main>
  );
}
