"""Streamlit UI for the AI Email Follow-Up Agent - built for everyone (shop owners, teachers, and tech judges).

Run:  streamlit run app.py
"""
import html
import json
import os
import time
from datetime import datetime, timedelta, time as dtime

import pandas as pd
import streamlit as st

import ui_helpers as H
from followup import agent, clock, config, db, scheduler, strategies, tools

st.set_page_config(page_title="Follow-Up Assistant", page_icon="📬", layout="wide", initial_sidebar_state="auto")


@st.cache_resource
def _init():
    db.init_schema()
    if not db.one("SELECT COUNT(*) n FROM contacts")["n"]:
        db.reset()
    return True


_init()
ss = st.session_state
esc = html.escape
QP = st.query_params


# ------------------------------------------------------------------ styling
def _theme_type():
    try:
        return (st.context.theme.type or "light").lower()
    except Exception:
        return "light"


DARK = _theme_type() == "dark"
PALETTE = {  # chip text colours tuned for contrast on each theme; backgrounds are translucent tints
    "indigo": ("#A5B4FC" if DARK else "#3730A3", "rgba(99,102,241,.22)" if DARK else "rgba(79,70,229,.10)"),
    "green": ("#86EFAC" if DARK else "#166534", "rgba(34,197,94,.18)" if DARK else "rgba(22,163,74,.10)"),
    "amber": ("#FCD34D" if DARK else "#92400E", "rgba(245,158,11,.18)" if DARK else "rgba(217,119,6,.12)"),
    "red": ("#FCA5A5" if DARK else "#991B1B", "rgba(239,68,68,.18)" if DARK else "rgba(220,38,38,.10)"),
    "gray": ("#D1D5DB" if DARK else "#374151", "rgba(148,163,184,.18)" if DARK else "rgba(100,116,139,.12)"),
    "violet": ("#D8B4FE" if DARK else "#6B21A8", "rgba(168,85,247,.18)" if DARK else "rgba(147,51,234,.10)"),
}
chip_css = "\n".join(f".fu-chip.{k}{{color:{fg};background:{bg};}}" for k, (fg, bg) in PALETTE.items())
MUTED = "#A3A9C2" if DARK else "#5B6178"
BORDER = "rgba(148,163,184,.28)" if DARK else "rgba(30,35,60,.10)"
CARD_BG = "rgba(255,255,255,.035)" if DARK else "#FFFFFF"
US_BG = "rgba(99,102,241,.22)" if DARK else "rgba(79,70,229,.09)"
THEM_BG = "rgba(148,163,184,.14)" if DARK else "#F1F3F9"
SHADOW = "none" if DARK else "0 1px 3px rgba(20,25,60,.06)"

st.markdown(f"""
<style>
.block-container {{padding-top: 2rem; max-width: 1100px;}}
.fu-hero h1 {{font-size: 1.9rem; margin: 0 0 .15rem 0; font-weight: 750; padding: 0;}}
.fu-hero p {{color: {MUTED}; margin: 0; font-size: 1.02rem;}}
.fu-muted {{color: {MUTED}; font-size: .92rem;}}
.fu-stats {{display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .55rem; margin: .2rem 0 .6rem 0;}}
.fu-metric {{border: 1px solid {BORDER}; border-radius: 12px; padding: .5rem .75rem; background: {CARD_BG};
            box-shadow: {SHADOW}; min-width: 0;}}
.fu-metric .lbl {{color: {MUTED}; font-size: .8rem; font-weight: 600; white-space: nowrap; overflow: hidden;
                 text-overflow: ellipsis;}}
.fu-metric .val {{font-size: 1.45rem; font-weight: 750; line-height: 1.2;}}
.fu-chip {{display: inline-block; padding: .14rem .6rem; border-radius: 999px; font-size: .8rem;
          font-weight: 650; margin: 0 .35rem .2rem 0; white-space: nowrap;}}
{chip_css}
.fu-badge {{font-size: .98rem; padding: .3rem .85rem;}}
.fu-step-title {{display: flex; align-items: center; gap: .6rem; font-size: 1.2rem; font-weight: 700;
                margin: .4rem 0 .4rem 0;}}
.fu-num {{display: inline-flex; flex: none; width: 1.9rem; height: 1.9rem; border-radius: 50%;
         align-items: center; justify-content: center; background: #4F46E5; color: #fff; font-size: 1rem;
         font-weight: 750;}}
.fu-bubble {{max-width: 85%; width: fit-content; padding: .65rem .9rem; border-radius: 14px; margin: .35rem 0;
            line-height: 1.45;}}
.fu-bubble.us {{margin-left: auto; background: {US_BG}; border-bottom-right-radius: 4px;}}
.fu-bubble.them {{margin-right: auto; background: {THEM_BG}; border-bottom-left-radius: 4px;}}
.fu-bubble .meta {{font-size: .78rem; color: {MUTED}; margin-bottom: .2rem; font-weight: 600;}}
.fu-last {{border-left: 3px solid {BORDER}; padding: .2rem .7rem; margin: .35rem 0; color: {MUTED};
          font-size: .93rem;}}
.fu-email {{border-left: 4px solid #6366F1; background: {THEM_BG}; border-radius: 8px; padding: .8rem 1rem;
           line-height: 1.5; margin: .4rem 0 .6rem 0;}}
.fu-email .subj {{font-weight: 700; margin-bottom: .45rem; white-space: normal;}}
.fu-steps {{display: flex; flex-wrap: wrap; gap: .3rem 1rem; margin: .3rem 0 .4rem 0;}}
.fu-steps.vertical {{flex-direction: column; gap: .45rem; font-size: 1.02rem;}}
.fu-s {{font-size: .93rem;}}
.fu-s.done {{color: {PALETTE['green'][0]};}}
.fu-s.active {{color: {PALETTE['indigo'][0]}; font-weight: 700;}}
.fu-s.failed {{color: {PALETTE['red'][0]};}}
.fu-s.todo, .fu-s.skipped {{color: {MUTED};}}
.fu-why {{font-size: 1.05rem; margin: .55rem 0 .35rem 0; line-height: 1.5;}}
.fu-when {{font-size: 1rem; margin: .35rem 0;}}
.fu-rules div {{font-size: .93rem; margin: .1rem 0;}}
.fu-clock {{border: 1px solid {BORDER}; border-radius: 10px; padding: .55rem .75rem; background: {CARD_BG};
           font-size: .95rem; margin-bottom: .6rem;}}
.st-key-go button {{font-size: 1.15rem; min-height: 3.3rem; font-weight: 700;}}
.st-key-go button p {{font-size: 1.15rem; font-weight: 700;}}
div[data-testid="stPopoverBody"] {{min-width: min(520px, 92vw);}}
.st-key-nav [role="radiogroup"], .st-key-nav > div > div {{flex-wrap: wrap;}}
@media (max-width: 640px) {{
  .block-container {{padding-top: 1.2rem;}}
  .fu-hero h1 {{font-size: 1.45rem;}}
  .fu-hero p {{font-size: .92rem;}}
  .fu-stats {{grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .35rem;}}
  .fu-metric {{padding: .35rem .5rem;}}
  .fu-metric .val {{font-size: 1.15rem;}}
  .fu-metric .lbl {{font-size: .72rem;}}
}}
</style>
""", unsafe_allow_html=True)


# ------------------------------------------------------------------ Smart AI availability (checked once, cached)
@st.cache_data(ttl=600, show_spinner=False)
def claude_status():
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
        return False, "no API key is set"
    try:
        import anthropic
        anthropic.Anthropic(timeout=8, max_retries=0).models.list(limit=1)
        return True, ""
    except Exception as e:  # noqa: BLE001 - any failure means "use the offline assistant"
        name = type(e).__name__
        why = {"AuthenticationError": "the API key was rejected",
               "PermissionDeniedError": "the API key has no access",
               "APIConnectionError": "Claude can't be reached",
               "APITimeoutError": "Claude didn't answer in time"}.get(name, name)
        return False, why


CLAUDE_OK, CLAUDE_WHY = claude_status()

# ------------------------------------------------------------------ session defaults (survive reloads via the URL)
NAV = ["home", "people", "scheduled", "sent", "history", "help"]
NAV_LABELS = {"home": "🏠 Home", "people": "💬 People", "scheduled": "📅 Scheduled", "sent": "📤 Sent",
              "history": "📜 History", "help": "❓ Help"}
BRAINS = {"llm": "Smart AI (Claude)", "rules": "Offline rules"}
SRC_LABELS = {"saved": "📂 Someone in my list", "new": "✍️ Someone new", "paste": "📋 Paste an email (advanced)"}
TYPES = ["customer", "student", "employee", "business"]

if "nav" not in ss:
    ss["nav"] = QP.get("nav") if QP.get("nav") in NAV else "home"
if "tech" not in ss:
    ss["tech"] = QP.get("view") == "tech"
if "brain" not in ss:
    ss["brain"] = QP.get("brain") if QP.get("brain") in BRAINS else ("llm" if CLAUDE_OK else "rules")
if "hide_intro" not in ss:
    ss["hide_intro"] = QP.get("intro") == "0"
ss.setdefault("src", "saved")

# deferred jumps requested by buttons after their widgets were drawn (applied before any widget exists)
if "_goto" in ss:
    g = ss.pop("_goto")
    for k in ("nav", "src", "pick_thread", "reply_thread"):
        if k in g:
            ss[k] = g[k]
    for k in g.get("clear", []):
        ss.pop(k, None)

# Keep Home's inputs when the user visits another page (Streamlit drops state of widgets that aren't drawn;
# re-assigning turns it into plain session state that survives).
for _k in ("src", "pick_thread", "paste_text", "f_name", "f_email", "f_type", "f_subject", "f_body", "f_reply",
           "f_date", "f_time", "f_rdate", "f_rtime", "conv_search"):
    if _k in ss:
        ss[_k] = ss[_k]


def technical():
    return bool(ss.get("tech"))


MODE = ss["brain"]


# ------------------------------------------------------------------ small render helpers
TYPE_COLOR = {"customer": "indigo", "student": "green", "employee": "amber", "business": "violet"}
ICONS = {"thinking": "🧠", "plan": "🗺️", "tool_call": "🔧", "tool_result": "📄",
         "decision": "✅", "info": "ℹ️", "error": "⚠️"}
FALLBACK_LINE = "💡 Smart AI is unavailable right now, so the offline assistant handled this (same safety rules)."


def html_block(s, target=st):
    target.markdown(s, unsafe_allow_html=True)


def chip(text, color="gray", extra=""):
    return f'<span class="fu-chip {color} {extra}">{esc(str(text))}</span>'


def type_chip(t):
    return chip(f"{H.TYPE_ICONS.get(t, '👤')} {H.type_label(t)}", TYPE_COLOR.get(t, "gray"))


def step_title(n, text):
    html_block(f'<div class="fu-step-title"><span class="fu-num">{n}</span>{esc(text)}</div>')


def steps_html(steps, vertical=False):
    icons = {"done": "✅", "active": "⏳", "todo": "⚪", "skipped": "➖", "failed": "⚠️"}
    parts = []
    for label, state in steps:
        suffix = " (could not finish)" if state == "failed" else ("…" if state == "active" else "")
        parts.append(f'<span class="fu-s {state}">{icons[state]} {esc(label)}{suffix}</span>')
    return f'<div class="fu-steps {"vertical" if vertical else ""}">{"".join(parts)}</div>'


def nl2br(text):
    """Escape and keep line breaks without letting markdown split the HTML block on blank lines."""
    return "<br>".join(esc(text or "").splitlines())


def email_html(subject, body):
    return (f'<div class="fu-email"><div class="subj">✉️ {esc(subject or "(no subject)")}</div>'
            f'{nl2br(body)}</div>')


def messages_of(thread_id):
    return db.query("SELECT direction, body, sent_at, is_followup FROM messages WHERE thread_id=%s "
                    "ORDER BY sent_at, id", (thread_id,))


def bubbles(thread_id, name):
    msgs = messages_of(thread_id)
    if not msgs:
        st.caption("No messages yet.")
        return
    out = []
    for m in msgs:
        us = m["direction"] == "outbound"
        tag = " · automatic follow-up" if m["is_followup"] else ""
        out.append(f'<div class="fu-bubble {"us" if us else "them"}"><div class="meta">'
                   f'{"You" if us else esc(name)} · {H.fmt_time(m["sent_at"])}{tag}</div>{nl2br(m["body"])}</div>')
    html_block("".join(out))


def last_message_html(t, now):
    m = db.one("SELECT direction, body, sent_at FROM messages WHERE thread_id=%s ORDER BY sent_at DESC, id DESC "
               "LIMIT 1", (t["id"],))
    if not m:
        return ""
    who = "You" if m["direction"] == "outbound" else esc(t["name"].split()[0])
    return (f'<div class="fu-last"><b>{who}</b>, {H.humanize_delta(m["sent_at"], now)}: '
            f'“{esc(H.short(m["body"], 150))}”</div>')


def contacts_by_email():
    return {c["email"]: c for c in db.query("SELECT * FROM contacts")}


def thread_rows():
    return db.query(
        "SELECT t.id, t.subject, t.status, t.created_at, c.email, c.name, c.type, c.timezone, c.company, "
        "(SELECT direction FROM messages m WHERE m.thread_id=t.id ORDER BY sent_at DESC, id DESC LIMIT 1) last_dir, "
        "(SELECT MAX(sent_at) FROM messages m WHERE m.thread_id=t.id) last_at, "
        "(SELECT COUNT(*) FROM messages m WHERE m.thread_id=t.id) n_msgs, "
        "(SELECT COUNT(*) FROM followups f WHERE f.thread_id=t.id AND f.status='pending') n_pending "
        "FROM threads t JOIN contacts c ON c.email=t.contact_email ORDER BY t.created_at")


def thread_status(t):
    """(label, colour, sort priority) - lower priority = needs you sooner."""
    if t["status"] == "closed":
        return "Closed", "gray", 4
    if t["n_pending"]:
        return "Follow-up scheduled", "indigo", 2
    if t["last_dir"] == "inbound":
        return "They replied", "green", 1
    if t["last_dir"] == "outbound":
        return "Waiting for their reply", "amber", 0
    return "New", "gray", 3


def sorted_threads():
    return sorted(thread_rows(), key=lambda t: (thread_status(t)[2], t["last_at"] or t["created_at"]))


def thread_option_label(t, now):
    label, _, _ = thread_status(t)
    status = {"Waiting for their reply": f"waiting {H.humanize_delta(t['last_at'], now).replace(' ago', '')}",
              "They replied": "they replied", "Follow-up scheduled": "follow-up already scheduled",
              "Closed": "closed"}.get(label, label.lower())
    return f"{t['name']} - {H.short(t['subject'], 34)} · {status}"


def thread_sig(thread_id):
    """Snapshot of a conversation; when it changes, an older result for it is out of date."""
    if not thread_id:
        return None
    r = db.one("SELECT (SELECT COUNT(*) FROM messages WHERE thread_id=%s) m, "
               "(SELECT status FROM threads WHERE id=%s) s, "
               "(SELECT COUNT(*) FROM followups WHERE thread_id=%s AND status='pending') p, "
               "(SELECT COUNT(*) FROM followups WHERE thread_id=%s AND status='sent') x",
               (thread_id, thread_id, thread_id, thread_id))
    return [r["m"], r["s"], r["p"], r["x"]] if r else None


def thread_info(thread_id):
    if not thread_id:
        return None
    return db.one("SELECT t.id, t.subject, t.status, c.name, c.type, c.timezone, c.email FROM threads t "
                  "JOIN contacts c ON c.email=t.contact_email WHERE t.id=%s", (thread_id,))


def goto(**kw):
    """Button callback: jump to a page / conversation (runs before widgets are drawn)."""
    for k, v in kw.items():
        ss[k] = v


def notice(kind, msg):
    ss["notice"] = (kind, msg)


# ------------------------------------------------------------------ actions on a scheduled email
def cancel(fid, where):
    res = tools.cancel_followup(int(fid), f"cancelled by user from the {where}")
    if res.get("status") == "cancelled":
        notice("success", "Cancelled. That email will not be sent.")
    else:
        notice("info", res.get("detail") or res.get("error") or "Nothing to cancel.")


def followup_actions(f, prefix, name, tz):
    """Edit / change time / send now / cancel for one pending follow-up (each opens a small panel)."""
    fid = f["id"]
    ver = abs(hash((f["subject"], f["body"], str(f["send_at"])))) % 10 ** 6
    now = clock.now()
    c1, c2, c3, c4 = st.columns(4)
    with c1.popover("✏️ Edit", width="stretch", help="Change the subject or wording before it goes out."):
        subj = st.text_input("Subject", f["subject"], key=f"{prefix}_es_{fid}_{ver}")
        body = st.text_area("Email", f["body"], height=220, key=f"{prefix}_eb_{fid}_{ver}")
        if st.button("Save changes", type="primary", key=f"{prefix}_esave_{fid}", width="stretch"):
            if not subj.strip() or not body.strip():
                st.error("The subject and the email can't be empty.")
            else:
                db.execute("UPDATE followups SET subject=%s, body=%s WHERE id=%s AND status='pending'",
                           (subj.strip(), body.strip(), fid))
                db.log_action("followup_edited", f["thread_id"], {"followup_id": fid, "by": "user"})
                notice("success", f"Saved your changes to the email for {name}.")
                st.rerun()
    with c2.popover("🕒 Change time", width="stretch", help="Pick a different day or time."):
        loc = H.to_local(f["send_at"])
        day = st.date_input("Day", loc.date(), min_value=H.to_local(now).date(), format="DD/MM/YYYY",
                            key=f"{prefix}_ed_{fid}_{ver}")
        tm = st.time_input("Time (India time)", dtime(loc.hour, loc.minute), step=900, key=f"{prefix}_et_{fid}_{ver}")
        st.caption(f"Emails only go out in {name.split()[0]}'s working hours (Mon-Fri, 9 AM-6 PM "
                   f"{H.tz_city(tz)} time). A time outside that moves to the next working slot.")
        if st.button("Save new time", type="primary", key=f"{prefix}_etsave_{fid}", width="stretch"):
            want = H.local_to_utc(datetime.combine(day, tm))
            if want < now:
                st.error("Please pick a time in the future.")
            else:
                slot = strategies.next_business_slot(want, tz or H.HOME_TZ)
                db.execute("UPDATE followups SET send_at=%s WHERE id=%s AND status='pending'", (slot, fid))
                db.log_action("followup_rescheduled", f["thread_id"],
                              {"followup_id": fid, "send_at": slot, "requested": want, "by": "user"})
                moved = "" if slot == want else " (moved into their working hours)"
                notice("success", f"The email to {name} now goes out {H.fmt_time(slot)} India time{moved}.")
                st.rerun()
    with c3.popover("📤 Send now", width="stretch", help="Send it right away instead of waiting."):
        st.markdown(f"Send this email to **{esc(name)}** right now?")
        if st.button("Yes, send it now", type="primary", key=f"{prefix}_snow_{fid}", width="stretch"):
            db.execute("UPDATE followups SET send_at=%s WHERE id=%s AND status='pending'", (now, fid))
            results = scheduler.run_due()
            mine = next((r for r in results if r["followup_id"] == fid), None)
            if mine and mine["status"] == "sent":
                notice("success", f"Sent to {name}. You'll find it under 📤 Sent.")
            elif mine and mine["status"] == "cancelled":
                notice("warning", f"Not sent: {H.humanize_text(mine.get('reason'))}. A safety rule stopped it.")
            else:
                notice("error", f"Could not send: {(mine or {}).get('reason') or 'unknown error'}")
            st.rerun()
    with c4.popover("🗑️ Cancel", width="stretch", help="Stop this email from being sent."):
        st.markdown("Cancel this email? It will **not** be sent.")
        if st.button("Yes, cancel it", type="primary", key=f"{prefix}_cancel_{fid}", width="stretch"):
            cancel(fid, prefix)
            st.rerun()


def when_html(f, tz, now):
    state = {"pending": "🕒 Goes out", "sent": "✅ Went out", "cancelled": "🛑 Cancelled - was due"}
    when = f'<b>{H.fmt_time(f["send_at"])}</b> India time ({H.humanize_delta(f["send_at"], now)})'
    if tz and tz != H.HOME_TZ:
        when += f' · {H.fmt_time(f["send_at"], tz)} for them in {esc(H.tz_city(tz))}'
    return f'<div class="fu-when">{state.get(f["status"], "🕒")} {when}</div>'


def strategy_line(ctype):
    s = strategies.STRATEGIES.get(ctype) or {}
    if not s:
        return ""
    wait = H.plural(s["delay_hours"] // 24, "day") if s["delay_hours"] >= 24 else H.plural(s["delay_hours"], "hour")
    return (f"{H.TYPE_ICONS.get(ctype, '')} {H.type_label(ctype)}: waits {wait} before a reminder, "
            f"{s['tone'].split(',')[0]} tone, at most {s['max_followups']} reminders, only in their working hours.")


# ------------------------------------------------------------------ running the assistant
def run_agent(thread_id, text, where, source=None, compact=False):
    """Run with a live progress list; stores the result in ss['last_run']."""
    if compact:
        box = st.empty()
        box.info("⏳ The assistant is working on it…")
        on_event = lambda ev: ev.__setitem__("_t", time.perf_counter())  # noqa: E731
    else:
        box = st.status("The assistant is working on it…", expanded=True)
        with box:
            steps_ph = st.empty()
            note_ph = st.empty()
            html_block(steps_html(H.progress([]), vertical=True), steps_ph)
        seen = []

        def on_event(ev):
            ev["_t"] = time.perf_counter()
            seen.append(ev)
            html_block(steps_html(H.progress(seen), vertical=True), steps_ph)
            if MODE == "llm" and "falling back" in (ev.get("text") or "").lower():
                note_ph.caption(FALLBACK_LINE)
    try:
        result = agent.run(thread_id=thread_id, text=text, mode=MODE, on_event=on_event)
    except Exception as e:  # keep the UI alive whatever happens
        result = {"run_id": None, "mode": MODE, "thread_id": thread_id, "decision": None,
                  "summary": f"Something went wrong: {e}",
                  "events": [{"type": "error", "text": f"{type(e).__name__}: {e}", "data": None}]}
    if not compact:
        box.update(label="Done!", state="complete", expanded=False)
    ss["last_run"] = {"result": result, "requested_mode": MODE, "where": where, "src": source,
                      "sig": thread_sig(result.get("thread_id")), "fresh": True}
    return result


def render_trace(events):
    for ev in events:
        typ, body = ev.get("type"), ev.get("text") or ""
        data = ev.get("data") or {}
        icon = ICONS.get(typ, "•")
        if typ == "tool_call":
            st.markdown(f"{icon} **Tool call** `{data.get('name', '')}`")
            st.json(data.get("input") or {}, expanded=True)
        elif typ == "tool_result":
            st.markdown(f"{icon} **Tool result** `{data.get('name', '')}`")
            st.json(data.get("result") or {}, expanded=True)
        elif typ == "thinking":
            st.markdown(f"{icon} _{body}_")
        elif typ == "decision":
            st.success(f"{icon} {body}")
        else:
            st.markdown(f"{icon} **{typ}:** {body}")


def render_technical(run):
    result, requested = run["result"], run["requested_mode"]
    events = result.get("events") or []
    with st.expander("🔍 Show how the assistant thought (technical)", expanded=technical()):
        st.caption(f"run_id `{result.get('run_id')}` · mode `{result.get('mode')}` (requested `{requested}`) · "
                   f"decision `{result.get('decision')}` · thread_id `{result.get('thread_id')}`")
        raw = H.decision_reason(events)
        if raw:
            st.markdown(f"**Raw reason:** {raw}")
        if result.get("summary"):
            st.markdown(f"**Agent summary:** {result['summary']}")
        plans = [ev["text"] for ev in events if ev.get("type") in ("plan", "thinking", "info", "error")]
        if plans:
            st.markdown("**Plan and notes**")
            for p in plans:
                st.markdown(f"- {p}")
        st.markdown("**Hard rules (checked in code before anything is sent)**")
        icons = {"pass": "✅", "fail": "❌", "n/a": "➖"}
        html_block('<div class="fu-rules">' + "".join(
            f'<div>{icons[s]} {esc(label)}{" <span class=fu-muted>(not checked - no email attempted)</span>" if s == "n/a" else ""}</div>'
            for label, s in H.hard_rule_checks(events)) + "</div>")
        rows = H.trace_rows(events)
        if rows:
            st.markdown("**Tool calls**")
            st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch",
                         column_config={"#": st.column_config.NumberColumn(width="small"),
                                        "ms": st.column_config.NumberColumn("ms", width="small"),
                                        "Key arguments": st.column_config.TextColumn(width="large"),
                                        "Result": st.column_config.TextColumn(width="large")})
        if st.toggle("Show every step with full JSON", key=f"rawjson_{result.get('run_id')}"):
            render_trace(events)


def render_result(run, compact=False):
    result = run["result"]
    events = result.get("events") or []
    decision = result.get("decision")
    tid = result.get("thread_id")
    t = thread_info(tid)
    name = (t or {}).get("name") or "them"
    tz = (t or {}).get("timezone") or H.HOME_TZ
    now = clock.now()

    mail = H.extract_email(events)
    f = None
    if mail and mail["kind"] == "scheduled" and mail.get("followup_id"):
        f = db.one("SELECT * FROM followups WHERE id=%s", (mail["followup_id"],))
    badge, color, icon, _ = H.decision_info(decision)
    if f and f["status"] == "sent":
        badge, color, icon = "Follow-up sent", "green", "✅"
    elif f and f["status"] == "cancelled":
        badge, color, icon = "Follow-up cancelled", "gray", "🛑"
    stale = not mail and tid and thread_sig(tid) != run.get("sig")

    with st.container(border=True, key="fu_result" if not compact else None):
        who = (f' <span class="fu-muted">for <b>{esc(name)}</b> · {esc(t["subject"])}</span>' if t else "")
        html_block(chip(f"{icon} {badge}", "gray" if stale else color, "fu-badge") + who)
        if stale:
            st.info("This result is out of date - something changed since (a reply, a sent email or a "
                    "cancellation). Run the assistant again for a fresh decision.", icon="🔄")
        if H.used_fallback(result, run["requested_mode"]):
            st.caption(FALLBACK_LINE)

        errs = H.real_errors(result)
        if not decision:
            if not tid and run.get("src") == "paste":
                st.error("I couldn't work out who this email is for. Make sure it includes their email address, "
                         "for example a line like `To: Meera <meera@shop.in>`. Easier: use **✍️ Someone new**, "
                         "which needs no special format.", icon="⚠️")
                st.button("Use the simple form instead", key="to_form", on_click=goto, kwargs={"src": "new"})
            else:
                st.error("The assistant couldn't finish this one" +
                         (f": {H.first_sentence(errs[-1])}" if errs else ".") + " Please try again.", icon="⚠️")
        else:
            reason = H.decision_reason(events)
            html_block(f'<div class="fu-why">{esc(H.friendly_reason(decision, reason, name))}</div>')
        html_block(steps_html(H.final_steps(events, decision)))

        if f:
            html_block(when_html(f, tz, now))
            html_block(email_html(f["subject"], f["body"]))
            if f["status"] == "pending":
                followup_actions(f, "res" if not compact else "cres", name, tz)
        elif mail:
            html_block(f'<div class="fu-when">✅ Sent to {esc(name)} right away</div>')
            html_block(email_html(mail["subject"], mail["body"]))
        elif decision:
            html_block('<div class="fu-when">Nothing new will be sent. ✔️</div>')
            waiting = tid and db.one("SELECT * FROM followups WHERE thread_id=%s AND status='pending' "
                                     "ORDER BY send_at LIMIT 1", (tid,))
            if waiting:
                html_block(f'<div class="fu-when">The email already waiting goes out '
                           f'<b>{H.fmt_time(waiting["send_at"])}</b> India time '
                           f'({H.humanize_delta(waiting["send_at"], now)}):</div>')
                html_block(email_html(waiting["subject"], waiting["body"]))
                followup_actions(waiting, "wait" if not compact else "cwait", name, tz)
        if compact and tid:
            st.button("Open the full result on Home", key=f"open_home_{tid}", on_click=goto,
                      kwargs={"nav": "home", "src": "saved", "pick_thread": tid})
    if not compact:
        render_technical(run)


# ------------------------------------------------------------------ sidebar
def do_advance(hours, label):
    ss["advance"] = {"label": label, **scheduler.advance(hours)}


with st.sidebar:
    html_block('<div style="font-size:1.35rem;font-weight:750">📬 Follow-Up Assistant</div>'
               '<div class="fu-muted">Never forget to follow up again.</div>')
    st.write("")
    st.toggle("🔧 Technical view", key="tech",
              help="Off: plain language, just the essentials. On: also shows the assistant's reasoning, tool calls, "
                   "IDs, UTC times and raw logs.")
    st.radio("Assistant brain", list(BRAINS), format_func=BRAINS.get, horizontal=True, key="brain",
             help="Smart AI uses Claude to read and write emails. Offline rules works without internet or an API "
                  "key. If Smart AI fails, the app switches to Offline rules for you.")
    if CLAUDE_OK:
        st.caption("🟢 Smart AI is connected.")
    elif ss["brain"] == "llm":
        st.caption(f"⚪ Smart AI unavailable ({CLAUDE_WHY}) - runs will use the offline assistant.")
    else:
        st.caption(f"⚪ Smart AI unavailable ({CLAUDE_WHY}) - using the offline assistant.")
    if technical():
        st.caption(f"Model `{config.CLAUDE_MODEL}` · email mode `{config.EMAIL_MODE}` · "
                   f"DB `{config.MYSQL['database']}`")
        st.caption("⚠️ Shared demo database: anyone else with this app open can change the data and the clock.")

    st.divider()
    st.subheader("🎮 Demo controls")
    st.caption("Helpers for trying the app. In real use, time passes on its own and replies arrive by email.")
    now = clock.now()
    html_block(f'<div class="fu-clock">🕒 <b>Demo clock:</b> {H.fmt_time(now)}'
               f' <span class="fu-muted">(India time)</span></div>')
    if technical():
        st.caption(f"UTC: {now:%Y-%m-%d %H:%M}")

    st.markdown("**⏩ Skip ahead in time**")
    st.caption("Skip ahead 1 day to see scheduled emails go out.")
    c1, c2, c3 = st.columns(3)
    for col, hrs, label in ((c1, 6, "+6 hrs"), (c2, 24, "+1 day"), (c3, 72, "+3 days")):
        col.button(label, width="stretch", key=f"adv_{hrs}", on_click=do_advance, args=(hrs, label.lstrip("+")),
                   help=f"Move the demo clock forward {label.lstrip('+')} and send whatever falls due.")
    st.button("📤 Send anything that's due now", width="stretch", key="run_due",
              on_click=lambda: ss.__setitem__("advance", {"label": None, "now": clock.now(),
                                                          "results": scheduler.run_due()}))

    with st.expander("💬 Pretend someone replied"):
        st.caption("Adds a reply from the other person. Any follow-up waiting for them is cancelled - we never "
                   "chase someone who already answered.")
        open_threads = {t["id"]: t for t in sorted_threads() if t["status"] != "closed"}
        if open_threads:
            if ss.get("reply_thread") not in open_threads:
                cur = ss.get("pick_thread")
                ss["reply_thread"] = cur if cur in open_threads else next(iter(open_threads))
            rid = st.selectbox("Who replied?", list(open_threads), key="reply_thread",
                               format_func=lambda i: f"{open_threads[i]['name']} - "
                                                     f"{H.short(open_threads[i]['subject'], 30)}")
            rbody = st.text_area("Their reply", key="reply_body", height=90,
                                 placeholder="e.g. Thanks for the reminder - I'll confirm by tomorrow.")
            if st.button("Add their reply", width="stretch", type="primary", key="add_reply",
                         disabled=not (rbody or "").strip()):
                who = open_threads[rid]["name"]
                pend = db.query("SELECT id FROM followups WHERE thread_id=%s AND status='pending'", (rid,))
                scheduler.simulate_reply(rid, rbody.strip())
                cancelled = [p["id"] for p in pend
                             if tools.cancel_followup(p["id"], "recipient replied").get("status") == "cancelled"]
                if cancelled:
                    msg = (f"Added {who}'s reply and cancelled {H.plural(len(cancelled), 'scheduled email')} to "
                           f"them - no need to chase someone who answered.")
                else:
                    msg = f"Added {who}'s reply. Nothing was waiting to be sent to them, so nothing was cancelled."
                notice("success", msg)
                ss["_goto"] = {"nav": "home", "src": "saved", "pick_thread": rid, "clear": ["reply_body"]}
                st.rerun()
        else:
            st.caption("No open conversations.")

    with st.popover("🔄 Reset demo data", width="stretch"):
        st.markdown("**Start over?** This removes every change and restores the original example conversations.")
        if st.button("Yes, reset everything", type="primary", width="stretch", key="confirm_reset"):
            db.reset()
            ss["_goto"] = {"clear": ["last_run", "pick_thread", "paste_text", "advance", "reply_thread"]}
            notice("success", "Demo data restored to the starting point.")
            st.rerun()


# ------------------------------------------------------------------ header, onboarding, notices
h1, h2 = st.columns([5, 1.4], vertical_alignment="center")
html_block('<div class="fu-hero"><h1>📬 Follow-Up Assistant</h1>'
           '<p>Reads your email conversations, decides if a follow-up is needed, writes it and sends it at the '
           'right time.</p></div>', h1)
h2.button("➕ New follow-up", type="secondary", width="stretch", key="hdr_new",
          on_click=goto, kwargs={"nav": "home", "src": "new"},
          help="Start a follow-up for someone who isn't in your list yet.")


def _hide_intro():
    ss["hide_intro"] = True


if not ss["hide_intro"]:
    with st.container(border=True):
        a, b = st.columns([6, 1], vertical_alignment="center")
        a.markdown("**👋 How this works:** ① pick who you're following up with → ② click one button → "
                   "③ see the email it wrote and when it goes out (or why none is needed).")
        b.button("Got it", key="hide_intro_btn", width="stretch", on_click=_hide_intro)

if "notice" in ss:
    kind, msg = ss.pop("notice")
    getattr(st, kind)(msg)
    st.toast(msg, icon={"success": "✅", "warning": "⚠️", "error": "⚠️"}.get(kind, "ℹ️"))

if "advance" in ss:
    r = ss.pop("advance")
    people = contacts_by_email()
    lines = []
    for x in r.get("results") or []:
        name = people.get(x.get("to"), {}).get("name", x.get("to"))
        if x["status"] == "sent":
            lines.append(f"✅ Sent the follow-up to **{name}** - “{x.get('subject', '')}”")
        elif x["status"] == "cancelled":
            reason = (x.get("reason") or "").lower()
            why = ("they already replied" if "replied" in reason else
                   "they said no / opted out" if "opted out" in reason or "declined" in reason else
                   "the conversation is closed" if "closed" in reason else x.get("reason"))
            lines.append(f"🛑 Did **not** send to **{name}** - {why}")
        else:
            lines.append(f"⚠️ Could not send to **{name}** - {x.get('reason') or 'unknown error'}")
    head = ((f"⏩ Skipped ahead {r['label']}. " if r.get("label") else "")
            + f"Demo clock is now **{H.fmt_time(r['now'])}** (India time).")
    if lines:
        st.success(head + "\n\n" + "\n".join(f"- {line}" for line in lines))
    else:
        st.info(head + " Nothing was due to go out in that time.")


# ------------------------------------------------------------------ stats strip
def _count(sql):
    return db.one(sql)["n"]


n_conv = _count("SELECT COUNT(*) n FROM threads")
n_open = _count("SELECT COUNT(*) n FROM threads WHERE status='open'")
n_sched = _count("SELECT COUNT(*) n FROM followups WHERE status='pending'")
n_sent = _count("SELECT COUNT(*) n FROM outbox WHERE status='sent'")
n_none = _count("SELECT COUNT(*) n FROM action_log WHERE action IN ('decision:skipped','decision:closed')")
n_dup = _count("SELECT COUNT(*) n FROM action_log WHERE action='decision:blocked_duplicate'")
tiles = [("💬 Conversations", f"{n_conv}", f"{n_open} open"), ("📅 Scheduled", n_sched, ""),
         ("📤 Sent", n_sent, ""), ("✋ No email needed", n_none, ""), ("🛡️ Duplicates stopped", n_dup, "")]
html_block('<div class="fu-stats">' + "".join(
    f'<div class="fu-metric" title="{esc(lbl)}"><div class="lbl">{lbl}</div><div class="val">{val}'
    f'{f" <span class=fu-muted style=font-size:.8rem;font-weight:500>{sub}</span>" if sub else ""}</div></div>'
    for lbl, val, sub in tiles) + "</div>")

st.segmented_control("Go to", NAV, format_func=NAV_LABELS.get, key="nav", required=True,
                     label_visibility="collapsed", width="stretch")

QP.update({"nav": ss["nav"], "view": "tech" if technical() else "simple", "brain": ss["brain"]})
if ss["hide_intro"]:
    QP["intro"] = "0"


# ------------------------------------------------------------------ pages
SENDER_FIRST = (config.SENDER_NAME or "Alex").split()[0]
EXAMPLE = {
    "f_name": "Meera Shah", "f_email": "meera@sweetcrumbs.in", "f_type": "customer",
    "f_subject": "Quote for 200 cupcakes",
    "f_body": (f"Hi Meera,\n\nThanks for your enquiry. Our quote for 200 assorted cupcakes for your event on "
               f"12 October is Rs 18,000 including delivery. Shall I go ahead and book the date?\n\n"
               f"Best regards,\n{SENDER_FIRST}"),
}
FORM_KEYS = ["f_name", "f_email", "f_subject", "f_body", "f_reply"]


def _form_default_dates():
    loc = H.to_local(clock.now())
    ss.setdefault("f_date", (loc - timedelta(days=3)).date())
    ss.setdefault("f_time", dtime(10, 0))
    ss.setdefault("f_rdate", loc.date())
    ss.setdefault("f_rtime", dtime(9, 0))
    ss.setdefault("f_type", "customer")


def _fill_example():
    for k, v in EXAMPLE.items():
        ss[k] = v
    ss["f_reply"] = ""
    ss["f_date"] = (H.to_local(clock.now()) - timedelta(days=3)).date()


def _clear_form():
    for k in FORM_KEYS:
        ss[k] = ""
    ss.pop("last_run", None)


def _fill_paste_example():
    try:
        ss["paste_text"] = open("samples/new_customer.txt", encoding="utf-8").read()
    except OSError:
        ss["paste_text"] = ""


def _clear_paste():
    ss["paste_text"] = ""
    ss.pop("last_run", None)


def _src_changed():
    ss.pop("last_run", None)


def page_home():
    now = clock.now()
    threads = sorted_threads()
    opts = {t["id"]: t for t in threads}

    step_title(1, "Who are you following up with?")
    src = st.radio("How do you want to start?", list(SRC_LABELS), format_func=SRC_LABELS.get, horizontal=True,
                   key="src", on_change=_src_changed, label_visibility="collapsed")
    thread_id, text, form, problems = None, None, None, []

    if src == "saved":
        if not opts:
            st.info("No saved conversations yet - choose **✍️ Someone new**.")
        else:
            if ss.get("pick_thread") not in opts:
                ss["pick_thread"] = next(iter(opts))  # sorted: the one that most needs you first
            thread_id = st.selectbox("Conversation", list(opts), key="pick_thread",
                                     format_func=lambda i: thread_option_label(opts[i], now))
            t = opts[thread_id]
            label, color, _ = thread_status(t)
            html_block(f'{type_chip(t["type"])}{chip(label, color)}'
                       f'<span class="fu-muted">{H.plural(t["n_msgs"], "message")} · last one '
                       f'{H.humanize_delta(t["last_at"], now)}</span>' + last_message_html(t, now))
            with st.expander(f"Read the whole conversation ({H.plural(t['n_msgs'], 'message')})"):
                bubbles(thread_id, t["name"])
            if technical():
                st.caption(f"thread_id `{thread_id}` · {t['email']}")
            if t["status"] == "closed":
                problems.append("this conversation is closed, so nothing more will be sent")

    elif src == "new":
        _form_default_dates()
        st.caption("Tell the assistant about the email you sent. No special format needed.")
        c1, c2 = st.columns(2)
        c1.text_input("Their name", key="f_name", placeholder="e.g. Meera Shah")
        c2.text_input("Their email", key="f_email", placeholder="e.g. meera@example.com")
        c3, c4 = st.columns(2)
        c3.selectbox("Who are they?", TYPES, key="f_type",
                     format_func=lambda k: f"{H.TYPE_ICONS[k]} {H.type_label(k)}",
                     help="Sets the tone and timing: friendly for customers, encouraging for students, short for "
                          "colleagues, formal for business partners.")
        c4.text_input("What is it about?", key="f_subject", placeholder="e.g. Quote for 200 cupcakes")
        st.text_area("What you sent them", key="f_body", height=130,
                     placeholder="Paste or type the email you sent…")
        c5, c6 = st.columns(2)
        c5.date_input("When you sent it", key="f_date", format="DD/MM/YYYY", max_value=H.to_local(now).date())
        c6.time_input("Time (India time)", key="f_time", step=900)
        with st.expander("💬 Did they reply? (optional)"):
            st.text_area("Their reply", key="f_reply", height=90, placeholder="Leave empty if they haven't replied.")
            r1, r2 = st.columns(2)
            r1.date_input("When they replied", key="f_rdate", format="DD/MM/YYYY", max_value=H.to_local(now).date())
            r2.time_input("Reply time (India time)", key="f_rtime", step=900)
        typed = any((ss.get(k) or "").strip() for k in FORM_KEYS)
        b1, b2, _ = st.columns([1.3, 1, 2])
        b1.button("Fill in an example", on_click=_fill_example, width="stretch", key="fill_example",
                  disabled=typed, help="Clear the form first to load the example." if typed else
                  "Loads a sample customer you can try straight away.")
        b2.button("Clear form", on_click=_clear_form, width="stretch", key="clear_form", disabled=not typed)
        form = {"name": ss.get("f_name"), "email": ss.get("f_email"), "subject": ss.get("f_subject"),
                "sent_body": ss.get("f_body")}
        problems = H.missing_form_fields(form)
        sent_utc = H.local_to_utc(datetime.combine(ss["f_date"], ss["f_time"]))
        if sent_utc > now:
            problems.append("a send time that isn't in the future")
        form.update(type=ss["f_type"], sent_utc=sent_utc, reply=ss.get("f_reply"),
                    reply_utc=H.local_to_utc(datetime.combine(ss["f_rdate"], ss["f_rtime"])))

    else:
        st.caption("For people comfortable with email headers: paste the whole thread with its From / To / Date / "
                   "Subject lines, emails separated by a line with `---`.")
        text = st.text_area("Email conversation", key="paste_text", height=240,
                            placeholder="From: …\nTo: …\nDate: 2026-09-29 10:05 IST\nSubject: …\n\nHi …")
        has = bool((text or "").strip())
        b1, b2, _ = st.columns([1.3, 1, 2])
        b1.button("Fill in an example", on_click=_fill_paste_example, width="stretch", key="fill_paste",
                  disabled=has, help="Clear the box first to load the example." if has else None)
        b2.button("Clear", on_click=_clear_paste, width="stretch", key="clear_paste", disabled=not has)
        if not has:
            problems.append("an email to paste")

    step_title(2, "Let the assistant decide")
    go = st.button("✨ Let the assistant decide", type="primary", width="stretch", disabled=bool(problems),
                   key="go")
    if problems:
        st.caption("✋ Still needed: " + ", ".join(problems) + ".")
    else:
        st.caption("It checks whether they replied, what was already sent and the right time to write - then drafts "
                   "the email for you. Nothing is ever sent twice.")
    rerun_tid = ss.pop("rerun_thread", None)

    step_title(3, "What the assistant decided")
    if go or (rerun_tid and rerun_tid == thread_id):
        if src == "new":
            try:
                saved = tools.save_conversation(
                    {"email": form["email"].strip().lower(), "name": form["name"].strip(), "type": form["type"]},
                    form["subject"].strip(),
                    H.build_messages(form["sent_body"], form["sent_utc"], form["reply"], form["reply_utc"]))
                thread_id = saved["thread_id"]
            except Exception as e:  # noqa: BLE001
                st.error(f"Couldn't save that conversation: {e}")
                return
        res = run_agent(thread_id, text if src == "paste" else None, "home", source=src)
        if res.get("thread_id") and src != "saved":
            ss["_goto"] = {"src": "saved", "pick_thread": res["thread_id"],
                           "clear": FORM_KEYS + ["paste_text"] if src != "saved" else []}
        st.rerun()

    run = ss.get("last_run")
    show = run and ((src == "saved" and run["result"].get("thread_id") == thread_id) or
                    (src != "saved" and not run["result"].get("thread_id") and run.get("src") == src))
    if show:
        render_result(run)
        if run.get("fresh"):
            run["fresh"] = False
            st.html("<script>setTimeout(()=>{const el=document.querySelector('.st-key-fu_result');"
                    "if(el){el.scrollIntoView({behavior:'smooth',block:'start'});}},150);</script>",
                    unsafe_allow_javascript=True)
        if src == "saved" and thread_id and not H.extract_email(run["result"].get("events")) and \
                thread_sig(thread_id) != run.get("sig"):
            st.button("🔄 Run the assistant again", key="rerun_btn", on_click=goto, kwargs={"rerun_thread": thread_id})
    else:
        with st.container(border=True):
            st.markdown("Your result will appear here: **the decision**, **why** in one sentence, **the email it "
                        "wrote** and **when it goes out** - which you can still edit, reschedule, send now or cancel.")


def page_people():
    now = clock.now()
    a, b = st.columns([3, 1.2], vertical_alignment="bottom")
    q = a.text_input("Search conversations", placeholder="🔎 Search by name, company or subject…",
                     key="conv_search", label_visibility="collapsed")
    b.button("➕ New follow-up", width="stretch", key="people_new", on_click=goto,
             kwargs={"nav": "home", "src": "new"})
    st.caption("Everyone the assistant is looking after - the ones that need you first. Your messages are on the "
               "right, theirs on the left.")
    ordered = sorted_threads()
    keep = ss.get("people_order")  # keep cards where they were after "Decide now" so nothing jumps
    if keep:
        ordered.sort(key=lambda t: keep.index(t["id"]) if t["id"] in keep else len(keep))
    shown = [t for t in ordered
             if not q or q.lower() in f"{t['name']} {t['subject']} {t['company'] or ''}".lower()]
    if not shown:
        st.info("No conversations match.")
    run = ss.get("last_run")
    for t in shown:
        label, color, _ = thread_status(t)
        with st.container(border=True):
            c1, c2 = st.columns([4, 1.4], vertical_alignment="center")
            html_block(f'<div style="font-weight:700;font-size:1.05rem">{esc(t["name"])}'
                       f'<span class="fu-muted" style="font-weight:400">'
                       f'{" · " + esc(t["company"]) if t.get("company") else ""}</span></div>'
                       f'<div style="margin:.15rem 0 .4rem 0">{esc(t["subject"])}</div>'
                       f'{type_chip(t["type"])}{chip(label, color)}'
                       f'<span class="fu-muted">{H.plural(t["n_msgs"], "message")} · last '
                       f'{H.humanize_delta(t["last_at"], now)}</span>' + last_message_html(t, now), c1)
            if t["status"] == "closed":
                c2.caption("🔒 Closed - nothing more will be sent.")
            else:
                btn = "✨ Check if they need an answer" if label == "They replied" else "✨ Decide now"
                if c2.button(btn, key=f"decide_{t['id']}", width="stretch", type="primary",
                             help="Run the assistant on this conversation. The result appears right here."):
                    ss["people_order"] = [x["id"] for x in ordered]
                    run_agent(t["id"], None, "people", source="saved", compact=True)
                    ss["_goto"] = {"pick_thread": t["id"], "src": "saved"}
                    st.rerun()
            if run and run.get("where") == "people" and run["result"].get("thread_id") == t["id"]:
                render_result(run, compact=True)
            with st.expander("Open conversation"):
                bubbles(t["id"], t["name"])
                if technical():
                    st.caption(f"thread_id `{t['id']}` · {t['email']} · tz {t['timezone']}")


def page_scheduled():
    now = clock.now()
    pend = db.query("SELECT f.*, c.name, c.type, c.timezone FROM followups f JOIN contacts c "
                    "ON c.email=f.contact_email WHERE f.status='pending' ORDER BY f.send_at")
    a, b = st.columns([3, 1.3], vertical_alignment="center")
    a.caption("Emails the assistant will send automatically. You can still edit, reschedule, send now or cancel "
              "any of them.")
    b.button("⏩ Skip ahead 1 day", width="stretch", key="sched_adv", on_click=do_advance, args=(24, "1 day"),
             help="Move the demo clock forward a day to watch these go out.")
    if not pend:
        st.info("Nothing scheduled right now. Go to **🏠 Home** and let the assistant decide on a conversation.")
    for f in pend:
        with st.container(border=True):
            html_block(f'<div style="font-weight:700;font-size:1.05rem">To {esc(f["name"])} '
                       f'<span class="fu-muted" style="font-weight:400">{esc(f["contact_email"])}</span></div>'
                       f'{type_chip(f["type"])}{chip("goes out " + H.humanize_delta(f["send_at"], now), "indigo")}'
                       + when_html(f, f["timezone"], now)
                       + f'<div class="fu-muted">Why this time: {esc(strategy_line(f["type"]))}</div>')
            html_block(email_html(f["subject"], f["body"]))
            followup_actions(f, "sched", f["name"], f["timezone"])
            if technical():
                st.caption(f"followup_id {f['id']} · thread `{f['thread_id']}` · strategy {f['strategy']} · "
                           f"send_at {f['send_at']} UTC · reason: {f['reason']}")

    done = db.query("SELECT f.*, c.name FROM followups f JOIN contacts c ON c.email=f.contact_email "
                    "WHERE f.status<>'pending' ORDER BY COALESCE(f.done_at, f.send_at) DESC")
    if done:
        with st.expander(f"Earlier follow-ups ({len(done)} sent or cancelled)"):
            for f in done:
                sent = f["status"] == "sent"
                why = ""
                if not sent and f.get("reason") and "cancelled" in f["reason"]:
                    raw = f["reason"].split("cancelled:", 1)[-1].strip()
                    why = raw if technical() else H.friendly_reason("skipped", raw, f["name"]) \
                        if any(k in raw for k in ("replied", "opted", "closed")) else H.humanize_text(raw)
                html_block(f'{chip("✅ Sent" if sent else "🛑 Cancelled", "green" if sent else "gray")}'
                           f'<b>{esc(f["name"])}</b> · {esc(f["subject"])} '
                           f'<span class="fu-muted">· {H.fmt_time(f["done_at"] or f["send_at"])}'
                           f'{" · " + esc(why) if why else ""}</span>')


def page_sent():
    now = clock.now()
    people = contacts_by_email()
    rows = db.query("SELECT * FROM outbox ORDER BY id DESC")
    mock = config.EMAIL_MODE == "mock"
    if not rows:
        st.info("No emails sent yet. Scheduled emails appear here once they go out - try **⏩ +1 day** in the "
                "sidebar or **Skip ahead 1 day** on 📅 Scheduled.")
    for r in rows:
        name = people.get(r["to_email"], {}).get("name", r["to_email"])
        ok = r["status"] == "sent"
        with st.container(border=True):
            demo = chip("🧪 Demo - kept here, not really delivered", "amber") if mock and ok else ""
            html_block(f'{chip("✅ Sent" if ok else "⚠️ " + str(r["status"]).capitalize(), "green" if ok else "red")}'
                       f'{demo}<b>To {esc(name)}</b> <span class="fu-muted">· {H.fmt_time(r["sent_at"])} · '
                       f'{H.humanize_delta(r["sent_at"], now)}</span>')
            html_block(email_html(r["subject"], r["body"]))
            if technical():
                st.caption(f"outbox #{r['id']} · to {r['to_email']} · delivered_to {r['delivered_to']} · "
                           f"provider {r['provider']} · thread `{r['thread_id']}`"
                           + (f" · error: {r['error']}" if r.get("error") else ""))


def _details(raw):
    try:
        return json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return {"raw": raw}


def page_history():
    rows = db.query("SELECT a.*, t.subject, c.name FROM action_log a LEFT JOIN threads t ON t.id=a.thread_id "
                    "LEFT JOIN contacts c ON c.email=t.contact_email ORDER BY a.id DESC LIMIT 500")
    if technical():
        st.caption("Raw action log - every tool call and decision, newest first. Times are UTC.")
        flt = st.text_input("Filter", placeholder="Filter by run_id, thread_id or action…", key="log_filter")
        raw = []
        for r in rows:
            d = json.dumps(_details(r["details"]), ensure_ascii=False, default=str)
            row = {"id": r["id"], "ts (UTC)": str(r["ts"]), "run_id": r["run_id"] or "",
                   "thread_id": r["thread_id"] or "", "action": r["action"], "details": d}
            if not flt or flt.lower() in f"{row['run_id']} {row['thread_id']} {row['action']}".lower():
                raw.append(row)
        st.dataframe(pd.DataFrame(raw), width="stretch", hide_index=True, height=460,
                     column_config={"details": st.column_config.TextColumn(width="large"),
                                    "id": st.column_config.NumberColumn(width="small")})
        runs = list(dict.fromkeys(r["run_id"] for r in rows if r["run_id"]))
        if runs:
            pick = st.selectbox("Open one run's full log", ["-"] + runs, key="log_run")
            if pick != "-":
                for r in reversed([r for r in rows if r["run_id"] == pick]):
                    st.markdown(f"`{r['ts']}` **{r['action']}** · thread `{r['thread_id']}`")
                    st.json(_details(r["details"]), expanded=False)
        return

    st.caption("Everything that happened, newest first, in India time. Turn on **🔧 Technical view** in the sidebar "
               "for the raw log.")
    lines = []
    for r in rows:
        s = H.activity_sentence(r["action"], _details(r["details"]), r["name"], r["subject"])
        if s:
            lines.append(f"**{H.fmt_time(r['ts'])}** - {esc(s)}")
    if not lines:
        st.info("Nothing has happened yet.")
        return
    st.markdown("\n".join(f"- {line}" for line in lines[:40]))
    if len(lines) > 40:
        with st.expander(f"Older activity ({len(lines) - 40} more)"):
            st.markdown("\n".join(f"- {line}" for line in lines[40:]))


def page_help():
    st.markdown("""
#### Getting started
1. On **🏠 Home**, pick someone from your list - or choose **✍️ Someone new** and fill in a few boxes.
2. Click **✨ Let the assistant decide**.
3. Read the result. If an email is scheduled you can still **edit**, **change the time**, **send now** or **cancel**.

Trying the demo? Use **⏩ Skip ahead** in the sidebar to watch scheduled emails go out, and **💬 Pretend someone
replied** to see the assistant stop chasing people who answered. *Neha Kapoor* already has a follow-up waiting -
running the assistant on her shows the duplicate guard.

#### What the assistant does, in plain words
1. **Reads the conversation** - who wrote last, and what was promised.
2. **Checks past emails** - did they already reply? Is a follow-up already waiting?
3. **Decides** - follow up, answer their question, or do nothing (for example when they replied or said no).
4. **Picks a polite time** - during the person's working hours, and before any deadline.
5. **Writes the email** in the right tone - friendly for customers, encouraging for students, short for
   colleagues, formal for business partners.
6. **Sends or schedules it**, and writes everything down in **📜 History**.

#### Built-in safety rules
- Never sends two follow-ups for the same conversation, and never the same email twice.
- Never chases someone who already replied - a waiting follow-up is cancelled automatically.
- Respects "not interested" / opt-outs, a maximum number of reminders, and at least 24 hours between emails.
- Only sends during the recipient's business hours (Mon-Fri, 9:00-18:00 their time).
""")
    st.markdown("#### Tone and timing for each kind of contact")
    st.dataframe(pd.DataFrame([{
        "Contact": f"{H.TYPE_ICONS.get(k, '')} {H.type_label(k)}",
        "First follow-up after": (H.plural(v["delay_hours"] // 24, "day") if v["delay_hours"] >= 24
                                  else H.plural(v["delay_hours"], "hour")),
        "Max reminders": v["max_followups"], "Tone": v["tone"], "Focus": v["focus"], "Length": v["length"],
    } for k, v in strategies.STRATEGIES.items()]), width="stretch", hide_index=True)
    with st.expander("Technical details"):
        st.markdown(f"""
- **Agent loop:** Claude (`followup.agent`, model `{config.CLAUDE_MODEL}`) with manual tool use -
  `save_conversation`, `get_thread_history`, `list_followups`, `get_strategy`, `lookup_faq`, `schedule_followup`,
  `send_email_now`, `cancel_followup`, `close_thread`, `record_decision`. If the Claude API is unavailable it falls
  back to the deterministic `rule_agent`, which uses the same tools and emits the same events.
- **Guards** are enforced in code inside the tools (not just in the prompt); the scheduler re-checks them at
  send time.
- **Storage:** MySQL tables `contacts`, `threads`, `messages`, `followups`, `outbox`, `action_log`. Datetimes are
  stored as naive UTC and shown here in India time.
- **Demo clock** is simulated so time can be fast-forwarded. The demo database is shared: run one UI per database
  for a live demo, or other viewers' clicks will change what you see.
""")
    st.caption("Team AGT-018 · PS-053 · AI Email Follow-Up Agent")


if ss["nav"] != "people":
    ss.pop("people_order", None)
{"home": page_home, "people": page_people, "scheduled": page_scheduled, "sent": page_sent,
 "history": page_history, "help": page_help}[ss["nav"]]()
