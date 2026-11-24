# Deployment guide

> **Naming note.** The product is called Zipli, but internal identifiers (Docker Compose project, volumes like `shorturl_chdata`, the Postgres/ClickHouse database and user `shorturl`) keep the original name so existing data and volumes keep working. Commands in this guide use those real names.

This guide takes Zipli from a laptop to a public HTTPS site. It starts with the simplest option that is genuinely production-capable for a young product (one server, Docker Compose, automatic HTTPS), then describes how to grow.

> **Verification status.** The Compose stack, Nginx config and production override were validated locally (`docker compose config`, `nginx -t`, full local run). **Certificate issuance and a real internet-facing deployment have not been tested** because they need a public domain and server. Follow the "verify" steps below on your first deploy.

---

## 1. Where should I deploy it?

| Stage | Where | Choose it when |
|---|---|---|
| **1. Single VPS + Docker Compose** *(recommended start)* | One virtual server running the whole stack, Caddy for HTTPS | Launch, early traction, up to roughly a few million redirects a day (unproven, load-test first). Simplest and cheapest. |
| **2. Split services** | API + web on 2+ VMs behind a load balancer; Postgres, Redis, Kafka and ClickHouse as managed services | You need high availability, backups handled for you, or one box is no longer enough |
| **3. Kubernetes** | Managed Kubernetes (EKS / GKE / DOKS / …) | Many services, autoscaling, a platform team. Not needed early. |

**Recommendation: start at Stage 1.** The stateless API and the Compose layout make Stages 2 and 3 a migration, not a rewrite.

### Picking a provider and region

- **Region:** choose the one closest to your visitors. For Bangladesh that usually means **Singapore** (or Mumbai). Latency to the redirect matters more than anything else on this product.
- **Providers that fit Stage 1:** any VPS provider offering Ubuntu with root access and a public IPv4, for example Hetzner, DigitalOcean, Vultr, Linode/Akamai, or AWS Lightsail / EC2. Compare current prices yourself; they change.
- **Payment practicalities in Bangladesh:** most international providers need an internationally enabled card (some local banks offer dollar or virtual cards). If that is a blocker, a local hosting provider that accepts bKash/Nagad is a valid alternative, as long as it gives you a real VPS with Docker support, enough RAM (below), and decent upstream bandwidth. Check its location, since latency to your audience matters.
- **Domain:** buy a short domain. A `.xyz`, `.link` or country-code domain works; shorter is better for a shortener. Anything you point at the server needs an `A` record.

### Sizing (measured)

Idle memory of the whole stack on a development machine: **≈ 1.4 GB** (Kafka ≈ 780 MB, ClickHouse ≈ 400 MB, everything else < 50 MB each). Memory grows with traffic (ClickHouse merges, Redis cache up to its 256 MB cap).

| | Minimum | Comfortable |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | **4 GB** | 8 GB |
| Disk | 40 GB SSD | 80 GB+ |

Do not run this on a 1–2 GB server: Kafka and ClickHouse will be killed by the OOM killer. These figures are estimates from idle measurements, not a load test.

---

## 2. Prerequisites

- A server: Ubuntu 22.04/24.04, root or sudo access, public IPv4.
- A domain name you control.
- An SSH key pair.
- Ports **80** and **443** reachable from the internet (Let's Encrypt needs both).

---

## 3. Step-by-step: single VPS

### 3.1 Point DNS at the server

Create an `A` record: `sho.example.com → <server IPv4>` (use your domain). Wait until it resolves:

```bash
dig +short sho.example.com
```

If you use Cloudflare, set the record to **DNS only** (grey cloud) for the first deploy so the certificate can be issued. See §6 to enable proxying later.

### 3.2 Prepare the server

```bash
ssh root@<server-ip>

# Updates and a non-root user
apt update && apt -y upgrade
adduser deploy && usermod -aG sudo deploy

# Firewall: only SSH, HTTP, HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp          # HTTP/3
ufw --force enable

# Docker (official repository instructions: https://docs.docker.com/engine/install/ubuntu/)
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Then log in as `deploy`. Optionally disable password SSH login (`PasswordAuthentication no` in `/etc/ssh/sshd_config`).

> Docker-published ports bypass `ufw` rules. That is fine here because the production override publishes only Caddy's 80/443; Postgres, Redis, Kafka and ClickHouse publish nothing.

### 3.3 Get the code

```bash
sudo mkdir -p /opt/zipli && sudo chown deploy:deploy /opt/zipli
git clone <your-repo-url> /opt/zipli
cd /opt/zipli
```

### 3.4 Configure secrets

```bash
cp .env.example .env
nano .env
```

Set **strong, unique** values (generate with `openssl rand -hex 32`):

```dotenv
POSTGRES_PASSWORD=<random>
CLICKHOUSE_PASSWORD=<random>
JWT_SECRET=<random, at least 32 chars>
IP_SALT=<random>
# Optional "Continue with Google" (redirect URI: https://your.domain/api/auth/google/callback)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

DOMAIN=sho.example.com
BASE_URL=https://sho.example.com
```

`BASE_URL` must be your public https origin: it is used to build every short link. `chmod 600 .env`. Never commit it (it is git-ignored).

### 3.5 Start

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The first build takes several minutes. Make the long command short:

```bash
echo "alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'" >> ~/.bashrc
```

### 3.6 Verify

```bash
dc ps                                        # all services running / healthy
curl -s https://sho.example.com/readyz       # {"status":"ready"}
dc logs caddy | grep -i certificate          # certificate obtained
```

Then in a browser: open the site, register, create a link, open it, and check the analytics page shows the click within a few seconds. If you are scripting it, the `curl` examples in the README work against your domain.

Delete the local-only test accounts if you restored any data (they are documented in the README for development only).

---

## 4. Operations

### Logs and health

```bash
dc logs -f api            # structured JSON logs
dc logs -f nginx
curl -s https://sho.example.com/healthz   # includes events_sent / events_dropped
```

Point an uptime monitor (UptimeRobot, Better Stack, Uptime Kuma, …) at `/readyz`. Alert if `events_dropped` keeps rising; it means Kafka is unavailable or overloaded.

### Update and roll back

```bash
cd /opt/zipli
git pull
dc up -d --build           # rebuilds changed images, recreates changed containers

# Roll back
git checkout <previous-commit>
dc up -d --build
```

Database migrations are embedded in the API and applied at start under an advisory lock, so replicas can start together. Migrations are forward-only: take a backup before deploying a release that adds one.

After editing `deploy/nginx/nginx.conf`: `dc up -d --force-recreate nginx`.

### Scale the API

```bash
dc up -d --scale api=4
```

Nginx re-resolves the `api` hostname every few seconds, so new replicas join automatically. One server only helps until it runs out of CPU; beyond that, go to Stage 2.

### Backups

**Postgres is the source of truth** (users and links). Back it up daily and copy it off the server.

```bash
# backup
dc exec -T postgres pg_dump -U shorturl shorturl | gzip > /opt/backups/zipli-$(date +%F).sql.gz

# restore (into an empty database, e.g. after `dc down -v` and `dc up -d postgres`)
gunzip -c /opt/backups/zipli-2026-01-01.sql.gz | dc exec -T postgres psql -U shorturl shorturl
```

Cron example (`crontab -e` as `deploy`):

```cron
0 3 * * * cd /opt/zipli && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres pg_dump -U shorturl shorturl | gzip > /opt/backups/zipli-$(date +\%F).sql.gz && find /opt/backups -mtime +14 -delete
```

Copy `/opt/backups` off the machine (`rclone` to object storage, or provider snapshots). A backup on the same disk is not a backup.

**ClickHouse** holds click history. It can be partly rebuilt from Kafka only within Kafka's retention window (72 h by default), so for long-term history snapshot the volume (stop ClickHouse first for a consistent copy) or enable your provider's disk snapshots:

```bash
dc stop clickhouse
docker run --rm -v shorturl_chdata:/data -v /opt/backups:/backup alpine tar czf /backup/chdata-$(date +%F).tgz -C /data .
dc start clickhouse
```

**Redis** is a cache and needs no backup.

### Housekeeping: expired guest links

Guest links stop redirecting after 7 days but stay in Postgres. Clean them weekly:

```cron
0 4 * * 0 cd /opt/zipli && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres psql -U shorturl -c "DELETE FROM links WHERE user_id IS NULL AND expires_at < now();"
```

### Changing a user's plan (until billing exists)

```bash
dc exec postgres psql -U shorturl -c "UPDATE users SET plan='pro' WHERE email='user@example.com';"
```

---

## 5. Security checklist

- [ ] All four secrets in `.env` are random and unique; `.env` is `chmod 600` and not in git.
- [ ] Firewall allows only 22, 80, 443. Confirm: `sudo ss -tlnp` shows nothing else public.
- [ ] SSH uses keys only; root login disabled.
- [ ] `BASE_URL` is `https://…`.
- [ ] Automatic OS security updates enabled (`unattended-upgrades`).
- [ ] Off-server Postgres backups exist and you have tested a restore.
- [ ] Monitoring alerts on `/readyz` and on rising `events_dropped`.
- [ ] You understand the known limitations: the login token is stored in `localStorage` (XSS-exposed; move to httpOnly cookies before handling sensitive accounts), no email verification or password reset, and no malicious-URL screening on guest links. **A public shortener attracts phishing and spam.** Before opening guest shortening to the world, add abuse handling (a URL reputation check such as Google Safe Browsing, a report/takedown path, and stricter limits).
- [ ] Legal basics for your jurisdiction: terms of service, privacy policy (you store a hashed visitor id, referrer, user agent class and country), and an abuse contact.

---

## 6. Using a CDN (Cloudflare)

A CDN gives DDoS protection, edge caching of static assets, and **country detection** (`CF-IPCountry`, which the API already reads, so the geo analytics start working).

1. Deploy first with DNS-only (§3), confirm HTTPS works.
2. In Cloudflare, switch the record to **Proxied** (orange cloud) and set SSL/TLS mode to **Full (strict)**. The origin (Caddy) already presents a valid certificate.
3. Make the real visitor IP reach the app. Cloudflare connects from its own addresses, so tell Caddy to trust them and read `CF-Connecting-IP`. Edit `deploy/caddy/Caddyfile`:

   ```caddyfile
   {
   	servers {
   		trusted_proxies static <Cloudflare IP ranges from https://www.cloudflare.com/ips/>
   		client_ip_headers CF-Connecting-IP
   	}
   }

   {$DOMAIN} {
   	encode zstd gzip
   	reverse_proxy nginx:80
   }
   ```

   Then `dc restart caddy`. **This Cloudflare configuration has not been tested here**; verify by creating a click from your own connection and checking that rate limiting and unique-visitor counts behave per visitor, not per Cloudflare node.
4. Add a Cloudflare cache rule for `/_next/static/*` (the app already sends `Cache-Control: public, max-age=31536000, immutable`). **Do not cache short-code redirects** at the CDN: a cached redirect never reaches the API and the click would not be counted.

Without Cloudflare, country is shown as "unknown". Alternatives are another CDN that adds a country header (send it as `X-Geo-Country`) or adding a GeoIP database lookup in the API's event worker.

---

## 7. Growing beyond one server (Stage 2)

Move the stateful parts to managed services first, and keep running the stateless API and web containers on one or more VMs behind a load balancer.

| Component | Managed options | Notes |
|---|---|---|
| Postgres | Your cloud's managed Postgres, Neon, Supabase | Set `DATABASE_URL` with `sslmode=require`. Easiest and highest-value first move (backups, failover). |
| Redis | Managed Redis/Valkey | **Code change needed:** `REDIS_ADDR` supports only `host:port`; there is no password or TLS option yet. |
| Kafka | Redpanda Cloud, Confluent Cloud, AWS MSK, Aiven | **Code change needed:** the producer and the ClickHouse Kafka table use plaintext without SASL/TLS. Both `api/internal/events/events.go` and `deploy/clickhouse/init.sql` need credentials. |
| ClickHouse | ClickHouse Cloud, Aiven | Works over HTTPS with `CLICKHOUSE_URL=https://…`. Kafka ingestion then needs ClickPipes or a consumer service instead of the Kafka table engine. |

Also at this stage: run 2+ API replicas on separate machines, put a cloud load balancer in front, and replace Caddy with the provider's TLS termination.

The Kafka and Redis credential support is the main engineering work required to go managed; budget for it.

---

## 8. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Browser shows a certificate error / Caddy loops | DNS not pointing at the server yet, ports 80/443 blocked, or Cloudflare proxy on during first issuance. Check `dc logs caddy`. |
| `502 Bad Gateway` | `api` or `web` not running yet. `dc ps`, then `dc logs api web`. Nginx resolves upstreams lazily, so it recovers on its own once they are up. |
| Services killed / restarting | Out of memory. Check `free -h` and `dmesg | grep -i oom`; use a bigger server. |
| Dashboard works but stats stay at 0 | Analytics lane: `curl /healthz` (is `events_sent` rising?), `dc logs kafka clickhouse`, and `dc exec clickhouse clickhouse-client --user shorturl --password '<pw>' -q "SELECT count() FROM shorturl.clicks"`. |
| All users share one rate limit / one IP in logs | Proxy chain not passing the client IP. Ensure traffic goes through Caddy (not straight to Nginx) and see §6 for Cloudflare. |
| Created links show `http://localhost:8088/…` | `BASE_URL` not set in `.env`; set it and `dc up -d api`. |
| API crash-loops with `JWT_SECRET is required` | Missing or shorter than 16 characters in `.env`. |
| `docker compose` complains `set in .env` | A required variable (`POSTGRES_PASSWORD`, `CLICKHOUSE_PASSWORD`, `JWT_SECRET`, `DOMAIN`) is missing. |

---

## 9. Pre-launch checklist

- [ ] Load test the redirect path (k6) on the actual server size and record the real numbers.
- [ ] Back up and test a restore.
- [ ] Abuse handling for guest links in place or guest shortening limited/disabled.
- [ ] Billing decision made (bKash / Nagad / SSLCommerz) or paid plans clearly labelled "coming soon" (the pricing page already says so).
- [ ] Pricing page matches what the backend enforces (see "Known limitations" in the README).
- [ ] Terms, privacy policy and abuse contact published.
- [ ] If you ship the CLI: default server changed to your domain, release published (see §10).

---

## 10. Publishing the CLI (`zipli`)

The CLI (`api/cmd/zipli`, see the README) works for anyone once the service is live. Releasing it is mostly a hosting question; the binary is the easy part.

### Before you release

1. **Deploy the service first** (§3). The CLI's default server is `http://localhost:8088`, so until you change it, it only works on your own machine. Set `defaultServer` in `api/cmd/zipli/main.go` to your public URL (users can still override it with `-server` or `ZIPLI_SERVER`).
2. **Close the abuse gap on guest links.** The CLI makes anonymous shortening trivial to script. The Nginx guest limit (10 requests/min per IP) only slows abuse down; there is no phishing/malware screening yet, and abused short domains get blocklisted quickly. Treat this as a launch blocker.
3. **Put the CLI source in a public repository.** Only the CLI needs to be public; it can live in its own repo.

### How to distribute it

| Method | What users type | What you need |
|---|---|---|
| **GitHub Releases** (start here) | download the binary for their OS | Tag a version and attach the binaries `scripts/build-cli.sh` produces, plus a checksums file. GoReleaser automates this on every tag. |
| **Install script** | `curl -fsSL https://your.domain/install.sh \| sh` | A small script that detects OS/CPU and downloads the matching release binary. |
| **Homebrew** (macOS/Linux) | `brew install you/tap/zipli` | A tap repository with a formula (GoReleaser can generate and update it). |
| **Scoop / winget** (Windows) | `scoop install zipli` | A manifest pointing at the release `.exe`. |
| **`go install`** | `go install github.com/you/zipli@latest` | The CLI in its own Go module with a real module path (the current module is named `shorturl`). Only useful for Go developers. |
| **npm / pip wrapper** | `npx zipli ...` | Optional, more work. |

Recommended path: GitHub Releases + GoReleaser + a Homebrew tap + `install.sh`. Also sign the binaries, and notarize the macOS ones if you want to avoid Gatekeeper warnings.

### Known CLI gaps to fix before a public release

- Google-only accounts have no password, so `zipli login` does not work for them. Add a browser-based login or API tokens in the dashboard.
- No `list` / `stats` commands yet.
- Update the README install section to show the public install commands.

Users must **quote URLs** containing `&` (`zipli 'https://...?a=1&b=2'`); that is shell behaviour, not something the CLI can fix.
