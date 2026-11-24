"use client";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

/**
 * Background illustration for the hero: a "zip machine". Long URLs ride a
 * conveyor into the machine; short links come out the other side. Everything
 * loops forever. Flat line-art, low contrast (no gradients), decorative only.
 *
 * Drawn in a 1600-wide design space; the visible window (viewBox) is wider so
 * items enter and leave fully off-screen, and it is anchored to the bottom of
 * the hero. Rendered at ~0.7x so it stays a background element.
 */

// Illustrative sample text (not a real domain).
const LONG_URL = "https://example.com/blog/2026/launch?utm_source=newsletter";
const SHORT_URL = "zpl.li/k9Xw2Qa";

// Visible window: x -320..1920, y 250..621 (aspect ~6:1, rendered 270px tall).
const VB = { x: -320, y: 250, w: 2240, h: 371 };
const BELT_Y = 590;                 // top surface of both conveyors
const ITEM_Y = BELT_Y - 36;         // items ride on the belt
const IN_X = 620, OUT_X = 980;      // machine mouth / chute
const RIBBON_W = 520, PILL_W = 176;
const SPEED = 420;                  // px per second, both belts
const RIBBON_FROM = VB.x - RIBBON_W - 20, RIBBON_TO = IN_X;      // starts fully off-screen left
const PILL_FROM = OUT_X - PILL_W, PILL_TO = VB.x + VB.w + 40;      // ends fully off-screen right
const HIT_AT = (IN_X - RIBBON_W - RIBBON_FROM) / SPEED;            // long link reaches the mouth
const PILL_START = HIT_AT + 0.4;                                    // short "processing" pause
const RIBBON_DUR = (RIBBON_TO - RIBBON_FROM) / SPEED;
const PILL_DUR = (PILL_TO - PILL_FROM) / SPEED;
const CYCLE = PILL_START + PILL_DUR + 0.05;                         // two lanes are staggered by half

const LINE = "rgba(255,255,255,0.24)";
const SOFT = "rgba(255,255,255,0.10)";
const VIOLET = "#8b5cf6";
const CYAN = "#22d3ee";
const GREEN = "#34d399";

/** Gear outline centred on (0,0): trapezoid teeth around a body circle. */
function gearPath(r: number, teeth: number, depth: number) {
  const seg = (Math.PI * 2) / teeth;
  const pts: string[] = [];
  for (let t = 0; t < teeth; t++) {
    const b = t * seg;
    for (const [f, rad] of [[0.08, r], [0.28, r + depth], [0.58, r + depth], [0.78, r]] as const) {
      const a = b + f * seg;
      pts.push(`${(Math.cos(a) * rad).toFixed(1)},${(Math.sin(a) * rad).toFixed(1)}`);
    }
  }
  return `M${pts.join("L")}Z`;
}

export function HeroMachine({ className = "" }: { className?: string }) {
  const root = useRef<SVGSVGElement>(null);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: reduce)", () => {
      // Static frame: one link approaching, one leaving.
      gsap.set(q("[data-ribbon='0']"), { x: 40 });
      gsap.set(q("[data-ribbon='1']"), { autoAlpha: 0 });
      gsap.set(q("[data-pill='0']"), { x: 1150 });
      gsap.set(q("[data-pill='1']"), { autoAlpha: 0 });
    });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Two staggered lanes so both belts always have something on them.
      [0, 1].forEach((i) => {
        const tl = gsap.timeline({ repeat: -1 });
        tl.fromTo(q(`[data-ribbon='${i}']`), { x: RIBBON_FROM }, { x: RIBBON_TO, duration: RIBBON_DUR, ease: "none" }, 0)
          .fromTo(q(`[data-pill='${i}']`), { x: PILL_FROM }, { x: PILL_TO, duration: PILL_DUR, ease: "none" }, PILL_START)
          .to({}, { duration: 0.001 }, CYCLE - 0.001);
        tl.progress(i * 0.5);
      });

      // Belts: dashes slide in the direction of travel.
      gsap.to(q("[data-belt]"), { strokeDashoffset: -40, duration: 40 / SPEED, ease: "none", repeat: -1 });

      // Interlocked gears (ratio follows tooth count: 8 vs 6).
      gsap.to(q("[data-gear-a]"), { rotation: 360, duration: 9, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
      gsap.fromTo(q("[data-gear-b]"), { rotation: 25 }, { rotation: 25 - 360, duration: 9 * 6 / 8, ease: "none", repeat: -1, transformOrigin: "50% 50%" });

      // Press stamps down each time a long link reaches the mouth (every CYCLE/2).
      const press = gsap.timeline({ repeat: -1, delay: HIT_AT - 0.15 });
      press.to(q("[data-press]"), { y: 14, duration: 0.18, ease: "power2.in" })
        .to(q("[data-press]"), { y: 0, duration: 0.4, ease: "power2.out" })
        .to({}, { duration: CYCLE / 2 - 0.58 });

      // Status lamp pulses; screen cursor blinks.
      gsap.to(q("[data-lamp]"), { opacity: 0.25, duration: 0.55, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(q("[data-cursor]"), { opacity: 0, duration: 0.5, ease: "steps(1)", yoyo: true, repeat: -1 });

      // Exhaust puffs rise and fade.
      q("[data-puff]").forEach((el, i) => {
        gsap.fromTo(el, { y: 0, scale: 0.5, opacity: 0.45 }, { y: -64, scale: 1.5, opacity: 0, duration: 2.4, ease: "power1.out", repeat: -1, delay: i * 0.8, transformOrigin: "50% 50%" });
      });
    });

    return () => mm.revert();
  }, { scope: root });

  const ribbon = (i: number) => (
    <g key={i} data-ribbon={i} transform={`translate(${RIBBON_FROM} ${ITEM_Y})`}>
      <rect width={RIBBON_W} height={34} rx={9} fill={SOFT} stroke={LINE} />
      <text x={16} y={22} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize={14} fill="rgba(255,255,255,0.55)">{LONG_URL}</text>
    </g>
  );
  const pill = (i: number) => (
    <g key={i} data-pill={i} transform={`translate(${PILL_FROM} ${ITEM_Y})`}>
      <rect width={PILL_W} height={34} rx={17} fill="rgba(34,211,238,0.10)" stroke={CYAN} strokeOpacity={0.75} />
      <circle cx={20} cy={17} r={8} fill="none" stroke={GREEN} strokeOpacity={0.9} />
      <path d="M16.5 17.2l2.6 2.6 4.6-5" fill="none" stroke={GREEN} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <text x={38} y={22} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize={14} fill="rgba(255,255,255,0.85)">{SHORT_URL}</text>
    </g>
  );

  return (
    <svg ref={root} aria-hidden="true" focusable="false" viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMax slice"
      className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="zm-clip-in"><rect x={-800} y={500} width={IN_X + 800} height={120} /></clipPath>
        <clipPath id="zm-clip-out"><rect x={OUT_X} y={500} width={1200} height={120} /></clipPath>
      </defs>

      {/* conveyors */}
      {[[VB.x - 20, IN_X + 10], [OUT_X - 10, VB.x + VB.w + 20]].map(([x1, x2], i) => (
        <g key={i}>
          <rect x={x1} y={BELT_Y} width={x2 - x1} height={22} rx={11} fill="none" stroke={LINE} />
          <line data-belt x1={x1 + 16} x2={x2 - 16} y1={BELT_Y + 11} y2={BELT_Y + 11} stroke={LINE} strokeWidth={3} strokeLinecap="round" strokeDasharray="10 30" />
        </g>
      ))}

      {/* items: long links go in (clipped at the mouth), short links come out (clipped at the chute) */}
      <g clipPath="url(#zm-clip-in)">{[0, 1].map(ribbon)}</g>
      <g clipPath="url(#zm-clip-out)">{[0, 1].map(pill)}</g>

      {/* exhaust */}
      <rect x={900} y={368} width={28} height={34} rx={4} style={{ fill: "var(--background)" }} stroke={LINE} />
      {[0, 1, 2].map((i) => <circle key={i} data-puff cx={914} cy={356} r={9} fill="none" stroke={LINE} />)}

      {/* press */}
      <g data-press>
        <rect x={702} y={380} width={16} height={22} style={{ fill: "var(--background)" }} stroke={LINE} />
        <rect x={668} y={366} width={84} height={14} rx={5} style={{ fill: "var(--background)" }} stroke={VIOLET} strokeOpacity={0.7} />
      </g>

      {/* machine body */}
      <rect x={IN_X} y={400} width={OUT_X - IN_X} height={212} rx={20} style={{ fill: "var(--background)" }} stroke={LINE} strokeWidth={1.5} />
      <rect x={IN_X - 12} y={ITEM_Y - 6} width={24} height={46} rx={7} style={{ fill: "var(--background)" }} stroke={VIOLET} strokeOpacity={0.7} />
      <rect x={OUT_X - 12} y={ITEM_Y - 6} width={24} height={46} rx={7} style={{ fill: "var(--background)" }} stroke={CYAN} strokeOpacity={0.7} />

      {/* gear window */}
      <rect x={650} y={430} width={180} height={104} rx={14} fill="none" stroke={LINE} />
      <g transform="translate(712 482)"><g data-gear-a>
        <path d={gearPath(26, 8, 7)} fill="rgba(139,92,246,0.10)" stroke={VIOLET} strokeOpacity={0.75} />
        <circle r={8} fill="none" stroke={VIOLET} strokeOpacity={0.75} />
      </g></g>
      <g transform="translate(772 482)"><g data-gear-b>
        <path d={gearPath(19, 6, 6)} fill="rgba(34,211,238,0.10)" stroke={CYAN} strokeOpacity={0.75} />
        <circle r={6} fill="none" stroke={CYAN} strokeOpacity={0.75} />
      </g></g>

      {/* screen + lamp */}
      <rect x={852} y={430} width={100} height={56} rx={9} fill="none" stroke={LINE} />
      <text x={868} y={466} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize={22} fill="rgba(255,255,255,0.6)">ZIP</text>
      <rect data-cursor x={918} y={450} width={10} height={20} fill="rgba(255,255,255,0.6)" />
      <circle data-lamp cx={870} cy={514} r={8} fill={GREEN} />
      {[0, 1, 2].map((i) => <line key={i} x1={896} x2={950} y1={506 + i * 10} y2={506 + i * 10} stroke={SOFT} strokeWidth={3} strokeLinecap="round" />)}

      {/* nameplate */}
      <text x={720} y={582} textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize={15} letterSpacing={5} fill="rgba(255,255,255,0.35)">ZIPLI</text>
    </svg>
  );
}
