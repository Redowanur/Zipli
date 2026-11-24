"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn, gradientBtn } from "@/lib/utils";
import { LogoMark } from "./Logo";

export function Nav() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-border bg-background/60 backdrop-blur-xl"
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <LogoMark size={28} /> <span>Zip<span className="text-gradient">li</span></span>
        </Link>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="lg"><Link href="/pricing">Pricing</Link></Button>
          {!loading && user && (
            <>
              <Button asChild variant="ghost" size="lg"><Link href="/dashboard">Dashboard</Link></Button>
              <Button variant="ghost" size="lg" onClick={() => { signOut(); router.push("/"); }}>
                <LogOut data-icon="inline-start" /> Sign out
              </Button>
            </>
          )}
          {!loading && !user && (
            <>
              <Button asChild variant="ghost" size="lg"><Link href="/login">Log in</Link></Button>
              <Button asChild size="lg" className={cn("ml-1", gradientBtn)}><Link href="/register">Get started</Link></Button>
            </>
          )}
        </div>
      </nav>
    </motion.header>
  );
}
