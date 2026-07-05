"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function useSpeech(text: string) {
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(() => {
    if (!window.speechSynthesis) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;

    // Cancel any other card that may be speaking
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [text, speaking]);

  // Stop on unmount
  useEffect(() => {
    return () => {
      if (speaking) window.speechSynthesis?.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { speaking, speak };
}
