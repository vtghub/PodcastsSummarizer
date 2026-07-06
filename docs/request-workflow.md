# Request Workflow Diagrams

## 1. Pipeline — GitHub Actions → Supabase → Gmail

```mermaid
sequenceDiagram
    participant GH as GitHub Actions
    participant PY as Python Pipeline
    participant RSS as RSS/YouTube
    participant W as Whisper STT
    participant LLM as Gemini/Groq
    participant DB as Supabase DB
    participant MAIL as Gmail SMTP

    GH->>PY: trigger (cron or workflow_dispatch)
    PY->>DB: get_sources(enabled=True)
    DB-->>PY: 16 sources

    loop parallel (8 workers)
        PY->>RSS: fetch_latest_episodes(since)
        RSS-->>PY: new episodes
    end

    loop per episode (4 workers)
        PY->>RSS: fetch_transcript_text()
        alt captions available
            RSS-->>PY: text transcript
        else no captions
            PY->>RSS: download_audio()
            PY->>W: transcribe(audio)
            W-->>PY: transcript text
        end
        PY->>LLM: extract_insights(episode, transcript)
        alt Gemini quota error
            PY->>LLM: retry with Groq
        end
        LLM-->>PY: Insight (summary, key_points, quotes, actions, tags)
        PY->>DB: save_insight(insight, date=today)
        PY->>DB: mark_episode_done(episode_id)
    end

    Note over PY,MAIL: Email fan-out (send_email=True)
    PY->>DB: get_users_with_digest_enabled()
    DB-->>PY: [user1, user2, ...]
    loop per user
        PY->>DB: get_user_subscribed_source_ids(user_id)
        PY->>DB: get_insights_by_date_and_sources(date, source_ids)
        alt has insights for subscriptions
            PY->>MAIL: send_digest(user.email, date, insights_by_domain)
        end
    end
```

---

## 2. Public Dashboard Request (guest)

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as middleware.ts
    participant PAGE as dashboard/page.tsx
    participant CACHE as unstable_cache (1h TTL)
    participant DB as Supabase

    B->>MW: GET /dashboard?date=2026-07-05
    MW->>MW: refresh Supabase session (no-op for guest)
    MW-->>PAGE: pass through
    PAGE->>PAGE: getUser() → null (guest)
    PAGE->>CACHE: _cachedGetInsightsByDate("2026-07-05")
    alt cache miss
        CACHE->>DB: SELECT * FROM insights WHERE date=?
        DB-->>CACHE: 18 insights
        CACHE-->>PAGE: 18 insights (cached 1h)
    else cache hit
        CACHE-->>PAGE: 18 insights
    end
    PAGE->>CACHE: _cachedGetAvailableDates()
    CACHE-->>PAGE: ["2026-07-05", ...]
    PAGE-->>B: HTML — all public insights + guest banner
```

---

## 3. Authenticated Dashboard Request (personalized)

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as middleware.ts
    participant PAGE as dashboard/page.tsx
    participant DB as Supabase

    B->>MW: GET /dashboard (with JWT cookie)
    MW->>DB: verify + refresh JWT session
    MW-->>PAGE: pass through
    PAGE->>DB: getUser() [React cache — 1 req/render]
    DB-->>PAGE: user {id, email}
    PAGE->>DB: sbGetInsightsByDateForUser(date, userId)
    Note right of DB: JOIN user_subscriptions ON source_id\nWHERE user_id = userId
    DB-->>PAGE: insights for subscribed sources only
    PAGE->>DB: sbGetAvailableDatesForUser(userId)
    DB-->>PAGE: dates with insights for user's sources
    PAGE-->>B: HTML — personalized insights (no cache)
```

---

## 4. Register

```mermaid
sequenceDiagram
    participant B as Browser
    participant PAGE as register/page.tsx
    participant API as /api/auth/register
    participant SB as Supabase Auth
    participant DB as Supabase DB

    B->>PAGE: fill display_name, email, password
    B->>API: POST {displayName, email, password}
    API->>SB: supabase.auth.signUp({email, password})
    SB-->>API: {user, session}
    API->>DB: INSERT user_profiles (user_id, display_name, is_admin=false)
    API-->>B: 200 OK (Supabase sets SSR cookies)
    B->>B: redirect to /dashboard
```

---

## 5. Login / Logout

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as /api/auth/login
    participant SB as Supabase Auth

    B->>API: POST {email, password}
    API->>SB: supabase.auth.signInWithPassword()
    SB-->>API: JWT session
    API-->>B: 200 OK (Supabase sets http-only SSR cookies)
    B->>B: redirect to /dashboard

    Note over B,SB: Logout
    B->>API: POST /api/auth/logout
    API->>SB: supabase.auth.signOut()
    SB-->>API: cleared
    API-->>B: 200 OK (cookies cleared)
    B->>B: redirect to /
```

---

## 6. Subscribe / Unsubscribe (optimistic)

```mermaid
sequenceDiagram
    participant B as Browser
    participant PM as PodcastManager.tsx
    participant API as /api/subscriptions

    B->>PM: click Subscribe on source card
    PM->>PM: optimistic update (localSubs.add(source_id))
    PM->>API: POST {sourceId}
    alt success
        API-->>PM: 200 OK
    else error
        API-->>PM: 4xx/5xx
        PM->>PM: revert optimistic update
    end

    B->>PM: click Subscribed (toggle off)
    PM->>PM: optimistic update (localSubs.delete(source_id))
    PM->>API: DELETE /api/subscriptions/{sourceId}
```

---

## 7. Profile Update

```mermaid
sequenceDiagram
    participant B as Browser
    participant FORM as ProfileForm.tsx
    participant API as /api/profile

    B->>FORM: edit display_name / digest_enabled / digest_hour
    FORM->>API: PUT {display_name, digest_enabled, digest_hour}
    API->>API: validate: user authed, digest_hour 0-23
    API->>DB: UPDATE user_profiles SET ... WHERE user_id=?
    DB-->>API: ok
    API-->>FORM: 200 {display_name, digest_enabled, digest_hour}
    FORM->>FORM: show green checkmark, router.refresh()
```

---

## 8. On-Demand Digest Send (Profile page)

```mermaid
sequenceDiagram
    participant B as Browser
    participant BTN as SendDigestButton.tsx
    participant API as /api/digest/send
    participant DB as Supabase
    participant MAIL as Gmail SMTP

    B->>BTN: click "Send Digest Now"
    BTN->>BTN: setState("sending")
    BTN->>API: POST /api/digest/send
    API->>DB: getUser() → user {id, email}
    alt not signed in
        API-->>BTN: 401 Unauthorized
        BTN->>BTN: setState("error")
    else signed in
        API->>DB: getAvailableDates(user.id)
        DB-->>API: ["2026-07-05", ...]
        API->>DB: getInsightsByDate(date, user.id)
        Note right of DB: JOIN user_subscriptions\nWHERE user_id = userId
        DB-->>API: insights for subscribed sources
        alt no insights
            API-->>BTN: 404 "No insights found"
            BTN->>BTN: setState("error")
        else has insights
            API->>MAIL: sendDigestEmail(user.email, date, byDomain)
            MAIL-->>API: sent
            API-->>BTN: 200 {ok, date, count}
            BTN->>BTN: setState("sent") → auto-reset after 6s
        end
    end
```

---

## 9. Episode Digest — Phase 1 (processed episode, fast path)

```mermaid
sequenceDiagram
    participant B as Browser
    participant PICKER as EpisodeDigestPicker.tsx
    participant EAPI as /api/digest/episodes
    participant SAPI as /api/digest/send
    participant DB as Supabase
    participant MAIL as Gmail SMTP

    B->>PICKER: select podcast
    PICKER->>EAPI: GET ?sourceId=X&includeAll=true
    EAPI->>DB: get processed episode_ids (insights table)
    EAPI->>EAPI: fetch RSS feed (redirect: follow)
    EAPI->>EAPI: parse items → MD5(audioUrl) = episode_id
    EAPI-->>PICKER: EpisodeItem[] (processed ✓ / unprocessed ○)

    B->>PICKER: select processed episode (✓)
    PICKER->>PICKER: show "Send Episode Digest" button

    B->>PICKER: click Send Episode Digest
    PICKER->>SAPI: POST {episodeId}
    SAPI->>DB: getInsightsByEpisode(episodeId)
    DB-->>SAPI: insights[]
    SAPI->>MAIL: sendDigestEmail(user.email, date, byDomain)
    MAIL-->>SAPI: sent
    SAPI-->>PICKER: 200 {ok, date, count}
    PICKER->>PICKER: setState("sent") → auto-reset 8s
```

---

## 10. Episode Digest — Phase 2 (unprocessed episode, slow path)

```mermaid
sequenceDiagram
    participant B as Browser
    participant PICKER as EpisodeDigestPicker.tsx
    participant PAPI as /api/digest/process
    participant STAT as /api/digest/status
    participant GH as GitHub Actions
    participant PY as Python Pipeline
    participant DB as Supabase
    participant MAIL as Gmail SMTP

    B->>PICKER: select unprocessed episode (○)
    PICKER->>PICKER: show "Process & Send Digest" button (purple)

    B->>PICKER: click Process & Send Digest
    PICKER->>PAPI: POST {sourceId, audioUrl, episodeTitle}
    PAPI->>PAPI: verify user subscription
    PAPI->>GH: POST /actions/workflows/daily_pipeline.yml/dispatches\n{episode_audio_url, source_id, target_email}
    GH-->>PAPI: 204 No Content
    PAPI-->>PICKER: 200 {queued: true}
    PICKER->>PICKER: setState("processing") — show spinner

    loop poll every 10s (max 10 min)
        PICKER->>STAT: GET ?episodeId=X
        STAT->>DB: SELECT * FROM insights WHERE episode_id=?
        DB-->>STAT: {processed: false}
        STAT-->>PICKER: {processed: false}
    end

    Note over GH,PY: GitHub Actions picks up dispatch
    GH->>PY: run_single_episode(audio_url, source_id, target_email)
    PY->>PY: fetch RSS → find episode → transcribe → LLM
    PY->>DB: save_insight(insight)
    PY->>MAIL: send_digest(target_email, date, insights)

    PICKER->>STAT: GET ?episodeId=X
    STAT->>DB: SELECT * FROM insights WHERE episode_id=?
    DB-->>STAT: {processed: true}
    STAT-->>PICKER: {processed: true}
    PICKER->>PICKER: auto-send via /api/digest/send → setState("sent")
```

---

## 11. Admin Source Management

```mermaid
sequenceDiagram
    participant B as Browser (admin)
    participant MW as middleware.ts
    participant API as /api/sources
    participant DB as Supabase

    B->>MW: POST /api/sources (with JWT cookie)
    MW->>MW: verify session → user present
    MW-->>API: pass through
    API->>DB: isAdmin() → user_profiles.is_admin
    alt is_admin = true
        API->>DB: INSERT sources (is_public=true)
        API-->>B: 201 Created
    else not admin
        API-->>B: 403 Forbidden
    end
```
