# Followup – AI Email Follow-Up Agent

**Agenticthon 2026 · Team AGT-018 · Problem PS-053**

Give it an email conversation. The agent reads it, checks what was already sent, decides whether a follow-up is needed, picks a time inside the recipient's business hours, drafts the email, and schedules or sends it through Gmail. Every step is recorded. Hard safety rules in code stop duplicate or unnecessary emails.

## How the agent works

```
conversation ──► AI agent (tool-use loop) ──► tools ──► safety rules ──► MySQL ──► scheduler ──► Gmail
                 Mercury 2.5 → Gemini 3.5/3.8 Flash → built-in rules (fallback)
```

1. **Read**: save the pasted thread (contact, type, messages).
2. **Check history**: earlier emails and pending follow-ups.
3. **Decide**: follow up, reply, skip, close (opt-out) or block (duplicate).
4. **Time it**: per-type strategy (customer 48 h, student/employee 24 h, business 96 h), business hours, 24 h gap, before deadlines.
5. **Draft and act**: schedule or send through the email tool.
6. **Record**: decision and every tool call in the activity log.

The model chooses which tools to call and in what order; the tools enforce the rules (one pending follow-up per thread, never chase after a reply, respect opt-outs, max follow-ups per type). Just before sending, the scheduler checks again and cancels if they replied. You can also edit a scheduled email, **reschedule it to a custom time, or send it now**.

## Run it locally

Needs Python 3.11+, Node 20+, MySQL 8.

```bash
pip install -r requirements.txt
cp .env.example .env          # fill in MYSQL_*, AI key, email (see below)
python -m followup.cli reset  # create tables + 1 demo conversation
python -m uvicorn api.main:app --port 8010
```

In a second terminal (frontend, from the `frontend` branch / `web/` folder):

```bash
cd web
npm install
npm run dev                   # http://localhost:5173 (proxies /api to 8010)
```

Open http://localhost:5173 → **Get started** (the first account becomes admin).

**One-process mode:** `cd web && npm run build`, then start the API with `WEB_DIST=<path>/web/dist` and open http://localhost:8010.

## Settings (`.env`)

| Setting | Purpose |
|---|---|
| `MYSQL_HOST` `MYSQL_PORT` `MYSQL_USER` `MYSQL_PASSWORD` `MYSQL_DATABASE` | Database (created automatically) |
| `INCEPTION_API_KEY` | Inception Mercury 2.5, tried first (fast) |
| `GEMINI_API_KEY` | Gemini 3.5 Flash, then 3.8 Flash as backup |
| `EMAIL_MODE=smtp` `EMAIL_HOST` `EMAIL_PORT` `EMAIL_USER` `EMAIL_PASS` | Real Gmail (use a Google App Password); `mock` stores emails only |
| `EMAIL_REDIRECT_TO` | Safety net: every real email goes to this inbox |

No AI key? The agent still works with the built-in rules (same tools and safety rules).

## Useful commands

```bash
python -m followup.cli run quote-rahul --mode llm   # run the agent on the demo conversation
python -m followup.cli test-email --to you@example.com
python -m pytest -q tests                           # 173 tests
```

API docs: http://localhost:8010/api/docs

## Project layout

```
api/          FastAPI: auth, conversations, live agent run (SSE), follow-ups, demo clock
followup/     agent loop, AI providers, tools, safety rules, strategies, scheduler, email, MySQL
web/          React + Tailwind web app (frontend branch)
docs/         PRD.md, ARCHITECTURE.md
seed.json     1 demo conversation · samples/new_customer.txt for "Use sample"
```

Team: Pulkit, Prabhdeep.
