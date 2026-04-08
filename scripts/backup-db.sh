#!/bin/bash
# TBWX Sales Hub — SQLite Database Backup
# Copies the SQLite database to a timestamped backup file.
# Run via cron: 0 2 * * * /docker/saleshub/scripts/backup-db.sh
#
# The database contains: messages, contacts, tasks, SLA metrics,
# agreements, drip state, voice agent calls, lead notes.
# Google Sheets data (leads) is NOT in this database.

set -euo pipefail

DB_PATH="/app/data/saleshub.db"
BACKUP_DIR="/app/data/backups"
KEEP_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/saleshub-${TIMESTAMP}.db"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Use SQLite's .backup command for a consistent snapshot
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" ".backup '${BACKUP_FILE}'"
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[backup] Created: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
  echo "[backup] WARNING: Database not found at ${DB_PATH}"
  exit 1
fi

# Compress
gzip "$BACKUP_FILE" 2>/dev/null && echo "[backup] Compressed: ${BACKUP_FILE}.gz" || true

# Prune old backups (keep last N days)
find "$BACKUP_DIR" -name "saleshub-*.db*" -mtime "+${KEEP_DAYS}" -delete 2>/dev/null
REMAINING=$(ls -1 "$BACKUP_DIR"/saleshub-*.db* 2>/dev/null | wc -l)
echo "[backup] Retained ${REMAINING} backup(s) (keeping ${KEEP_DAYS} days)"
