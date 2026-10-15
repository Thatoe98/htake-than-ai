# Htake Than AI

A mobile-first web app where employees chat with an AI assistant all day and report in plain **Burmese or English**, and the CEO gets a daily briefing, a per-employee view of work and chats, and (planned) a content studio that posts to Facebook.

Built by one developer with [Claude Code](https://claude.com/claude-code) for a small company that has no reporting habit and no record of who did what. The product requirements are written down feature by feature (E-1, C-2, P-8 …) and the code, tests and commit history refer back to those IDs.

<p>
  <img src="docs/screenshots/chat-approval-card.png" alt="Burmese chat with a confirmation card before a task is saved" height="420">
  <img src="docs/screenshots/briefing-blocker-detail.png" alt="CEO briefing with a blocker detail dialog" height="420">
</p>

## What it does

**For employees**
- Streaming chat in Burmese or English; replies in the language used.
- The assistant calls tools to log work, create and update tasks, and file the end-of-day report.
- **Nothing is saved silently:** before a tool writes data, the assistant shows a confirmation card (what will be saved) that the employee can approve or reject.
- A permanent banner states that the manager and CEO can read the chat, and a notice must be accepted at first login.

**For the CEO**
- **Morning briefing:** needs-attention items (blockers, overdue tasks), yesterday in numbers, who did not report. Every point links to its source report or task. The numbers come from SQL; the AI only writes the wording, and any wording that repeats a number not in the facts is discarded.
- **Team and employee pages:** reports (day-by-day or calendar), work log, tasks, and full chat history. Opening someone's chat is written to an audit log.
- **Assign tasks by chat:** "give Aung a task to fix the price list by tomorrow" matches the name (Burmese or English spelling) to an account, shows a confirmation card, and creates the task.
- **Admin:** accounts, roles, password resets, sign-out-everywhere, audit log, usage and spending cap.

## Design decisions worth a look

| Decision | Why |
| --- | --- |
| No AI score, ranking or disciplinary flag, anywhere | Staff trust. The app shows facts with links; AI summaries are labelled. |
| Briefing numbers from SQL, AI writes wording only, with a post-check | Prevents invented figures in something a CEO acts on. |
| Tool calls need signed human approval, checked again server-side | The model can propose, never silently write. Permissions are re-checked in `execute`, not just in the UI. |
| Role checks in every server action and route handler | The UI hiding a button is not security. |
| Chat history is read from the database, not trusted from the client | A client can only add a plain-text message or answer an approval card; any other change is rejected. |
| Hard monthly AI spending cap, cost logged per call, dollars visible only to the developer | Predictable cost for a fixed monthly fee. |
| Burmese-aware: Unicode, Noto Sans Myanmar, `pg_trgm` for keyword search (planned) | Burmese has no spaces between words, so Postgres full-text search does not work. |

## Architecture

```mermaid
flowchart LR
  Phone[Browser / PWA] -->|HTTPS| Caddy
  Caddy --> Web[Next.js app<br/>chat, briefing, admin]
  Web --> PG[(Postgres 17<br/>pgvector + pg_trgm)]
  Web -->|AI SDK| OpenAI
  Worker[Worker, planned<br/>pg-boss] --> PG
  Worker --> OpenAI
  Worker --> FB[Facebook Graph API]
```

One TypeScript codebase. The web app and a background worker never call each other: the app enqueues jobs in Postgres and the worker picks them up. Each client gets its own Compose project and its own database.

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Vercel AI SDK + OpenAI · Postgres 17 + pgvector + pg_trgm · Drizzle ORM · Better Auth (username + admin plugins, admin-created accounts) · pg-boss · Docker Compose + Caddy · Vitest

## Status

| Area | State |
| --- | --- |
| Auth, first-login notice, accounts, roles, audit log | Done |
| Assistant chat, tools, approval cards, cost logging and cap | Done |
| Tasks, end-of-day reports, work log | Done |
| Morning briefing (on demand), team and employee pages, report review | Done |
| Background worker, scheduled briefing, push reminders (PWA) | Planned |
| Company knowledge base (RAG: hybrid vector + trigram search, "not found" answers) | Planned |
| Content studio and Facebook publishing | Planned |

## Run it locally

Requires Node 22+, Docker.

```bash
npm install
cp .env.example .env.local          # set BETTER_AUTH_SECRET and OPENAI_API_KEY
docker compose up -d db             # Postgres with pgvector and pg_trgm
export DATABASE_URL=postgres://htake:htake_dev@localhost:5432/htake
npm run db:migrate
npm run seed -- admin "Admin" "a-temporary-password"   # first CEO account; create staff in /admin/users
npm run dev                         # must run on port 3000 (auth checks the origin)
```

```bash
npm test        # Vitest, pure logic (permissions, briefing, report calendar, chat guards, ...)
npm run lint
npm run build
```

## Deploy

`Dockerfile`, `docker-compose.prod.yml` and `deploy/Caddyfile` run Postgres, the web app and Caddy (automatic HTTPS) on one small VPS.

```bash
cp .env.production.example .env.production      # set DOMAIN, secrets, OPENAI_API_KEY
C="docker compose -f docker-compose.prod.yml --env-file .env.production"
$C up -d --build                                  # build and start
$C run --rm tools                                 # apply database migrations
$C run --rm tools npx tsx scripts/seed.ts admin "Admin" "a-temporary-password"
```

`DOMAIN` can be your own domain or a free `<server-ip-with-dashes>.sslip.io` name; Caddy gets the certificate by itself.

## Notes

- AI cost and token counts are visible only to the developer account listed in `DEVELOPER_USERNAMES`.
- The database port is bound to `127.0.0.1` in development and not published at all in production.
