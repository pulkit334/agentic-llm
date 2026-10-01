# Product Requirements Document: Follow-Up Agent

**Problem statement:** PS-053 "AI Email Follow-Up Agent" · **Team:** AGT-018

---

## 1. Overview and problem

Most deals, assignments and tasks don't stall because people refuse. They stall because nobody follows up. A quote goes unanswered, a student misses a submission reminder, or a colleague's status update never comes, and the person who should chase it is busy or forgets. Even when follow-ups do happen, they often do harm. They go out after the other person has already replied, two arrive in one day, one lands at 2 AM in the recipient's timezone, or one reaches someone who asked to be left alone.

The **Follow-Up Agent** is an autonomous assistant that takes over that job. The user gives it an email conversation, either a thread already stored or raw text pasted in. The agent reads the full history and decides whether a follow-up is needed. It then picks a send time inside the recipient's business hours, writes a message in a tone that suits the relationship, and schedules or sends it through an email tool. Every step is recorded.

**Core principle: the LLM proposes and the code decides.** The model handles judgment and wording. The rules that prevent duplicates, spam and badly timed messages are enforced in code, and the model can't override them.

## 2. Goals and non-goals

**Goals**
- G1. No conversation that needs a follow-up is left without one.
- G2. No unnecessary message is sent: nothing duplicated, nothing after a reply, nothing after an opt-out, and nothing beyond the per-type limit.
- G3. Every message suits the recipient type, is timed for the recipient's working hours and uses only facts from the thread.
- G4. Every decision and action can be explained and audited afterwards.
- G5. The agent keeps working when the AI service is unavailable.

**Non-goals**
- A full email client or inbox replacement.
- Bulk marketing campaigns, cold outreach or newsletters.
- Writing content that isn't backed by the conversation or the built-in knowledge base.
- CRM, calendar or ticketing features beyond what a follow-up needs.

## 3. Target users and personas

| Persona | Type | Context | What they need |
|---|---|---|---|
| **Riya, shop owner** | Non-technical | Sends quotes and offers to customers and loses track of who hasn't answered. | Polite chasers that never feel pushy, and that stop once a customer says no. |
| **Mr. Sharma, course coordinator** | Non-technical | Reminds students about assignment deadlines. | Reminders that arrive before the deadline, in a supportive tone, without nagging students who have already responded. |
| **Anita, team lead** | Non-technical | Waits on status updates from team members and partners. | Short, direct nudges at the right moment, plus a record of what was sent. |
| **Dev, ops / developer** | Technical | Runs and maintains the agent and connects it to real email. | Configuration, CLI and batch runs, logs, safe fallbacks and account management. |

## 4. User stories and acceptance criteria

Each story maps to one clause of the problem statement.

| # | PS-053 clause | User story | Acceptance criteria |
|---|---|---|---|
| US-1 | *User provides an email or communication context* | As a user, I can give the agent a stored thread or paste raw email text. | The agent accepts either a thread id or pasted text. From pasted text it extracts the contact, recipient type, subject, and each message's direction and time, and stores them. |
| US-2 | *Analyze the conversation; decide what information is relevant* | As a user, I want the agent to understand who said what and what is still open. | The agent records the key facts it relied on (who wrote last, open questions, deadlines, promises) with its decision. |
| US-3 | *Identify whether a follow-up is required* | As a user, I only want follow-ups where one is actually needed. | No follow-up when the recipient replied, declined, opted out or resolved the thread, or when one is already pending. A question from the recipient gets a reply instead of a chaser. |
| US-4 | *Determine an appropriate follow-up time* | As a user, I want follow-ups to land at sensible times. | The send time respects the per-type delay, any deadline, the minimum gap, and Mon–Fri 09:00–18:00 in the recipient's local time. |
| US-5 | *Draft a suitable message* | As a user, I want messages that sound right for the recipient. | The draft follows the type's tone, focus and length, uses only facts from the thread, ends with one clear call to action and keeps the `Re: <subject>` line. |
| US-6 | *Schedule or send using an email tool* | As a user, I want the message queued or sent without manual work. | Follow-ups are queued and delivered when due. Direct replies can be sent immediately within business hours. Mock and real email are both supported. |
| US-7 | *Avoid duplicate or unnecessary messages* | As a user, I never want to embarrass myself with a repeat or unwanted email. | Guards in code block duplicates, identical bodies, chasing after a reply, opt-outs, closed threads and over-limit sends. A re-check at send time cancels follow-ups that are no longer needed. |
| US-8 | *Check previous communication* | As a user, I want the agent to know the full history first. | Before deciding, the agent reads the full thread, follow-ups already sent and pending ones, including the contact's follow-ups on other threads. |
| US-9 | *Record the action taken* | As a user, I want to see what was done and why. | Every action, block, cancellation and send is logged and grouped by run, with exactly one final decision record per run. Every email handled appears in the outbox. |
| US-10 | *Strategies by recipient type* | As a user, I want customers, students, employees and business contacts handled differently. | Each type has its own delay, limit, tone, focus, length and deadline behaviour (see §7). |
| US-11 | *Walkthrough of planning and execution* | As an evaluator, I want to see how the agent plans and acts. | A live trace shows reasoning summary, plan, tool calls, results and the final decision. Simulated time can be moved forward to show the full lifecycle. |

## 5. Functional requirements

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-1 | **Input.** Accept a stored thread id or raw pasted email text. | Must | Pasted text is parsed into contact, type, subject and messages. Pasting the same conversation twice doesn't duplicate any messages. |
| FR-2 | **Analysis.** Identify who wrote last, open questions, promises to reply, declines and deadlines. | Must | Deadlines such as "due 3 Oct, 11:59 PM" or "by Friday 2 October" are detected. A date without a time is read as 18:00 local. |
| FR-3 | **Decision.** Choose one outcome: schedule, send now (reply), skip, close, or blocked as duplicate. | Must | Exactly one decision is recorded per run, with its reason and key points. Declines and opt-outs close the thread. |
| FR-4 | **Timing.** Compute the send time from the strategy delay, any deadline lead, the minimum gap and business hours. | Must | The suggested time is never sooner than now + 5 min, and a requested time is never moved earlier than now. The gap after our last message is at least 24 h, or 12 h for a student/employee deadline reminder that would otherwise land after the deadline. The time always falls inside the recipient's Mon–Fri 09:00–18:00. |
| FR-5 | **Drafting.** Write the message in the strategy's tone, focus and length. | Must | Only thread facts, plus knowledge-base answers for product questions. One call to action. Correct subject line. |
| FR-6 | **Scheduling and sending.** Queue follow-ups and deliver them when due. Send direct replies immediately. | Must | Works with a mock outbox and real SMTP. A failed send is recorded, never crashes the agent and is retried on the next pass. |
| FR-7 | **Duplicate prevention.** Block closed threads, opt-outs, chasing after a reply, replies when we wrote last, pending duplicates, over-limit sends and identical bodies. | Must | Each blocked attempt returns and logs a human-readable reason. |
| FR-8 | **Previous-communication check.** Read the full thread and the contact's follow-up history before deciding, and check the thread again at send time. | Must | A follow-up is cancelled automatically if the recipient replied, opted out, or the thread was closed after it was scheduled. |
| FR-9 | **Action recording.** Log every step to an audit trail and every email to an outbox. | Must | Entries are grouped by run id. The outbox shows both the intended and the actual delivery address. |
| FR-10 | **Per-type strategies.** Apply customer, student, employee and business strategies. | Must | Values match the strategy matrix in §7. Unknown types fall back to the customer strategy. |
| FR-11 | **Knowledge-base lookup.** Answer recipient questions from a built-in FAQ. | Should | No invented product facts. |
| FR-12 | **Batch processing.** Run the agent over many open threads in parallel. | Should | Runs are independent. One failing thread doesn't stop the others. The worker count is capped to respect API rate limits. |
| FR-13 | **Accounts and roles.** Users sign in. Admins manage users, reset demo data and control time travel. Members run the agent. | Should | The first account becomes admin. Admins can't remove their own admin role. |
| FR-14 | **Demo time travel.** A simulated clock can be moved forward, and recipient replies can be simulated. | Should | Moving the clock forward delivers or cancels each due follow-up at its scheduled time, in order. |
| FR-15 | **Real reply sync.** Pull real replies from the inbox (IMAP) before sending. | Could | A real reply cancels the pending follow-up. A sync error is logged and doesn't block sending. |
| FR-16 | **Interfaces.** Provide a web UI (run, conversations, queue, outbox, log, time travel) and a CLI with the same operations. | Must | Every end-to-end scenario can be run from either interface. |

## 6. Non-functional requirements

- **Safety guards in code.** Duplicate, opt-out, limit, gap and business-hours rules sit in code below the model and apply to every send path. The model can't shorten the gap by inventing a deadline, because the deadline is read from the thread text.
- **Privacy.** Only data in the thread is used. Credentials and API keys never appear in logs, traces or error messages. SMTP errors have the password stripped out. A redirect safety net sends demo email to a test inbox and labels it with the intended recipient.
- **Reliability and fallback.** If the AI service is missing, rejects the key or fails mid-run, a deterministic rules agent finishes the run with the same tools, guards and log. Email failures leave the follow-up pending for retry.
- **Performance.** Database access goes through a thread-safe connection pool. Batch runs use a bounded thread pool so multiple conversations are processed at once. The agent loop has a fixed iteration cap.
- **Security.** Passwords are hashed with scrypt, using a per-user random salt and constant-time comparison. Session tokens are random and only their hash is stored. Sessions expire after 12 h. After 5 failed logins the account locks for 15 minutes. An unknown email and a wrong password return the same error.
- **Explainability.** Every run can be replayed from the trace and the action log.
- **Timezone correctness.** Times are stored in UTC and shown in the recipient's local timezone.

## 7. Follow-up strategy matrix

Values from `followup/strategies.py`.

| Type | Delay after last message | Max follow-ups | Tone | Focus | Length | Deadline lead |
|---|---|---|---|---|---|---|
| **Customer** | 48 h | 3 | warm, helpful, low-pressure | remind them of the value, answer likely objections, make the next step a one-line reply | 60–110 words | – |
| **Student** | 24 h | 2 | clear, encouraging, supportive | the deadline and the exact action needed; offer help if they are stuck | 50–90 words | 24 h before deadline |
| **Employee** | 24 h | 2 | direct, polite, brief | the task, the owner, and the due date; ask for a status update or blocker | 30–70 words | 24 h before deadline |
| **Business** | 96 h | 2 | formal and professional | the proposal or meeting; offer two concrete time slots or a clear next step | 70–120 words | – |

These rules apply to every type:
- **Business hours:** Mon–Fri 09:00–18:00 in the recipient's timezone.
- **Minimum gap:** 24 h between two of our messages in a thread.
- **Deadline exception (student and employee):** the gap shrinks to 12 h, but only when the 24 h gap would miss the deadline and 12 h still lands before it.
- **Timing formula:** `send_at = next_business_slot(max(min(last + delay, deadline − lead), last + gap, now + 5 min))`

## 8. Success metrics

| Metric | Target |
|---|---|
| Unnecessary sends (after a reply, an opt-out, a duplicate or the limit) | 0 |
| Follow-ups sent outside the recipient's business hours | 0 |
| Correct decision on the demo scenario set (schedule, skip, reply, close) | 100% |
| Runs with exactly one recorded decision and a complete audit trail | 100% |
| Runs that complete when the AI service is unavailable (fallback) | 100% |
| Pending follow-ups auto-cancelled after a recipient replies | 100% |
| Drafts within the type's word range that use only thread facts | ≥ 95% |
| Recipient reply rate after a follow-up (in live use) | Higher than the user's baseline |

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The model decides to send when it shouldn't | Spam, damaged relationship | Hard guards in code, plus a re-check at send time |
| The model invents facts or commitments | Misinformation | Prompt allows thread facts only, plus a knowledge-base lookup for product questions |
| Recipient type is misclassified from pasted text | Wrong tone or timing | The inferred type is shown in the live trace for review. Unknown types default to the customer strategy |
| AI service outage or invalid key | Agent stops | Automatic fallback to the rules agent |
| Real emails reach fictional or wrong addresses during demos | Privacy and embarrassment | Redirect safety net to a test inbox, with the intended recipient labelled |
| Credential leakage | Account compromise | Secrets kept in environment config, never logged, stripped from errors |
| An opt-out is phrased in a way the phrase list misses | Unwanted follow-up | The model also detects declines and closes the thread. The phrase list can be extended |
| Rate limits during batch runs | Failed runs | Bounded worker count, per-thread isolation, fallback |

## 10. Out of scope and future work

- Native Gmail and Outlook API integration (OAuth) beyond SMTP/IMAP.
- Multi-channel follow-ups (SMS, WhatsApp, Slack).
- Learning the best send time and tone from reply outcomes.
- User-defined strategies and custom recipient types in the UI.
- A human-in-the-loop approval queue before sending.
- Multi-tenant workspaces with per-team sender identities.
- Attachments, rich-text templates and multiple languages.
- Calendar integration to propose real meeting slots.
