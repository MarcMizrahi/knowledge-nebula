# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Knowledge Nebula to a permanent, HTTPS-secured URL on Oracle Cloud Always Free with persistent storage and daily backups.

**Architecture:** One Ampere A1 ARM VM runs both Docker containers (frontend + backend) behind Nginx. A 50GB block volume mounted at `/data` holds all ChromaDB, SQLite, and uploaded file data. DuckDNS provides the free subdomain; Certbot issues the HTTPS certificate.

**Tech Stack:** Oracle Cloud (ARM VM + Block Storage + Object Storage), Docker Compose, Nginx, Certbot/Let's Encrypt, DuckDNS, OCI CLI (for backups)

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `frontend/Dockerfile` | Accept `NEXT_PUBLIC_API_URL` as build arg |
| Modify | `docker-compose.yml` | Persistent volume path + build arg for API URL |
| Create | `nginx/knowledge-nebula.conf` | Reverse proxy: frontend + backend + SSE support |
| Create | `scripts/backup.sh` | Daily backup to Oracle Object Storage |

> **Note:** Tasks 1–4 are code changes committed to the repo. Tasks 5–12 are one-time server setup steps performed via SSH. No application logic is changed.

---

## Task 1: Fix NEXT_PUBLIC_API_URL build-time injection in the frontend Dockerfile

`NEXT_PUBLIC_*` vars in Next.js are replaced at build time, not runtime. The current Dockerfile runs `npm run build` without the variable — so in production the frontend would call `http://localhost:8000` (wrong). This task fixes that by adding a build arg.

**Files:**
- Modify: `frontend/Dockerfile`

- [ ] **Step 1: Add ARG and ENV before the build stage in `frontend/Dockerfile`**

Open `frontend/Dockerfile`. Replace:
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
```

With:
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build
```

- [ ] **Step 2: Verify the Dockerfile still builds locally**

```bash
cd /Users/marcmizrahi/Documents/GitHub/knowledge-nebula
docker build --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 -t nebula-frontend-test ./frontend
```

Expected: image builds successfully, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/Dockerfile
git commit -m "fix: accept NEXT_PUBLIC_API_URL as build arg for production"
```

---

## Task 2: Update docker-compose.yml for production

Two changes: (1) pass `NEXT_PUBLIC_API_URL` as a build arg so it's baked into the frontend image, and (2) remap the backend storage volume to the persistent block volume path.

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Update `docker-compose.yml`**

Replace the entire file content with:

```yaml
version: "3.9"

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    env_file:
      - ./backend/.env
    volumes:
      - /data/nebula-storage:/app/storage
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:8000}
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - backend
    restart: unless-stopped
```

> **Local dev note:** When running locally, the block volume `/data/nebula-storage` won't exist. For local development, temporarily revert the volume line to `./backend/storage:/app/storage`. On the production VM, `/data/nebula-storage` will exist.

- [ ] **Step 2: Verify the compose file is valid**

```bash
cd /Users/marcmizrahi/Documents/GitHub/knowledge-nebula
docker compose config
```

Expected: prints the resolved config with no errors.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: configure production volume path and API URL build arg"
```

---

## Task 3: Create the Nginx reverse proxy config

Nginx sits in front of both containers. It redirects HTTP → HTTPS, proxies `/` to the frontend (port 3000), and proxies `/api/` to the backend (port 8000). The `/api/` → backend proxy strips the `/api` prefix so the backend receives clean paths (e.g. `/api/documents/` becomes `/documents/`). SSE (streaming chat) requires `proxy_buffering off`.

**Files:**
- Create: `nginx/knowledge-nebula.conf`

- [ ] **Step 1: Create the `nginx/` directory and config file**

Create `nginx/knowledge-nebula.conf` with this content (replace `myknowledge.duckdns.org` with your actual DuckDNS subdomain in Task 8):

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

# HTTPS — main config
server {
    listen 443 ssl;
    server_name myknowledge.duckdns.org;

    ssl_certificate     /etc/letsencrypt/live/myknowledge.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myknowledge.duckdns.org/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Frontend (Next.js)
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API — strip /api prefix before forwarding
    location /api/ {
        proxy_pass         http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Required for SSE streaming (chat endpoint)
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 300s;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add nginx/knowledge-nebula.conf
git commit -m "feat: add nginx reverse proxy config with HTTPS and SSE support"
```

---

## Task 4: Create the backup script

A daily cron job on the VM tarballs `/data/nebula-storage` and uploads it to an Oracle Object Storage bucket using the OCI CLI. The script keeps only the last 7 backups.

**Files:**
- Create: `scripts/backup.sh`

- [ ] **Step 1: Create `scripts/backup.sh`**

```bash
#!/bin/bash
# Daily backup of Knowledge Nebula storage to Oracle Object Storage
# Retains last 7 backups. Requires OCI CLI configured on the VM.
set -euo pipefail

BUCKET="nebula-backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="nebula-backup-${DATE}.tar.gz"
TMP_DIR="/tmp/nebula-backups"

mkdir -p "$TMP_DIR"

echo "[backup] Creating archive ${BACKUP_NAME}..."
tar -czf "${TMP_DIR}/${BACKUP_NAME}" -C /data nebula-storage

echo "[backup] Uploading to Object Storage bucket '${BUCKET}'..."
oci os object put \
  --bucket-name "$BUCKET" \
  --file "${TMP_DIR}/${BACKUP_NAME}" \
  --name "$BACKUP_NAME" \
  --force

rm "${TMP_DIR}/${BACKUP_NAME}"
echo "[backup] Upload complete."

# Prune: delete all but the 7 most recent backups
echo "[backup] Pruning old backups (keeping last 7)..."
oci os object list \
  --bucket-name "$BUCKET" \
  --all \
  --query 'sort_by(data, &"time-created")[*].name' \
  --raw-output 2>/dev/null \
  | python3 -c "
import sys, json
names = json.load(sys.stdin)
to_delete = names[:-7] if len(names) > 7 else []
for n in to_delete:
    print(n)
" | while read -r obj; do
    echo "[backup] Deleting old backup: ${obj}"
    oci os object delete --bucket-name "$BUCKET" --object-name "$obj" --force
  done

echo "[backup] Done."
```

- [ ] **Step 2: Make it executable and commit**

```bash
chmod +x scripts/backup.sh
git add scripts/backup.sh
git commit -m "feat: add daily backup script for Oracle Object Storage"
```

---

## Task 5: Create Oracle Cloud Always Free account and provision VM

> This is a one-time manual step in the Oracle Cloud web console.

- [ ] **Step 1: Sign up for Oracle Cloud**

Go to `cloud.oracle.com` → click "Start for free". Fill in your details. A credit card is required for identity verification — you will NOT be charged for always-free resources.

> **Tip:** Use a real credit card. Prepaid/virtual cards are often rejected. If your signup is rejected, try again with a different browser or contact Oracle support.

- [ ] **Step 2: Create a compute instance**

In the Oracle Cloud Console:
1. Go to **Compute → Instances → Create Instance**
2. Name: `knowledge-nebula`
3. Image: **Ubuntu 22.04** (Minimal)
4. Shape: Click "Change shape" → **Ampere** → `VM.Standard.A1.Flex`
   - Set **OCPUs: 1**, **Memory: 6 GB**
5. Under "Add SSH keys" — generate a new key pair, download the private key (`.key` file). Save it somewhere safe (e.g. `~/.ssh/oracle-nebula.key`)
6. Click **Create**

Wait ~2 minutes for the instance to reach "Running" state.

- [ ] **Step 3: Note the public IP**

On the instance detail page, copy the **Public IP address** — you'll need it for DuckDNS and SSH.

- [ ] **Step 4: Open firewall ports in Oracle's security list**

In the Console:
1. Go to **Networking → Virtual Cloud Networks → your VCN → Security Lists → Default Security List**
2. Click **Add Ingress Rules**, add these two rules:
   - Source CIDR: `0.0.0.0/0`, Protocol: TCP, Destination Port: `80`
   - Source CIDR: `0.0.0.0/0`, Protocol: TCP, Destination Port: `443`

- [ ] **Step 5: SSH into the VM**

```bash
chmod 400 ~/.ssh/oracle-nebula.key
ssh -i ~/.ssh/oracle-nebula.key ubuntu@<YOUR_VM_PUBLIC_IP>
```

Expected: you are now inside the VM as `ubuntu`.

- [ ] **Step 6: Open ports in Ubuntu's firewall**

Oracle VMs have a second firewall layer (iptables/ufw) that blocks everything by default:

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Expected: `Firewall is active and enabled on system startup`

---

## Task 6: Attach and mount the block volume

> Performed via Oracle Console + SSH.

- [ ] **Step 1: Create a block volume**

In the Oracle Console:
1. Go to **Storage → Block Storage → Block Volumes → Create Block Volume**
2. Name: `nebula-storage`
3. Size: **50 GB**
4. Availability domain: **same as your VM**
5. Click **Create Block Volume**

Wait until status is "Available".

- [ ] **Step 2: Attach the volume to your VM**

1. On the block volume detail page, click **Attach to Instance**
2. Select your `knowledge-nebula` instance
3. Attachment type: **Paravirtualized**
4. Click **Attach**

Wait until status is "Attached". Then click the three-dot menu → **iSCSI Commands & Information** — note the **attach commands**.

- [ ] **Step 3: Format and mount the volume on the VM**

SSH into the VM. Find the new disk (it will appear as `/dev/sdb` or `/dev/vdb`):

```bash
lsblk
```

Expected: you'll see a new disk ~50GB, e.g. `/dev/sdb` with no partitions.

Format it (do this ONCE — only on a fresh volume):
```bash
sudo mkfs.ext4 /dev/sdb
```

Create the mount point and mount it:
```bash
sudo mkdir -p /data
sudo mount /dev/sdb /data
```

Make it persist across reboots:
```bash
echo '/dev/sdb /data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
```

Create the nebula storage directory:
```bash
sudo mkdir -p /data/nebula-storage
sudo chown ubuntu:ubuntu /data/nebula-storage
```

Verify:
```bash
df -h /data
```

Expected: shows ~50GB mounted at `/data`.

---

## Task 7: Install Docker, Nginx, and Certbot on the VM

> SSH into the VM for all steps.

- [ ] **Step 1: Install Docker**

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Add yourself to the docker group so you don't need sudo:
```bash
sudo usermod -aG docker ubuntu
newgrp docker
```

Verify:
```bash
docker --version && docker compose version
```

Expected: prints Docker version (29+) and compose version (2+).

- [ ] **Step 2: Install Nginx and Certbot**

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Verify:
```bash
nginx -v
certbot --version
```

Expected: both print version numbers.

- [ ] **Step 3: Enable unattended security upgrades**

```bash
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

Select "Yes" when prompted.

---

## Task 8: Set up DuckDNS subdomain

- [ ] **Step 1: Register a DuckDNS account and create a subdomain**

1. Go to `duckdns.org` → log in with Google/GitHub
2. In the "domains" section, enter a subdomain name (e.g. `myknowledge`) and click **add domain**
3. In the IP field, enter your **Oracle VM public IP**
4. Click **update ip**

Your subdomain is now `myknowledge.duckdns.org` → points to your VM.

- [ ] **Step 2: Verify DNS resolves**

From your local machine:
```bash
nslookup myknowledge.duckdns.org
```

Expected: returns your Oracle VM public IP. (May take up to 2 minutes to propagate.)

- [ ] **Step 3: (Optional) Set up DuckDNS auto-update on the VM**

If your VM's IP ever changes (rare on Oracle), this cron keeps it updated:

```bash
mkdir -p ~/duckdns
cat > ~/duckdns/duck.sh << 'EOF'
#!/bin/bash
echo url="https://www.duckdns.org/update?domains=myknowledge&token=YOUR_DUCKDNS_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -K -
EOF
chmod +x ~/duckdns/duck.sh
(crontab -l 2>/dev/null; echo "*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1") | crontab -
```

Replace `YOUR_DUCKDNS_TOKEN` with the token shown on your DuckDNS dashboard.

---

## Task 9: Clone the repo, configure, and start the app

> SSH into the VM for all steps.

- [ ] **Step 1: Clone the repo**

```bash
cd ~
git clone https://github.com/MarcMizrahi/knowledge-nebula.git
cd knowledge-nebula
```

- [ ] **Step 2: Create `backend/.env`**

```bash
cat > backend/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE
CORS_ORIGINS=["https://myknowledge.duckdns.org"]
EOF
```

Replace the API key value with your actual Anthropic API key.

- [ ] **Step 3: Build and start the containers**

```bash
NEXT_PUBLIC_API_URL=https://myknowledge.duckdns.org/api docker compose up -d --build
```

This will take 5–10 minutes on the first run (downloads base images, installs Python packages, builds Next.js).

- [ ] **Step 4: Verify both containers are running**

```bash
docker compose ps
```

Expected:
```
NAME                              STATUS
knowledge-nebula-backend-1        Up
knowledge-nebula-frontend-1       Up
```

- [ ] **Step 5: Smoke test the backend directly**

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok","version":"0.1.0"}`

---

## Task 10: Configure Nginx and issue HTTPS certificate

- [ ] **Step 1: Copy the nginx config to the VM**

From your local machine:
```bash
scp -i ~/.ssh/oracle-nebula.key \
  /Users/marcmizrahi/Documents/GitHub/knowledge-nebula/nginx/knowledge-nebula.conf \
  ubuntu@<YOUR_VM_PUBLIC_IP>:/tmp/knowledge-nebula.conf
```

On the VM:
```bash
sudo mv /tmp/knowledge-nebula.conf /etc/nginx/sites-available/knowledge-nebula
```

Update the domain name in the config (replace the placeholder if you used a different subdomain):
```bash
sudo sed -i 's/myknowledge.duckdns.org/YOUR_ACTUAL_SUBDOMAIN.duckdns.org/g' \
  /etc/nginx/sites-available/knowledge-nebula
```

- [ ] **Step 2: Enable the site and test the config**

```bash
sudo ln -s /etc/nginx/sites-available/knowledge-nebula /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

- [ ] **Step 3: Start nginx with HTTP only temporarily (needed for Certbot challenge)**

Edit the nginx config to comment out the HTTPS block temporarily — Certbot needs port 80 working first:

```bash
sudo nginx -s reload
```

- [ ] **Step 4: Issue the HTTPS certificate**

```bash
sudo certbot --nginx -d myknowledge.duckdns.org
```

Follow the prompts:
- Enter your email (for renewal notices)
- Agree to terms
- Choose whether to share email with EFF (optional)

Certbot will automatically update the nginx config with SSL paths and reload nginx.

Expected output includes: `Congratulations! Your certificate and chain have been saved...`

- [ ] **Step 5: Verify HTTPS is working**

From your local machine:
```bash
curl -I https://myknowledge.duckdns.org
```

Expected: `HTTP/2 200` from the frontend.

```bash
curl https://myknowledge.duckdns.org/api/health
```

Expected: `{"status":"ok","version":"0.1.0"}`

- [ ] **Step 6: Verify auto-renewal is scheduled**

```bash
sudo systemctl status certbot.timer
```

Expected: `active (waiting)` — Certbot renews automatically every 12 hours if needed.

---

## Task 11: Set up the backup cron

- [ ] **Step 1: Install OCI CLI on the VM**

```bash
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
```

Accept all defaults. Then reload your shell:
```bash
source ~/.bashrc
oci --version
```

Expected: prints OCI CLI version (e.g. `3.x.x`)

- [ ] **Step 2: Configure OCI CLI**

```bash
oci setup config
```

You'll need from the Oracle Console:
- **User OCID:** Profile menu → My profile → copy OCID
- **Tenancy OCID:** Profile menu → Tenancy → copy OCID
- **Region:** your region (e.g. `us-ashburn-1`)

The setup generates a key pair. Upload the public key:
1. In Oracle Console → Profile → My profile → API keys → Add API key → paste the public key content

- [ ] **Step 3: Create the Object Storage bucket**

```bash
oci os bucket create \
  --compartment-id $(oci iam compartment list --query 'data[0].id' --raw-output) \
  --name nebula-backups
```

Expected: prints JSON with `"name": "nebula-backups"`.

- [ ] **Step 4: Copy the backup script to the VM**

From your local machine:
```bash
scp -i ~/.ssh/oracle-nebula.key \
  /Users/marcmizrahi/Documents/GitHub/knowledge-nebula/scripts/backup.sh \
  ubuntu@<YOUR_VM_PUBLIC_IP>:~/backup.sh
chmod +x ~/backup.sh
```

- [ ] **Step 5: Run a manual backup to verify it works**

On the VM:
```bash
~/backup.sh
```

Expected: prints `[backup] Done.` with no errors.

```bash
oci os object list --bucket-name nebula-backups --query 'data[*].name'
```

Expected: lists one backup file like `["nebula-backup-20260413_120000.tar.gz"]`.

- [ ] **Step 6: Schedule the daily cron**

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * /home/ubuntu/backup.sh >> /home/ubuntu/backup.log 2>&1") | crontab -
```

This runs the backup daily at 3:00 AM UTC.

Verify:
```bash
crontab -l
```

Expected: shows the backup cron line.

---

## Task 12: End-to-end smoke test

- [ ] **Step 1: Open the app in a browser**

Navigate to `https://myknowledge.duckdns.org`. Verify:
- Page loads over HTTPS (padlock in browser)
- No console errors about blocked API calls

- [ ] **Step 2: Upload a document**

Go to the Upload page, upload a small PDF or paste a note. Verify it appears in the document list.

- [ ] **Step 3: Run a semantic search**

Go to Search, type a query related to what you uploaded. Verify results appear.

- [ ] **Step 4: Test AI chat**

Go to Chat, ask a question. Verify streaming response appears correctly.

- [ ] **Step 5: Verify data persists across container restart**

```bash
ssh -i ~/.ssh/oracle-nebula.key ubuntu@<YOUR_VM_PUBLIC_IP>
cd ~/knowledge-nebula
docker compose restart
```

Wait 30 seconds, then refresh the app. Verify your uploaded document still appears.

- [ ] **Step 6: Verify VM restarts correctly**

```bash
sudo reboot
```

Wait 2 minutes, then open `https://myknowledge.duckdns.org`. Everything should be back up automatically (Docker `restart: unless-stopped` handles this).

---

## Future: Deploying Updates

After the initial setup, deploying code changes is:

```bash
ssh -i ~/.ssh/oracle-nebula.key ubuntu@<YOUR_VM_PUBLIC_IP>
cd ~/knowledge-nebula
git pull
NEXT_PUBLIC_API_URL=https://myknowledge.duckdns.org/api docker compose up -d --build
```

To avoid typing the env var every time, add it to `~/.bashrc` on the VM:
```bash
echo 'export NEXT_PUBLIC_API_URL=https://myknowledge.duckdns.org/api' >> ~/.bashrc
source ~/.bashrc
```
