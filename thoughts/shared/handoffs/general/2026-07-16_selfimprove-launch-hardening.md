# SelfImprove launch hardening handoff

## Scope

Implemented code-side fixes from the 2026-07-16 product audit. The separate pilot/video experiment was intentionally excluded and its dirty files were not modified.

## Durable decisions

- `selfimprove.dev` is not owned and must not be referenced as a project domain.
- Supabase Auth remains the sole authentication system; Clerk is a future migration decision, not a launch patch.
- Stripe checkout consumes pre-provisioned Price IDs and never creates catalog objects in a customer request.
- Email is disabled unless `RESEND_FROM_EMAIL` names a verified sender.
- External/provider work is tracked in `docs/product-launch-outstanding.md`.

## Verification entry points

- Focused regression tests: `npx vitest run src/lib/site-config.test.ts src/lib/stripe/checkout-config.test.ts src/lib/stripe/subscription-state.test.ts src/lib/onboarding/settings-update.test.ts src/app/seo-metadata.test.ts`
- Type/build verification: `npm run build`
- Full test baseline: `npx vitest run`
- Lint baseline: `npm run lint`
