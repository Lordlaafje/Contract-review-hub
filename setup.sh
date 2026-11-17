#!/usr/bin/env bash
# One-time setup on your own computer: OpenAI key, Google Drive folder and sign-in → .env,
# then starts the demo. Safe to run again: it keeps what's already in .env unless you
# choose to change it.  Usage:  ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="$PWD/.env"
DEFAULT_FOLDER_ID="1OYX6X0C01D6JGPia_mlShO0p3oMKZk41"   # Drive folder "Claude Demo"

command -v node >/dev/null || { echo "Node.js 18+ is required — install it from https://nodejs.org and run this again."; exit 1; }
node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 18 ] || { echo "Node.js 18+ is required (you have $(node -v))."; exit 1; }

touch "$ENV_FILE"; chmod 600 "$ENV_FILE"

get_env() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }
set_env() {  # set_env NAME VALUE — replace or append, without printing the value
  local tmp; tmp=$(mktemp)
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  mv "$tmp" "$ENV_FILE"; chmod 600 "$ENV_FILE"
}
ask_yes() { local a; read -r -p "$1 [y/N] " a; [[ "$a" =~ ^[Yy] ]]; }

echo
echo "── 1/3  OpenAI ──────────────────────────────────────────────"
if [ -n "$(get_env OPENAI_API_KEY)" ] && ! ask_yes "An OpenAI key is already set. Replace it?"; then
  echo "Keeping the existing key."
else
  echo "Create a key at https://platform.openai.com/api-keys and paste it here (it won't be shown)."
  read -r -s -p "OpenAI API key: " key; echo
  [[ "$key" == sk-* ]] || { echo "That doesn't look like an OpenAI key (they start with sk-)."; exit 1; }
  if curl -sf -o /dev/null -H "Authorization: Bearer $key" https://api.openai.com/v1/models; then
    echo "✅ Key works."
  else
    echo "⚠️  OpenAI didn't accept that key (or there's no internet). Saving it anyway — check it later."
  fi
  set_env OPENAI_API_KEY "$key"; unset key
fi

echo
echo "── 2/3  Google Drive folder ─────────────────────────────────"
folder=$(get_env GOOGLE_DRIVE_FOLDER_ID)
read -r -p "Drive folder id for uploads [${folder:-$DEFAULT_FOLDER_ID}]: " input
folder=${input:-${folder:-$DEFAULT_FOLDER_ID}}
if [ "$folder" != "$(get_env GOOGLE_DRIVE_FOLDER_ID)" ]; then set_env GOOGLE_DRIVE_FOLDER_ID "$folder"; fi
echo "Uploads go to https://drive.google.com/drive/folders/$folder"

echo
echo "── 3/3  Google sign-in ──────────────────────────────────────"
if [ -n "$(get_env GOOGLE_REFRESH_TOKEN)" ] && ! ask_yes "Already signed in to Google. Sign in again?"; then
  echo "Keeping the existing sign-in."
elif [ -z "$(get_env GOOGLE_CLIENT_ID)" ] && ! ask_yes "Set up Drive saving now? (needs ~10 minutes in the Google Cloud console)"; then
  echo "Skipped — the demo runs without Drive. Run ./setup.sh again to add it later."
else
  if [ -z "$(get_env GOOGLE_CLIENT_ID)" ] || [ -z "$(get_env GOOGLE_CLIENT_SECRET)" ]; then
    cat <<'STEPS'
In https://console.cloud.google.com/ (signed in as your Workspace account):
  1. Create a project (or pick one).
  2. APIs & Services → Library → "Google Drive API" → Enable.
  3. APIs & Services → OAuth consent screen → User type "Internal" → fill in an app name
     and your email → save. (Internal = no Google review, and the sign-in doesn't expire.)
  4. APIs & Services → Credentials → Create credentials → OAuth client ID →
     Application type "Desktop app" → Create. Copy the client ID and secret.
STEPS
    read -r -p "Client ID: " cid
    read -r -s -p "Client secret (won't be shown): " csec; echo
    [ -n "$cid" ] && [ -n "$csec" ] || { echo "Both are needed."; exit 1; }
    set_env GOOGLE_CLIENT_ID "$cid"; set_env GOOGLE_CLIENT_SECRET "$csec"; unset csec
  fi
  [ -d server/node_modules ] || npm --prefix server install --silent
  echo "A sign-in link follows. Open it, sign in, and allow access (it asks for Drive access"
  echo "because it saves into a folder you created yourself)."
  if command -v open >/dev/null; then echo "(Tip: Cmd-click the link.)"; fi
  ( set -a; . "$ENV_FILE"; set +a; DRIVE_AUTH_ENV_FILE="$ENV_FILE" node server/drive-auth.mjs )
fi

echo
echo "Setup done. Settings are in .env (private to you, never committed). Starting the demo…"
exec ./run.sh
