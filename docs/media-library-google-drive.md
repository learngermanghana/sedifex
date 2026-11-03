# Sedifex Media Library and Google Drive photo import

The Media Library at /media-library also displays original promo gallery and existing album images as reusable pictures. Picking them does not re-upload or duplicate the file. It is a store-scoped way to bulk import new photos
from a device or Google Drive. It reuses the current /api/uploads endpoint and
Google Cloud Storage bucket, so there is no new always-on worker or storage provider.

## User flow

1. Open **Media Library** and select the current Sedifex store.
2. Upload up to **100 JPEG, PNG, WebP or AVIF pictures** (25 MB source maximum each)
   or choose **Import from Google Drive**.
3. For Google Drive, authorize your free Google account, browse to your photo folder
   and multi-select individual pictures. Folder-wide continuous synchronization
   is *not* enabled; Google Picker shares only selected files with Sedifex.
4. The browser downloads selected Drive photos, resizes them to a maximum
   1920 px dimension, encodes WebP when it is smaller, then uploads them to
   existing Sedifex storage, up to 3 concurrent uploads with retry on transient
   errors. There is a per-image progress/error list and a Retry failed button.
5. A SHA-256 of the optimized image is saved as the media asset ID. Re-importing
   identical images to the same store skips duplicates.
6. Choose an existing gallery album and click **Add to album** to publish it in
   the existing website gallery feed. Or open a product and choose **Choose from
   Media Library** for its product images. Other pages may paste the published URL.

Imported media is *not* automatically published to a website or album. Stored
image URLs are publicly fetchable and should never contain private documents.

## Editing existing albums

From **Media Library**, select an existing gallery album and choose **Edit album**.
Changes are saved to the same store-scoped records that the original Gallery
settings page uses.

- Rename the album, update the description, publish or hide it, and select a
  cover from the album's published pictures. Save with **Save album changes**.
- In **Pictures in this album**, edit a photo's alt text, caption and published
  flag, move it earlier or later, or remove it from the album.
- Removing a picture affects only the gallery reference. The original media
  file stays in the Media Library and can be reused on another album or product.
- Removing or hiding a cover photo automatically chooses the next published
  photo as the cover, or clears it when none remain.
- Use **Add more from Media Library** to select and publish more photos to
  the chosen album, then the editor refreshes the album's photo list.

The galleryAlbums.isPublished and galleryImages.isPublished flags should be
respected by connected websites when rendering public galleries. The existing
/v1IntegrationProducts endpoint continues to expose product image URLs when
those images have been assigned to a product. The authenticated /integrationGallery Cloud Function returns grouped published
albums and a flat photo list for website integrations. Connected websites must
fetch it server-side with a per-store integration key and the canonical contract
header. Updates appear when the site's own cache refreshes (the example uses
120-second revalidation). Existing public promo pages use `/integrationGallery?slug=...` and published Sedifex websites use `?siteSlug=...`; both serve only published pictures without exposing an integration key in browser code. The original `promoGallery` records remain usable alongside new named albums.

## One-time Google Cloud setup for Sedifex (not per store)

Use a Google Cloud project that Sedifex controls.

1. Enable **Google Drive API** and **Google Picker API**.
2. Configure the OAuth consent screen (external users if needed), verified
   application details and authorized domains.
3. Create an **OAuth 2.0 Web application client ID** with permitted JavaScript
   origins, including https://www.sedifex.com and approved local development
   origins. Test users may need to be added while the app is in testing mode.
4. Create an API key for Google Picker. Restrict by website referrers / hosts
   and the relevant APIs. Find the *numeric* Google Cloud project number.
5. Set these **build-time variables** in the Vercel project and redeploy:
   - VITE_GOOGLE_CLIENT_ID
   - VITE_GOOGLE_PICKER_API_KEY
   - VITE_GOOGLE_CLOUD_PROJECT_NUMBER
6. Verify imported images in Media Library, product edits and gallery website
   endpoints. Test authorization cancellation and Google token expiry.

No store needs Google Workspace or its own API key. Sedifex requests only the
https://www.googleapis.com/auth/drive.file scope in the Google Picker user
session. It does not store Google access/refresh tokens in Firestore or on the
Sedifex backend.

## Firebase deployment and access rules

Deploy the updated firestore.rules together with the application. The
stores/{storeId}/mediaAssets records require membership in that store, and the
legacy generic store subcollection fallback explicitly excludes mediaAssets.

Verify that the existing /api/uploads Vercel function is deployed and points to
the intended IMAGE_UPLOAD_BUCKET (or FIREBASE_STORAGE_BUCKET). New media uploads
still obey the existing **5 MB per request** upload limit after client-side
optimization. Media Library uploads and deletions under stores/{storeId}/media/ now require
a valid Firebase ID token and verified team membership for that store. Older
non-media upload paths retain their legacy behavior pending broader hardening.

## Costs and limits

- No background synchronization, watchers, schedulers or added always-on servers.
- Google Picker/Drive API access is initiated by the user.
- Sedifex's existing Cloud Storage bucket stores the optimized image copy.
- Storage, outbound image traffic, API invocations and Firestore reads/writes may
  have usage-based costs. Set cloud billing alerts and monitor especially as
  stores and image inventories grow.
- The media grid currently loads the latest 200 assets, and pickers load 100.
  Add pagination for large stores before scaling substantially.

## Follow-up hardening

The existing general-purpose /api/uploads route predates this feature. Its
legacy non-media paths still need Firebase ID-token verification and store-scoped
write/delete authorization. The new Media Library path is already protected;
finish the wider upload-route hardening with migration tests for older clients.
Also consider authenticated signed URLs instead of public URLs for any private
media; this Media Library is for public website assets only.

A future iteration can add user-selected folder sync through a separately
reviewed Drive authorization flow, scheduled incremental imports, and verified
reference counts for safe removal of images that are already used by products
or website galleries.
