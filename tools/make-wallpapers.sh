#!/usr/bin/env bash
# Genera gli sfondi "Glassy Aurora" (scuro e chiaro) con ImageMagick.
# Uso: tools/make-wallpapers.sh [cartella-output]   (default: ./wallpapers)
set -euo pipefail

OUT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/wallpapers}"
W=480 H=270            # tela di lavoro piccola: i blur enormi restano veloci, poi si ingrandisce
FW=3840 FH=2160

command -v magick >/dev/null || { echo "serve ImageMagick (magick)" >&2; exit 1; }
mkdir -p "$OUT"

args=()

# blob COLORE CX CY RAGGIO BLEND OPACITÀ → aggiunge una macchia di colore sfumata (coordinate frazionarie)
blob() {
    local color=$1 cx=$2 cy=$3 r=$4 blend=$5 opacity=${6:-1}
    local x y rr
    x=$(awk -v w=$W -v c="$cx" 'BEGIN{printf "%d", w*c}')
    y=$(awk -v h=$H -v c="$cy" 'BEGIN{printf "%d", h*c}')
    rr=$(awk -v h=$H -v c="$r" 'BEGIN{printf "%d", h*c}')
    args+=( '(' -size "${W}x${H}" xc:none -fill "$color"
            -draw "circle $x,$y $x,$((y + rr))" -blur "0x$((rr / 2))"
            -channel A -evaluate Multiply "$opacity" +channel ')'
            -compose "$blend" -composite )
}

# render NOME SFONDO BLEND GRANA  (le macchie vanno aggiunte prima con blob)
finish() {
    local name=$1 grain=$2
    args+=(
        # striscia di luce diagonale morbida
        '(' -size "${W}x${H}" gradient:'rgba(255,255,255,0.10)-rgba(255,255,255,0)' ')'
        -compose over -composite
        -filter Lanczos -resize "${FW}x${FH}!"
        # grana: evita il banding sui gradienti
        '(' +clone -fill gray50 -colorize 100 -attenuate "$grain" +noise Gaussian -colorspace Gray ')'
        -compose overlay -composite
        -quality 92 -sampling-factor 4:4:4 "$OUT/$name.jpg"
    )
    magick "${args[@]}"
    echo "creato $OUT/$name.jpg"
}

# ── scuro ───────────────────────────────────────────────────────────────
args=( -size "${W}x${H}" 'xc:#07071a' )
blob '#2450ff' 0.10 0.16 0.46 screen 0.95
blob '#8b3dff' 0.62 0.18 0.38 screen 0.85
blob '#ff2d8f' 0.14 0.98 0.46 screen 0.90
blob '#10b8e0' 0.90 0.92 0.42 screen 0.85
blob '#ff7a2f' 0.97 0.08 0.24 screen 0.70
blob '#4a2bff' 0.52 0.66 0.26 screen 0.55
finish glassy-dark 0.35

# ── chiaro ──────────────────────────────────────────────────────────────
args=( -size "${W}x${H}" 'xc:#f1f2ff' )
blob '#7fa2ff' 0.10 0.16 0.50 over 0.80
blob '#c79bff' 0.62 0.18 0.42 over 0.70
blob '#ff9ccb' 0.14 0.98 0.50 over 0.75
blob '#7fe0f5' 0.90 0.92 0.46 over 0.75
blob '#ffc48a' 0.97 0.08 0.28 over 0.65
blob '#b3a1ff' 0.52 0.66 0.30 over 0.45
finish glassy-light 0.22
