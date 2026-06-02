# Architecture

This MVP is organized around a service-layer publishing pipeline:

1. Express routes/controllers handle HTTP, sessions, CSRF, form validation, and EJS rendering.
2. Models own PostgreSQL access and keep token encryption out of controllers.
3. Media services own local storage paths, FFmpeg probing, thumbnail creation, and future S3/R2 swaps.
4. Platform adapters implement a shared publishing contract: validate, refresh token, publish, normalize API errors.
5. BullMQ owns scheduling, retries, and rate-limited worker execution.
6. Webhook routes are present for later analytics, publishing callbacks, comments, and engagement sync.

## Platform extension

Add a new platform by creating `services/platforms/{platform}Service.js`, exporting an adapter with:

- `validateContent({ post, media, account })`
- `refreshToken(account)`
- `publish({ account, post, media, target })`
- `normalizeError(error)`

Then register it in `services/platforms/platformRegistry.js` and add the platform to the database enum or migrate to a lookup table when external platform count grows.

## Publishing flow

1. User uploads media.
2. FFmpeg extracts metadata and a thumbnail.
3. User selects connected accounts and immediate or scheduled publishing.
4. `posts` and `post_platforms` rows are created in one transaction.
5. BullMQ enqueues the job immediately or with delay.
6. Worker publishes each target through the registry adapter.
7. Success/failure, raw API response, failed payload, retry count, and logs are persisted.

## Storage

Local storage is intentionally wrapped behind `services/storage/localStorageService.js`. Instagram already uses a public media URL abstraction because Meta Graph API cannot publish private local files. S3 or Cloudflare R2 can replace this by adding a storage service with the same URL contract.

## Security

- Passport session auth with PostgreSQL-backed sessions.
- Bcrypt password hashing.
- AES-256-GCM token encryption at rest.
- CSRF protection for browser routes.
- Helmet headers and rate limiting.
- Multer MIME and size validation.
- Access and refresh tokens are never rendered to EJS.
