# rustfs-storage - S3-Compatible Object Storage on VPS (Coolify or similar)

Single RustFS instance as S3-compatible object storage for multiple apps, hosted on your own VPS.

**Replace `example.com` / `storage.example.com` with your domain (e.g. `breaking-bad.com` / `storage.breaking-bad.com`).**

---

## 1. Run RustFS

### Option A: Standalone Docker Compose (same host)

On the VPS:

```bash
# Load env: copy .env.example to .env and set all four vars (deploy fails if any is missing)
cp .env.example .env
nano .env

# Run (reads .env automatically)
docker compose up -d

# Check
docker compose ps
docker compose logs -f rustfs
```

- **Port 9000**: S3 API (objects, buckets).
- **Port 9001**: Web console (manage buckets/users).

The compose file uses a named volume `rustfs-data`; no host directory or `chown` is needed.

**Loading env:** Set variables in a `.env` file (copy from `.env.example`) or export them before `docker compose up`. All four vars in the compose are required (`:?`); if any is missing, deploy fails.

### Option B: Add as application in Coolify

1. **New resource** → **Docker Compose** (e.g. from a repo that contains the compose file, or “Raw”/paste).
2. **Docker Compose file**: use `docker-compose.yml` (paste or point to it).
3. **Environment variables**: set in Coolify’s env UI before deploy. All of these are required (compose uses `:?`; deploy fails if any is missing):
   - `RUSTFS_ACCESS_KEY` (e.g. `rustfsadmin`)
   - `RUSTFS_SECRET_KEY`
   - `RUSTFS_CONSOLE_ENABLE` (e.g. `true`)
   - `RUSTFS_SERVER_DOMAINS` (e.g. `storage.breaking-bad.com`)
4. Deploy. Coolify will create the stack and its network; you’ll attach the domain in the next step.

---

## 2. DNS

Add an **A** record so the storage host points to your VPS:

| Type | Name    | Value       | TTL |
| ---- | ------- | ----------- | --- |
| A    | storage | YOUR_VPS_IP | 300 |

So `storage.example.com` (or `storage.breaking-bad.com`) resolves to your server IP.

(Optional) For the **web console** on a separate hostname:

| Type | Name            | Value       | TTL |
| ---- | --------------- | ----------- | --- |
| A    | storage-console | YOUR_VPS_IP | 300 |

---

## 3. Reverse proxy and HTTPS in Coolify

Coolify’s proxy (Traefik) will terminate HTTPS and forward to RustFS.

### If RustFS is deployed **inside Coolify** (Option B)

1. Open the **RustFS** application in Coolify.
2. Go to the **Domains** (or **FQDN**) section.
3. Add domain:
   - **FQDN**: `https://storage.example.com` (use your domain).
   - **Port**: `9000` (container port for the S3 API). Coolify will send traffic to `rustfs:9000`; external users use `https://storage.example.com` (port 443).
4. Save. Coolify will request a Let’s Encrypt certificate and route `https://storage.example.com` → RustFS API.
5. (Optional) Add a second domain for the console, e.g. `https://storage-console.example.com` with port **9001**.

### If RustFS is **standalone** (Option A) on the same host

Coolify’s proxy usually only routes to containers it manages. Two approaches:

- **Recommended**: Add a **Proxy** (or “Redirect”) resource in Coolify that forwards `https://storage.example.com` to `http://127.0.0.1:9000` (see your Coolify version’s “Proxy” / “Redirect” docs for how to set upstream host/port).
- **Alternative**: Put RustFS behind Coolify by deploying it as a Docker Compose **stack** in Coolify (Option B) so the proxy can attach domains to the `rustfs` service by name and port 9000.

After configuration, test:

- `https://storage.example.com` — should respond (e.g. 403 or XML from S3 API).
- `https://storage-console.example.com` — web console (if configured).

---

## 4. Create buckets and (optional) users/keys (multi-app)

Each app can have its own bucket (e.g. `app1-assets`, `app2-assets`).

### Install MinIO Client (mc)

S3-compatible; works with RustFS. [Install mc](https://min.io/docs/minio/linux/reference/minio-mc.html).

```bash
# Linux (example)
curl -o mc https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/
```

### Alias and create buckets

Replace `storage.example.com`, `rustfsadmin`, and `ChangeMeStrongPassword123` with your domain and credentials.

```bash
# Alias (use your storage domain and HTTPS)
mc alias set rustfs https://storage.example.com rustfsadmin ChangeMeStrongPassword123

# Create one bucket per app
mc mb rustfs/app1-assets
mc mb rustfs/app2-assets
```

### (Optional) Per-app users/keys

For write access from apps, use the web console (Users / Access Keys) to create a user per app and assign policies to buckets, or use the same admin key for all (simpler, less secure). Docs: [RustFS IAM](https://docs.rustfs.com/administration/iam/).

---

## 5. Using as a Shared CDN

To make this storage serve as a CDN for public assets:

### Step 1: Public read for CDN buckets (anonymous GET)

To serve assets via URLs like `https://storage.example.com/app1-assets/path/to/file.jpg` without signed URLs:

1. **Web console**: Open `https://storage-console.example.com` (or `https://storage.example.com:9001` if not proxied). Log in with `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY`. For each bucket, set a **bucket policy** that allows public `GetObject` only (no `ListBucket` to avoid listing).

2. **Or via mc and policy file** — in this repo see `policy-public-read.json`. Replace `BUCKET_NAME` in that file with your bucket (e.g. `app1-assets`), then:

```bash
mc anonymous set-json policy-public-read.json rustfs/app1-assets
```

Repeat for each bucket (or use the console).

### Step 2: How apps use the CDN URL

- **Path-style** (default): bucket in the path.

  **URL pattern**: `https://storage.example.com/<bucket-name>/<object-key>`

  Examples:
  - `https://storage.example.com/app1-assets/images/logo.png`
  - `https://storage.example.com/app2-assets/fonts/main.woff2`

- **Upload** (from your app): use any S3-compatible SDK with:
  - **Endpoint**: `https://storage.example.com`
  - **Bucket**: e.g. `app1-assets`
  - **Access Key** / **Secret Key**: RustFS credentials (admin or per-app key)
  - **Path-style**: enable “path-style” or “virtual-host-style” according to SDK; for the URL above, path-style is used.

- **RUSTFS_SERVER_DOMAINS**: Set to `storage.example.com` (no port) so redirects and signatures use the correct host. Already set in the provided compose.

### Step 3: Cloudflare in front (Optional)

Use Cloudflare as a caching layer; RustFS is the origin.

1. **Add the site** in Cloudflare (DNS for `example.com`).
2. **Proxy the storage subdomain**:
   - Create or ensure **A** record: `storage` → `YOUR_VPS_IP`.
   - Set the record to **Proxied** (orange cloud). Traffic goes Cloudflare → your VPS.
3. **SSL/TLS**:
   - Mode: **Full (strict)** or **Full** (origin has Let’s Encrypt from Coolify).
4. **Caching**:
   - **Caching** → **Configuration**: set cache level (e.g. Standard).
   - **Page Rules** or **Cache Rules**: for `storage.example.com/*` you can set:
     - Cache eligibility, TTL (e.g. 1 day for static assets), and “Cache Everything” if you want all object GETs cached.
5. **Origin**:
   - Coolify already terminates HTTPS on the VPS; Cloudflare connects to `https://storage.example.com` (or to IP with correct Host header, depending on your setup). No change needed on RustFS.

Result: clients hit `https://storage.example.com/...` via Cloudflare; cache misses go to your VPS (Coolify → RustFS).

---

## 6. IAM and Security Policies

RustFS uses AWS-compatible IAM policies to control access. You can attach these to specific **Access Keys** via the Web Console (`:9001`) or the `mc` client.

### Common Policy Examples

#### A. Single Bucket Restricted Access

Gives a user full access (Read/Write/Delete) to **only one** bucket. Useful for per-app credentials.

- **File**: `policy-single-bucket.json`
- **Action**: Replace `YOUR_BUCKET_NAME` with your actual bucket name and apply to the user.

#### B. Global Read-Only Access

Allows a user to list and download objects from **all** buckets, but prevents any uploads/deletions.

- **File**: `policy-read-only.json`

#### C. Public Anonymous Read (CDN)

Allows anyone to download files via URL without an access key.

- **File**: `policy-public-read.json`
- **Apply to**: The **Bucket** itself (not a user) using the `mc anonymous` command:

```bash
mc anonymous set-json policy-public-read.json rustfs/my-public-bucket
```

### How to apply a User Policy (via Web Console)

1. Open the Web Console: `https://storage-console.example.com`.
2. Go to **IAM > Policies** and click **Create Policy**.
3. Paste the JSON from one of the example files.
4. Go to **IAM > Users**, select the user/access key, and click **Attached Policies**.
5. Add the policy you just created.

---

## Quick reference

| Item           | Value                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| RustFS API     | Port **9000**                                                                                                              |
| RustFS console | Port **9001**                                                                                                              |
| Image          | `rustfs/rustfs:latest`                                                                                                     |
| Docs           | [RustFS Docker](https://docs.rustfs.com/installation/docker), [S3 modes](https://docs.rustfs.com/integration/virtual.html) |
| Path-style URL | `https://storage.example.com/<bucket>/<key>`                                                                               |

**Compose file**: `docker-compose.yml`. **Env**: copy `.env.example` to `.env` and set all four variables (all required in compose); or set them in Coolify’s environment variables before deploy.
