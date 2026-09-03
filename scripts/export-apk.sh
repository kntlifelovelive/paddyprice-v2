#!/usr/bin/env bash
# Release / export step (P2 -> ~/paddy-install/paddy.apk).
#
#   npm run release:android
#
# 1. Builds the Android APK (web sync + gradle assembleDebug).
# 2. Verifies the build output exists.
# 3. Deploys the standalone installer files (install.sh + .gitignore) and the
#    APK binary into $HOME/paddy-install.
#
# It NEVER copies P2 source code into the installer folder, and it never
# generates or prints secrets (keypass.txt / master.pem / devices.reg stay in
# the installer folder only — the public master_pub.b64 may be embedded in the
# APK during the optional Rebuild flow).

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${PADDY_INSTALL_DIR:-$HOME/paddy-install}"
LEGACY_SECRET_DIR="${PADDY_SECRET_SRC:-$HOME/paddy-installer}"
APK_SRC="$REPO_DIR/android/app/build/outputs/apk/debug/app-debug.apk"

step() { printf '\n▶ %s\n' "$1"; }
ok()   { printf '✔ %s\n' "$1"; }
warn() { printf '⚠ %s\n' "$1"; }
fail() { printf '✘ %s\n' "$1" >&2; exit 1; }

step "Building P2 Android APK (web sync + gradle assembleDebug)"
(cd "$REPO_DIR" && npm run cap:sync)
(cd "$REPO_DIR" && npm run android:assemble:debug)

[ -f "$APK_SRC" ] || fail "Build output not found: $APK_SRC"
ok "Build verified: $APK_SRC"

mkdir -p "$INSTALL_DIR"

step "Deploying standalone installer files"
cp "$REPO_DIR/paddy-installer/install.sh" "$INSTALL_DIR/install.sh"
cp "$REPO_DIR/paddy-installer/.gitignore" "$INSTALL_DIR/.gitignore"
chmod +x "$INSTALL_DIR/install.sh"
ok "install.sh and .gitignore deployed to $INSTALL_DIR"

# Seed only MISSING secrets from an existing deployment (no-clobber). Existing
# device registrations stay valid because the key material is preserved.
for secret in keypass.txt master.pem master_pub.b64 devices.reg; do
  if [ ! -f "$INSTALL_DIR/$secret" ] && [ -f "$LEGACY_SECRET_DIR/$secret" ]; then
    cp -n "$LEGACY_SECRET_DIR/$secret" "$INSTALL_DIR/$secret"
    ok "$secret seeded (existing activations preserved)"
  elif [ ! -f "$INSTALL_DIR/$secret" ]; then
    warn "Missing $secret in $INSTALL_DIR — copy it from your existing deployment."
  fi
done

step "Exporting APK"
cp "$APK_SRC" "$INSTALL_DIR/paddy.apk"
size="$(ls -lh "$INSTALL_DIR/paddy.apk" | awk '{print $5}')"
ok "APK ready ($size): $INSTALL_DIR/paddy.apk"