"""
Chains multiple free-tier LLM providers into one `generate(prompt) -> str`
primitive, so exhausting one provider's quota doesn't stop the pipeline.

This is used as the `generate` callable for chunked_extract() (worker/
providers/llm/chunking.py), which means fallback applies per chunk-call, not
per-whole-episode — if a provider dies on chunk 4 of a 10-chunk episode,
chunk 5 picks up on the next provider in the chain instead of restarting the
episode from scratch on a different provider.

Each provider's own _generate_text() already retries transient errors
internally (see gemini_llm.py etc.) before giving up — by the time a failure
reaches WaterfallLLM, that provider has already failed several retries over
tens of seconds, so it's treated as unavailable for the rest of this
WaterfallLLM instance's lifetime (one whole pipeline run — see
run_pipeline()'s single get_llm_provider() call), not just this one call.
Without that, a quota-exhausted provider (the common case — see the "ran
out of free quota" framing this was built for) would otherwise be retried,
and fail again, on every single remaining chunk of every remaining episode
in the run — wasted time for a result already known.
"""

from typing import Callable, NamedTuple


class WaterfallStep(NamedTuple):
    name: str
    generate: Callable[[str], str]


class WaterfallLLM:
    def __init__(self, steps: list[WaterfallStep]):
        if not steps:
            raise ValueError("WaterfallLLM needs at least one provider configured")
        self.steps = steps
        self._dead: set[str] = set()  # provider names that have failed at least once this run
        # Name of the provider that handled the most recent successful generate()
        # call — read this right after calling generate() to know which model
        # actually produced that result (e.g. for per-chunk extraction logging).
        self.last_provider: str | None = None

    def generate(self, prompt: str) -> str:
        last_exc: Exception | None = None
        attempted_any = False
        for step in self.steps:
            if step.name in self._dead:
                continue
            attempted_any = True
            try:
                text = step.generate(prompt)
                if not text:
                    raise ValueError("empty response")
                self.last_provider = step.name
                return text
            except Exception as e:
                print(f"    [Waterfall] {step.name} failed ({e}) — marking unavailable for the rest of this run, trying next provider")
                self._dead.add(step.name)
                last_exc = e
                continue

        if not attempted_any:
            raise RuntimeError(
                f"All {len(self.steps)} providers in the waterfall were already marked "
                f"unavailable earlier in this run: {', '.join(sorted(self._dead))}"
            )
        raise RuntimeError(
            f"All {len(self.steps)} providers in the waterfall are exhausted"
        ) from last_exc
