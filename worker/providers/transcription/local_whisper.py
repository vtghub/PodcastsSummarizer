"""Local Whisper transcription — runs entirely on CPU, zero API cost."""

import whisper

from worker.core.interfaces import Episode, Transcript, TranscriptionProvider
from worker.config.settings import WHISPER_MODEL


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

    def transcribe(self, audio_path: str) -> Transcript:
        model = self._get_model()
        print(f"[Whisper] Transcribing {audio_path} ...")
        result = model.transcribe(audio_path, fp16=False, language=None)
        return Transcript(
            episode_id="",          # caller sets this
            text=result["text"].strip(),
            language=result.get("language", "en"),
        )

    def _model_size(self) -> str:
        sizes = {"tiny": "~75MB", "base": "~150MB", "small": "~500MB",
                 "medium": "~1.5GB", "large": "~3GB"}
        return sizes.get(self._model_name, "unknown size")
