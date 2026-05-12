# Blog page implementation plan (store-managed + public + embeddable)

## Goal
Enable each store to:
1. Create blog posts (title, image upload, rich text, links).
2. Publish posts to a public Sedifex-hosted page.
3. Pull posts into their own website using an API (and optionally webhooks).

## Architecture overview

- **Authoring UI (Sedifex app):** New "Blog" admin page for store staff.
- **Storage:** Firestore collection `blogPosts` with `storeId` tenant scoping.
- **Images:** Reuse existing upload pipeline (`POST /api/uploads`) and store returned URL.
- **Public read model:** Mirror published posts to `publicBlogPosts` for unauthenticated reads.
- **Public page route:** `/s/:storeSlug/blog` + `/s/:storeSlug/blog/:postSlug`.
- **External website pull:** `GET /api/public/blog?storeSlug=...` and `GET /api/public/blog/:postSlug?...`.
- **Optional push model:** Webhook event on publish/update/unpublish for site sync.

## Firestore schema

### `blogPosts/{postId}` (private, tenant-protected)
- `storeId: string`
- `storeSlug: string`
- `title: string`
- `slug: string`
- `excerpt: string | null`
- `coverImageUrl: string | null`
- `coverImageAlt: string | null`
- `contentHtml: string` (sanitized)
- `status: 'draft' | 'published' | 'archived'`
- `publishedAt: Timestamp | null`
- `createdBy: string`
- `createdAt: Timestamp`
- `updatedAt: Timestamp`

Indexes:
- `(storeId, updatedAt desc)`
- `(storeId, status, publishedAt desc)`

### `publicBlogPosts/{storeSlug_postSlug}` (public projection)
- `storeSlug: string`
- `postSlug: string`
- `title: string`
- `excerpt: string | null`
- `coverImageUrl: string | null`
- `coverImageAlt: string | null`
- `contentHtml: string`
- `publishedAt: Timestamp`
- `updatedAt: Timestamp`

Indexes:
- `(storeSlug, publishedAt desc)`

## Security model

- `blogPosts`: only authenticated members for matching `storeId` can read/write.
- `publicBlogPosts`: public read allowed, no client writes.
- Only backend/admin path can copy from `blogPosts` -> `publicBlogPosts`.

## Authoring UX requirements

### Form fields
- **Title** (required, 5–120 chars)
- **Cover image upload** (optional, image/*, max 5MB)
- **Content editor** (required): rich text with links
- **Link insert**: URL validation (`http://` or `https://`)
- **Excerpt** (optional)
- **Status**: Draft / Publish

### Editor options
- Bold, italic, headings, bullets, quote
- Link add/remove
- Paste sanitization

### Slug generation
- Auto-generate from title (`my-first-post`), allow manual override, unique per store.

## API contract (for "pull into their website")

### List posts
`GET /api/public/blog?storeSlug=<slug>&limit=20&cursor=<optional>`

Returns:
```json
{
  "items": [
    {
      "title": "...",
      "slug": "...",
      "excerpt": "...",
      "coverImageUrl": "...",
      "publishedAt": "2026-05-12T10:00:00.000Z"
    }
  ],
  "nextCursor": "..."
}
```

### Get single post
`GET /api/public/blog/:postSlug?storeSlug=<slug>`

Returns post body (`contentHtml`) for rendering.

## Public page behavior

- `/s/:storeSlug/blog`: list page with title, image, excerpt, date.
- `/s/:storeSlug/blog/:postSlug`: full post page.
- SEO basics:
  - `<title>` and meta description from post.
  - Open Graph image from `coverImageUrl`.
  - Canonical URL.

## Content safety

- Sanitize rich HTML on write (server-side) and on render (defense in depth).
- Allowlist tags/attributes (`a[href]`, `p`, `h1-h4`, `ul`, `ol`, `li`, `strong`, `em`, `blockquote`, `img[src|alt]` if needed).
- Add `rel="noopener noreferrer"` on external links.

## Rollout plan

1. Add collections + indexes + rules.
2. Build store Blog admin page (create/edit/list/publish).
3. Add public projection writer (on publish/update/unpublish).
4. Build public routes.
5. Expose public API endpoints for website pull.
6. Add docs and optional webhook for push sync.

## Future enhancement (recommended)

- RSS feed per store: `/api/public/blog/rss?storeSlug=...`
- Category/tag filtering
- Scheduled publishing
- Import from Markdown
