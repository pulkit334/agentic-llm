"""Streamlit demo UI for the AI Email Follow-Up Agent.

Run:  streamlit run app.py
"""
import json

import pandas as pd
import streamlit as st

from followup import agent, clock, config, db, scheduler, strategies

st.set_page_config(page_title="AI Follow-Up Agent", page_icon="📬", layout="wide")


@st.cache_resource
def _init():
    db.init_schema()
    if not db.one("SELECT COUNT(*) n FROM contacts")["n"]:
        db.reset()
    return True


_init()

ICONS = {"thinking": "🧠", "plan": "🗺️", "tool_call": "🔧", "tool_result": "📄",
         "decision": "✅", "info": "ℹ️", "error": "⚠️"}


def df(rows):
    return pd.DataFrame(rows) if rows else pd.DataFrame()


# ------------------------------------------------------------------ sidebar
with st.sidebar:
    st.title("📬 Follow-Up Agent")
    st.caption("Team AGT-018 · PS-053")
    now = clock.now()
    st.metric("Simulated time (UTC)", now.strftime("%a %d %b %H:%M"))
    st.caption(f"India: {strategies.local_str(now, 'Asia/Kolkata')}")

    mode = st.radio("Agent brain", ["llm", "rules"], horizontal=True,
                    help="llm = Claude decides; rules = offline deterministic fallback")
    st.caption(f"Model: `{config.CLAUDE_MODEL}` · Email: `{config.EMAIL_MODE}`")

    st.subheader("⏩ Time travel")
    c1, c2, c3 = st.columns(3)
    for col, hrs in ((c1, 6), (c2, 24), (c3, 72)):
        if col.button(f"+{hrs}h", use_container_width=True):
            res = scheduler.advance(hrs)
            st.session_state["advance_result"] = res
            st.rerun()
    if st.button("Send due follow-ups now", use_container_width=True):
        st.session_state["advance_result"] = {"now": clock.now(), "results": scheduler.run_due()}
        st.rerun()

    st.divider()
    if st.button("🔄 Reset demo data", use_container_width=True):
        db.reset()
        st.session_state.clear()
        st.rerun()

if "advance_result" in st.session_state:
    r = st.session_state.pop("advance_result")
    results = r.get("results") or []
    if results:
        st.toast(f"Clock now {r['now']} · {len(results)} follow-up(s) processed")
        st.success("Scheduler ran: " + "; ".join(
            f"#{x.get('followup_id')} {x.get('status')} {x.get('reason', '') or ''}" for x in results))
    else:
        st.info(f"Clock moved to {r['now']} UTC · nothing due yet")

# ------------------------------------------------------------------ main
tab_run, tab_threads, tab_queue, tab_outbox, tab_log, tab_how = st.tabs(
    ["🤖 Run agent", "💬 Conversations", "⏰ Follow-up queue", "📤 Outbox", "📜 Action log", "🧭 How it works"])

with tab_run:
    threads = db.query("SELECT t.id, t.subject, t.status, c.name, c.type FROM threads t "
                       "JOIN contacts c ON c.email=t.contact_email ORDER BY t.created_at")
    src = st.radio("Input", ["Existing conversation", "Paste new email / conversation"], horizontal=True)
    thread_id, text = None, None
    if src == "Existing conversation":
        labels = {f"{t['name']} ({t['type']}) — {t['subject']} [{t['status']}]": t["id"] for t in threads}
        choice = st.selectbox("Conversation", list(labels))
        thread_id = labels.get(choice)
        if thread_id:
            with st.expander("Show messages", expanded=False):
                for m in db.query("SELECT * FROM messages WHERE thread_id=%s ORDER BY sent_at", (thread_id,)):
                    who = "🟦 Us" if m["direction"] == "outbound" else "🟩 Them"
                    st.markdown(f"**{who}** · {m['sent_at']} UTC" + (" · _follow-up_" if m["is_followup"] else ""))
                    st.write(m["body"])
    else:
        try:
            sample = open("samples/new_customer.txt", encoding="utf-8").read()
        except OSError:
            sample = ""
        text = st.text_area("Paste the email thread (include From/To/Date if you have them)", sample, height=260)

    if st.button("▶ Run agent", type="primary"):
        trace = st.container(border=True)
        trace.markdown("#### Live agent trace")

        def on_event(ev):
            icon = ICONS.get(ev.get("type"), "•")
            label = ev.get("type", "")
            body = ev.get("text") or ""
            if ev.get("type") == "tool_call":
                trace.markdown(f"{icon} **{body}**")
                if ev.get("data"):
                    trace.json(ev["data"], expanded=False)
            elif ev.get("type") == "decision":
                trace.success(f"{icon} {body}")
            elif ev.get("type") == "error":
                trace.error(f"{icon} {body}")
            elif ev.get("type") == "thinking":
                trace.markdown(f"{icon} _{body}_")
            else:
                trace.markdown(f"{icon} `{label}` {body}")

        with st.spinner("Agent working…"):
            result = agent.run(thread_id=thread_id, text=text or None, mode=mode, on_event=on_event)
        st.session_state["last_result"] = result
        st.markdown("#### Result")
        st.info(result.get("summary") or "(no summary)")
        st.caption(f"run_id `{result.get('run_id')}` · mode `{result.get('mode')}` · "
                   f"decision `{result.get('decision')}` · thread `{result.get('thread_id')}`")

with tab_threads:
    rows = []
    for t in db.query("SELECT t.*, c.name, c.type, c.timezone FROM threads t JOIN contacts c "
                      "ON c.email=t.contact_email ORDER BY t.created_at"):
        msgs = db.query("SELECT direction, sent_at FROM messages WHERE thread_id=%s ORDER BY sent_at", (t["id"],))
        pend = db.one("SELECT COUNT(*) n FROM followups WHERE thread_id=%s AND status='pending'", (t["id"],))["n"]
        rows.append({"thread": t["id"], "contact": t["name"], "type": t["type"], "subject": t["subject"],
                     "status": t["status"], "messages": len(msgs),
                     "last from": ("us" if msgs and msgs[-1]["direction"] == "outbound" else "them") if msgs else "-",
                     "pending follow-ups": pend})
    st.dataframe(df(rows), use_container_width=True, hide_index=True)

    st.markdown("##### Simulate the recipient replying")
    ids = [r["thread"] for r in rows]
    if ids:
        c1, c2 = st.columns([1, 2])
        rid = c1.selectbox("Thread", ids, key="reply_thread")
        rbody = c2.text_input("Their reply", "Thanks for the reminder - I'll confirm by tomorrow.")
        if st.button("📨 Add reply"):
            scheduler.simulate_reply(rid, rbody)
            st.success("Reply stored. Pending follow-ups on this thread will be auto-cancelled at send time.")
            st.rerun()

with tab_queue:
    rows = db.query("SELECT f.id, f.thread_id, c.name, c.type, c.timezone, f.send_at, f.status, f.strategy, "
                    "f.subject, f.body, f.reason FROM followups f JOIN contacts c ON c.email=f.contact_email "
                    "ORDER BY f.send_at")
    for r in rows:
        r["send_at_local"] = strategies.local_str(r["send_at"], r.pop("timezone"))
    st.dataframe(df([{k: v for k, v in r.items() if k != "body"} for r in rows]),
                 use_container_width=True, hide_index=True)
    for r in rows:
        with st.expander(f"#{r['id']} · {r['status']} · {r['name']} · {r['send_at_local']}"):
            st.markdown(f"**{r['subject']}**")
            st.text(r["body"])
            st.caption(r["reason"] or "")

with tab_outbox:
    rows = db.query("SELECT id, sent_at, to_email, delivered_to, subject, provider, status, error, body "
                    "FROM outbox ORDER BY id DESC")
    st.dataframe(df([{k: v for k, v in r.items() if k != "body"} for r in rows]),
                 use_container_width=True, hide_index=True)
    for r in rows:
        with st.expander(f"#{r['id']} → {r['to_email']} · {r['subject']} · {r['status']}"):
            st.text(r["body"])

with tab_log:
    rows = db.query("SELECT id, ts, run_id, thread_id, action, details FROM action_log ORDER BY id DESC LIMIT 300")
    for r in rows:
        try:
            d = json.loads(r["details"]) if r["details"] else None
            r["details"] = json.dumps(d, ensure_ascii=False)[:300] if d is not None else ""
        except (TypeError, ValueError):
            pass
    st.dataframe(df(rows), use_container_width=True, hide_index=True)

with tab_how:
    st.markdown("""
### How the agent plans and executes

1. **Understand input** — existing thread, or pasted raw email → Claude extracts contact, type and messages → `save_conversation` (duplicate messages skipped).
2. **Check previous communication** — `get_thread_history` + `list_followups`: who wrote last, follow-ups already sent, anything pending.
3. **Decide** — is a follow-up needed? Skip when the recipient replied, the thread is resolved, they opted out, one is already pending, or the limit is reached. If they asked a question → reply instead.
4. **Pick time** — `get_strategy` gives the per-type delay and a business-hours slot; deadlines pull it earlier.
5. **Draft** — tone, length and focus from the strategy (customer / student / employee / business), using only the relevant facts from the thread.
6. **Act** — `schedule_followup` or `send_email_now` through the email tool (mock outbox or real SMTP).
7. **Record** — `record_decision` + every tool call in the action log.

### Safety guards (enforced in code, not just the prompt)
- one pending follow-up per thread · no chasing after they replied · opt-out / closed threads skipped
- max follow-ups per type · 24 h minimum gap · business hours only · identical message never re-sent
- at send time the scheduler re-checks: if they replied meanwhile, the follow-up is auto-cancelled
""")
    st.dataframe(df([{"type": k, **v} for k, v in strategies.STRATEGIES.items()]),
                 use_container_width=True, hide_index=True)
