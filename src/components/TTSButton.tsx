import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

export interface TTSButtonProps {
  /** The exact text this button should speak. */
  text: string;
  className?: string;
}

/**
 * Per-message TTS button. Tap to speak; tap again to stop.
 * Speech is created synchronously inside the pointer/click handler so mobile
 * browsers honor the user-gesture requirement for audio playback.
 */
export function TTSButton({ text, className }: TTSButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      }
    };
  }, []);

  const trigger = useCallback(
    (e: React.SyntheticEvent) => {
      // Make sure no parent (drag handlers, bubble click, etc) eats this.
      e.stopPropagation();
      e.preventDefault();

      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        console.warn("[TTS] speechSynthesis not supported in this browser");
        return;
      }

      const synth = window.speechSynthesis;

      // Toggle off if already speaking.
      if (synth.speaking || synth.pending || speaking) {
        try { synth.cancel(); } catch { /* noop */ }
        setSpeaking(false);
        return;
      }

      const clean = (text || "").trim();
      if (!clean) return;

      // Build the utterance SYNCHRONOUSLY inside the gesture.
      try { synth.cancel(); } catch { /* noop */ }

      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = "en-US";
      utter.rate = 1;
      utter.pitch = 1;
      utter.volume = 1;

      // Pick a matching voice if one is available (helps Android/iOS).
      try {
        const voices = synth.getVoices?.() ?? [];
        const v =
          voices.find((vv) => vv.lang === "en-US") ||
          voices.find((vv) => vv.lang?.startsWith("en")) ||
          voices[0];
        if (v) utter.voice = v;
      } catch { /* noop */ }

      utter.onstart = () => setSpeaking(true);
      utter.onend = () => {
        setSpeaking(false);
        utterRef.current = null;
      };
      utter.onerror = (ev) => {
        console.error("[TTS] SpeechSynthesisUtterance error:", ev);
        setSpeaking(false);
        utterRef.current = null;
      };

      utterRef.current = utter;

      // Force the audio engine awake — many mobile browsers leave it paused.
      try { synth.resume(); } catch { /* noop */ }
      try {
        synth.speak(utter);
        setSpeaking(true);
      } catch (err) {
        console.error("[TTS] speak() threw:", err);
        setSpeaking(false);
      }
    },
    [text, speaking],
  );

  return (
    <button
      type="button"
      onPointerUp={trigger}
      onClick={(e) => { e.stopPropagation(); }}
      aria-label={speaking ? "Stop voice" : "Play voice"}
      aria-pressed={speaking}
      style={{
        backgroundColor: speaking ? "#28a745" : undefined,
        color: speaking ? "#ffffff" : undefined,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
      className={
        "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors select-none " +
        (speaking
          ? "shadow-[0_0_0_2px_rgba(40,167,69,0.35)]"
          : "bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90") +
        (className ? " " + className : "")
      }
    >
      {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </button>
  );
}
