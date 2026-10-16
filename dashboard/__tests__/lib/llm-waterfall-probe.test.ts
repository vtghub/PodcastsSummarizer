import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));

import { probeLadder } from "@/lib/llm-waterfall";

const ALL_KEYS = ["GEMINI_API_KEY", "GROQ_API_KEY", "MISTRAL_API_KEY", "COHERE_API_KEY", "CEREBRAS_API_KEY", "OPENROUTER_API_KEY"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const chatOk = (content = "OK") => ({ choices: [{ message: { content } }] });

beforeEach(() => {
  for (const k of ALL_KEYS) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("probeLadder", () => {
  it("skips every slot (no network calls) when this environment has no keys", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = await probeLadder();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(results.length).toBe(12);
    expect(results.every((r) => r.status === "no_key" && r.latency_ms === null)).toBe(true);
  });

  it("reports the same 12 slots, in ladder order, with Cerebras last", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const keys = (await probeLadder()).map((r) => r.provider_key);

    expect(keys[0]).toBe("gemini");
    expect(keys[keys.length - 1]).toBe("cerebras");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("classifies ok / rate-limited / failing / empty per slot", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("MISTRAL_API_KEY", "k");
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const model = JSON.parse(String(init?.body ?? "{}")).model as string | undefined;
        if (url.includes("groq.com")) {
          if (model === "openai/gpt-oss-120b") return json(200, chatOk());
          if (model === "qwen/qwen3.8-27b") return json(404, { error: { message: "model does not exist" } });
          return json(200, chatOk("")); // gpt-oss-20b: reasoning ate the budget
        }
        if (url.includes("mistral.ai")) return json(429, { message: "Rate limit exceeded" });
        return json(200, chatOk()); // openrouter
      })
    );

    const byKey = Object.fromEntries((await probeLadder()).map((r) => [r.provider_key, r]));

    expect(byKey.groq_gpt_oss_120b.status).toBe("ok");
    expect(byKey.groq_gpt_oss_120b.latency_ms).toBeGreaterThanOrEqual(0);
    expect(byKey.groq_qwen_27b.status).toBe("error");
    expect(byKey.groq_qwen_27b.detail).toContain("404");
    expect(byKey.groq_gpt_oss_20b.status).toBe("empty");
    expect(byKey.mistral.status).toBe("rate_limited");
    expect(byKey.mistral_ministral.status).toBe("rate_limited");
    expect(byKey.openrouter_free.status).toBe("ok");
    // No key → not called, not failed
    expect(byKey.gemini.status).toBe("no_key");
    expect(byKey.cohere.status).toBe("no_key");
  });

  it("times out a hung provider without blocking the rest", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("COHERE_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("cohere.com")
          ? new Promise<Response>(() => {}) // never settles
          : Promise.resolve(json(200, chatOk()))
      )
    );

    const byKey = Object.fromEntries((await probeLadder(50)).map((r) => [r.provider_key, r]));

    expect(byKey.cohere.status).toBe("timeout");
    expect(byKey.groq_gpt_oss_120b.status).toBe("ok");
  });

  it("reads Cohere's answer from the text block even when a thinking block comes first", async () => {
    // Regression: command-a-plus returns [thinking, text]; reading content[0].text
    // used to yield empty text and silently killed the Cohere rung.
    vi.stubEnv("COHERE_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(200, { message: { content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "OK" }] } })
      )
    );

    const cohere = (await probeLadder()).find((r) => r.provider_key === "cohere")!;
    expect(cohere.status).toBe("ok");
  });

  it("ignores Gemini 'thought' parts and keeps only the answer", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(200, { candidates: [{ content: { parts: [{ thought: true, text: "thinking…" }, { text: "OK" }] } }] })
      )
    );

    const gemini = (await probeLadder()).find((r) => r.provider_key === "gemini")!;
    expect(gemini.status).toBe("ok");
  });
});
