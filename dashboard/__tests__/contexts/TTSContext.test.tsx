import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TTSProvider, useTTS } from "@/contexts/TTSContext";

function TTSConsumer() {
  const { enabled, toggle } = useTTS();
  return (
    <div>
      <span data-testid="enabled">{String(enabled)}</span>
      <button onClick={toggle}>Toggle</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(window.speechSynthesis.cancel).mockClear();
});

describe("TTSContext", () => {
  it("defaults to enabled: true", () => {
    render(
      <TTSProvider>
        <TTSConsumer />
      </TTSProvider>
    );
    expect(screen.getByTestId("enabled").textContent).toBe("true");
  });

  it("toggle flips enabled from true to false", () => {
    render(
      <TTSProvider>
        <TTSConsumer />
      </TTSProvider>
    );

    fireEvent.click(screen.getByText("Toggle"));
    expect(screen.getByTestId("enabled").textContent).toBe("false");
  });

  it("toggle flips enabled from false back to true", () => {
    render(
      <TTSProvider>
        <TTSConsumer />
      </TTSProvider>
    );

    fireEvent.click(screen.getByText("Toggle")); // → false
    fireEvent.click(screen.getByText("Toggle")); // → true
    expect(screen.getByTestId("enabled").textContent).toBe("true");
  });

  it("persists the toggled state to localStorage", () => {
    render(
      <TTSProvider>
        <TTSConsumer />
      </TTSProvider>
    );

    fireEvent.click(screen.getByText("Toggle"));
    expect(localStorage.getItem("tts_enabled")).toBe("false");

    fireEvent.click(screen.getByText("Toggle"));
    expect(localStorage.getItem("tts_enabled")).toBe("true");
  });

  it("restores disabled state from localStorage on mount", () => {
    localStorage.setItem("tts_enabled", "false");
    render(
      <TTSProvider>
        <TTSConsumer />
      </TTSProvider>
    );
    expect(screen.getByTestId("enabled").textContent).toBe("false");
  });

  it("calls speechSynthesis.cancel when TTS is toggled off", () => {
    render(
      <TTSProvider>
        <TTSConsumer />
      </TTSProvider>
    );

    fireEvent.click(screen.getByText("Toggle")); // enabled → false
    expect(window.speechSynthesis.cancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT call speechSynthesis.cancel when TTS is toggled back on", () => {
    render(
      <TTSProvider>
        <TTSConsumer />
      </TTSProvider>
    );

    fireEvent.click(screen.getByText("Toggle")); // → false (cancel called)
    vi.mocked(window.speechSynthesis.cancel).mockClear();
    fireEvent.click(screen.getByText("Toggle")); // → true (no cancel)
    expect(window.speechSynthesis.cancel).not.toHaveBeenCalled();
  });
});
