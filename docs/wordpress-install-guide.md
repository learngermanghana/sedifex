# Install Sedifex Sync on WordPress

Use this guide to connect a WordPress site to your Sedifex product catalog.

## What this setup does

1. Uses a Sedifex integration API key.
2. Calls the `integrationProducts` HTTP endpoint.
3. Renders products in WordPress via shortcode.

## Prerequisites

- A WordPress site where you can install plugins.
- A Sedifex integration API key for the target store.
- Sedifex API base URL for your deployed Functions endpoint.

## Step 1: Install the plugin scaffold

1. In WordPress Admin, go to **Plugins → Add New**.
2. Install **Code Snippets** (or use your preferred custom plugin workflow).
3. Add a snippet with PHP + JavaScript enqueue support.
4. Optionally start from `docs/wordpress-plugin/sedifex-sync.php` in this repo as a baseline MVP plugin.

## Step 2: Add Sedifex client script

Create a small frontend script that:

- Calls `integrationProducts?storeId=<storeId>` with `Authorization: Bearer <integration_key>`.
- Handles success/error responses and caching.
- Renders products into a container.

Reference implementation: `docs/integration-quickstart.md`.

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
2. Confirm products are rendered.
3. Confirm out-of-stock behavior (`stockCount <= 0`) is handled as expected.

## Recommended hardening

- Cache product payload for 30-120 seconds.
- Add visible "Last synced at" timestamp.
- Alert on repeated sync failures.
- Rotate integration credentials periodically using the in-app Integration keys UI.
