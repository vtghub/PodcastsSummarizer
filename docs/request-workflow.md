# Request Workflow Diagrams

## 1. Pipeline — GitHub Actions → Supabase

```mermaid
sequenceDiagram
    participant GHA as GitHub Actions
    participant P as Pipeline
    participant S as Storage (Supabase)
    participant SRC as Source Provider
    participant W as Whisper (local)
    participant LLM as LLM (Gemini / Groq)

    GHA->>P: run_pipeline(since=yesterday)
    Note over GHA: Fires at 7 PM EST (midnight UTC) daily
    P->>S: get_sources(enabled_only=True)
    S-->>P: [sources]

    loop Each source
        P->>SRC: fetch_latest_episodes(since)
        SRC-->>P: [episodes]

        loop Each episode
            P->>S: episode_exists?
            alt already processed
                S-->>P: true → skip
            else new episode
                P->>S: save_episode()
                P->>SRC: fetch_transcript_text()
                alt text / captions available
                    SRC-->>P: transcript text
                else no text transcript
                    P->>SRC: download_audio()
                    P->>W: transcribe(audio_path)
                    W-->>P: transcript text
                end
                P->>S: save_transcript()
                P->>LLM: extract_insights(episode, transcript, domain)
                LLM-->>P: Insight {summary, key_points, quotes, action_items, tags}
                P->>S: save_insight()
                P->>S: mark_episode_done()
            end
        end
    end
```

---

## 2. Public Dashboard Request — `/dashboard`

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as Edge Middleware
    participant SC as Server Component
    participant DB as Supabase
    participant CC as Client Components

    B->>MW: GET /dashboard
    MW->>MW: route not protected → pass through
    MW->>SC: render page (server-side)
    SC->>DB: getInsightsByDate(today)
    DB-->>SC: insights[]
    SC-->>B: HTML + serialised data

    B->>CC: hydrate React tree
    Note over CC: ThemeContext applies saved theme<br/>TTSContext restores TTS toggle<br/>DomainInsightView defaults to "Business & Startups"
    CC-->>B: fully interactive page
```

---

## 3. My Podcasts Page — Public with Auth-Aware UI

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as Edge Middleware
    participant SC as Server Component (podcasts/page.tsx)
    participant DB as Supabase
    participant PM as PodcastManager (client)

    B->>MW: GET /podcasts
    MW->>MW: public route → pass through (no redirect)
    MW->>SC: render page (server-side)
    SC->>SC: isValidSession(cookie) → isAuthed true/false
    SC->>DB: getSourcesAsync()
    DB-->>SC: sources[]
    SC-->>B: HTML with isAuthed prop

    alt isAuthed = false (guest)
        B->>PM: render read-only mode
        Note over PM: List visible · No Add/toggle/delete buttons<br/>"Sign in to manage" banner shown<br/>No Sign Out in navbar
    else isAuthed = true (signed in)
        B->>PM: render full management UI
        Note over PM: Add Podcast button · Enable/disable · Delete<br/>Sign Out shown in navbar
    end
```

---

## 4. Login Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant LP as /login page
    participant LA as POST /api/auth/login
    participant MW as Edge Middleware

    B->>LP: navigate to /login?from=/podcasts
    B->>LA: POST { passcode }
    LA->>LA: SHA-256(passcode) == SHA-256(ADMIN_SECRET)?

    alt wrong passcode
        LA-->>B: 401 { error: "Invalid passcode" }
    else correct passcode
        LA-->>B: 200 + Set-Cookie: admin_session (httpOnly, SameSite=strict, 30d)
        Note over B: window.location.href = "/podcasts"<br/>(full navigation — ensures middleware sees cookie)
        B->>MW: GET /podcasts (cookie present)
        MW->>MW: public route → pass through
        B->>B: /podcasts renders in full management mode
    end
```

---

## 5. Logout Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant LA as POST /api/auth/logout

    B->>LA: POST /api/auth/logout
    LA-->>B: 200 + Set-Cookie: admin_session="" (maxAge=0)
    Note over B: Cookie cleared in browser
    B->>B: router.push("/") → Home page
    Note over B: /podcasts now shows read-only mode
```

---

## 6. API Source Mutation — Auth Guard

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as Edge Middleware
    participant API as /api/sources

    B->>MW: POST/PUT/DELETE /api/sources/[id]

    alt no valid session cookie
        MW-->>B: 401 { error: "Unauthorized" }
    else valid cookie
        MW->>API: pass through
        API->>API: perform mutation (add / update / delete)
        API-->>B: 200 / 204
    end
```
