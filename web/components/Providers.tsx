"use client";
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <TooltipProvider>
          {children}
          <Toaster position="bottom-center" richColors />
        </TooltipProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
