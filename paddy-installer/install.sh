#!/usr/bin/env bash
# Paddy Price (P2) — standalone Android installer & device activation.
#
# Deployment: ~/paddy-install/
#   install.sh  paddy.apk  keypass.txt  master.pem  master_pub.b64  devices.reg
#
# Flows [1] Install / Activate, [2] Transfer to New Device, [3] Check Device
# and [5] Exit work WITHOUT the P2 source project — they operate only on the
# local paddy.apk, the local master key, and the local device registry.
# Only [4] Rebuild APK requires the development project (auto-detected:
# $PADDY_PROJECT_DIR -> ~/paddyprice-v2 -> ~/paddyprice).
#
# Activation architecture (reference parity):
#   keypass.txt -> encrypted master.pem -> master_pub.b64 -> APK asset
#   -> ADB challenge -> master signature -> device registration.
# Only master_pub.b64 (the PUBLIC key) is ever embedded into the APK.
# keypass/master.pem/devices.reg are never placed in the APK and never printed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APK="$SCRIPT_DIR/paddy.apk"
KEYPASS_FILE="$SCRIPT_DIR/keypass.txt"
MASTER_KEY="$SCRIPT_DIR/master.pem"
MASTER_PUB="$SCRIPT_DIR/master_pub.b64"
REGISTRY="$SCRIPT_DIR/devices.reg"
PORT=18777
# Existing P2 application ID — unchanged.
APP_ID="com.paddy.paddyprice"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { printf "${GREEN}✔${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}⚠${NC} %s\n" "$1"; }
fail() { printf "${RED}✘ %s${NC}\n" "$1" >&2; exit 1; }
step() { printf "\n${CYAN}▶ %s${NC}\n" "$1"; }

check_requirements() {
  step "Checking requirements"
  for cmd in adb curl openssl base64 unzip; do
    command -v "$cmd" >/dev/null 2>&1 || fail "'$cmd' is required but not installed."
    ok "$cmd found"
  done
}

load_keypass() {
  [ -f "$KEYPASS_FILE" ] || fail "keypass.txt not found in $SCRIPT_DIR"
  KEYPASS="$(tr -d '\r\n' <"$KEYPASS_FILE")"
  export KEYPASS
  [ -n "$KEYPASS" ] || fail "keypass.txt is empty"
  ok "keypass.txt loaded (never displayed)"
}

ensure_master_key() {
  if [ -f "$MASTER_KEY" ]; then
    ok "Master signing key found"
    return
  fi
  step "First run — generating master signing key (protected by keypass)…"
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 \
    -aes256 -pass env:KEYPASS -out "$MASTER_KEY" 2>/dev/null
  chmod 600 "$MASTER_KEY"
  export_master_pub
  ok "Master key created at $MASTER_KEY"
}

export_master_pub() {
  openssl pkey -in "$MASTER_KEY" -passin env:KEYPASS -pubout -outform DER 2>/dev/null |
    base64 -w0 >"$MASTER_PUB"
  ok "Master public key exported (safe to embed in APK)"
}

require_apk() {
  [ -f "$APK" ] ||
    fail "paddy.apk not found in $SCRIPT_DIR — run [4] Rebuild APK, or copy paddy.apk here."
  ok "APK ready"
}

# Reference parity (~/paddyprice install.sh `build_apk_if_needed`): the Android
# flow NEVER installs an APK whose embedded master public key differs from THIS
# deployment's master key. A stale key makes every /activate fail signature
# verification ("rejected by the device") and activation silently never
# completes. If the source project is available, embed + rebuild (exactly what
# [4] does); standalone, fail loudly instead of installing a useless APK.
ensure_apk_master_key() {
  step "Verifying the APK embeds this deployment's master public key"
  local embedded proj
  embedded="$(unzip -p "$APK" assets/master_pub.b64 2>/dev/null || true)"
  if [ -n "$embedded" ] && [ "$embedded" = "$(cat "$MASTER_PUB")" ]; then
    ok "APK master public key matches this deployment"
    return
  fi
  if proj="$(find_project_dir)"; then
    warn "APK does not embed this deployment's master public key — rebuilding…"
    rebuild_apk_menu
    embedded="$(unzip -p "$APK" assets/master_pub.b64 2>/dev/null || true)"
    [ "$embedded" = "$(cat "$MASTER_PUB")" ] ||
      fail "Rebuilt APK still does not embed the master public key."
    ok "APK rebuilt with the current master public key"
  else
    fail "paddy.apk does not embed this deployment's master public key. Run [4] Rebuild APK from the source project, then retry."
  fi
}

detect_device() {
  step "Detecting connected Android device…"
  local devices count
  devices="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
  count="$(printf '%s' "$devices" | grep -c . || true)"
  [ "$count" -ge 1 ] ||
    fail "No Android device found. Enable USB debugging, connect via USB, accept the prompt on the phone, then retry."
  if [ "$count" -gt 1 ]; then
    warn "Multiple devices connected:"
    echo "$devices" | nl
    read -rp "Select device number: " idx
    DEVICE_SERIAL="$(echo "$devices" | sed -n "${idx}p")"
  else
    DEVICE_SERIAL="$devices"
  fi
  ok "Device connected: $DEVICE_SERIAL"
}
adb_sh() { adb -s "$DEVICE_SERIAL" shell "$@"; }

launch_app() {
  step "Launching Paddy on the device…"
  adb_sh am force-stop "$APP_ID" >/dev/null 2>&1 || true
  sleep 1
  adb_sh monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 ||
    fail "Could not launch Paddy."
  sleep 3
  ok "Paddy launched (the phone shows 'waiting for activation' when unauthorized)"
}

open_tunnel() {
  step "Opening activation tunnel over USB (adb forward)…"
  adb -s "$DEVICE_SERIAL" forward --remove tcp:$PORT >/dev/null 2>&1 || true
  adb -s "$DEVICE_SERIAL" forward tcp:$PORT tcp:$PORT >/dev/null
  ok "Tunnel ready on 127.0.0.1:$PORT"
}

close_tunnel() {
  adb -s "$DEVICE_SERIAL" forward --remove tcp:$PORT >/dev/null 2>&1 || true
}

jget() {
  printf '%s' "$1" | grep -o "\"$2\":\"[^\"]*\"" | head -1 | cut -d'"' -f4
}

get_challenge() {
  CHALLENGE_JSON="$(curl -fsS --retry 10 --retry-delay 1 --retry-all-errors --max-time 120 \
    http://127.0.0.1:$PORT/challenge)" ||
    fail "Activation failed: cannot reach the activation service. Make sure Paddy is open on the phone."
  CH_FP="$(jget "$CHALLENGE_JSON" fp)"
  CH_NONCE="$(jget "$CHALLENGE_JSON" nonce)"
  [ -n "${CH_FP:-}" ] && [ -n "${CH_NONCE:-}" ] ||
    fail "Activation failed: invalid challenge response."
  ok "Device key fingerprint: ${CH_FP:0:16}…"
}

record_device() {
  touch "$REGISTRY"
  awk -v fp="$1" -F'\t' 'BEGIN{OFS="\t"} $1==fp{$2="replaced"} {print}' \
    "$REGISTRY" >"$REGISTRY.tmp" && mv "$REGISTRY.tmp" "$REGISTRY"
  printf '%s\t%s\t%s\t%s\n' \
    "$1" "$2" "${3:-}" "$(date '+%Y-%m-%d %H:%M')" >>"$REGISTRY"
}

lookup_status() {
  touch "$REGISTRY"
  local line
  line="$(awk -v fp="$1" -F'\t' '$1==fp' "$REGISTRY" | tail -1)"
  [ -n "$line" ] && printf '%s' "$line" | cut -f2 || true
}

sign_and_activate() {
  step "Activating device"
  local at sig_b64 body response tmp sig_der
  at="$(date +%s)"
  tmp="$(mktemp)"
  sig_der="$(mktemp)"
  # Expand the temp paths at trap-SET time and make the trap self-removing.
  # A RETURN trap persists after the function returns; a fire-time expansion
  # ("$tmp") then runs in a caller scope where tmp is unset and, under
  # `set -u`, crashes the menu ("tmp: unbound variable"). Baking the paths in
  # plus `trap - RETURN` scopes the cleanup to this function only — it cannot
  # leak into the caller or any later function.
  trap "rm -f '$tmp' '$sig_der'; trap - RETURN" RETURN
  printf '1|%s|%s|%s' "$CH_FP" "$CH_NONCE" "$at" >"$tmp"
  openssl dgst -sha256 -sign "$MASTER_KEY" -passin env:KEYPASS -binary -out "$sig_der" "$tmp"
  sig_b64="$(base64 -w0 "$sig_der")"
  body="{\"cert\":{\"v\":\"1\",\"fp\":\"$CH_FP\",\"nonce\":\"$CH_NONCE\",\"at\":\"$at\",\"sig\":\"$sig_b64\"}}"
  response="$(curl -fsS --max-time 30 -X POST -H 'Content-Type: application/json' \
    -d "$body" http://127.0.0.1:$PORT/activate)" ||
    fail "Activation failed: request to the device was not accepted."
  printf '%s' "$response" | grep -q '"ok":true' ||
    fail "Activation failed: rejected by the device."
  record_device "$CH_FP" active "${1:-}"
  ok "Device activated"
}
flow_install_activate() {
  detect_device
  step "Installing APK"
  adb -s "$DEVICE_SERIAL" install -r "$APK" ||
    fail "APK installation failed."
  ok "APK installed"
  launch_app
  open_tunnel
  get_challenge
  local status
  status="$(lookup_status "$CH_FP")"
  if [ "$status" = "active" ]; then
    ok "Device already authorized"
  elif [ "$status" = "replaced" ] || [ "$status" = "revoked" ]; then
    warn "This device fingerprint exists in history with status '$status'. Re-authorizing…"
    read -rp "Label for this device (e.g. Shop Phone A): " label
    sign_and_activate "$label"
  else
    warn "New device detected — authorization required."
    read -rp "Label for this device (e.g. Shop Phone A): " label
    sign_and_activate "$label"
  fi
  close_tunnel
}

flow_transfer() {
  warn "Transfer: first connect the CURRENTLY authorized phone."
  detect_device
  launch_app
  open_tunnel
  get_challenge
  local status
  status="$(lookup_status "$CH_FP")"
  [ "$status" = "active" ] ||
    warn "Connected phone is not marked 'active' in the registry (status: ${status:-unknown}). Continuing anyway."
  step "Revoking this phone's authorization…"
  curl -fsS --max-time 30 -X POST http://127.0.0.1:$PORT/deactivate >/dev/null ||
    fail "Deactivation failed."
  record_device "$CH_FP" revoked ""
  close_tunnel
  ok "Device revoked (old phone will stop at the activation screen)"
  echo ""
  warn "Now DISCONNECT the old phone and connect the NEW phone, then press Enter."
  read -rp ""
  flow_install_activate
}

flow_check() {
  detect_device
  open_tunnel
  get_challenge
  local status
  status="$(lookup_status "$CH_FP")"
  close_tunnel
  echo ""
  case "$status" in
  active)    ok "Device already authorized" ;;
  revoked)   warn "Device revoked" ;;
  replaced)  warn "Device superseded by a newer registration" ;;
  *)         warn "Unknown device (never activated from this PC)" ;;
  esac
}

# Development project is required ONLY for [4] Rebuild APK.
find_project_dir() {
  if [ -n "${PADDY_PROJECT_DIR:-}" ] && [ -d "$PADDY_PROJECT_DIR/android" ]; then
    printf '%s' "$PADDY_PROJECT_DIR"
    return 0
  fi
  if [ -d "$HOME/paddyprice-v2/android" ]; then
    printf '%s' "$HOME/paddyprice-v2"
    return 0
  fi
  if [ -d "$HOME/paddyprice/android" ]; then
    printf '%s' "$HOME/paddyprice"
    return 0
  fi
  return 1
}

rebuild_apk_menu() {
  step "Rebuilding APK from source…"
  local proj apk_src asset
  if ! proj="$(find_project_dir)"; then
    fail "Paddy source project not found. Set PADDY_PROJECT_DIR=/path/to/paddyprice to rebuild."
  fi
  asset="$proj/android/app/src/main/assets/master_pub.b64"
  mkdir -p "$(dirname "$asset")"
  if [ ! -f "$asset" ] || ! cmp -s "$MASTER_PUB" "$asset"; then
    cp "$MASTER_PUB" "$asset"
    ok "Master public key embedded into APK assets (public key only)"
  fi
  (cd "$proj" && npm run cap:sync && npm run android:assemble:debug) >/dev/null 2>&1 ||
    fail "Android build failed — run 'npm run cap:sync && npm run android:assemble:debug' in the project for details."
  apk_src="$proj/android/app/build/outputs/apk/debug/app-debug.apk"
  [ -f "$apk_src" ] || fail "Build output not found at $apk_src"
  cp "$apk_src" "$APK"
  ok "APK ready"
}

print_menu() {
  echo ""
  printf "${CYAN}===============================================${NC}\n"
  printf "${CYAN}        Paddy Price Installer & Activation${NC}\n"
  printf "${CYAN}===============================================${NC}\n"
  echo " [1] Install / Activate"
  echo " [2] Transfer to New Device"
  echo " [3] Check Device"
  echo " [4] Rebuild APK"
  echo " [5] Exit"
}

main() {
  check_requirements
  load_keypass
  ensure_master_key
  require_apk
  ensure_apk_master_key

  while true; do
    print_menu
    read -rp "Choose an option: " choice
    case "$choice" in
    1) flow_install_activate ;;
    2) flow_transfer ;;
    3) flow_check ;;
    4) rebuild_apk_menu ;;
    5) echo "Bye."; exit 0 ;;
    *) warn "Invalid option." ;;
    esac
  done
}

main "$@"
