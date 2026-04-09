# SelfImprove -- AI Product Manager for Developers

SelfImprove watches your users, builds your roadmap, writes the PRDs, and ships the fixes. It is the AI product manager for developers who built something and need what comes next.

## What is SelfImprove?

Most developers ship a v1 and then fly blind. Users hit bugs and leave silently, feedback piles up with no triage, and the backlog grows without any sense of priority. SelfImprove closes that loop automatically.

SelfImprove collects signals from multiple sources -- feedback widgets, voice recordings, analytics, error trackers, GitHub issues, and AI codebase scans. It groups, deduplicates, and weighs those signals, then uses Claude to generate a live, stack-ranked roadmap where every item has an ROI score, evidence trail, and thinking trace. Each roadmap item gets a full PRD with acceptance criteria, file-level implementation plans, success metrics, and analytics events to track.

When you are ready to ship, SelfImprove can create a GitHub issue from any roadmap item or auto-implement changes by running Claude Code against your repo, opening a PR, and optionally auto-approving and merging it -- all with configurable safety guardrails, risk thresholds, and daily caps.

## Features

- **Smart signal collection** -- Feedback widget, voice companion (Gemini transcription), analytics integration, error tracking, GitHub issue import, and AI codebase scanning all feed one system.
- **Weighted signal processing** -- Signals are typed (voice, feedback, analytics, error, builder) and assigned configurable weights. Voice signals carry 5x weight; builder signals carry 1x.
- **AI roadmap generation** -- Claude analyzes signals and produces 3-10 stack-ranked roadmap items with ROI scores computed as `(impact * confidence) / (size * 10)`.
- **Configurable ROI focus** -- Prioritize by impact, effort, confidence, bugs, UX, features, retention, revenue, or reach.
- **PRD generation** -- Each roadmap item gets a full PRD: problem statement, solution, acceptance criteria, file-by-file changes, test requirements, rollback plan, success metrics, and analytics events.
- **PRD refinement** -- Iterate on PRDs with natural language feedback.
- **Auto-implementation** -- One click queues a build job. A Fly.io worker clones your repo, runs Claude Code, commits changes, pushes a branch, and opens a PR.
- **Codebase scanning** -- AI scans your repo for bugs, security issues, performance problems, accessibility gaps, dead code, and missing tests, then feeds findings back as signals.
- **Cold-start site analysis** -- On project creation, SelfImprove fetches your site and generates initial signals for performance, security, accessibility, SEO, and agent readiness (llms.txt, agents.md, OpenAPI spec).
- **Safety guardrails** -- Two-stage PR review (mechanical + Claude semantic), configurable risk thresholds, blocked paths, max file/line limits, test requirements, and daily improvement caps.
- **GitHub integration** -- Import open issues as signals, create issues from roadmap items, and open PRs from implementations.
- **Voice companion** -- Audio recording transcribed via Gemini 2.5 Flash, capturing frustrations and feature requests users will not type.
- **Email notifications** -- Resend-powered alerts for new roadmap items, PRs created, tier changes, and more.
- **Stripe billing** -- Three tiers (Free, Pro $49/mo, Autonomous $199/mo) with per-tier project limits, signal caps, and feature gates.
- **Hourly cron** -- Vercel Cron runs every hour to process unprocessed signals into roadmap items and auto-generate PRDs.
- **Row-level security** -- All Supabase tables use RLS policies scoped to org membership.
- **Domain allowlisting** -- Signal ingestion validates request origin against per-project allowed domains.

## Architecture

```
Signals (widget, voice, GitHub, analytics, errors, codebase scan)
    |
    v
[Supabase Postgres] <-- RLS, org-scoped
    |
    v
[Next.js 16 on Vercel] -- API routes, dashboard, auth, cron
    |                         |
    |  hourly cron            |  user action
    v                         v
[Claude API] -------> Roadmap items + PRDs
                              |
                              | "Implement" click
                              v
                    [build_jobs queue in Supabase]
                              |
                              v
                    [Fly.io Worker] -- polls queue
                              |
                              v
                    [Claude Code CLI] -- clones repo, edits files
                              |
                              v
                    [GitHub PR] -- branch + PR created
```

**Web app (Vercel):** Next.js 16 App Router with Supabase Auth (GitHub OAuth), Stripe billing, and Vercel Cron. Handles signal ingestion, roadmap/PRD generation, dashboard UI, and webhook processing.

**Worker (Fly.io):** A long-running Node.js process that polls Supabase for pending build jobs every 30 seconds. For implementation jobs, it clones the repo, runs Claude Code CLI, commits changes, and opens a GitHub PR. For scan jobs, it runs Claude Code in read-only mode and inserts findings as signals.

**AI layer:** Claude (via Anthropic SDK with tool_use for structured output) powers roadmap generation, PRD generation, signal summarization, and PR risk assessment. Gemini 2.5 Flash handles audio transcription.

## Getting Started

### Prerequisites

- Node.js 22+
- A Supabase project
- A Vercel account
- A Fly.io account (for the worker)
- An Anthropic API key (Claude)
- A Google AI API key (Gemini, for voice transcription)
- A Stripe account (for billing)
- A GitHub OAuth App (for authentication)
- A Resend account (optional, for email notifications)

### Setup

1. **Clone the repo**

```bash
git clone https://github.com/msanchezgrice/selfimprove.git
cd selfimprove
```

2. **Install dependencies**

```bash
npm install
cd worker && npm install && cd ..
```

3. **Set up Supabase**

Create a Supabase project, then run the migrations in order:

```bash
# Apply via Supabase CLI or paste into SQL Editor
supabase db push
# Or manually run each file in supabase/migrations/
```

4. **Configure environment variables**

Copy the table below into a `.env.local` file for the web app. Set corresponding secrets on Fly.io for the worker.

5. **Run locally**

```bash
npm run dev          # Next.js app on http://localhost:3000
cd worker && npm run dev  # Worker (polls Supabase for jobs)
```

6. **Deploy the web app to Vercel**

```bash
vercel deploy --prod
```

7. **Deploy the worker to Fly.io**

```bash
cd worker
fly deploy
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=...
```

### Environment Variables

#### Web App (Vercel)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `GEMINI_API_KEY` | Google AI API key for Gemini (voice transcription) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for Pro tier |
| `STRIPE_AUTONOMOUS_PRICE_ID` | Stripe Price ID for Autonomous tier |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app (e.g., `https://selfimprove-iota.vercel.app`) |
| `RESEND_API_KEY` | Resend API key for email notifications (optional) |
| `CRON_SECRET` | Secret for authenticating Vercel Cron requests |

#### Worker (Fly.io)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ANTHROPIC_API_KEY` | Anthropic API key (used by Claude Code CLI) |

## Project Structure

```
selfimprove/
  src/
    app/
      page.tsx                          # Landing page
      layout.tsx                        # Root layout with Supabase auth
      login/                            # GitHub OAuth login
      onboarding/                       # New user onboarding
      pricing/                          # Pricing page
      dashboard/
        page.tsx                        # Project list / dashboard home
        layout.tsx                      # Dashboard shell with sidebar
        _components/
          sidebar.tsx                   # Project nav sidebar
          roadmap-table.tsx             # Roadmap items table with actions
          prd-detail.tsx                # PRD viewer/editor
          signals-feed.tsx              # Signal feed display
          settings-form.tsx             # Project settings (AI, safety, widget)
          building-card.tsx             # Build job status card
          roadmap-empty.tsx             # Empty state for roadmap
          signals-empty.tsx             # Empty state for signals
      api/
        signals/route.ts               # POST signal ingestion (widget/SDK)
        voice/route.ts                  # POST voice recording transcription
        projects/
          route.ts                      # POST create project
          list/route.ts                 # GET list projects
          [id]/
            route.ts                    # GET/PATCH/DELETE project
            generate-roadmap/route.ts   # POST trigger roadmap generation
            analyze/route.ts            # POST trigger cold-start site analysis
            backfill-prds/route.ts      # POST generate PRDs for existing items
            widget-config/route.ts      # GET widget configuration
        roadmap/
          [id]/
            route.ts                    # GET/PATCH roadmap item
            prd/route.ts               # POST generate/regenerate PRD
            implement/route.ts          # POST queue implementation job
            build/route.ts              # GET build job status
            github-issue/route.ts       # POST create GitHub issue
        github/
          repos/route.ts               # GET list user's GitHub repos
        stripe/
          checkout/route.ts             # POST create Stripe Checkout session
          portal/route.ts              # POST create Stripe billing portal
          webhooks/route.ts            # POST Stripe webhook handler
        webhooks/
          implement/route.ts           # POST webhook for build completion
        cron/
          roadmap/route.ts             # GET hourly cron: process signals
    lib/
      ai/
        call-claude.ts                 # Claude API wrapper (structured output via tool_use)
        generate-roadmap.ts            # Signal -> roadmap item generation
        generate-prd.ts                # Roadmap item -> PRD generation
        summarize-signals.ts           # Signal grouping and summarization
        approval-agent.ts              # Two-stage PR risk assessment
        cold-start.ts                  # Site analysis and initial signal seeding
        queue-build.ts                 # Queue implement/scan jobs
        github-issue.ts                # Create GitHub issues from roadmap items
        import-github-issues.ts        # Import GitHub issues as signals
        transcribe-audio.ts            # Gemini audio transcription
        daily-cap.ts                   # Daily improvement cap enforcement
      constants/
        signal-weights.ts              # Signal type weights
        tiers.ts                       # Pricing tier definitions
      stripe/
        client.ts                      # Stripe client
        products.ts                    # Stripe product config
        tier-enforcement.ts            # Tier-based feature gates
      supabase/
        admin.ts                       # Service role client
        server.ts                      # Server component client
        browser.ts                     # Browser client
        auth-helpers.ts                # Auth utilities
        get-active-project.ts          # Active project resolver
      github/
        get-token.ts                   # GitHub token retrieval
      types/
        database.ts                    # TypeScript types for DB tables
      notifications.ts                 # Resend email notifications
    proxy.ts                           # Next.js 16 proxy (middleware)
  supabase/
    migrations/
      00001_initial_schema.sql         # Core schema: orgs, projects, signals, roadmap_items, etc.
      00002_add_business_priority_categories.sql
      00003_add_github_token.sql
      00004_add_build_status_fields.sql
  worker/
    index.ts                           # Job queue poller (30s interval)
    process-job.ts                     # Job processor: clone, Claude Code, PR
    Dockerfile                         # Node 22 + git + Claude Code CLI
    fly.toml                           # Fly.io config (iad region, shared-cpu-1x)
  vercel.json                          # Vercel Cron: hourly roadmap generation
  vitest.config.ts                     # Test config
  next.config.ts                       # Next.js config
```

## How It Works

### Signal Collection

Signals enter the system through multiple channels:

- **Feedback widget** -- An embeddable widget POSTs to `/api/signals` with type, content, tags, and page context. Domain allowlisting prevents abuse.
- **Voice companion** -- Audio recordings POST to `/api/voice`, where Gemini 2.5 Flash transcribes them and stores the result as a voice signal (5x weight).
- **GitHub issue import** -- Open issues from connected repos are imported as feedback or error signals.
- **Codebase scan** -- Claude Code analyzes the repo in read-only mode and inserts findings (bugs, security, performance, accessibility, code quality, missing tests, UX issues) as builder signals.
- **Cold-start analysis** -- On project creation, SelfImprove fetches the live site and checks performance, security headers, accessibility, SEO, and agent readiness, seeding initial signals.

Each signal type has a weight: voice (5), feedback (4), error (3), analytics (2), builder (1). Tier-based monthly caps are enforced at ingestion.

### AI Roadmap Generation

A Vercel Cron job runs hourly at `/api/cron/roadmap`. For each project with automation enabled and unprocessed signals:

1. Signals are grouped, summarized, and formatted with weights and metadata.
2. Existing roadmap items are fetched to avoid duplicates.
3. Claude generates 3-10 roadmap items with ROI scores, evidence trails, thinking traces, acceptance criteria, files to modify, and risks.
4. Items are inserted into the database, signals are marked as processed, and email notifications fire.
5. PRDs are generated asynchronously for each new item via `after()`.

Users can also trigger roadmap generation manually from the dashboard.

### PRD Generation

Each roadmap item gets a full Product Requirements Document:

- Problem statement grounded in user signals
- Solution approach with technical implementation strategy
- File-by-file change plan
- Testable acceptance criteria
- Test requirements and rollback plan
- Success metrics with baselines and targets
- Analytics events the developer should add

PRDs can be regenerated with refinement feedback.

### Auto-Implementation (Worker)

When a user clicks "Implement" on a roadmap item:

1. A build job is queued in the `build_jobs` table with the implementation prompt (derived from the PRD).
2. The Fly.io worker polls the queue every 30 seconds.
3. It clones the repo, creates a branch (`selfimprove/auto-{timestamp}`), and runs Claude Code CLI with the prompt.
4. If Claude made changes, it commits, pushes, and opens a GitHub PR.
5. The roadmap item is updated with the PR URL and status.

The worker also supports scan jobs that analyze the codebase and feed findings back as signals.

### Safety Guardrails

Before auto-approving changes, a two-stage risk assessment runs:

1. **Mechanical scoring** -- Checks file count, line count, blocked paths, test presence, and diff size against configurable thresholds.
2. **Semantic review** -- Claude reviews the diff for correctness, security, performance, and error handling.
3. **Combined score** -- 40% mechanical + 60% semantic. Decision is approve, flag, or reject based on the project's risk threshold.

Additional safety features: daily improvement caps, blocked file paths, max files/lines per change, and test requirements.

## Deployment

### Vercel (Web App)

The Next.js app deploys to Vercel with standard settings. The `vercel.json` configures a cron job:

```json
{
  "crons": [
    {
      "path": "/api/cron/roadmap",
      "schedule": "0 * * * *"
    }
  ]
}
```

Set all web app environment variables in the Vercel dashboard.

### Fly.io (Worker)

The worker runs as a single Fly.io machine:

```bash
cd worker
fly launch        # First time
fly deploy        # Subsequent deploys
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=...
```

The Dockerfile installs Node.js 22, git, and the Claude Code CLI. The worker runs on a shared-cpu-1x VM with 512 MB memory in the `iad` region.

## Testing

Tests use Vitest with the Node.js environment:

```bash
npm run lint      # ESLint
npx vitest        # Run tests
npx vitest run    # Run tests once (CI)
```

Test files live alongside source files with a `.test.ts` suffix. Existing tests cover:
- Signal summarization and weighting
- Tier enforcement and feature gates
- Approval agent risk scoring
- Claude API call structure
- Database type definitions

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript 5 |
| Database | Supabase (Postgres + Auth + RLS) |
| AI (Roadmap/PRD) | Claude via Anthropic SDK (structured output) |
| AI (Transcription) | Gemini 2.5 Flash via Google GenAI SDK |
| AI (Implementation) | Claude Code CLI |
| Payments | Stripe (Checkout, Billing Portal, Webhooks) |
| Email | Resend |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |
| State | Zustand |
| Hosting (Web) | Vercel |
| Hosting (Worker) | Fly.io |
| Testing | Vitest |

## License

MIT
