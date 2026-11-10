#!/usr/bin/env bash
# Installs Scheherazade New (SIL Open Font License) for Qur'an text in the lesson decks, pupil PDFs
# and lesson plans. Other Arabic uses Noto Naskh Arabic, which comes with the Ubuntu package fonts-noto-core.
#
# Why not Amiri Quran: LibreOffice 24.2 (which makes our PDF copies) drops and misplaces Amiri's vowel
# marks (tried Amiri 1.000 and 0.117, TTF and OTF). Scheherazade New, made by SIL for Qur'anic text,
# keeps every mark in place there (checked by rendering Ya-Sin 36:9-12).
#
# Usage: scripts/lessons/install-quran-font.sh [font-dir]
# The font dir defaults to ~/.local/share/fonts/quran. CI caches that folder, so the download only
# happens when the cache is empty. The zip is checked against a fixed SHA-256.
set -euo pipefail

VERSION="4.300"
SHA256="23516d5c19298566da0606a1e5a67bf2ad189aedd606ab3a412f9e5629a7d9eb"
URL="https://github.com/silnrsi/font-scheherazade/releases/download/v${VERSION}/ScheherazadeNew-${VERSION}.zip"
DIR="${1:-$HOME/.local/share/fonts/quran}"

mkdir -p "$DIR"
if [ ! -s "$DIR/ScheherazadeNew-Regular.ttf" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL --retry 3 -o "$tmp/font.zip" "$URL"
  echo "${SHA256}  $tmp/font.zip" | sha256sum -c -
  unzip -q -j "$tmp/font.zip" "ScheherazadeNew-${VERSION}/ScheherazadeNew-Regular.ttf" "ScheherazadeNew-${VERSION}/ScheherazadeNew-Bold.ttf" "ScheherazadeNew-${VERSION}/OFL.txt" -d "$DIR"
fi
fc-cache -f "$DIR" >/dev/null
families="$(fc-list : family)"
case "$families" in *"Scheherazade New"*) ;; *) echo "Scheherazade New did not install" >&2; exit 1 ;; esac
echo "Scheherazade New ${VERSION} ready in $DIR"
