# Followup web app

The browser front end for the follow-up agent (Agenticthon 2026, team AGT-018, problem PS-053).
Paste or pick a conversation, watch the agent read it, decide, choose a time, draft the email and
schedule or send it, then review everything it recorded.

Stack: Vite, React 19, TypeScript (strict), Tailwind CSS v4, React Router, TanStack Query,
lucide-react icons, Geist Sans and Geist Mono.

## Run it

The app talks to the FastAPI backend (`api/main.py` on the `backend` branch) under `/api`.

```bash
# 1. backend (port 8010)
cd branches/backend
python -m uvicorn api.main:app --port 8010

# 2. front end (port 5173, proxies /api to 127.0.0.1:8010)
cd branches/frontend/web
npm install
npm run dev
```

Open http://localhost:5173. The first account you create becomes the admin (only admins can reset
the demo data).

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on 5173 with the `/api` proxy |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the build on 4173 (also proxies `/api`) |
| `npm run typecheck` | Type-check only |

In production FastAPI serves `dist/` itself (env `WEB_DIST`, default `<repo>/web/dist`), so the app
and API share one origin. To point a separately hosted build at another API origin, set
`VITE_API_BASE` (the backend must allow that origin with credentials).

## Pages

| Route | Page |
|---|---|
| `/` | Landing |
| `/signin`, `/signup` | Account pages (signed-in visitors go to `/app`) |
| `/app` | Overview: counts, what needs attention, recent activity |
| `/app/conversations` | All conversations and where each one stands |
| `/app/conversations/:id` | Thread, contact, strategy, live agent run, result, pending follow-up, simulate a reply |
| `/app/new` | Paste a conversation and run the agent on it |
| `/app/scheduled` | Pending, sent and cancelled follow-ups |
| `/app/sent` | Every email sent, with provider and actual recipient |
| `/app/activity` | The audit log |
| `/app/how-it-works` | Walkthrough of how the agent plans and executes |

The top bar's demo clock moves the simulated time (+6 h, +1 day, +3 days), sends due follow-ups,
and (admins) resets the demo data. All relative times ("in 1 day") are measured against that
simulated clock, not the computer's clock.

## Code map

```
src/
  main.tsx, App.tsx          providers: theme, react-query, auth, router, toaster
  router.tsx                 every route (code-split pages, auth guards, route titles)
  index.css                  design tokens (both themes) and Tailwind @theme
  lib/
    api.ts                   typed client for every endpoint + runAgent() SSE helper
    query.ts                 queryClient, queryKeys, invalidateWorkflow()
    queries.ts               shared hooks: useOverview, useConversation, useNow, useAdvanceClock...
    auth.tsx                 AuthProvider, useAuth, RequireAuth, GuestOnly
    theme.tsx                ThemeProvider, useTheme (system / light / dark, saved)
    format.ts                relative time, countdowns, labels for types, decisions, statuses, steps
    product.ts               static facts mirrored from the backend (strategies, safeguards, tools)
    utils.ts                 cn()
  components/
    ui/                      the UI kit (import from '@/components/ui')
    layout/                  AppLayout, Sidebar, TopBar, DemoClock, UserMenu, OfflineBanner, page titles
    brand.tsx                Logo, Wordmark
    theme-toggle.tsx         ThemeToggle
    status-badges.tsx        ContactTypeBadge, DecisionBadge, FollowupStatusBadge, ConversationStatusBadge
    relative-time.tsx        <RelativeTime value=... /> against the demo clock
  pages/                     one file per route
```

## Design rules

- Monochrome zinc palette from tokens only: `bg-background`, `bg-surface`, `bg-surface-2`,
  `bg-surface-3`, `text-foreground`, `text-muted`, `text-subtle`, `border-border`,
  `border-border-strong`, `bg-primary text-primary-foreground`. The default Tailwind colour
  palette is switched off on purpose.
- Colour only in small status badges: `info` (scheduled), `success` (sent), `warning`
  (skipped, they replied), `danger` (blocked, failed). Use `<Badge tone=...>` or the status badges.
- Type scale: `text-xs` 12, `text-sm` 13, `text-base` 14, `text-lg` 16, `text-xl` 20,
  `text-2xl` 28, `text-3xl` 48, `text-4xl` 56, `text-5xl` 64. Headings use `tracking-tight`.
- Radii: `rounded-sm` 6, `rounded-md` 8, `rounded-lg` 12. 1px hairline borders. Shadows only on
  floating layers (`shadow-popover`, `shadow-dialog`).
- Spacing on the 4/8 px grid. Motion is 150 ms ease and respects `prefers-reduced-motion`.
- lucide icons at 16 px (`size-4`), `aria-hidden` when next to text; icon-only buttons need `aria-label`.
- Plain, specific copy ("Waiting 20 hours for Rahul's reply"). No emojis, gradients or glass effects.
- Every list has a loading skeleton, an empty state with a next action, and an inline error with retry.
