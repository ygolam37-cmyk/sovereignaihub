import { useCallback, useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

export interface TTSButtonProps {
  /** The exact text this button should speak. */
  text: string;
  className?: string;
}

/**
 * Per-message TTS button. Tap to speak; tap again to stop.
 * Must be created synchronously inside the click handler to preserve
 * the user-gesture context required by browsers for speechSynthesis.
 */
export function TTSButton({ text, className }: TTSButtonProps) {
  const [speaking, setSpeaking] = useState(false);

  // Stop on unmount so a removed bubble doesn't keep talking.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window && speaking) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      }
    };
  }, [speaking]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      // Toggle stop if already speaking this/any utterance.
      if (window.speechSynthesis.speaking || speaking) {
        window.speechSynthesis.cancel();
        setSpeaking(false);
        return;
      }

      const clean = (text || "").trim();
      if (!clean) return;

      // Clear any leftover buffer, then speak synchronously in-gesture.
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = "en-US";
      utter.rate = 1;
      utter.pitch = 1;
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utter);
    },
    [text, speaking],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={speaking ? "Stop voice" : "Play voice"}
      aria-pressed={speaking}
      style={{
        backgroundColor: speaking ? "#28a745" : undefined,
        color: speaking ? "#ffffff" : undefined,
      }}
      className={
        "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors " +
        (speaking
          ? "shadow-[0_0_0_2px_rgba(40,167,69,0.35)]"
          : "bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90") +
        (className ? " " + className : "")
      }
    >
      {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
    </button>
  );
}
