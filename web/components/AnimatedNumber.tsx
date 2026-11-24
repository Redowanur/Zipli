"use client";
import { animate, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import { fmt } from "@/lib/utils";

export function AnimatedNumber({ value, className = "" }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const [text, setText] = useState("0");
  useEffect(() => {
    const unsub = mv.on("change", (v) => setText(fmt(Math.round(v))));
    const ctrl = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => { ctrl.stop(); unsub(); };
  }, [value, mv]);
  return <span className={`tabular-nums ${className}`}>{text}</span>;
}
