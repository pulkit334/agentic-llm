# PS-053 — AI Email Follow-Up Agent (Team AGT-018)

## Goal
Paste an email or conversation. The agent decides whether a follow-up is needed, picks when to send it, writes it, schedules or sends it, and logs every step. It must never send duplicate or pointless messages.

Judges want to see: a working agent, the repo, an email tool (real or a realistic mock), a full demo from start to finish, and the agent's plan/trace.

## Stack (fast to build)
| Part | Choice |
|---|---|
| Language | Python 3.11 |
| LLM | Claude API (`claude-sonnet-5-5`) with tool use |
| Agent loop | Manual tool-use loop (we can show every step in the demo) |
| Storage | SQLite: contacts, threads, messages, followups, action_log |
| Email | `MockEmailTool` (default) + optional real Gmail SMTP using an app password |
| Scheduler | Simulated clock + "advance time" button (for the demo) and APScheduler for real runs |
| UI | Streamlit: input box, live agent trace, follow-up queue, action log |

## Agent flow
```
input (email/thread + recipient)
  -> get_contact(email)            # type: customer/student/employee/business
  -> get_thread_history(thread)    # earlier messages, did they already reply?
  -> list_followups(contact)       # check for duplicates
  -> LLM decides: needs_followup? reason, strategy, send_at
       no  -> log_action("skipped", reason)            STOP
       yes -> draft message (tone matches contact type)
           -> schedule_followup(to, subject, body, send_at)  or send_now
           -> log_action("scheduled", ...)
at send time:
  -> re-check thread: they replied?  -> cancel + log
                      no reply       -> send + log
```

## Tools (LLM-callable)
- `get_contact(email)` -> name, type, timezone, followup_count
- `get_thread_history(thread_id)` -> messages, last_sender, last_time
- `list_followups(email, status)` -> pending/sent follow-ups
- `schedule_followup(to, subject, body, send_at, thread_id, strategy)`
- `send_email(to, subject, body, thread_id)`
- `cancel_followup(id, reason)`
- `log_action(type, details)`

## Duplicate / spam guards (enforced in code, not just in the prompt)
1. A follow-up is already pending for the same thread -> block the new one.
2. The recipient replied after our last message -> no follow-up.
3. Max follow-ups per thread (customer 3, business 2, student 2, employee 2).
4. Minimum gap between messages (24h).
5. No sends on weekends or at night (only 9am–6pm in the recipient's timezone).
6. The thread is closed ("thanks, resolved", "not interested") -> skip.

## Follow-up strategies by contact type
| Type | Delay | Tone | Focus |
|---|---|---|---|
| Customer | 2 business days | friendly, helpful | value, next step, easy reply |
| Student | 1 day / before deadline | clear, encouraging | deadline, action needed |
| Employee | 1 day | direct, short | task, owner, due date |
| Business contact | 3–5 business days | formal | proposal, meeting slot |

The LLM can move the delay earlier or later based on the message itself ("send by Friday" means follow up Thursday).

## Demo scenarios (seed data)
1. Customer asked for a quote, no reply after 3 days -> follow-up scheduled.
2. Business contact already replied -> **skipped** (explain why).
3. Run the same thread twice -> **duplicate blocked**.
4. Student with an assignment deadline -> timed before the deadline.
5. Advance the clock -> the queue sends, or cancels because a reply came in.

## Repo layout
```
app.py              # Streamlit UI
agent/loop.py       # tool-use loop + system prompt
agent/tools.py      # tool functions + JSON schemas
agent/guards.py     # duplicate/spam rules
agent/strategies.py # per-contact-type rules
db.py               # SQLite setup + seed
email_tool.py       # Mock + SMTP
scheduler.py        # simulated clock / runner
seed.json           # demo contacts + threads
README.md           # setup + architecture + walkthrough
```

## Work split
- **Pulkit**: agent loop, tools, guards, prompt, LLM decisions.
- **Prabhdeep**: SQLite + seed data, email tool, scheduler, Streamlit UI, README/demo script.

Agree on the tool function signatures first (30 min) so both people can work in parallel.

## Timeline (start 9:30)
| Time | Work |
|---|---|
| 9:30–10:00 | Repo setup, API key, agree on tool interfaces |
| 10:00–12:00 | Core: DB + seed, tools, agent loop working in the CLI |
| 12:00–13:30 | Guards, strategies, scheduler + simulated clock |
| 13:30–15:00 | Streamlit UI with live trace, action log, queue |
| 15:00–15:45 | Real SMTP send (optional), polish prompts, test all 5 scenarios |
| 15:45–16:15 | README, architecture diagram, rehearse the demo |
| Buffer | Fix bugs, commit often |

## Stretch goals (only if time is left)
- Reading the Gmail inbox for real reply detection
- Calendar link in business follow-ups
- Learning from replies: change the delay per contact
