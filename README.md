# Multi-agent orchestration platform

Node.js service that registers agents, routes work through **Bull** queues backed by **Redis**, persists tasks and results in **Supabase (PostgreSQL)**, and integrates **Gmail (OAuth2)**, **Google Gemini**, and optional outbound **webhooks**.

## Features

- **Express** API on `PORT` (default **3000**)
- **Orchestrator** with registry-backed agent factories, task routing, and a round-robin **load balancer** helper for multi-instance deployments
- **Agents**: email triage (Gmail + Gemini), deal discovery (fetch + Cheerio + Gemini), trading commentary (Yahoo quote snapshot + Gemini, not financial advice)
- **Retries** on agent operations via `BaseAgent.withRetry`
- **Logging** to Supabase table `platform_logs`
- **Health**: `GET /api/health` checks Supabase + Redis
- **Docker** + **Railway** (`railway.toml`) deployment stubs

## Prerequisites

- Node.js **20+**
- A **Redis** instance (`REDIS_URL`)
- A **Supabase** project with tables (SQL below)
- **Gemini** API key
- For Gmail: OAuth client + **refresh token** (and optionally `GMAIL_OAUTH_CLIENT_JSON_PATH` pointing at a client JSON file — do **not** commit that file)

## Supabase schema

Run in the Supabase SQL editor:

```sql
create table if not exists registered_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agent_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references registered_agents (id) on delete cascade,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  bull_job_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_tasks_agent_id_idx on agent_tasks (agent_id);
create index if not exists agent_tasks_status_idx on agent_tasks (status);

create table if not exists agent_results (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references registered_agents (id) on delete cascade,
  task_id uuid references agent_tasks (id) on delete set null,
  summary text,
  data jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists agent_results_agent_id_idx on agent_results (agent_id);
create unique index if not exists agent_results_task_id_uidx on agent_results (task_id);

create table if not exists platform_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null,
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_logs_created_at_idx on platform_logs (created_at desc);
```

Use the **service role** key only on the server (`SUPABASE_SERVICE_ROLE_KEY`). Never expose it to browsers.

## Environment

Copy `src/.env.example` to the repository root as `.env` and fill values. The app loads `.env` from the project root (not from `src/`).

Required for full operation:

| Variable | Purpose |
|----------|---------|
| `PLATFORM_API_KEYS` | Comma-separated keys; send `Authorization: Bearer <key>` or `x-api-key` |
| `REDIS_URL` | Bull / Redis connection string |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database + log sink |
| `GEMINI_API_KEY` | Gemini access |

Gmail (email agent):

| Variable | Purpose |
|----------|---------|
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | OAuth2 user access |
| `GMAIL_OAUTH_CLIENT_JSON_PATH` | Optional path to OAuth client JSON (e.g. `./credentials.json`) |

Optional:

- `GEMINI_MODEL` (default `gemini-1.5-flash`)
- `DEAL_SCAN_URLS` — comma-separated URLs for deal scans when the task payload omits `urls`
- `NOTIFY_WEBHOOK_URL` — JSON POST on task lifecycle events
- `EMAIL_SCAN_CRON`, `DEAL_SCAN_CRON` — Bull repeatable cron schedules

## Local run

```bash
npm install
npm start
```

The HTTP server listens on port **3000** unless `PORT` is set.

## API

All routes except `GET /api/health` require an API key header.

- `GET /api/health` — Redis + Supabase readiness
- `GET /api/logs?limit=100` — recent rows from `platform_logs`
- `GET /api/agents` — registered agents
- `POST /api/agents` — body `{ "name": "Inbox watcher", "agent_type": "email", "metadata": {} }`  
  Types: `email`, `deal_finder`, `trading_advisor`
- `POST /api/agents/:id/tasks` — body `{ "payload": { ... } }` — enqueues a Bull job (`202` with `taskId`, `bullJobId`)
- `GET /api/agents/:id/results?limit=50` — latest stored results for that agent

Example:

```bash
curl -s -H "Authorization: Bearer $PLATFORM_API_KEYS" http://localhost:3000/api/agents
```

## Gmail OAuth (outline)

1. Create OAuth client (Desktop or Web) in Google Cloud Console, enable Gmail API.
2. Obtain a **refresh token** for the Google account whose mail you will read (one-time OAuth consent).
3. Put client id/secret + refresh token in `.env`, or put client JSON path in `GMAIL_OAUTH_CLIENT_JSON_PATH` and secrets in `.env` as documented above.

## Docker

```bash
docker build -t multi-agent-platform .
docker run --env-file .env -p 3000:3000 multi-agent-platform
```

## Railway

`railway.toml` points at the `Dockerfile`. Set the same environment variables in the Railway service, provision **Redis** (or Upstash) and attach `REDIS_URL`, and configure Supabase secrets.

## Project layout

- `src/orchestrator` — registry, routing, load balancing, coordinator
- `src/agents` — `BaseAgent` + concrete agents
- `src/services` — LLM, cache, Bull queues, notifications
- `src/integrations` — Gmail, Gemini, Supabase helpers
- `src/api` — Express app, middleware, routes
- `src/jobs` — Bull processors and repeatable scanners

## Notes

- **Trading advisor** uses delayed/public Yahoo quote data and Gemini for commentary; output is **not** investment advice.
- **Deal finder** fetches third-party sites only with explicit URLs (payload or `DEAL_SCAN_URLS`); respect `robots.txt` and site terms in production.
- Repeatable Bull jobs persist in Redis; if you change cron strings, remove old repeatable jobs from Redis/Bull UI if duplicates appear.
