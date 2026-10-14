#!/usr/bin/env bash
# Apre (o fotografa) una finestra di prova con il tema Glassy.
#   tools/preview.sh [gtk4] [--scheme dark|light] [--no-css] [--shot file.png]
#   tools/preview.sh gtk3  [--dark] [--shot file.png]
# Il tema viene caricato come fa il sistema, ma da cartelle temporanee: la tua
# configurazione resta intatta.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
kind=gtk4
if [[ "${1:-}" == gtk3 || "${1:-}" == gtk4 ]]; then kind=$1; shift; fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Il tema si genera dai modelli: si copia lo scheletro in una cartella temporanea e si renderizza lì.
# Opzioni di tema (es. glass-strength=100) si passano con GLASSY_SET="glass-strength=100 traffic-lights=false".
build_theme() {  # cartella-destinazione
    cp -r "$root/theme/Glassy" "$1"
    local sets=() kv
    for kv in ${GLASSY_SET:-}; do sets+=(--set "$kv"); done
    gjs -m "$root/tools/render-theme.js" --theme "$1" --defaults "${sets[@]}" >/dev/null
}

if [[ $kind == gtk4 ]]; then
    mkdir -p "$tmp/gtk-4.0"
    if [[ " $* " != *" --no-css "* ]]; then
        build_theme "$tmp/Glassy"
        ln -s "$tmp/Glassy/gtk-4.0/glassy.css" "$tmp/gtk-4.0/gtk.css"
    fi
    XDG_CONFIG_HOME="$tmp" gjs -m "$root/tools/preview-gtk4.js" "$@"
else
    theme="$tmp/data/themes/Glassy"
    mkdir -p "$tmp/data/themes"
    build_theme "$theme"
    "$root/tools/fetch-adw-gtk3.sh" "$theme"
    variant=Glassy
    [[ " $* " == *" --dark "* ]] && variant=Glassy:dark
    XDG_DATA_HOME="$tmp/data" XDG_CONFIG_HOME="$tmp/cfg" GTK_THEME="$variant" gjs "$root/tools/preview-gtk3.js" "$@"
fi
