# Ships Itself launch worklist

Last updated: 2026-07-16 (America/Chicago)

This is the running source of truth for Ships Itself launch work outside the separate self-improving video experiment. The owned production domain is `shipsitself.com`; do not use or point `selfimprove.dev`.

## Product boundary decision — Canon is a separate product

Decision recorded 2026-07-16 after direct coordination with the Fable/Claude Code session:

- [x] Create an empty standalone workspace at `/Users/miguel/canon`.
- [x] Assign the new Canon application to Fable/Claude Code; it must not make further Canon edits in `/Users/miguel/selfimprove`.
- [x] Assign the legacy `/pilot` export and retirement work to Codex in this SelfImprove workspace.
- [x] Open `/Users/miguel/canon` directly in a separate Claude Code task. The Claude session is resumable as `6fa116ff-4339-4834-b516-0bc4b1ac561e`.
- [x] Finish Canon Milestone 1 and its read-only player. Local gate: 24 test files, 205 tests, typecheck, lint, and production build pass.
- [x] Give Canon its own private GitHub repository, Vercel project, production deployment, and domain at `makeitcanon.com`.
- [ ] Create Canon-owned Supabase, storage, credentials, analytics properties, provider budgets, and release automation. No shared runtime packages or environment files.
- [x] Export only versioned show/episode data, aggregate vote totals, and an asset manifest from SelfImprove. The live three-episode snapshot is in `/Users/miguel/handoff/canon/` as `canon-export.v1.json`, `asset-manifest.v1.json`, and `SHA256SUMS`; checksums and the privacy scan pass. All six media entries intentionally remain `approved: false` pending explicit review.
- [ ] Review the six exported media entries, then rerun `npm run export:canon -- --approve-assets` immediately before Canon import if they are cleared for rehosting. The exporter streams media for hashes and never writes video copies locally.
- [ ] Copy and re-host approved pilot media into Canon-owned storage; do not leave Canon dependent on SelfImprove storage URLs.
- [ ] Secure Canon admin, spend, and destructive mutations with bearer authorization and idempotency keys. Keep public voting anonymous via a signed voter token, database uniqueness, rate limiting, and an optional bot challenge.
- [ ] Rotate the existing SelfImprove `CRON_SECRET` before the next deployment and provision a different Canon admin secret; never pass either secret in a query string.
- [ ] Replace the singleton `pilot_state` JSON document and long `after()` render polling with normalized tables and durable, idempotent jobs.
- [ ] Give Canon separate GA4/PostHog/Sentry projects, social accounts, email configuration, and—if monetized—separate Stripe products, prices, webhook endpoint, metadata namespace, and restricted credentials. Canon metadata, favicon, and share cards are live.
- [x] Keep Ships Itself and Canon separate in production: `/pilot` redirects to `makeitcanon.com`, `/canon` is 404, and Canon’s primary player is `makeitcanon.com/pilot` (`/watch` permanently redirects).
- [x] Connect the validated three-episode Devon handoff and all six source media URLs to Canon’s read-only player. The first plot is directly linked from the Canon landing page.

Temporary exception: keep `src/lib/pilot/caps.ts` and its cycle guard in SelfImprove until `/pilot` is retired; it is currently the only explicit spend brake on that experiment.

## Implemented in the current worktree

- [x] Rebrand the committed production product, dashboard, onboarding, widget, emails, generated GitHub messages, metadata, manifest, and share cards as Ships Itself while retaining compatibility identifiers such as the repository/package names, cookie, API-key prefix, and npm handle.

- [x] Replace active `selfimprove.dev` sender, widget, onboarding, share-card, worker, and alert references with the configured app URL or safe provider-neutral values.
- [x] Keep Supabase Auth as the current auth system and repair first-signup GitHub token persistence after membership creation.
- [x] Repair the billing UI so it sends the selected `pro` or `autonomous` tier to checkout and shows provider errors.
- [x] Remove lazy live Stripe product creation from customer checkout; require fixed Price IDs from environment variables.
- [x] Add the advertised 14-day trial for organizations without an existing subscription and attach tier/org metadata to subscriptions.
- [x] Reconcile active, trialing, delinquent, and deleted Stripe subscriptions back to application tiers.
- [x] Persist the onboarding settings that the wizard actually submits and prevent Free organizations from enabling paid automation.
- [x] Persist onboarding product description, target users, and current features in the project description; show user-facing onboarding errors.
- [x] Remove unsupported full-autonomous onboarding selection and the nonfunctional “Add to CLAUDE.md” control.
- [x] Add conditional GA4 loading plus signup, onboarding, and checkout events.
- [x] Add route-specific login and pricing metadata, with login marked `noindex`.
- [x] Add `robots.txt`, `sitemap.xml`, a generated Apple icon, corrected canonicals, and corrected OG/Twitter host labels.
- [x] Add real `/docs`, `/blog`, `/privacy`, and `/terms` routes, including three initial blog articles.
- [x] Fix the broken “How it works” and docs/blog navigation targets.
- [x] Expand “How it works” into a concrete six-stage improvement loop with inputs, evidence, controls, shipping, measurement, and a worked checkout example.
- [x] Consolidate the complete Ships Itself product on `shipsitself.com`: landing, login, auth callback, onboarding, dashboards, APIs, widget, and generated links now share the owned origin. The retired Vercel hostname preserves path/query while permanently redirecting to the owned domain.
- [x] Verify Google and GitHub are enabled, linked to the same production user, and accepted by Supabase with callbacks on the app origin. Google tokens can no longer overwrite the stored GitHub repository token.
- [x] Replace unverified testimonials with transparent product principles.
- [x] Add a tested `canon-export.v1` / `asset-manifest.v1` generator for the live public pilot state. It strips SelfImprove branding and all private/internal pilot fields, uses stable natural keys, hashes HTTPS media, writes atomically outside both repos, and defaults every asset to unapproved.

## P0 — required before accepting a real paid customer

- [x] **Choose and deploy the owned canonical domain.** `https://shipsitself.com` points to the existing Vercel project and serves Ships Itself metadata, manifest, widget branding, favicon, and share cards.
- [x] **Use one production origin for provider callbacks.** Google and GitHub flows now request `https://shipsitself.com/auth/callback`, so PKCE state and session cookies remain on the same owned domain as the landing page and dashboard. Fresh interactive signup QA remains tracked separately below.
- [ ] **Provision the Stripe catalog in the live account.** Create recurring monthly Prices for Pro ($49) and Autonomous ($199), then set `STRIPE_PRO_PRICE_ID` and `STRIPE_AUTONOMOUS_PRICE_ID` in Vercel. The app now fails closed with a clear message when these are absent.
- [ ] **Repair the Stripe webhook subscription.** Enable at least `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted` for the deployed webhook endpoint. Confirm the endpoint secret in Vercel matches it.
- [ ] **Finish Stripe account activation.** Payouts were disabled during the audit. Complete the required business/bank verification before launch.
- [ ] **Run one controlled end-to-end billing test.** Verify trial creation, application tier upgrade, billing portal access, plan change, cancellation, failed-payment downgrade, and webhook retry behavior. Refund or cancel the test subscription afterward.
- [ ] **Configure a verified email sender.** Verify a domain Miguel owns in Resend and set `RESEND_FROM_EMAIL`. Email intentionally remains disabled when no verified sender is configured.
- [ ] **Create and verify a GA4 property.** Set `NEXT_PUBLIC_GA_MEASUREMENT_ID`, deploy, validate page views and the `sign_up_started`, `onboarding_project_created`, `onboarding_completed`, `checkout_started`, and `checkout_redirected` events in DebugView.
- [ ] **Run authenticated production QA.** Complete fresh GitHub and Google signups, returning-user login, logout, onboarding, dashboard, project switching, and GitHub repository access in the production deployment. Confirm the GitHub provider token survives first signup and refresh.
- [x] **Restore the GitHub/Vercel production path.** Pushes to `main` now create production builds in the existing `selfimprove` project; no claimable project was created.
- [ ] **Review and ship the remaining launch-hardening worktree.** The auth, Stripe, analytics, blog/legal, and onboarding changes listed above remain mixed with unrelated local edits and were intentionally not swept into the branding commit.

## P1 — launch trust and lifecycle

- [ ] Create an owned support channel and publish it in the app, privacy policy, terms, and billing receipts.
- [ ] Have the privacy policy and terms reviewed for the actual business entity, data retention, subprocessors, governing law, refunds, and support process.
- [ ] Add a persistent, cross-device onboarding checkpoint so an interrupted wizard resumes the existing incomplete project rather than relying on the current session.
- [ ] Add checkout completion/purchase analytics from the Stripe success path and server-side webhook so paid conversion is not inferred from a redirect event.
- [ ] Decide whether welcome/reminder email delivery failures should be stored for retry instead of remaining fire-and-forget.
- [x] Validate the live Ships Itself and Canon OG/Twitter image routes, image dimensions, metadata URLs, and favicon responses. Platform cache/debugger refreshes remain useful before launch-day sharing.
- [ ] Editorially review the three starter blog posts and establish an owner/cadence before treating the blog as an acquisition channel.
- [ ] Collect real customer quotes and permission before adding testimonials or customer logos.

## P1 — social accounts

- [ ] Create or claim the official Ships Itself LinkedIn company page.
- [ ] Create or claim the official Facebook page.
- [ ] Create or claim the official X/Twitter account.
- [ ] Use the owned canonical domain, consistent handle, logo, bio, and OG image on each profile.
- [ ] Add the verified profile URLs to the site footer and structured `sameAs` metadata only after the accounts exist and Miguel confirms the exact URLs.

## P2 — engineering health

- [ ] Repair the pre-existing full-suite test failures outside this launch patch. Current verification: 263 passed and the same 6 failed across 4 files (`dedup-signals`, `impact-review`, `cold-start-cluster`, and `funnel`).
- [ ] Repair the remaining lint backlog. Current verification: 13 errors and 17 warnings; touched launch files pass their focused lint check. Keep pilot experiment findings separate.
- [ ] Add browser-level tests for OAuth callback setup, onboarding resume, checkout selection, billing return states, metadata routes, and public navigation.
- [ ] Upgrade the local Vercel CLI from 56.3.0 to 56.3.1 before future provider work.

## Explicit product decision

Clerk is not currently installed. The working product uses Supabase Auth with GitHub and Google OAuth. Do not add a second authentication system unless there is a separate migration decision, plan, and user-data migration test.
