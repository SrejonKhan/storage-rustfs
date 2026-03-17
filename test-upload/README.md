# RustFS S3 upload test

Minimal Express + TypeScript app with a static frontend to test S3-compatible uploads to RustFS.

## Setup

```bash
cp .env.example .env
# Edit .env: set S3_ACCESS_KEY, S3_SECRET_KEY; create bucket "test-uploads" in RustFS if needed.

npm install
```

## Run

```bash
npm run dev
```

Open http://localhost:3000, choose a file, set an object key (e.g. `images/photo.jpg`), and click Upload. The response shows a link to the object (path-style URL).

## "Open file" shows Access Denied?

The demo defaults to the **public-upload/** prefix so only that "folder" needs to be public. Apply a prefix-scoped policy (don’t make the whole bucket public):

1. In the repo root, open `policy-public-read-prefix.json` and replace `BUCKET_NAME` with your bucket (e.g. `test-uploads`). It allows public read only for `public-upload/*`.
2. Using the MinIO client: `mc anonymous set-json policy-public-read-prefix.json rustfs/your-bucket-name` (with `rustfs` as your `mc alias`).
3. Or in RustFS web console (port 9001): set a bucket policy that allows public `s3:GetObject` only for `arn:aws:s3:::bucket-name/public-upload/*` (no `s3:ListBucket`).

## Env

| Variable         | Description |
|------------------|-------------|
| S3_ENDPOINT      | RustFS API URL (e.g. http://194.233.65.126:9000) |
| S3_ACCESS_KEY    | RustFS access key |
| S3_SECRET_KEY    | RustFS secret key |
| S3_BUCKET        | Bucket name (create it in RustFS console first) |
| S3_PUBLIC_URL    | Base URL for the "Open file" link (defaults to S3_ENDPOINT) |
| PORT             | Server port (default 3000) |
