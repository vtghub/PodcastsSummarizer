# System Architecture

```mermaid
graph TB
    subgraph CI["⚙️ GitHub Actions — daily_pipeline.yml"]
        CRON["🕛 Cron: midnight UTC daily\n+ workflow_dispatch\n(since_days, force_email,\nepisode_audio_url, source_id, target_email)"]
    end

    subgraph PIPELINE["🐍 Python Worker Pipeline"]
        SRC["Source Providers\nRSS · YouTube"]
        FETCH["Fetch Episodes\n(parallel, 8 workers)"]
        TXT["Text Transcript\n(captions / subtitles)"]
        AUDIO["Download Audio"]
        WHISPER["Whisper STT\n(tiny model, local)"]
        LLM["LLM Insight Extraction\nGemini → Groq fallback"]
        FANOUT["Per-User Digest Fan-out\nuser_profiles × user_subscriptions"]
        EMAIL["Gmail SMTP\nPersonalized HTML email"]
    end

    subgraph STORE["🗄️ Supabase PostgreSQL"]
        SOURCES[("sources\nis_public, user_id")]
        EPISODES[("episodes\nstatus: done/pending")]
        TRANSCRIPTS[("transcripts")]
        INSIGHTS[("insights\ndate, domain, source_id")]
        EPQUEUE[("episode_queue\nepisode_id, status\ndone·failed·pending")]
        VIEWS[("insight_views\ninsight_id, user_id")]
        REACTIONS[("insight_reactions\ninsight_id, user_id, type")]
        COMMENTS[("insight_comments\ninsight_id, user_id, body")]
        CREACTIONS[("comment_reactions\ncomment_id, user_id, type")]
        PROFILES[("user_profiles\nis_admin, digest_enabled\ndigest_hour")]
        SUBS[("user_subscriptions\nuser_id → source_id")]
        AUTHUSERS[("auth.users\nSupabase Auth")]
    end

    subgraph AUTH["🔐 Supabase Auth"]
        JWT["JWT + SSR Cookies\n(@supabase/ssr)"]
        RLS["Row Level Security\nsources · user_profiles\nuser_subscriptions"]
    end

    subgraph REALTIME["⚡ Supabase Realtime"]
        RT["postgres_changes WebSocket\nINSERT on insights table\nINSERT/UPDATE on episode_queue"]
    end

    subgraph DASH["🌐 Next.js 15 Dashboard — Vercel"]
        MW["middleware.ts\nSession refresh · API guard"]
        LAYOUT["layout.tsx (async)\ngetUser() + getDisplayName()"]
        DPAGE["dashboard/page.tsx\nPersonalized or public preview"]
        PPAGE["podcasts/page.tsx\nCatalog + subscribe toggles"]
        PROF["profile/page.tsx\nDisplay name · digest prefs"]
        REG["register/page.tsx"]
        LOGIN["login/page.tsx"]
        CACHE["unstable_cache\n1h TTL — public views only"]
    end

    subgraph APIROUTES["📡 API Routes"]
        ARAUTH["/api/auth/\nlogin · logout · register"]
        ARSRC["/api/sources\nadmin only"]
        ARSUBS["/api/subscriptions\nauthed users"]
        ARPROF["/api/profile\nauthed users"]
        ARDIG["/api/digest/send\nauthed users — on-demand email"]
        ARDIGEPI["/api/digest/episodes\nRSS-aware episode list"]
        ARDIGPROC["/api/digest/process\ntriggers workflow_dispatch"]
        ARDIGSTAT["/api/digest/status\npoll for insights"]
        ARSEARCH["/api/podcasts/search\nproxies iTunes Search API"]
        ARENG["/api/insights/[id]/view\n/react · /comments\n/api/comments/[id]\n/react · DELETE"]
    end

    CRON --> SRC
    SRC --> FETCH
    FETCH --> TXT
    TXT -->|no captions| AUDIO
    AUDIO --> WHISPER
    WHISPER --> LLM
    TXT --> LLM
    LLM --> INSIGHTS
    LLM --> EPISODES
    LLM --> TRANSCRIPTS
    FETCH --> SOURCES

    INSIGHTS --> FANOUT
    PROFILES --> FANOUT
    SUBS --> FANOUT
    FANOUT --> EMAIL

    AUTHUSERS --> PROFILES
    AUTHUSERS --> JWT
    JWT --> RLS
    RLS --> SOURCES
    RLS --> PROFILES
    RLS --> SUBS

    MW --> LAYOUT
    LAYOUT --> DPAGE
    LAYOUT --> PPAGE
    LAYOUT --> PROF
    LAYOUT --> REG
    LAYOUT --> LOGIN

    DPAGE --> CACHE
    CACHE --> INSIGHTS
    DPAGE --> SUBS

    PPAGE --> SOURCES
    PPAGE --> SUBS

    ARAUTH --> AUTHUSERS
    ARSRC --> SOURCES
    ARSUBS --> SUBS
    ARPROF --> PROFILES
    ARDIG --> INSIGHTS
    ARDIG --> EMAIL
    ARDIGEPI --> INSIGHTS
    ARDIGEPI -.->|RSS feed| SOURCES
    ARDIGPROC -.->|workflow_dispatch| CI
    ARDIGSTAT --> INSIGHTS
    ARSEARCH -.->|iTunes API| SOURCES
    ARENG --> VIEWS
    ARENG --> REACTIONS
    ARENG --> COMMENTS
    ARENG --> CREACTIONS

    LLM --> EPQUEUE
    INSIGHTS -.->|Realtime broadcast| RT
    EPQUEUE -.->|Realtime broadcast| RT
    RT -.->|WebSocket push| DASH
```

---

## Data Model

```mermaid
erDiagram
    auth_users {
        uuid id PK
        text email
        timestamptz email_confirmed_at
    }
    user_profiles {
        uuid user_id PK
        text display_name
        bool is_admin
        bool digest_enabled
        int  digest_hour
    }
    user_subscriptions {
        uuid user_id PK
        text source_id PK
        bool enabled
    }
    sources {
        text id PK
        text name
        text url
        text source_type
        text domain
        bool enabled
        bool deleted
        bool is_public
        uuid user_id
        jsonb platform_links
    }
    episodes {
        text id PK
        text source_id FK
        text title
        timestamptz published_at
        text status
    }
    transcripts {
        text episode_id PK
        text text
        text language
    }
    insights {
        text id PK
        text episode_id FK
        text source_id FK
        text domain
        text date
        text summary
        jsonb key_points
        jsonb key_quotes
        jsonb action_items
        jsonb tags
    }

    episode_queue {
        text episode_id PK
        text source_id
        text status
        text error_msg
        timestamptz updated_at
    }
    insight_views {
        bigint id PK
        text insight_id FK
        uuid user_id FK
        timestamptz viewed_at
    }
    insight_reactions {
        bigint id PK
        text insight_id FK
        uuid user_id FK
        text type
        timestamptz created_at
    }
    insight_comments {
        bigint id PK
        text insight_id FK
        uuid user_id FK
        text body
        timestamptz created_at
    }
    comment_reactions {
        bigint id PK
        bigint comment_id FK
        uuid user_id FK
        text type
        timestamptz created_at
    }

    auth_users ||--|| user_profiles : "has"
    auth_users ||--o{ user_subscriptions : "subscribes"
    sources ||--o{ user_subscriptions : "subscribed by"
    sources ||--o{ episodes : "has"
    episodes ||--o| transcripts : "has"
    episodes ||--o| insights : "has"
    episodes ||--o| episode_queue : "queued in"
    insights ||--o{ insight_views : "tracked by"
    insights ||--o{ insight_reactions : "reacted to"
    insights ||--o{ insight_comments : "commented on"
    insight_comments ||--o{ comment_reactions : "reacted to"
```

---

## Provider Registry

Providers are resolved from environment variables at runtime — no code changes needed to switch backends:

| Env var | Options |
|---|---|
| `STORAGE_PROVIDER` | `sqlite` (dev) · `supabase` (prod) |
| `LLM_PROVIDER` | `gemini` · `groq` · `ollama` |
| `TRANSCRIPTION_PROVIDER` | `local_whisper` |
| `EMAIL_PROVIDER` | `console` (dev) · `gmail_smtp` (prod) |
