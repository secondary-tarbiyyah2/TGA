#!/usr/bin/env bash
# Installs Amiri Quran (SIL Open Font License) for the lesson decks, pupil PDFs and lesson plans.
# Qur'an text in the decks asks for "Amiri Quran"; other Arabic asks for "Noto Naskh Arabic",
# which comes with the Ubuntu package fonts-noto-core.
#
# Usage: scripts/lessons/install-quran-font.sh [font-dir]
# The font dir defaults to ~/.local/share/fonts/amiri-quran. CI caches that folder, so the
# download only happens when the cache is empty. The zip is checked against a fixed SHA-256.
set -euo pipefail

VERSION="1.000"
SHA256="926fe1bd7dfde8e55178281f645258bfced6420c951c6f2fd532fd21691bca30"
URL="https://github.com/aliftype/amiri/releases/download/${VERSION}/Amiri-${VERSION}.zip"
DIR="${1:-$HOME/.local/share/fonts/amiri-quran}"

mkdir -p "$DIR"
if [ ! -s "$DIR/AmiriQuran.ttf" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL --retry 3 -o "$tmp/amiri.zip" "$URL"
  echo "${SHA256}  $tmp/amiri.zip" | sha256sum -c -
  unzip -q -j "$tmp/amiri.zip" "Amiri-${VERSION}/AmiriQuran.ttf" "Amiri-${VERSION}/OFL.txt" -d "$DIR"
fi
fc-cache -f "$DIR" >/dev/null
families="$(fc-list : family)"
case "$families" in *"Amiri Quran"*) ;; *) echo "Amiri Quran did not install" >&2; exit 1 ;; esac
echo "Amiri Quran ${VERSION} ready in $DIR"
