# Install Sedifex Sync on WordPress

Use this guide to connect a WordPress site to your Sedifex product catalog.

## What this setup does

1. Authenticates a Sedifex integration user.
2. Calls the `listStoreProducts` callable.
3. Renders products in WordPress via shortcode.

## Prerequisites

- A WordPress site where you can install plugins.
- A Sedifex integration user (staff/owner) for the target store.
- Firebase web config values for your Sedifex project.

## Step 1: Install the plugin scaffold

1. In WordPress Admin, go to **Plugins → Add New**.
2. Install **Code Snippets** (or use your preferred custom plugin workflow).
3. Add a snippet with PHP + JavaScript enqueue support.

## Step 2: Add Sedifex client script

Create a small frontend script that:

- Initializes Firebase app/auth/functions.
- Signs in with integration credentials.
- Calls `listStoreProducts`.
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

- `SEDIFEX_INTEGRATION_EMAIL`
- `SEDIFEX_INTEGRATION_PASSWORD`
- `FB_API_KEY`
- `FB_AUTH_DOMAIN`
- `FB_PROJECT_ID`
- `FB_APP_ID`

## Step 5: Validate sync

1. Open the page containing `[sedifex_products]`.
2. Confirm products are rendered.
3. Confirm out-of-stock behavior (`stockCount <= 0`) is handled as expected.

## Recommended hardening

- Cache product payload for 30-120 seconds.
- Add visible "Last synced at" timestamp.
- Alert on repeated sync failures.
- Rotate integration credentials periodically.

