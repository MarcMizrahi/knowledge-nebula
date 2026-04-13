# Production Deployment Design — Knowledge Nebula

**Date:** 2026-04-13  
**Status:** Approved  
**Goal:** Deploy Knowledge Nebula to a real, publicly accessible URL with permanent data persistence at zero cost.

---

## Context

Knowledge Nebula is a self-hosted, AI-powered personal knowledge base (FastAPI backend + Next.js frontend) currently running locally via Docker Compose. The goal is to move it to a cloud VM so it is always accessible, with no data loss, at no recurring cost.

**Constraints:**
- Free hosting only
- Cloud-only (no home hardware)
- Data must persist permanently (ChromaDB + SQLite)
- Personal use only (no multi-user auth required)
- No code changes to application logic

---

## Section 1 — Infrastructure

### VM
- **Provider:** Oracle Cloud Always Free
- **Shape:** Ampere A1 (ARM64) — 1 OCPU, 6GB RAM
- **OS:** Ubuntu 22.04 LTS
- **Always-free allocation:** 4 OCPUs / 24GB RAM total — this config leaves headroom for future scaling

### Networking
- Oracle assigns a free static **public IP** to the VM
- **DuckDNS** free subdomain (e.g. `myknowledge.duckdns.org`) points to that IP via A record
- **Nginx** runs on the VM as a reverse proxy:
  - `https://myknowledge.duckdns.org` → frontend container (port 3000)
  - `https://myknowledge.duckdns.org/api` → backend container (port 8000)
- **Certbot + Let's Encrypt** issues and auto-renews the HTTPS certificate

### Storage
- Oracle 200GB block volume mounted at `/data` on the VM
- Docker volume remapped: `/data/nebula-storage:/app/storage`
- ChromaDB, SQLite (`nebula.db`), and uploaded files all persist on the block volume
- Survives container restarts, redeploys, and VM reboots

---

## Section 2 — Deployment & Operations

### Deploy Workflow
No CI/CD pipeline. Manual deploy via SSH:
```bash
ssh ubuntu@myknowledge.duckdns.org
cd ~/knowledge-nebula
git pull
docker compose up -d --build
```

### Process Management
- `restart: unless-stopped` already set in `docker-compose.yml`
- Both containers auto-restart on crash or VM reboot
- No systemd units needed

### OS Maintenance
- `unattended-upgrades` cron handles security patches automatically

### Secrets
- `ANTHROPIC_API_KEY` lives in `backend/.env` on the VM disk only
- Never committed to git

### Backups
- Daily cron job on the VM tarballs `/data/nebula-storage`
- Uploads to Oracle Object Storage (free 10GB bucket)
- Retains last 7 days of backups
- Protects against block volume failure

### Access Control
- App is reachable at the DuckDNS URL — obscurity is sufficient for personal use
- Optional: add Nginx HTTP Basic Auth in 5 minutes if lockdown is ever needed

---

## Section 3 — Production Config Changes

### Files changed in repo

| File | Change |
|---|---|
| `docker-compose.yml` | Remap volume: `./backend/storage` → `/data/nebula-storage` |
| `backend/.env` (VM only, not committed) | Set `CORS_ORIGINS` to DuckDNS URL |
| `nginx/knowledge-nebula.conf` | New — Nginx reverse proxy + HTTPS redirect config |
| `scripts/backup.sh` | New — daily backup to Oracle Object Storage |
| `backend/.dockerignore` | Already done |

### No application code changes
- `backend/main.py`, routers, services — untouched
- `frontend/` — untouched (already production-ready with standalone Next.js build)
- Both Dockerfiles — untouched

### `docker-compose.yml` volume change
```yaml
# Before
- ./backend/storage:/app/storage

# After
- /data/nebula-storage:/app/storage
```

### `backend/.env` on VM
```
ANTHROPIC_API_KEY=<your-key>
CORS_ORIGINS=["https://myknowledge.duckdns.org"]
```

---

## Implementation Steps (high level)

1. Create Oracle Cloud Always Free account and provision Ampere A1 VM
2. Attach and mount 200GB block volume at `/data`
3. Install Docker, Docker Compose, Nginx, Certbot on VM
4. Register DuckDNS subdomain, point A record to VM public IP
5. Add `nginx/knowledge-nebula.conf` to repo and configure on VM
6. Add `scripts/backup.sh` to repo, set up cron on VM
7. Update `docker-compose.yml` volume path
8. Clone repo on VM, create `backend/.env`, run `docker compose up -d --build`
9. Run Certbot to issue HTTPS certificate
10. Verify app is live at `https://myknowledge.duckdns.org`
11. Verify backup cron runs successfully
