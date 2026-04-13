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
