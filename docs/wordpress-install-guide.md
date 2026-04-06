# WordPress Install Guide (Sedifex Sync)

Use this guide to connect a **WordPress** site to your Sedifex product catalog.

> If you are using **Next.js on Vercel**, use `docs/integration-quickstart.md` instead.

## What this setup does

1. Uses a Sedifex integration API key.
2. Calls the `integrationProducts` HTTP endpoint.
3. Renders products in WordPress via shortcode.
4. Applies dedupe + fallback + cache strategy so the UI stays stable.

## Prerequisites

- A WordPress site where you can install plugins.
- A Sedifex integration API key for the target store.
- Sedifex API base URL for your deployed Functions endpoint.

## Step 1: Install the plugin scaffold

1. In WordPress Admin, go to **Plugins → Add New**.
2. Install **Code Snippets** (or use your preferred custom plugin workflow).
3. Add a snippet with PHP + JavaScript enqueue support.
4. Optionally start from `docs/wordpress-plugin/sedifex-sync.php` in this repo as a baseline plugin.

## Step 2: Add Sedifex client script

Create a frontend script that:

- Calls `integrationProducts?storeId=<storeId>` with `Authorization: Bearer <integration_key>`.
- Deduplicates by composite key: `id|storeId|name|price`.
- Falls back to static products when fetch fails.
- Groups products by category and renders menu sections, including optional product descriptions.
- Handles cache timing (30-120s for fast-changing stock, 3600s+ for mostly static catalogs).

Reference implementation: `docs/integration-quickstart.md`.

If you also want to auto-show TikTok videos for the same store, call:

- `integrationTikTokVideos?storeId=<storeId>` with `Authorization: Bearer <integration_key>`

Then render each returned `embedUrl` (or fallback to `permalink`) inside your website section for social proof.

## Step 3: Create a shortcode

Register a shortcode like `[sedifex_products]` that outputs:

```html
<div id="sedifex-products-root"></div>
```

Then mount your client script to this root.

## Step 4: Add environment settings

Store these values in WordPress config or plugin settings:

- `SEDIFEX_API_BASE_URL`
- `SEDIFEX_STORE_ID`
- `SEDIFEX_INTEGRATION_KEY`

## Step 5: Validate sync

1. Open the page containing `[sedifex_products]`.
2. Confirm products render by category.
3. Confirm out-of-stock behavior (`stockCount <= 0`) is handled as expected.
4. Force a failed fetch and confirm fallback products still render.

## Recommended hardening

- Add a visible **Last synced at** timestamp.
- Alert on repeated sync failures.
- Rotate integration credentials periodically using **Account → Integrations**.
