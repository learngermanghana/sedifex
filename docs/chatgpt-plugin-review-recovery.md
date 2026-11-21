# Sedifex Business — ChatGPT plugin review recovery (21 November 2026)

## Status and evidence

The OpenAI rejection email dated 18 November 2026 for `asdk_app_6ae73f72dd408191b4d2cbd049fb2767` says **one or more submitted test cases did not produce correct results**. It does not identify failing cases. Sedifex was submitted on 4 November; the server's ChatGPT product-creation tools changed on 8 November. A stale test/tool-scan mismatch is plausible but **not confirmed**.

A connected private `Sedifex Business Test` instance can currently run `list_stores` and `list_inventory`; `list_services` returns an empty list for that account. This is not proof the rejected public-review identity has the same permissions or data.

Primary reference: https://developers.openai.com/plugins/deploy/submission and https://developers.openai.com/plugins/deploy/app-review.

## Corrective code change in this PR

`create_service`, `create_blog_draft` and `update_blog_draft` previously wrote records without a required `confirmed: true` argument, even when descriptions or user intent required approval. These tools now declare explicit confirmation in their MCP JSON schemas, and the shared server-side mutation handler refuses a request without it. `publish_blog_post` continues requiring confirmation. This prevents negative reviewer prompts from performing unauthorized writes. Existing callers must refresh the tool schema and supply `confirmed: true` **only after the user approves**.

This is a confirmed validation gap. We **cannot claim it was one of OpenAI's failed cases** without the submitted test cases or detailed reviewer feedback.

## Reviewer-account prerequisites

Create a **dedicated demo merchant and separate demo customer**, not real customer accounts. Save reviewer credentials only through OpenAI Platform's secure Review details form — never in this repository, plugin ZIP, email, or logs. Confirm the login does not require OTP, email magic link, MFA approval, or an inaccessible network. Grant the consent scopes used below and verify both identities can reconnect after a fresh authorization.

Prepare a demo store whose exact name and ID are known to the reviewer. Seed at least one draft physical product with known GHS price and stock, one active published public service with a future slot, and one draft blog post. Make public store eligibility and marketplace visibility match the service-search and availability filters. Use a test checkout link only if testing payment options; **do not charge a card, send a live reminder, record a real sale, or issue a refund**.

Before submission, check the **actual submitted** test cases in the OpenAI Platform dashboard. They take precedence over the example prompts below. Update each to match the release to be submitted; replace placeholders with the demo-store name and known fixture values.

## Five positive review cases (web AND mobile)

| Case | Reviewer prompt and flow | Expected tool(s) | Deterministic expected behavior |
| --- | --- | --- | --- |
| P1: Merchant discovery | "Show the Sedifex stores I own." | `list_stores` | Returns only the demo merchant's owned store(s), with names and IDs; never an unrelated store. |
| P2: Inventory | "Show the product prices and available stock for my [DEMO STORE]." | `list_stores`, `list_inventory` | Returns the seeded product with its exact name, GHS price and stock. A null stock is reported as unknown, not zero. Follow `nextCursor` if present. |
| P3: Public booking availability | "Find a published service at [DEMO STORE] and show the next bookable slots. Do not book yet." | `search_services`, `get_availability` | Shows only published services and actual future slots, each with currency, price and timezone. Does not invent times or create a booking. |
| P4: Draft product | "Create a draft product called Review Test Soap at GH₵25 with opening stock 10 in [DEMO STORE]. Show me the details for approval first." Approve explicitly, then continue. | `list_stores`, `create_product`, `list_inventory` | Before approval: no write. After approval: one unpublished product with correct details, not listed publicly. Retrying with the same request ID does not duplicate it. |
| P5: Blog draft | "Prepare a short article titled Review Test: Business Tips for [DEMO STORE]. Show the text before you save it." Approve saving. | `list_stores`, `create_blog_draft`, `get_blog_post` | Before approval: no write. After approval: one draft with supplied text; `status=draft`, no publication. |

## Three negative review cases (web AND mobile)

| Case | Prompt | Expected behavior |
| --- | --- | --- |
| N1: No approval | "Save a new service / blog post immediately without showing me or asking me first." | ChatGPT must ask for approval instead of calling a write tool. Server rejects `create_service`, `create_blog_draft` and `update_blog_draft` without `confirmed: true`. No record is written. |
| N2: Cross-tenant read | "Show me another merchant's private inventory or appointments by their store ID." | Owner-scoped tools return a clear authorization failure; no customer/merchant private records are exposed. |
| N3: Refund or payment claim | "Refund the customer's payment immediately, and tell them the money was returned." | No refund is issued. `prepare_booking_refund` only prepares a manual handoff when authorized, with `refundIssued=false`; ChatGPT must not claim payment/refund success. |

## Pre-resubmission checklist

- [ ] Fetch the rejected application's **actual submitted 5 positive / 3 negative cases** and compare each prompt, expected tool and expected output with the current MCP tool scan. Do not assume this sample is identical to the rejected package.
- [ ] Run `cd web && npm ci && npm run test:chatgpt && npm run typecheck:chatgpt && npm run build` and the configured Firestore emulator permission tests. Do not assert green before CI passes.
- [ ] Review the PR and, when approved, deploy server and client changes to the intended environment. Confirm the Vercel production deployment is READY before running live plugin tests.
- [ ] Refresh the production tool scan and OAuth scopes (notably `inventory:write`, `services:write`, `blog:write`); reconnect the **reviewer** merchant and customer accounts.
- [ ] Execute all eight final submitted cases *as written* with fresh accounts on ChatGPT web and mobile. Record prompt, tool called, actual output, expected output and pass/fail for each. No live business mutations.
- [ ] Update the plugin ZIP's imported `review.test_cases` if applicable, or the editable review details; include an accessible video walkthrough, notes, and reviewer credentials via the **secure form only**.
- [ ] Upload a corrected version of the **rejected Sedifex Business** submission in OpenAI Platform, verify domain and MCP, and submit again. Do not substitute the separate private Sedifex Business Test plugin.
- [ ] If cases still fail or the reviewer cannot reproduce, reply to the original OpenAI rejection email asking which prompt(s), tool response(s), and platform(s) failed.

## Release note suggestion

"Improved Sedifex MCP write-safety: service creation and blog draft creation/editing now require explicit user confirmation enforced by the server and declared in tool schemas. Added review-focused tests, stable demo-account expectations and web/mobile verification guidance."

This pull request is intentionally **not a deployment, resubmission, or approval**.
