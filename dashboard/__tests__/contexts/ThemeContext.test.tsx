import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, useTheme, THEMES } from "@/contexts/ThemeContext";

function ThemeConsumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      {THEMES.map((t) => (
        <button key={t.key} onClick={() => setTheme(t.key)}>
          {t.name}
        </button>
      ))}
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  // Reset CSS vars on root element
  document.documentElement.removeAttribute("style");
});

describe("ThemeContext", () => {
  it("defaults to the first theme (anthropic-light / Parchment)", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("current-theme").textContent).toBe("anthropic-light");
  });

  it("applies CSS variables to document.documentElement on mount", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    // The Parchment theme sets --bg-page to #FAF9F6
    expect(document.documentElement.style.getPropertyValue("--bg-page")).toBe("#FAF9F6");
  });

  it("updates CSS variables when theme changes", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Midnight"));

    expect(document.documentElement.style.getPropertyValue("--bg-page")).toBe("#0A0D14");
    expect(screen.getByTestId("current-theme").textContent).toBe("midnight");
  });

  it("persists the selected theme to localStorage", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Forest"));
    expect(localStorage.getItem("theme")).toBe("forest");
  });

  it("restores the theme from localStorage on mount", () => {
    localStorage.setItem("theme", "aurora");

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("current-theme").textContent).toBe("aurora");
    // Aurora sets --bg-page to #020B18
    expect(document.documentElement.style.getPropertyValue("--bg-page")).toBe("#020B18");
  });

  it("ignores invalid theme keys stored in localStorage", () => {
    localStorage.setItem("theme", "not-a-real-theme");

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    // Should fall back to default
    expect(screen.getByTestId("current-theme").textContent).toBe("anthropic-light");
  });

  it("exposes all 5 themes via the THEMES array", () => {
    expect(THEMES).toHaveLength(5);
    const keys = THEMES.map((t) => t.key);
    expect(keys).toContain("anthropic-light");
    expect(keys).toContain("midnight");
    expect(keys).toContain("aurora");
    expect(keys).toContain("dusk");
    expect(keys).toContain("forest");
  });
});
