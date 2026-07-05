# System Architecture

```mermaid
graph TB
    subgraph CI["⚙️ GitHub Actions — daily_pipeline.yml"]
        CRON["🕖 Cron: 07:00 UTC daily\n+ workflow_dispatch"]
    end

    subgraph PIPELINE["🐍 Python Worker Pipeline"]
        SRC["Source Providers\nRSS · YouTube"]
        FETCH["Fetch Episodes"]
        TXT["Text Transcript\n(captions / subtitles)"]
        AUDIO["Download Audio"]
        WHISPER["Whisper STT\n(runs locally)"]
        LLM["LLM Insight Extraction\nGemini · Groq · Ollama"]
        EMAIL["Email Digest\nGmail SMTP · Resend · console"]
    end

    subgraph STORE["🗄️ Storage"]
        DB[("Supabase\nPostgres\n(production)")]
        LITE[("SQLite\n(local dev)")]
    end

    subgraph DASH["🖥️ Next.js 15 Dashboard — Vercel"]
        MW["Edge Middleware\nauth cookie guard"]
        PUB["Public Pages\n/ · /dashboard"]
        PROT["Protected Page\n/podcasts"]
        API["API Routes\n/api/sources  /api/auth"]
        UI["Client Components\nTheme · TTS · Domain Tabs · Cards"]
    end

    LOGIN["🔐 /login\nPasscode form"]
    USER(["👤 User\n(Browser)"])

    %% Pipeline flow
    CRON --> SRC
    SRC --> FETCH
    FETCH --> TXT
    TXT -->|"no text transcript"| AUDIO
    AUDIO --> WHISPER
    TXT -->|"transcript ready"| LLM
    WHISPER -->|"transcript ready"| LLM
    LLM --> DB
    LLM --> LITE
    LLM -.->|"optional"| EMAIL

    %% Dashboard flow
    USER -->|"HTTP request"| MW
    MW -->|"public route"| PUB
    MW -->|"cookie valid"| PROT
    MW -->|"no cookie → redirect"| LOGIN
    LOGIN -->|"POST passcode"| API
    API -->|"set cookie"| USER
    PROT --> API
    API --> DB
    PUB --> DB
    PUB --> UI
    PROT --> UI
```

## Layer Summary

| Layer | Technology | Role |
|---|---|---|
| **Scheduler** | GitHub Actions (cron) | Triggers pipeline daily at 07:00 UTC |
| **Source** | Python — RSS / yt-dlp | Fetches episode metadata and audio |
| **Transcription** | OpenAI Whisper (local) | Converts audio to text when no caption is available |
| **LLM** | Gemini / Groq / Ollama | Extracts summary, key points, quotes, and action items |
| **Storage** | Supabase (prod) / SQLite (dev) | Persists episodes, transcripts, and insights |
| **Email** | Gmail SMTP / Resend | Delivers optional daily digest |
| **Dashboard** | Next.js 15 on Vercel | Displays insights; manages podcast sources |
| **Auth** | Edge Middleware + HTTP-only cookie | Passcode-gates the My Podcasts page |

## Provider Switching

All providers swap via `.env` — no code changes needed:

| Setting | Default | Alternatives |
|---|---|---|
| `TRANSCRIPTION_PROVIDER` | `local_whisper` | `openai_whisper_api` |
| `LLM_PROVIDER` | `gemini` | `groq` · `ollama` · `openai` · `anthropic` |
| `STORAGE_PROVIDER` | `sqlite` | `supabase` |
| `EMAIL_PROVIDER` | `console` | `gmail_smtp` · `resend` |
