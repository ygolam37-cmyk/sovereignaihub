import { useEffect, useState } from "react";

const NAME = "Golam Yasin";
const TYPE_MS = 140;
const HOLD_MS = 60_000;

function randColor() {
  return `hsl(${Math.floor(Math.random() * 360)} 95% 60%)`;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function NameBanner() {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  const [colors, setColors] = useState<string[]>(() =>
    Array.from({ length: NAME.length }, randColor),
  );

  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;

    if (shown < NAME.length) {
      timer = setTimeout(() => setShown((n) => n + 1), TYPE_MS);
    } else {
      timer = setTimeout(() => {
        setColors(Array.from({ length: NAME.length }, randColor));
        setShown(0);
      }, HOLD_MS);
    }

    return () => clearTimeout(timer);
  }, [shown, reduced]);

  if (reduced) {
    return (
      <div
        aria-label="Golam Yasin"
        className="pointer-events-none fixed left-1/2 top-2 z-[9999] -translate-x-1/2 select-none rounded-full bg-background/70 px-4 py-1.5 font-display text-lg font-bold tracking-wide shadow-elegant backdrop-blur sm:text-xl"
        style={{
          backgroundImage:
            "linear-gradient(90deg, #ff5f6d, #ffc371, #47e891, #37b6ff, #a37bff, #ff5f6d)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        {NAME}
      </div>
    );
  }

  return (
    <div
      aria-label="Golam Yasin"
      className="pointer-events-none fixed left-1/2 top-2 z-[9999] -translate-x-1/2 select-none rounded-full bg-background/70 px-4 py-1.5 font-display text-lg font-bold tracking-wide shadow-elegant backdrop-blur sm:text-xl"
      style={{ textShadow: "0 0 8px rgba(0,0,0,0.6)" }}
    >
      {NAME.split("").map((ch, i) => (
        <span
          key={i}
          style={{
            color: colors[i],
            opacity: i < shown ? 1 : 0,
            transition: "opacity 60ms linear",
          }}
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
      <span
        className="ml-0.5 inline-block animate-pulse"
        style={{ color: colors[Math.min(shown, NAME.length - 1)] }}
      >
        |
      </span>
    </div>
  );
}
