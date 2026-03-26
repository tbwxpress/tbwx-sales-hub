#!/usr/bin/env bash
# =============================================================================
# Sales Hub — Client Deployment Script
# =============================================================================
# Run this script to set up a new client instance of the Sales Hub.
# It will:
#   1. Ask you for all config values
#   2. Generate a .env file and docker-compose.yml
#   3. Print the commands to run on your VPS
#
# Usage:
#   chmod +x scripts/deploy-client.sh
#   ./scripts/deploy-client.sh
# =============================================================================

set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

print_header() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${CYAN}${BOLD}  $1${RESET}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
}

prompt() {
  local var_name="$1"
  local prompt_text="$2"
  local default="$3"
  local is_secret="${4:-false}"

  if [ -n "$default" ]; then
    prompt_text="$prompt_text [${default}]"
  fi
  prompt_text="$prompt_text: "

  if [ "$is_secret" = "true" ]; then
    read -rsp "$prompt_text" value
    echo ""
  else
    read -rp "$prompt_text" value
  fi

  if [ -z "$value" ] && [ -n "$default" ]; then
    value="$default"
  fi

  eval "$var_name='$value'"
}

prompt_required() {
  local var_name="$1"
  local prompt_text="$2"
  local is_secret="${3:-false}"
  local value=""

  while [ -z "$value" ]; do
    if [ "$is_secret" = "true" ]; then
      read -rsp "$prompt_text (required): " value
      echo ""
    else
      read -rp "$prompt_text (required): " value
    fi
    if [ -z "$value" ]; then
      echo -e "${RED}This field is required.${RESET}"
    fi
  done

  eval "$var_name='$value'"
}

generate_secret() {
  # Generate a random 64-char hex string
  if command -v openssl &>/dev/null; then
    openssl rand -hex 32
  else
    cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64
  fi
}

# =============================================================================
print_header "Sales Hub — Client Deployment Setup"
echo -e "  This script generates a ${BOLD}.env${RESET} file and ${BOLD}docker-compose.yml${RESET}"
echo -e "  for a new client deployment."
echo ""
echo -e "  You'll need:"
echo -e "    - Client brand info"
echo -e "    - WhatsApp Cloud API credentials"
echo -e "    - Google OAuth credentials (from GCP)"
echo -e "    - Turso database URL (or use local SQLite)"
echo -e "    - Target domain/IP for the server"
echo ""
read -rp "Press Enter to continue..."

# =============================================================================
print_header "1 of 5 — Brand Configuration"

prompt_required CLIENT_SLUG "Client identifier (lowercase, no spaces, e.g. 'acmefoods')"
prompt_required BRAND_NAME "Full brand name (e.g. 'Acme Foods Sales Hub')"
prompt_required BRAND_SHORT "Short brand name (2-6 chars, e.g. 'ACME')"
prompt BRAND_LOGO "Logo path (relative to /public, e.g. '/logo-acme.png')" "/logo.png"
prompt BRAND_DESCRIPTION "Brand description" "Sales dashboard for ${BRAND_NAME}"
prompt BRAND_TAGLINE "Login page tagline (short motto)" "Sell More. Scale Fast."
prompt BRAND_SUPPORT_EMAIL "Admin login email hint" "admin@${CLIENT_SLUG}.com"
prompt THEME_COLOR "Browser theme color hex" "#1a1209"
prompt APP_URL "Full app URL (e.g. https://sales.acmefoods.com)" "https://sales.${CLIENT_SLUG}.com"
prompt APP_PORT "Local Docker port (use different ports per client)" "3458"

# =============================================================================
print_header "2 of 5 — Authentication"

AUTO_JWT=$(generate_secret)
AUTO_CRON=$(generate_secret | cut -c1-32)

echo -e "  ${GREEN}Auto-generating JWT_SECRET and CRON_SECRET...${RESET}"
echo -e "  JWT:  ${AUTO_JWT:0:16}…"
echo -e "  CRON: ${AUTO_CRON:0:16}…"
echo ""

prompt ADMIN_NAME "First admin user name" "Admin"
prompt_required ADMIN_EMAIL "First admin email"
prompt_required ADMIN_PASSWORD "First admin password" "true"
prompt SESSION_COOKIE "Session cookie name (unique per client)" "${CLIENT_SLUG}_session"

JWT_SECRET="$AUTO_JWT"
CRON_SECRET="$AUTO_CRON"

# =============================================================================
print_header "3 of 5 — WhatsApp Cloud API"
echo -e "  Get these from: Meta Business Suite → WhatsApp → API Setup"
echo ""

prompt_required WA_PHONE_NUMBER_ID "Phone Number ID"
prompt_required WA_TOKEN "WhatsApp API Token" "true"
prompt_required WA_WABA_ID "WABA ID"
prompt WA_VERIFY_TOKEN "Webhook Verify Token" "${CLIENT_SLUG}-webhook-verify"
prompt_required META_APP_SECRET "Meta App Secret" "true"

# =============================================================================
print_header "4 of 5 — Google Sheets & OAuth"
echo -e "  Get credentials from: console.cloud.google.com → APIs → Credentials"
echo -e "  Required scope: spreadsheets (read/write)"
echo ""

prompt_required GOOGLE_CLIENT_ID "Google OAuth Client ID"
prompt_required GOOGLE_CLIENT_SECRET "Google OAuth Client Secret" "true"
prompt_required GOOGLE_REFRESH_TOKEN "Google OAuth Refresh Token" "true"
prompt_required LEADS_SHEET_ID "Leads Google Sheet ID (from URL)"
prompt LEADS_TAB_NAME "Leads tab name" "Leads"
prompt REPLIES_TAB_NAME "Replies tab name" "Replies"
prompt HUB_SHEET_ID "Hub Sheet ID (for users/quick replies, can be same as leads)" ""
prompt SENT_TAB_NAME "Sent Messages tab" "SentMessages"
prompt USERS_TAB_NAME "Users tab" "Users"
prompt QR_TAB_NAME "Quick Replies tab" "QuickReplies"
prompt OLD_LEADS_TAB_NAME "Old/Previous Campaign Leads tab (leave blank if none)" ""

# =============================================================================
print_header "5 of 5 — Database"
echo -e "  Leave blank to use local SQLite (good for small clients)."
echo -e "  For production, create a free DB at: turso.tech"
echo ""

prompt TURSO_URL "Turso Database URL (leave blank for local SQLite)" ""
prompt TURSO_TOKEN "Turso Auth Token (leave blank if using local SQLite)" "" "true"

# =============================================================================
# Generate output files
# =============================================================================
print_header "Generating deployment files..."

OUT_DIR="${ROOT_DIR}/deployments/${CLIENT_SLUG}"
mkdir -p "$OUT_DIR"

# --- .env file ---
cat > "${OUT_DIR}/.env" << EOF
# ============================================================
# ${BRAND_NAME} — Sales Hub Configuration
# Generated: $(date)
# ============================================================

# ─── Brand ─────────────────────────────────────────────────
NEXT_PUBLIC_BRAND_NAME=${BRAND_NAME}
NEXT_PUBLIC_BRAND_SHORT=${BRAND_SHORT}
NEXT_PUBLIC_BRAND_LOGO=${BRAND_LOGO}
NEXT_PUBLIC_BRAND_DESCRIPTION=${BRAND_DESCRIPTION}
NEXT_PUBLIC_BRAND_TAGLINE=${BRAND_TAGLINE}
NEXT_PUBLIC_BRAND_SUPPORT_EMAIL=${BRAND_SUPPORT_EMAIL}
NEXT_PUBLIC_THEME_COLOR=${THEME_COLOR}
NEXT_PUBLIC_APP_URL=${APP_URL}

# ─── Auth ───────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
SESSION_COOKIE_NAME=${SESSION_COOKIE}
CRON_SECRET=${CRON_SECRET}

# ─── Admin Seed ─────────────────────────────────────────────
ADMIN_NAME=${ADMIN_NAME}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}

# ─── Google OAuth ───────────────────────────────────────────
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_REFRESH_TOKEN=${GOOGLE_REFRESH_TOKEN}

# ─── Google Sheets ──────────────────────────────────────────
LEADS_SHEET_ID=${LEADS_SHEET_ID}
LEADS_TAB_NAME=${LEADS_TAB_NAME}
REPLIES_TAB_NAME=${REPLIES_TAB_NAME}
HUB_SHEET_ID=${HUB_SHEET_ID:-${LEADS_SHEET_ID}}
SENT_MESSAGES_TAB_NAME=${SENT_TAB_NAME}
USERS_TAB_NAME=${USERS_TAB_NAME}
QUICK_REPLIES_TAB_NAME=${QR_TAB_NAME}
OLD_LEADS_TAB_NAME=${OLD_LEADS_TAB_NAME}

# ─── WhatsApp ───────────────────────────────────────────────
WHATSAPP_PHONE_NUMBER_ID=${WA_PHONE_NUMBER_ID}
WHATSAPP_TOKEN=${WA_TOKEN}
WHATSAPP_WABA_ID=${WA_WABA_ID}
WHATSAPP_WEBHOOK_VERIFY_TOKEN=${WA_VERIFY_TOKEN}
META_APP_SECRET=${META_APP_SECRET}

# ─── Database ───────────────────────────────────────────────
TURSO_DATABASE_URL=${TURSO_URL}
TURSO_AUTH_TOKEN=${TURSO_TOKEN}
EOF

echo -e "  ${GREEN}✓ .env written${RESET}"

# --- docker-compose.yml ---
cat > "${OUT_DIR}/docker-compose.yml" << EOF
# ${BRAND_NAME} — Sales Hub
# Generated: $(date)
version: '3.8'

services:
  saleshub-${CLIENT_SLUG}:
    image: ghcr.io/tbwxpress/tbwx-sales-hub:latest
    container_name: saleshub-${CLIENT_SLUG}
    restart: unless-stopped
    ports:
      - "${APP_PORT}:3000"
    env_file:
      - .env
    volumes:
      - ./data:/app/data
    networks:
      - n8n_default

networks:
  n8n_default:
    external: true
EOF

echo -e "  ${GREEN}✓ docker-compose.yml written${RESET}"

# --- deploy-to-server.sh (run ON the VPS) ---
cat > "${OUT_DIR}/deploy-to-server.sh" << 'SERVSCRIPT'
#!/usr/bin/env bash
# Run this on the VPS after copying the files
set -e
docker compose pull
docker compose up -d
echo "Waiting for container to start..."
sleep 5
docker compose logs --tail=20
echo ""
echo "✓ Deployed! Now run: node seed-admin.js (inside the container to create admin user)"
echo ""
echo "To create admin user:"
echo "  docker exec -it saleshub-CLIENTSLUG sh"
echo "  cd /app && node scripts/seed-admin.js"
SERVSCRIPT
chmod +x "${OUT_DIR}/deploy-to-server.sh"
sed -i "s/CLIENTSLUG/${CLIENT_SLUG}/g" "${OUT_DIR}/deploy-to-server.sh"

echo -e "  ${GREEN}✓ deploy-to-server.sh written${RESET}"

# =============================================================================
print_header "All done! 🎉"

echo -e "  Output files saved to: ${BOLD}deployments/${CLIENT_SLUG}/${RESET}"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo ""
echo -e "  1. ${CYAN}Copy files to VPS:${RESET}"
echo -e "     scp -r deployments/${CLIENT_SLUG}/ root@YOUR_VPS_IP:~/saleshub-${CLIENT_SLUG}/"
echo ""
echo -e "  2. ${CYAN}SSH into VPS and deploy:${RESET}"
echo -e "     ssh root@YOUR_VPS_IP"
echo -e "     cd ~/saleshub-${CLIENT_SLUG} && ./deploy-to-server.sh"
echo ""
echo -e "  3. ${CYAN}Configure webhook in Meta:${RESET}"
echo -e "     URL:    ${APP_URL}/api/webhook/whatsapp"
echo -e "     Token:  ${WA_VERIFY_TOKEN}"
echo ""
echo -e "  4. ${CYAN}Set up Nginx reverse proxy:${RESET}"
echo -e "     proxy_pass http://localhost:${APP_PORT};"
echo ""
echo -e "  5. ${CYAN}Check setup health:${RESET}"
echo -e "     ${APP_URL}/admin/setup"
echo ""
echo -e "  ${YELLOW}IMPORTANT: Keep deployments/${CLIENT_SLUG}/.env SECRET — it has all credentials!${RESET}"
echo ""
