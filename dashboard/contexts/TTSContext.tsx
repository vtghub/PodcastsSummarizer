"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface TTSContextValue {
  enabled: boolean;
  toggle: () => void;
}

const TTSContext = createContext<TTSContextValue>({ enabled: true, toggle: () => {} });

export function TTSProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("tts_enabled");
    if (stored !== null) setEnabled(stored === "true");
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("tts_enabled", String(next));
      if (!next) window.speechSynthesis?.cancel();
      return next;
    });
  }, []);

  return <TTSContext.Provider value={{ enabled, toggle }}>{children}</TTSContext.Provider>;
}

export function useTTS() {
  return useContext(TTSContext);
}
