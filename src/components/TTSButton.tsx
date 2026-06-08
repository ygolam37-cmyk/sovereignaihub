import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

export interface TTSButtonProps {
  /** The exact text this button should speak. */
  text: string;
  className?: string;
}

const ACTIVE_TTS_EVENT = "sovereign:tts-active";

function getSpeechEngine() {
  if (typeof window === "undefined") return null;

  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  if (!synth || typeof window.SpeechSynthesisUtterance === "undefined") {
    return null;
  }

  return synth;
}

function inferSpeechLang(text: string) {
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  if (/[\u0980-\u09FF]/.test(text)) return "bn-IN";
  if (/[\u0A00-\u0A7F]/.test(text)) return "pa-IN";
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu-IN";
  if (/[\u0B00-\u0B7F]/.test(text)) return "or-IN";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te-IN";
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn-IN";
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml-IN";
  if (/[\u0600-\u06FF]/.test(text)) return "ar-SA";
  if (/[\u3040-\u30FF]/.test(text)) return "ja-JP";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko-KR";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh-CN";
  if (/[А-Яа-яЁё]/.test(text)) return "ru-RU";

  return "en-US";
}

function pickVoiceForLang(synth: SpeechSynthesis, lang: string) {
  const voices = synth.getVoices?.() ?? [];

  return (
    voices.find((voice) => voice.lang === lang) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith(lang.split("-")[0].toLowerCase())) ??
    voices.find((voice) => voice.default) ??
    voices[0] ??
    null
  );
}

/**
 * Per-message TTS button. Tap to speak; tap again to stop.
 * Speech is created synchronously inside the pointer/click handler so mobile
 * browsers honor the user-gesture requirement for audio playback.
 */
export function TTSButton({ text, className }: TTSButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const id = useId();
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeRef = useRef(false);
  const lastTriggerAtRef = useRef(0);
  const lastDirectGestureAtRef = useRef(0);

  useEffect(() => {
    const handleActiveChange = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string | null }>).detail;
      const isActive = detail?.id === id;
      activeRef.current = isActive;
      setSpeaking(isActive);
    };

    window.addEventListener(ACTIVE_TTS_EVENT, handleActiveChange as EventListener);

    return () => {
      window.removeEventListener(ACTIVE_TTS_EVENT, handleActiveChange as EventListener);

      const synth = getSpeechEngine();
      if (synth && activeRef.current) {
        try {
          synth.cancel();
        } catch {
          /* noop */
        }

        window.dispatchEvent(new CustomEvent(ACTIVE_TTS_EVENT, { detail: { id: null } }));
      }
    };

  }, [id]);

  const trigger = useCallback(
    (e: React.SyntheticEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (e.type === "click" && Date.now() - lastDirectGestureAtRef.current < 800) {
        return;
      }
      if (e.type === "pointerup" || e.type === "touchend") {
        lastDirectGestureAtRef.current = Date.now();
      }

      const now = Date.now();
      if (now - lastTriggerAtRef.current < 250) return;
      lastTriggerAtRef.current = now;

      const clean = (text || "").trim();
      if (!clean) return;

      const synth = getSpeechEngine();
      if (!synth) {
        console.warn("[TTS] speechSynthesis unavailable", {
          hasWindow: typeof window !== "undefined",
          hasSpeechSynthesis: typeof window !== "undefined" ? typeof window.speechSynthesis !== "undefined" : false,
          hasUtteranceCtor: typeof window !== "undefined" ? typeof window.SpeechSynthesisUtterance !== "undefined" : false,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        });
        return;
      }

      const isStoppingCurrent = activeRef.current && (synth.speaking || synth.pending || speaking);

      try {
        synth.cancel();
      } catch (err) {
        console.error("[TTS] cancel() failed:", err);
      }

      if (isStoppingCurrent) {
        utterRef.current = null;
        activeRef.current = false;
        setSpeaking(false);
        window.dispatchEvent(new CustomEvent(ACTIVE_TTS_EVENT, { detail: { id: null } }));
        return;
      }

      try {
        synth.resume();
      } catch (err) {
        console.error("[TTS] resume() failed:", err);
      }

      const lang = inferSpeechLang(clean);
      const utter = new window.SpeechSynthesisUtterance(clean);
      utter.lang = lang;
      utter.rate = 1;
      utter.pitch = 1;
      utter.volume = 1;

      const voice = pickVoiceForLang(synth, lang);
      if (voice) {
        utter.voice = voice;
      }

      utter.onstart = () => {
        activeRef.current = true;
        setSpeaking(true);
        window.dispatchEvent(new CustomEvent(ACTIVE_TTS_EVENT, { detail: { id } }));
      };
      utter.onend = () => {
        utterRef.current = null;
        activeRef.current = false;
        setSpeaking(false);
        window.dispatchEvent(new CustomEvent(ACTIVE_TTS_EVENT, { detail: { id: null } }));
      };
      utter.onerror = (ev) => {
        console.error("[TTS] SpeechSynthesisUtterance error:", {
          error: (ev as SpeechSynthesisErrorEvent).error,
          charIndex: (ev as SpeechSynthesisErrorEvent).charIndex,
          elapsedTime: (ev as SpeechSynthesisErrorEvent).elapsedTime,
          lang,
          voice: utter.voice?.name ?? null,
          event: ev,
        });
        utterRef.current = null;
        activeRef.current = false;
        setSpeaking(false);
        window.dispatchEvent(new CustomEvent(ACTIVE_TTS_EVENT, { detail: { id: null } }));
      };

      utterRef.current = utter;
      activeRef.current = true;
      setSpeaking(true);
      window.dispatchEvent(new CustomEvent(ACTIVE_TTS_EVENT, { detail: { id } }));

      try {
        console.info("[TTS] speak() requested", {
          lang,
          voice: voice?.name ?? null,
          voiceCount: synth.getVoices?.().length ?? 0,
          textLength: clean.length,
          pending: synth.pending,
          speaking: synth.speaking,
        });
        synth.speak(utter);
      } catch (err) {
        console.error("[TTS] speak() threw:", err);
        utterRef.current = null;
        activeRef.current = false;
        setSpeaking(false);
        window.dispatchEvent(new CustomEvent(ACTIVE_TTS_EVENT, { detail: { id: null } }));
      }
    },
    [id, speaking, text],
  );

  return (
    <button
      type="button"
      onPointerUp={trigger}
      onTouchEnd={trigger}
      onClick={trigger}
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
