"""Command line interface for the AI Email Follow-Up Agent.

    python -m followup.cli reset | threads | run <thread_id> | paste [--file f] | advance <hours>
                           reply <thread_id> <body> | queue | outbox | log | demo
"""
import argparse
import json
import sys
import textwrap

from . import clock, db, scheduler, strategies

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


# ------------------------------------------------------------------ output helpers

def _s(v, width=None):
    s = "" if v is None else str(v)
    s = " ".join(s.split())
    if width and len(s) > width:
        s = s[: width - 3] + "..."
    return s


def table(rows, cols, widths=None):
    """cols: list of (key, header). Prints a plain ASCII table."""
    widths = widths or {}
    if not rows:
        print("  (none)")
        return
    data = [[_s(r.get(k), widths.get(k, 40)) for k, _ in cols] for r in rows]
    w = [max(len(h), *(len(row[i]) for row in data)) for i, (_, h) in enumerate(cols)]
    line = "+-" + "-+-".join("-" * x for x in w) + "-+"
    print(line)
    print("| " + " | ".join(h.ljust(w[i]) for i, (_, h) in enumerate(cols)) + " |")
    print(line)
    for row in data:
        print("| " + " | ".join(c.ljust(w[i]) for i, c in enumerate(row)) + " |")
    print(line)


def header(title, sub=None):
    print()
    print("=" * 78)
    print(" " + title)
    if sub:
        for l in textwrap.wrap(sub, 76):
            print(" " + l)
    print("=" * 78)


def now_line():
    n = clock.now()
    print(f"Clock: {n} UTC  ({strategies.local_str(n, 'Asia/Kolkata')})")


PREFIX = {
    "plan": "[PLAN]    ", "thinking": "[THINK]   ", "tool_call": "[TOOL] -> ", "tool_result": "[RESULT]<-",
    "decision": "[DECISION]", "info": "[INFO]    ", "error": "[ERROR]   ",
}


def print_event(ev):
    typ = ev.get("type", "info")
    text = ev.get("text") or ""
    pre = PREFIX.get(typ, f"[{typ.upper()}]")
    lines = str(text).splitlines() or [""]
    print(f"{pre} {lines[0]}")
    for l in lines[1:]:
        print(" " * (len(pre) + 1) + l)
    data = ev.get("data")
    if data and typ in ("tool_call", "tool_result", "decision"):
        try:
            blob = json.dumps(data, default=str, ensure_ascii=False)
        except Exception:
            blob = str(data)
        if len(blob) > 300:
            blob = blob[:297] + "..."
        print(" " * (len(pre) + 1) + blob)
    sys.stdout.flush()


# ------------------------------------------------------------------ commands

def cmd_reset(_a=None):
    db.reset()
    counts = {t: db.one(f"SELECT COUNT(*) AS n FROM {t}")["n"]
              for t in ("contacts", "threads", "messages", "followups", "outbox", "action_log")}
    print("Database reset and seeded: " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    now_line()


def cmd_threads(_a=None):
    rows = db.query(
        "SELECT t.id, t.subject, t.status, c.name, c.type, c.timezone, "
        " (SELECT direction FROM messages m WHERE m.thread_id=t.id ORDER BY sent_at DESC, id DESC LIMIT 1) AS last_dir,"
        " (SELECT MAX(sent_at) FROM messages m WHERE m.thread_id=t.id) AS last_at,"
        " (SELECT COUNT(*) FROM messages m WHERE m.thread_id=t.id) AS n_msgs,"
        " (SELECT COUNT(*) FROM followups f WHERE f.thread_id=t.id AND f.status='pending') AS pending "
        "FROM threads t JOIN contacts c ON c.email=t.contact_email ORDER BY t.created_at")
    for r in rows:
        r["last_by"] = {"inbound": "them", "outbound": "us"}.get(r["last_dir"], "-")
    now_line()
    table(rows, [("id", "thread"), ("name", "contact"), ("type", "type"), ("status", "status"),
                 ("n_msgs", "msgs"), ("last_by", "last by"), ("last_at", "last msg (UTC)"),
                 ("pending", "pending f/u"), ("subject", "subject")], {"subject": 38})


def _run_agent(thread_id=None, text=None, mode="llm"):
    from . import agent  # imported lazily so other commands work even if agent.py is broken
    result = agent.run(thread_id=thread_id, text=text, mode=mode, on_event=print_event)
    print("-" * 78)
    print(f"Run {result.get('run_id')} | mode={result.get('mode')} | thread={result.get('thread_id')} | "
          f"decision={result.get('decision')}")
    if result.get("summary"):
        print("Summary: " + _s(result["summary"]))
    return result


def cmd_run(a):
    now_line()
    _run_agent(thread_id=a.thread_id, mode=a.mode)


def cmd_paste(a):
    if a.file:
        with open(a.file, encoding="utf-8") as fh:
            text = fh.read()
    else:
        print("Paste the conversation, then Ctrl+Z Enter (Windows) / Ctrl+D (Unix):", file=sys.stderr)
        text = sys.stdin.read()
    if not text.strip():
        print("No input given.")
        return
    now_line()
    _run_agent(text=text, mode=a.mode)


def print_results(res):
    print(f"Clock is now {res['now']} UTC  ({strategies.local_str(res['now'], 'Asia/Kolkata')})")
    results = res["results"]
    if not results:
        print("No follow-ups were due.")
        return
    for r in results:
        if r["status"] == "sent":
            print(f"  SENT      #{r['followup_id']} {r['thread_id']} -> {r['to']} at {r['send_at']} UTC "
                  f"(outbox #{r.get('outbox_id')})")
        elif r["status"] == "cancelled":
            print(f"  CANCELLED #{r['followup_id']} {r['thread_id']}: {r.get('reason')}")
        else:
            print(f"  FAILED    #{r['followup_id']} {r['thread_id']}: {r.get('reason')} (kept pending)")


def cmd_advance(a):
    print_results(scheduler.advance(a.hours))


def cmd_reply(a):
    r = scheduler.simulate_reply(a.thread_id, a.body)
    if r.get("status") != "ok":
        print("Error: " + r.get("error", "unknown"))
    else:
        print(f"Inbound reply #{r['message_id']} recorded on {a.thread_id} at {r['sent_at']} UTC")


def cmd_queue(a=None):
    rows = db.query("SELECT f.*, c.timezone FROM followups f JOIN contacts c ON c.email=f.contact_email "
                    "ORDER BY f.send_at, f.id")
    for r in rows:
        r["local"] = strategies.local_str(r["send_at"], r["timezone"])
    table(rows, [("id", "#"), ("thread_id", "thread"), ("status", "status"), ("send_at", "send_at UTC"),
                 ("local", "recipient local"), ("strategy", "strategy"), ("reason", "reason")],
          {"reason": 50, "local": 40})


def cmd_outbox(a=None):
    rows = db.query("SELECT * FROM outbox ORDER BY id")
    table(rows, [("id", "#"), ("sent_at", "sent_at UTC"), ("thread_id", "thread"), ("to_email", "to"),
                 ("provider", "via"), ("status", "status"), ("subject", "subject"), ("body", "body")],
          {"subject": 36, "body": 50})


def cmd_log(a=None):
    limit = getattr(a, "limit", 30) or 30
    rows = db.query("SELECT * FROM (SELECT * FROM action_log ORDER BY id DESC LIMIT %s) x ORDER BY id",
                    (int(limit),))
    table(rows, [("id", "#"), ("ts", "ts UTC"), ("run_id", "run"), ("thread_id", "thread"),
                 ("action", "action"), ("details", "details")], {"details": 70})


DEMO_SCENARIOS = [
    ("quote-rahul", "Customer, quote sent 3 days ago, no reply",
     "SCHEDULE a warm customer follow-up inside Rahul's business hours."),
    ("proposal-sarah", "Business partner replied 'signed copy attached, all good'",
     "SKIP - conversation is resolved, no follow-up needed."),
    ("invoice-neha", "Customer invoice reminder - a follow-up is ALREADY queued",
     "BLOCKED as duplicate - the pending follow-up stays the only one."),
    ("assignment-arjun", "Student, report due Sat 3 Oct 23:59 IST, no reply",
     "SCHEDULE a supportive reminder BEFORE the deadline."),
    ("report-priya", "Employee asked for Q3 sales report by Friday, no reply",
     "SCHEDULE a short, direct nudge about 1 business day later."),
    ("demo-vikram", "Customer said 'Not interested anymore, please remove me'",
     "SKIP and CLOSE the thread - respect the opt-out."),
    ("pricing-ananya", "Customer asked a question we never answered",
     "REPLY now - answer the WhatsApp integration question instead of chasing."),
]


def cmd_demo(a):
    mode = a.mode
    header("AI EMAIL FOLLOW-UP AGENT - DEMO", f"mode={mode}. Resetting database to the seeded scenario.")
    cmd_reset()
    cmd_threads()

    for i, (tid, situation, expected) in enumerate(DEMO_SCENARIOS, 1):
        header(f"SCENARIO {i}: {tid} - {situation}", f"Expected: {expected}")
        try:
            _run_agent(thread_id=tid, mode=mode)
        except Exception as e:
            print(f"[ERROR] agent run failed: {type(e).__name__}: {e}")

    header("SCENARIO 8: run quote-rahul AGAIN",
           "Expected: BLOCKED / SKIP - a follow-up is already pending, no duplicate is created.")
    try:
        _run_agent(thread_id="quote-rahul", mode=mode)
    except Exception as e:
        print(f"[ERROR] agent run failed: {type(e).__name__}: {e}")

    header("Follow-up queue after the agent runs")
    cmd_queue()

    header("SCENARIO 9: Rahul replies before his follow-up goes out",
           "Expected: when time advances, the scheduler re-checks and AUTO-CANCELS Rahul's follow-up.")
    r = scheduler.simulate_reply(
        "quote-rahul",
        "Hi Alex, thanks for the quote. We are reviewing it internally with finance and will confirm early "
        "next week. Regards, Rahul")
    print(f"Inbound reply recorded on quote-rahul (message #{r.get('message_id')}).")

    header("SCENARIO 10: fast-forward 72 hours",
           "Expected: due follow-ups are SENT (Neha, Arjun, Priya), Rahul's is CANCELLED, nothing goes to "
           "Sarah or Vikram.")
    print_results(scheduler.advance(72))

    header("FINAL: follow-up queue")
    cmd_queue()
    header("FINAL: outbox (every email the agent actually sent)")
    cmd_outbox()
    header("FINAL: action log (last 40 actions)")
    cmd_log(argparse.Namespace(limit=40))


# ------------------------------------------------------------------ entry point

def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m followup.cli", description="AI Email Follow-Up Agent")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("reset", help="drop tables and load seed.json").set_defaults(fn=cmd_reset)
    sub.add_parser("threads", help="list threads").set_defaults(fn=cmd_threads)

    s = sub.add_parser("run", help="run the agent on an existing thread")
    s.add_argument("thread_id")
    s.add_argument("--mode", choices=["llm", "rules"], default="llm")
    s.set_defaults(fn=cmd_run)

    s = sub.add_parser("paste", help="run the agent on a raw pasted conversation")
    s.add_argument("--mode", choices=["llm", "rules"], default="llm")
    s.add_argument("--file", help="read the conversation from this file (default: stdin)")
    s.set_defaults(fn=cmd_paste)

    s = sub.add_parser("advance", help="move the simulated clock forward and send due follow-ups")
    s.add_argument("hours", type=float)
    s.set_defaults(fn=cmd_advance)

    s = sub.add_parser("reply", help="simulate an inbound reply on a thread")
    s.add_argument("thread_id")
    s.add_argument("body")
    s.set_defaults(fn=cmd_reply)

    sub.add_parser("queue", help="list follow-ups").set_defaults(fn=cmd_queue)
    sub.add_parser("outbox", help="list sent emails").set_defaults(fn=cmd_outbox)
    s = sub.add_parser("log", help="show the action log")
    s.add_argument("--limit", type=int, default=30)
    s.set_defaults(fn=cmd_log)

    s = sub.add_parser("demo", help="reset and run every scenario end to end")
    s.add_argument("--mode", choices=["llm", "rules"], default="llm")
    s.set_defaults(fn=cmd_demo)

    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
