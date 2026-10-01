# Demo script: 3-minute judge walkthrough

**Story in one line:** the agent decides whether to follow up, picks a time, drafts the message and sends it. The demo also shows the two moments where it *refuses* to spam: a duplicate is blocked, and a reply cancels a queued follow-up.

All UI references are to `streamlit run app.py`. Timings assume `llm` mode, where each live Claude run takes tens of seconds. The "Say" lines are written to fill that time.

---

## Before the judges arrive (T-10 min)

1. **`.env` check:** `ANTHROPIC_API_KEY` is set. Use `EMAIL_MODE=mock`. If you use `smtp`, `SMTP_REDIRECT_TO` must be your own inbox, never a seeded address.
2. **Terminal 1:** `streamlit run app.py` → open http://localhost:8501 and set the browser zoom to about 85% so the trace fits.
3. **Sidebar → Reset demo data.** Check that **Simulated time (UTC)** shows **Thu 01 Oct 05:30** and the India line shows **11:00**.
4. **Sidebar → Agent brain = `llm`.** The caption should read Model `claude-opus-5-5` · Email `mock`.
5. **Terminal 2:** pre-run the background threads so the queue, outbox and log already tell a story. Leave `quote-rahul` and the paste for the live demo.
   ```powershell
   python -m followup.cli run proposal-sarah
   python -m followup.cli run invoice-neha
   python -m followup.cli run assignment-arjun
   python -m followup.cli run report-priya
   python -m followup.cli run demo-vikram
   python -m followup.cli run pricing-ananya
   ```
   Expected: Sarah skipped, Neha blocked as a duplicate, Arjun and Priya scheduled, Vikram closed, Ananya's question answered (it appears in the **Outbox**). Then refresh the browser tab.
6. Keep Terminal 2 open for the [fallback](#if-something-breaks).

---

## The 3 minutes

### 0:00–0:15 · Hook *(Run agent tab visible)*

> "Follow-ups fail in two ways. Either nobody sends them, or they go out when they shouldn't: after the client already replied, twice, or to someone who said stop. Our agent handles both. Claude decides, picks the time, drafts and sends, and rules in our code make the bad cases impossible."

### 0:15–1:00 · Live run: a customer gone quiet

**Click:** **Run agent** tab → Input **Existing conversation** → Conversation **"Rahul Mehta (customer) — Quote for 50 CRM licenses [open]"** → *(optional)* open **Show messages** for 2 seconds → **Run agent**.

> "This is Claude Opus 5.5 in a tool-use loop, and every line in the trace is a real step. First it checks the history with `get_thread_history` and `list_followups`. Rahul asked for a quote, we sent it yesterday afternoon, and he hasn't replied. Next it calls `get_strategy`. He's a customer, so that means a 48-hour wait, a warm, low-pressure tone and a one-line call to action. The send time is already moved into Rahul's business hours in IST. Now it drafts the email and calls `schedule_followup`, and our Python guards check it before anything is queued."

**Point at:** the green **decision** line (`scheduled: …`) and the **Result** box.

### 1:00–1:20 · "What if it runs twice?"

**Click:** sidebar **Agent brain → `rules`** → **Run agent** again on the same conversation. The result comes back instantly. Then switch back to **`llm`**.

> "Judges always ask what happens if it runs twice. It's blocked, because a follow-up is already pending. That rule lives in `guards.py`, not in the prompt, so the model can't talk its way past it. I switched to the offline rules brain to prove it: same tools, same guards, and it's blocked in under a second."

### 1:20–1:50 · Paste a conversation it has never seen

**Click:** Input → **Paste new email / conversation**. The box is pre-filled with `samples/new_customer.txt`: Karan from Urban Brew asked about HR/payroll for 3 cafes, and we offered a demo on 29 Sep. Then **Run agent**.

> "Now some raw text it has never seen. Claude extracts the contact, works out that Karan is a customer and not an employee, rebuilds both messages with their direction and UTC time, and saves the thread. Then it runs the same loop. Karan never answered our demo offer, so it schedules a follow-up in his business hours."

### 1:50–2:05 · The recipient replies

**Click:** **Conversations** tab. Point at the table: Sarah's last message is from *them* with 0 pending, and Vikram's thread is *closed*. Under **Simulate the recipient replying**, set Thread **`quote-rahul`**, set Their reply to *"Thanks Alex, we're reviewing the quote with finance and will confirm early next week."*, then click **Add reply**.

> "This is the case most tools get wrong. Rahul replies before our follow-up goes out."

### 2:05–2:30 · Time travel

**Click:** sidebar **Time travel → +72h**. A green banner lists the results. Then open the **Follow-up queue** tab, point at Rahul's row (**cancelled**) and the others (**sent**), and expand one sent row to show the drafted body and its reason. Then open the **Outbox** tab.

> "We jump 72 hours. Right before sending, the scheduler checks every thread again. Rahul replied, so his follow-up is cancelled automatically and the reason is logged. He won't get a 'just checking in' after he's already answered. Neha's invoice reminder, Arjun's reminder before his deadline, Priya's report nudge and Karan's demo follow-up all went out, each at its scheduled time inside the recipient's business hours. In mock mode they land in this outbox, and one environment variable switches it to real Gmail SMTP."

### 2:30–2:50 · Everything is logged

**Click:** **Action log** tab. *(If there's time: **How it works** tab → strategy table.)*

> "Every action is auditable: run start, every side effect, blocked attempts with their reasons, the final decision with the facts it used, sends, cancellations and clock moves, all grouped by run ID. Sarah was skipped because she'd already signed. Vikram said 'remove me', so his thread was closed. Ananya asked a question, so the agent answered it instead of chasing her. There are four strategies: customers wait 48 hours with a warm tone, students get 24 hours and always hear from us before their deadline, employees get short and direct messages, and business partners wait 96 hours with a formal tone."

### 2:50–3:00 · Close

> "So the agent decides, picks the time, drafts and sends. It never spams, and everything is logged. Claude makes the judgement calls and our code enforces the rules. Thank you."

---

## If something breaks

### A. API slow or wifi down → same UI, `rules` mode

- In the sidebar, set **Agent brain → `rules`** and do the same clicks. Results are instant and need no network, because MySQL is local.
- What changes: drafts come from templates. Ananya is **skipped** instead of answered, because rules mode can't write an answer. Vikram is **skipped** but his thread stays open. Duplicate blocking, the reply-cancel, time travel, the outbox and the log all work the same.
- If the API fails *during* an `llm` run, the agent falls back by itself. The trace shows `Claude API error …` and then `Falling back to the offline rules agent.`
- **Say:** "Claude provides the intelligence, but the safety is in our code. Here's the same pipeline with the deterministic planner: same tools, same guards, same log."

### B. Streamlit broken → CLI only

One command resets the data and plays all 10 scenarios with traces, then prints the queue, outbox and action log:

```powershell
python -m followup.cli demo --mode rules
```

Or step by step, following the same story as the UI script:

```powershell
python -m followup.cli reset
python -m followup.cli threads
python -m followup.cli run quote-rahul --mode rules        # scheduled
python -m followup.cli run quote-rahul --mode rules        # blocked_duplicate
python -m followup.cli run proposal-sarah --mode rules     # skipped: she already replied
python -m followup.cli run invoice-neha --mode rules       # blocked_duplicate: reminder already queued
python -m followup.cli run assignment-arjun --mode rules   # scheduled
python -m followup.cli run report-priya --mode rules       # scheduled
python -m followup.cli run demo-vikram --mode rules        # skipped: opted out
python -m followup.cli paste --file samples/new_customer.txt --mode rules   # new thread, scheduled
python -m followup.cli reply quote-rahul "Thanks Alex, reviewing with finance, will confirm early next week."
python -m followup.cli advance 72                          # Rahul CANCELLED; Neha, Arjun, Priya, Karan SENT
python -m followup.cli queue
python -m followup.cli outbox
python -m followup.cli log --limit 40
```

Run these from the repo root. If wifi is back, swap `--mode rules` for `--mode llm` on the `run` and `paste` lines.

### C. MySQL not running

Start the MySQL service (Windows: Services app → `MySQL80`, the installer's default name), then run `python -m followup.cli reset`.

### Between judges

Click **Sidebar → Reset demo data**, then repeat pre-run step 5. For speed, add `--mode rules` to the pre-run commands.

---

## Likely judge questions

| Question | Answer | Show |
|---|---|---|
| What stops duplicates and spam? | Seven hard rules in `guards.check`: closed thread, opt-out, already replied, nothing to reply to, already pending, limit reached, identical body. Every due follow-up is also checked again at send time. | `followup/guards.py`, `followup_blocked` rows in the log |
| What if the LLM picks Saturday at 3 AM? | The guards move the time into Mon–Fri 09:00–18:00 in the recipient's timezone and keep at least 24 h after our last message. The adjustment is logged. | `adjustments` in a `followup_scheduled` log row |
| Does it really send email? | Yes, with `EMAIL_MODE=smtp` and a Gmail App Password. `SMTP_REDIRECT_TO` keeps demo mail in our own inbox, and the outbox shows `to_email` next to `delivered_to`. | **Outbox** tab, `followup/email_tool.py` |
| How does it know someone replied? | In the demo, through the simulated reply. For real mail, `python -m followup.imap_sync` pulls replies over IMAP into the thread. Either way the scheduler checks again before sending. | `followup/imap_sync.py`, `scheduler._cancel_reason` |
| Why not let the LLM do everything? | Claude handles the judgement work: extraction, deciding, timing and drafting. Code enforces the invariants. A block comes back to Claude as a tool result, and the prompt forbids workarounds. | `followup/tools.py`, `agent.SYSTEM_PROMPT` |
| Different recipient types? | Customer (48 h, max 3, warm), student (24 h, before the deadline), employee (24 h, direct), business (96 h, formal). | **How it works** tab, `followup/strategies.py` |
| What if Claude is down? | The same run falls back to the rules agent automatically, with the same `run_id`, tools and guards. | `agent.run`, `followup/rule_agent.py` |
| Where is the "plan"? | The live trace shows Claude's thinking summaries, plan text and every tool call and result. Each run ends with `record_decision` and its key facts. | **Run agent** trace, **Action log** |
