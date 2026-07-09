"""Local Whisper transcription — runs entirely on CPU, zero API cost."""

import re
import whisper

from worker.core.interfaces import Episode, Transcript, TranscriptionProvider
from worker.config.settings import WHISPER_MODEL

# Per-domain vocabulary hints for Whisper's initial_prompt parameter.
# Each prompt primes the model with proper nouns common in that domain,
# dramatically reducing mishearing of brand names and technical terms.
# Unknown/unlisted domains fall back to _PROMPT_GENERAL.
_PROMPT_GENERAL = (
    "This is a podcast interview or discussion. "
    "Key terms: podcast, episode, host, guest, interview, conversation, listener."
)

_DOMAIN_PROMPTS: dict[str, str] = {
    "Technology & AI": (
        "This is a technology and artificial intelligence podcast. "
        "Key proper nouns: Claude, Claude AI, Claude Cowork, Anthropic, "
        "ChatGPT, OpenAI, GPT-4, GPT-4o, Gemini, Google DeepMind, "
        "Grok, xAI, Groq, Mistral, Perplexity, Llama, Meta AI, "
        "LLM, RAG, fine-tuning, transformer, diffusion model, multimodal, "
        "Supabase, Vercel, Next.js, TypeScript, Kubernetes, NVIDIA, CUDA, "
        "AWS, Azure, GCP, GitHub, Python, open-source."
    ),
    "Business & Startups": (
        "This is a business and entrepreneurship podcast. "
        "Key terms: venture capital, Series A, Series B, IPO, valuation, "
        "SaaS, B2B, go-to-market, product-market fit, Y Combinator, "
        "Andreessen Horowitz, a16z, Sequoia, churn, ARR, MRR, CAC, LTV, "
        "runway, unicorn, decacorn, pivot, burn rate, cap table, term sheet."
    ),
    "Health & Science": (
        "This is a health, science, and medicine podcast. "
        "Key terms: CRISPR, mRNA, mitochondria, cortisol, dopamine, serotonin, "
        "neuroscience, Andrew Huberman, Peter Attia, David Sinclair, longevity, "
        "microbiome, inflammation, telomere, HRV, VO2 max, ketogenic, "
        "intermittent fasting, placebo, randomized controlled trial, RCT, "
        "metabolism, insulin resistance, cardiovascular, cognitive function."
    ),
    "Finance & Investing": (
        "This is a finance and investing podcast. "
        "Key terms: S&P 500, NASDAQ, Federal Reserve, Jerome Powell, "
        "interest rates, inflation, CPI, GDP, Treasury bonds, yield curve, "
        "Warren Buffett, Berkshire Hathaway, hedge fund, private equity, "
        "cryptocurrency, Bitcoin, Ethereum, DeFi, ETF, dividend yield, "
        "portfolio, asset allocation, compounding, index fund, Vanguard."
    ),
    "Leadership & Productivity": (
        "This is a leadership, productivity, and self-improvement podcast. "
        "Key terms: OKRs, KPIs, agile, scrum, deep work, Cal Newport, "
        "James Clear, atomic habits, Simon Sinek, Brené Brown, stoicism, "
        "Marcus Aurelius, first principles, mental models, growth mindset, "
        "emotional intelligence, systems thinking, time management, focus."
    ),
    "Society & Culture": (
        "This is a society, culture, and current affairs podcast. "
        "Key terms: journalism, New York Times, Washington Post, NPR, "
        "geopolitics, NATO, G7, United Nations, Supreme Court, Congress, "
        "Senate, electoral college, ESG, DEI, social media, misinformation, "
        "democracy, civil rights, climate change, immigration, inequality."
    ),
    "General": _PROMPT_GENERAL,
    "Other": _PROMPT_GENERAL,
}

# Known Whisper mishearings: (pattern, replacement) applied after transcription.
# Patterns are case-insensitive; replacements use the canonical casing.
_TRANSCRIPT_CORRECTIONS: list[tuple[str, str]] = [
    (r"\bcloud\s+science\b", "Claude Science"),
    (r"\bclaude\s+co[-\s]work\b", "Claude Cowork"),
    (r"\bclaude\s+co[-\s]works\b", "Claude Cowork"),
    (r"\bcloud\s+ai\b", "Claude AI"),
]


def _apply_corrections(text: str) -> str:
    for pattern, replacement in _TRANSCRIPT_CORRECTIONS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


class LocalWhisperProvider(TranscriptionProvider):

    def __init__(self, model_name: str = WHISPER_MODEL):
        # Model is lazy-loaded on first use and cached for subsequent calls
        self._model_name = model_name
        self._model = None

    def _get_model(self):
        if self._model is None:
            print(f"[Whisper] Loading model '{self._model_name}' (first run downloads ~{self._model_size()})")
            self._model = whisper.load_model(self._model_name)
        return self._model

    def transcribe(self, audio_path: str, domain: str = "") -> Transcript:
        model = self._get_model()
        prompt = _DOMAIN_PROMPTS.get(domain, _PROMPT_GENERAL)
        print(f"[Whisper] Transcribing {audio_path} (domain={domain or 'General'}) ...")
        result = model.transcribe(
            audio_path,
            fp16=False,
            language=None,
            initial_prompt=prompt,
        )
        corrected = _apply_corrections(result["text"].strip())
        return Transcript(
            episode_id="",          # caller sets this
            text=corrected,
            language=result.get("language", "en"),
        )

    def _model_size(self) -> str:
        sizes = {"tiny": "~75MB", "base": "~150MB", "small": "~500MB",
                 "medium": "~1.5GB", "large": "~3GB"}
        return sizes.get(self._model_name, "unknown size")
