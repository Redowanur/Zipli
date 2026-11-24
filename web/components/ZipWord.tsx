"use client";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

const LETTERS = ["Z", "i", "p"];
const SEAM = "54%"; // vertical position of the zipper seam inside the line box

/**
 * "Zip" with a real zipper running through it. Each letter is two halves
 * (top/bottom). Open: the halves are pushed apart and a toothed seam shows.
 * A pull tab travels the seam; the letters snap shut behind it. Then it holds
 * closed, unzips back the other way, and loops. Reduced motion: plain text.
 */
export function ZipWord() {
  const root = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const q = gsap.utils.selector(root);
      const tops = q("[data-top]"), bots = q("[data-bot]");
      const tab = q("[data-tab]"), track = q("[data-track]");
      const W = (root.current as HTMLElement).getBoundingClientRect().width;
      const D = 1.1;
      const frac = [0.12, 0.45, 0.8]; // when the tab passes each letter (0 = left)
      const TOP_OPEN = { y: -6, x: -4, rotation: -2 };
      const BOT_OPEN = { y: 6, x: 4, rotation: 2 };
      const CLOSED = { y: 0, x: 0, rotation: 0 };

      // start closed
      gsap.set([...tops, ...bots], CLOSED);
      gsap.set(tab, { opacity: 0, x: 0 });
      gsap.set(track, { opacity: 0, scaleX: 1, transformOrigin: "100% 50%" });

      const tl = gsap.timeline({ repeat: -1, delay: 1.4 });

      // UNZIP: tab enters at the right edge and runs left, opening each letter.
      tl.set(tab, { x: W }, 0)
        .to(tab, { opacity: 1, duration: 0.15 }, 0)
        .to(tab, { x: 0, duration: D, ease: "power1.inOut" }, 0.1)
        .set(track, { transformOrigin: "0% 50%", scaleX: 0 }, 0)
        .to(track, { opacity: 1, duration: 0.15 }, 0.1)
        .to(track, { scaleX: 1, duration: D, ease: "power1.inOut" }, 0.1);
      [2, 1, 0].forEach((i, k) => {
        const at = 0.1 + D * (1 - frac[i]);
        tl.to(tops[i], { ...TOP_OPEN, duration: 0.35, ease: "back.out(2)" }, at)
          .to(bots[i], { ...BOT_OPEN, duration: 0.35, ease: "back.out(2)" }, at);
        void k;
      });
      tl.to(tab, { opacity: 0.0, duration: 0.2 }, 0.1 + D + 0.1);

      // hold open briefly, then ZIP shut: tab runs left to right, letters close behind it.
      const Z0 = 0.1 + D + 0.9;
      tl.set(track, { transformOrigin: "100% 50%" }, Z0)
        .to(tab, { opacity: 1, duration: 0.15 }, Z0)
        .to(tab, { x: W, duration: D, ease: "power1.inOut" }, Z0 + 0.05)
        .to(track, { scaleX: 0, duration: D, ease: "power1.inOut" }, Z0 + 0.05);
      [0, 1, 2].forEach((i) => {
        const at = Z0 + 0.05 + D * frac[i];
        tl.to(tops[i], { ...CLOSED, duration: 0.4, ease: "back.out(2.4)" }, at)
          .to(bots[i], { ...CLOSED, duration: 0.4, ease: "back.out(2.4)" }, at);
      });
      tl.to(tab, { opacity: 0, duration: 0.2 }, Z0 + 0.05 + D)
        .to(track, { opacity: 0, duration: 0.2 }, Z0 + 0.05 + D)
        .to({}, { duration: 2.6 }); // hold closed (readable headline)

      return () => { tl.kill(); };
    });
    return () => mm.revert();
  }, { scope: root });

  const half = (c: string, kind: "top" | "bot") => (
    <span aria-hidden="true" {...{ [`data-${kind}`]: "" }} className="absolute inset-0 inline-block"
      style={{ clipPath: kind === "top" ? `inset(0 -0.1em ${`calc(100% - ${SEAM})`} -0.1em)` : `inset(${SEAM} -0.1em 0 -0.1em)` }}>{c}</span>
  );

  return (
    <span ref={root} className="relative inline-block align-baseline">
      <span className="sr-only">Zip</span>
      {LETTERS.map((c) => (
        <span key={c} aria-hidden="true" className="relative inline-block">
          <span className="opacity-0">{c}</span>
          {half(c, "top")}
          {half(c, "bot")}
        </span>
      ))}
      {/* toothed seam + pull tab */}
      <svg aria-hidden="true" viewBox="0 0 100 4" preserveAspectRatio="none" className="pointer-events-none absolute left-0 h-1 w-full overflow-visible" style={{ top: SEAM }}>
        <line data-track x1="0" x2="100" y1="2" y2="2" stroke="#22d3ee" strokeOpacity="0.9" strokeWidth="3" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      </svg>
      <span data-tab aria-hidden="true" className="pointer-events-none absolute left-0 flex h-[0.28em] w-[0.42em] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[0.08em] bg-primary opacity-0 shadow-[0_0_14px_rgba(139,92,246,0.7)]" style={{ top: SEAM }}>
        <span className="size-[0.1em] rounded-full border border-primary-foreground/80" />
      </span>
    </span>
  );
}
