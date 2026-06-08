import { useEffect, useRef, useState, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";

type Pos = { x: number; y: number };

const STORAGE_KEY = "sovereign.tts.pos";
const SIZE = 56;
const DRAG_THRESHOLD = 6;

function clampPos(p: Pos): Pos {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: Math.min(Math.max(8, p.x), w - SIZE - 8),
    y: Math.min(Math.max(8, p.y), h - SIZE - 8),
  };
}

function defaultPos(): Pos {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return { x: window.innerWidth - SIZE - 16, y: Math.round(window.innerHeight / 2 - SIZE / 2) };
}

export interface TTSButtonProps {
  /** Returns the text to speak (typically the latest assistant message). */
  getText: () => string;
}

export function TTSButton({ getText }: TTSButtonProps) {
  const [pos, setPos] = useState<Pos>(() => ({ x: 0, y: 0 }));
  const [ready, setReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [dragging, setDragging] = useState(false);

  const dragState = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pointerId: -1,
  });
  const btnRef = useRef<HTMLButtonElement>(null);

  // Init position from storage or default (middle-right).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const p = raw ? clampPos(JSON.parse(raw)) : defaultPos();
      setPos(p);
    } catch {
      setPos(defaultPos());
    }
    setReady(true);

    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Keep speaking state in sync with the Web Speech API.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const id = window.setInterval(() => {
      setSpeaking(window.speechSynthesis.speaking);
    }, 300);
    return () => window.clearInterval(id);
  }, []);

  const stop = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    const text = getText().trim();
    if (!text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
  }, [getText]);

  const toggle = useCallback(() => {
    if (speaking || (typeof window !== "undefined" && window.speechSynthesis?.speaking)) stop();
    else speak();
  }, [speaking, speak, stop]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragState.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      pointerId: e.pointerId,
    };
    btnRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = dragState.current;
    if (!s.active) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!s.moved) {
      s.moved = true;
      setDragging(true);
    }
    setPos(clampPos({ x: s.originX + dx, y: s.originY + dy }));
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = dragState.current;
    if (!s.active) return;
    const moved = s.moved;
    s.active = false;
    s.moved = false;
    if (btnRef.current?.hasPointerCapture(e.pointerId)) {
      btnRef.current.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
    if (moved) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
      } catch {
        /* ignore */
      }
    } else {
      toggle();
    }
  };

  if (!ready) return null;

  const active = speaking;
  return (
    <button
      ref={btnRef}
      type="button"
      aria-label={active ? "Stop voice" : "Play voice"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: SIZE,
        height: SIZE,
        touchAction: "none",
        transition: dragging ? "none" : "transform 120ms ease, box-shadow 200ms ease",
        transform: dragging ? "scale(1.06)" : "scale(1)",
        zIndex: 60,
      }}
      className="bg-gradient-gold text-primary-foreground shadow-gold rounded-full flex items-center justify-center select-none cursor-grab active:cursor-grabbing ring-1 ring-[oklch(0.78_0.13_80/0.5)]"
    >
      {active ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      {active && (
        <span className="pointer-events-none absolute inset-0 rounded-full animate-ping bg-[oklch(0.82_0.15_82/0.35)]" />
      )}
    </button>
  );
}
