#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Glassy — installer
#
#  Installa tutto quello che serve per avere GNOME in vetro smerigliato, in stile
#  macOS: tema GTK3/GTK4/libadwaita e Shell, icone Tela-ubuntu, sfondi, e le
#  estensioni già configurate: dock con ingrandimento, launcher a schermo intero
#  (al posto di Attività/Overview), sfocato e effetto "lampada" alla minimizzazione.
#
#  Prima di toccare le impostazioni salva i valori originali: ./uninstall.sh
#  riporta tutto com'era.
#
#  Uso: ./install.sh [opzioni]        (./install.sh --help per l'elenco)
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

THEME_NAME="Glassy"

# Icone Tela (GPL-3.0, di Vinceliuice): non fanno parte di questo repository, che è MIT.
# Se accanto all'installer c'è una cartella ./Tela-ubuntu si usa quella; altrimenti si scarica
# da upstream una versione precisa, verificata con SHA-256.
ICON_PACK_DIR="$ROOT/Tela-ubuntu"
ICON_FROM_UPSTREAM=0
TELA_TAG="2026-07-07"
TELA_URL="https://github.com/vinceliuice/Tela-icon-theme/archive/refs/tags/$TELA_TAG.tar.gz"
TELA_SHA256="6b8c28f637067a15551459ab90e6720c5aba1215b777b6f1f506fea188a1ddf9"
TMP_DIRS=()

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
THEMES_DIR="$DATA_HOME/themes"
ICONS_DIR="$DATA_HOME/icons"
EXT_DIR="$DATA_HOME/gnome-shell/extensions"
STATE_DIR="$DATA_HOME/glassy-os"
MANIFEST="$STATE_DIR/manifest"
GS_BACKUP="$STATE_DIR/gsettings.backup"

# Estensioni scaricate da extensions.gnome.org (uuid) …
EXTENSIONS=(
    "user-theme@gnome-shell-extensions.gcampax.github.com"   # serve per il tema della Shell
    "blur-my-shell@aunetx"                                   # sfocato vero
    "compiz-alike-magic-lamp-effect@hermes83.github.com"     # effetto "lampada" (genio) in minimizzazione
)
# … e quella scritta per Glassy, che sta in ./extension (dock, launcher, niente Activities).
LOCAL_EXTENSION="glassy-desktop@glassy-os"
# Quelle che si pestano i piedi con il dock/layout stile Mac: vengono disattivate (non rimosse).
CONFLICTING=(
    "dash-to-panel@jderose9.github.com"
    "dash-to-dock@micxgx.gmail.com"
    "ubuntu-dock@ubuntu.com"
    "dash2dock-lite@icedman.github.com"
    "arcmenu@arcmenu.com"
    "start_menu@slim8916.github.io"
)

# Colori d'accento accettati (i nove di GNOME)
valid_accent() {
    case "$1" in blue|teal|green|yellow|orange|red|pink|purple|slate) return 0 ;; *) return 1 ;; esac
}

# ── Opzioni ──────────────────────────────────────────────────────────────────
ACCENT="blue"
SCHEME="dark"
ACCENT_GIVEN=0      # accento e schema si impostano solo al primo giro o se richiesti: non si pesta
SCHEME_GIVEN=0      # ciò che l'utente ha scelto nel pannello delle impostazioni
ASSUME_YES=0
DRY_RUN=0
DO_ICONS=1
DO_WALLPAPER=1
DO_EXTENSIONS=1
DO_DOCK=1
DO_FLATPAK=1
RESTART_APPS=ask

usage() {
    cat <<EOF
Glassy — installer

Uso: ./install.sh [opzioni]

  --accent COLORE    blue (predefinito), teal, green, yellow, orange, red, pink, purple, slate
  --dark | --light   schema colori di sistema (predefinito: --dark)
  --no-extensions    non scaricare né configurare estensioni (niente rete per quelle)
  --no-dock          non toccare il layout: niente dock/launcher e le tue estensioni restano attive
  --no-icons         non installare il pacchetto icone Tela-ubuntu
  --no-wallpaper     non cambiare lo sfondo
  --no-flatpak       non dare ai Flatpak l'accesso al tema (gtk.css) e alle icone
  --restart-apps     chiudi Nautilus senza chiedere (le app già aperte non ricaricano lo stile)
  --dry-run          mostra cosa verrebbe fatto, senza modificare nulla
  -y, --yes          non chiedere conferma
  -h, --help         questo aiuto

Per tornare indietro: ./uninstall.sh
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --accent)        ACCENT="${2:-}"; ACCENT_GIVEN=1; shift 2 ;;
        --accent=*)      ACCENT="${1#*=}"; ACCENT_GIVEN=1; shift ;;
        --dark)          SCHEME="dark"; SCHEME_GIVEN=1; shift ;;
        --light)         SCHEME="light"; SCHEME_GIVEN=1; shift ;;
        --no-extensions) DO_EXTENSIONS=0; shift ;;
        --no-dock)       DO_DOCK=0; shift ;;
        --no-icons)      DO_ICONS=0; shift ;;
        --no-wallpaper)  DO_WALLPAPER=0; shift ;;
        --no-flatpak)    DO_FLATPAK=0; shift ;;
        --restart-apps)  RESTART_APPS=yes; shift ;;
        --dry-run)       DRY_RUN=1; shift ;;
        -y|--yes)        ASSUME_YES=1; shift ;;
        -h|--help)       usage; exit 0 ;;
        *) echo "opzione sconosciuta: $1 (vedi --help)" >&2; exit 2 ;;
    esac
done

valid_accent "$ACCENT" || { echo "accento non valido: '$ACCENT' (vedi --help)" >&2; exit 2; }

# ── Output ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    C_B=$'\e[1m'; C_D=$'\e[2m'; C_R=$'\e[31m'; C_G=$'\e[32m'; C_Y=$'\e[33m'; C_C=$'\e[36m'; C_0=$'\e[0m'
else
    C_B=""; C_D=""; C_R=""; C_G=""; C_Y=""; C_C=""; C_0=""
fi
step() { printf '\n%s▸ %s%s\n' "$C_C$C_B" "$*" "$C_0"; }
info() { printf '  %s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_Y" "$C_0" "$*" >&2; }
die()  { printf '%s✗ %s%s\n' "$C_R" "$*" "$C_0" >&2; exit 1; }

trap 'printf "%s✗ errore alla riga %s (comando: %s)%s\n" "$C_R" "$LINENO" "$BASH_COMMAND" "$C_0" >&2' ERR
cleanup() { local d; for d in ${TMP_DIRS[@]+"${TMP_DIRS[@]}"}; do rm -rf "$d"; done; }
trap cleanup EXIT

# Esegue (o, con --dry-run, mostra) un comando che modifica il sistema.
run() {
    if ((DRY_RUN)); then
        printf '  %s[dry-run]%s' "$C_D" "$C_0"; printf ' %q' "$@"; printf '\n'
    else
        "$@"
    fi
}

have() { command -v "$1" >/dev/null 2>&1; }

# ── Utilità GSettings / manifest ─────────────────────────────────────────────
manifest_add() {  # tipo valore
    ((DRY_RUN)) && return 0
    mkdir -p "$STATE_DIR"
    local line="$1 $2"
    grep -qxF -- "$line" "$MANIFEST" 2>/dev/null || printf '%s\n' "$line" >> "$MANIFEST"
}

gs_get() { gsettings get "$1" "$2" 2>/dev/null; }

# Salva il valore ORIGINALE (solo la prima volta) e poi imposta quello nuovo.
gs_set() {  # schema chiave valore
    local schema=$1 key=$2 value=$3 old
    if ((DRY_RUN)); then
        printf '  %s[dry-run]%s gsettings set %s %s %s\n' "$C_D" "$C_0" "$schema" "$key" "${value:0:70}"
        return 0
    fi
    if ! old="$(gs_get "$schema" "$key")"; then
        warn "chiave non trovata, salto: $schema $key"
        return 0
    fi
    mkdir -p "$STATE_DIR"
    if ! grep -q -- "^$schema"$'\t'"$key"$'\t' "$GS_BACKUP" 2>/dev/null; then
        printf '%s\t%s\t%s\n' "$schema" "$key" "$old" >> "$GS_BACKUP"
    fi
    gsettings set "$schema" "$key" "$value" 2>/dev/null || warn "impossibile impostare $schema $key"
}

trim() {  # stringa → stringa senza spazi ai lati
    local v=$1
    v="${v#"${v%%[![:space:]]*}"}"
    printf '%s' "${v%"${v##*[![:space:]]}"}"
}

# 'a', 'b' → una voce per riga (per leggere le liste di GSettings senza dipendenze).
gs_list_items() {
    sed -e 's/^@as //' -e 's/^\[//' -e 's/\]$//' <<<"$1" | tr ',' '\n' | sed -e "s/^[[:space:]]*'//" -e "s/'[[:space:]]*\$//" | sed '/^$/d'
}

gs_list_format() {  # voci su stdin → ['a', 'b']
    local out="" item
    while IFS= read -r item; do out+="${out:+, }'$item'"; done
    printf '[%s]' "$out"
}

fetch() {  # url file
    if have curl; then curl -fsSL --retry 2 --connect-timeout 15 --max-time 180 -o "$2" "$1"
    else wget -q --tries=2 --timeout=20 -O "$2" "$1"; fi
}
fetch_text() {  # url → stdout
    if have curl; then curl -fsSL --retry 2 --connect-timeout 15 --max-time 30 "$1"
    else wget -q --tries=2 --timeout=20 -O - "$1"; fi
}

# ── Controlli iniziali ───────────────────────────────────────────────────────
preflight() {
    step "Controllo il sistema"
    [[ $EUID -ne 0 ]] || die "non eseguire come root: Glassy si installa nella tua cartella personale."
    have gsettings || die "manca 'gsettings' (pacchetto glib2-tools / libglib2.0-bin)."
    have gnome-shell || die "GNOME Shell non trovata: Glassy è un tema per GNOME."

    SHELL_MAJOR="$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
    [[ -n "$SHELL_MAJOR" ]] || die "non riesco a leggere la versione di GNOME Shell."
    ((SHELL_MAJOR >= 45)) || die "serve GNOME 45 o successivo (trovato $SHELL_MAJOR)."
    ok "GNOME Shell $SHELL_MAJOR (${XDG_SESSION_TYPE:-sessione sconosciuta})"

    local missing=()
    have curl || have wget || missing+=("curl")
    have tar || missing+=("tar")
    have xz  || missing+=("xz")
    have sha256sum || missing+=("coreutils (sha256sum)")
    if ((DO_EXTENSIONS)); then
        have glib-compile-schemas || missing+=("glib2-tools (glib-compile-schemas)")
        have unzip || have python3 || missing+=("unzip")
    fi
    if ((${#missing[@]})); then
        warn "mancano: ${missing[*]}"
        if   have zypper; then info "installa con:  sudo zypper install curl tar xz unzip glib2-tools"
        elif have apt;    then info "installa con:  sudo apt install curl tar xz-utils unzip libglib2.0-bin"
        elif have dnf;    then info "installa con:  sudo dnf install curl tar xz unzip glib2"
        elif have pacman; then info "installa con:  sudo pacman -S curl tar xz unzip glib2"
        fi
        die "installa i pacchetti mancanti e riesegui."
    fi
    ok "strumenti necessari presenti"

    [[ -d "$ROOT/theme/$THEME_NAME" ]] || die "cartella del tema non trovata in $ROOT/theme/$THEME_NAME"
    if ((DO_ICONS)) && [[ ! -d "$ICON_PACK_DIR" ]]; then
        ICON_FROM_UPSTREAM=1
        info "cartella icone locale assente: Tela $TELA_TAG verrà scaricata da upstream"
    fi
}

show_plan() {
    step "Cosa farò"
    info "• tema $THEME_NAME (GTK3, GTK4/libadwaita, GNOME Shell) con accento ${C_B}$ACCENT${C_0}, schema ${C_B}$SCHEME${C_0}"
    if ((DO_ICONS && ICON_FROM_UPSTREAM)); then
        info "• icone Tela-ubuntu $TELA_TAG, scaricate da GitHub (GPL-3.0, verifica SHA-256)"
    elif ((DO_ICONS)); then
        info "• icone Tela-ubuntu (cartelle: $(find "$ICON_PACK_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f ' | sed 's/ $//'))"
    fi
    ((DO_WALLPAPER))  && info "• sfondi Glassy Aurora (chiaro e scuro)"
    ((DO_EXTENSIONS)) && info "• estensioni scaricate da extensions.gnome.org: User Themes, Blur my Shell, Magic Lamp"
    ((DO_DOCK))       && info "• estensione Glassy Desktop: dock con ingrandimento, launcher al posto di Attività, pulsanti finestra a sinistra"
    if ((DO_DOCK)); then
        local c active=() current
        current="$(gs_get org.gnome.shell enabled-extensions || true)"
        for c in "${CONFLICTING[@]}"; do grep -qF "'$c'" <<<"$current" && active+=("$c"); done
        ((${#active[@]})) && warn "verranno DISATTIVATE (non rimosse): ${active[*]}"
    fi
    info "• prima di cambiare le impostazioni salvo i valori originali in ${STATE_DIR/#$HOME/~}"
    info "• per tornare indietro: ./uninstall.sh"
    ((DRY_RUN)) && warn "modalità --dry-run: non cambierà nulla"

    if ((!ASSUME_YES && !DRY_RUN)) && [[ -t 0 ]]; then
        local reply
        read -r -p $'\nProcedo? [S/n] ' reply
        [[ -z "$reply" || "$reply" =~ ^[sSyY] ]] || { info "Annullato."; exit 0; }
    fi
}

# ── Passi di installazione ───────────────────────────────────────────────────
same_tree() {  # a b → 0 se hanno lo stesso numero di voci e lo stesso index.theme
    [[ -d "$1" && -d "$2" ]] || return 1
    cmp -s "$1/index.theme" "$2/index.theme" || return 1
    [[ "$(find "$1" | wc -l)" == "$(find "$2" | wc -l)" ]]
}

# Scarica Tela da upstream e genera le tre cartelle Tela-ubuntu* in una cartella temporanea.
fetch_icon_pack() {
    local tmp
    tmp="$(mktemp -d)"
    TMP_DIRS+=("$tmp")
    info "scarico Tela $TELA_TAG…"
    fetch "$TELA_URL" "$tmp/tela.tar.gz" || die "download delle icone fallito ($TELA_URL). Riprova, oppure metti la cartella Tela-ubuntu accanto a install.sh, oppure usa --no-icons."
    [[ "$(sha256sum "$tmp/tela.tar.gz" | cut -d' ' -f1)" == "$TELA_SHA256" ]] \
        || die "le icone scaricate non corrispondono all'hash atteso (SHA-256): non le installo."
    mkdir -p "$tmp/src" "$tmp/out"
    tar -xzf "$tmp/tela.tar.gz" -C "$tmp/src" --strip-components=1
    bash "$tmp/src/install.sh" -d "$tmp/out" ubuntu >/dev/null 2>&1 || die "la generazione delle icone Tela è fallita."
    [[ -f "$tmp/out/Tela-ubuntu/index.theme" ]] || die "pacchetto icone Tela inatteso: manca Tela-ubuntu."
    ICON_PACK_DIR="$tmp/out"
}

install_icons() {
    step "Icone"
    local src name dest existed
    if ((ICON_FROM_UPSTREAM)); then
        if ((DRY_RUN)); then
            info "[dry-run] scaricherei Tela $TELA_TAG da GitHub (SHA-256 $TELA_SHA256) e installerei Tela-ubuntu, -dark, -light"
            return 0
        fi
        fetch_icon_pack
    fi
    for src in "$ICON_PACK_DIR"/*/; do
        [[ -f "$src/index.theme" ]] || continue
        name="$(basename "$src")"
        dest="$ICONS_DIR/$name"
        if same_tree "$src" "$dest"; then
            ok "$name già installata"
            continue
        fi
        info "copio $name ($(du -sh "$src" | cut -f1))…"
        existed=0
        if [[ -e "$dest" ]]; then existed=1; warn "sostituisco la versione già presente di $name"; fi
        run mkdir -p "$ICONS_DIR"
        run rm -rf "$dest.glassy-tmp" "$dest"
        run cp -a "$src" "$dest.glassy-tmp"
        run mv "$dest.glassy-tmp" "$dest"
        # In disinstallazione si rimuove solo ciò che l'installer ha creato da zero.
        ((existed)) || manifest_add icons "$name"
        if have gtk-update-icon-cache; then run gtk-update-icon-cache -q -f -t "$dest" || true; fi
        ok "$name installata"
    done
}

install_theme() {
    step "Tema $THEME_NAME"
    local dest="$THEMES_DIR/$THEME_NAME"
    run mkdir -p "$THEMES_DIR"
    run rm -rf "$dest"
    run cp -r "$ROOT/theme/$THEME_NAME" "$dest"
    manifest_add theme "$THEME_NAME"
    ok "file del tema copiati in ${dest/#$HOME/~}"

    info "scarico la base adw-gtk3 per GTK3 (e per le app GTK4 non libadwaita)…"
    if ((DRY_RUN)); then
        info "[dry-run] tools/fetch-adw-gtk3.sh $dest"
    elif "$ROOT/tools/fetch-adw-gtk3.sh" "$dest"; then
        ok "adw-gtk3 installato"
    else
        warn "adw-gtk3 non disponibile: le app GTK3 useranno Adwaita come base (meno rifinito)."
    fi

    # CSS generati dai modelli (prima coi predefiniti: il tema è subito utilizzabile; il passo
    # render_theme, più avanti, lo rigenera con i valori salvati e l'accento di sistema).
    if ((!DRY_RUN)); then
        gjs -m "$ROOT/tools/render-theme.js" --theme "$dest" --defaults >/dev/null \
            || die "non riesco a generare i CSS del tema (serve gjs)"
    else
        info "[dry-run] tools/render-theme.js --theme $dest"
    fi

    # GTK4/libadwaita: le app ignorano il tema e leggono solo ~/.config/gtk-4.0/gtk.css.
    local gtk4="$CONFIG_HOME/gtk-4.0/gtk.css" target="$dest/gtk-4.0/glassy.css"
    run mkdir -p "$CONFIG_HOME/gtk-4.0"
    if [[ -L "$gtk4" && "$(readlink "$gtk4")" == "$target" ]]; then
        ok "gtk.css di GTK4 già collegato"
    else
        if [[ -e "$gtk4" || -L "$gtk4" ]]; then
            run mkdir -p "$STATE_DIR/backup/gtk-4.0"
            if [[ ! -e "$STATE_DIR/backup/gtk-4.0/gtk.css" && ! -L "$STATE_DIR/backup/gtk-4.0/gtk.css" ]]; then
                run mv "$gtk4" "$STATE_DIR/backup/gtk-4.0/gtk.css"
                manifest_add gtk4-backup gtk.css
                warn "il tuo ~/.config/gtk-4.0/gtk.css è salvato in ${STATE_DIR/#$HOME/~}/backup/gtk-4.0/"
            else
                run rm -f "$gtk4"
            fi
        fi
        run ln -s "$target" "$gtk4"
        manifest_add link "$gtk4"
        ok "~/.config/gtk-4.0/gtk.css → tema (app libadwaita)"
    fi

    if grep -qs 'gtk-theme-name' "$CONFIG_HOME/gtk-3.0/settings.ini" 2>/dev/null; then
        warn "~/.config/gtk-3.0/settings.ini imposta gtk-theme-name: potrebbe prevalere sul tema GTK3."
    fi
}

# Rigenera i CSS con le impostazioni salvate dall'utente (se ce ne sono) e l'accento di sistema attuale.
render_theme() {
    step "Generazione del tema"
    local dest="$THEMES_DIR/$THEME_NAME" ext="$EXT_DIR/$LOCAL_EXTENSION" args=()
    if ((DRY_RUN)); then info "[dry-run] rigenererei il tema con le impostazioni salvate"; return 0; fi
    args=(--theme "$dest")
    if [[ -d "$ext/schemas" ]]; then args+=(--settings-from "$ext"); fi
    gjs -m "$ROOT/tools/render-theme.js" "${args[@]}" | sed 's/^/  /'
    ok "tema generato (accento di sistema: $(gs_get org.gnome.desktop.interface accent-color | tr -d "'"))"
}

# Voce "Impostazioni di Glassy" nel menu delle app: apre il pannello dell'estensione.
install_settings_entry() {
    local file="$DATA_HOME/applications/glassy-settings.desktop"
    run mkdir -p "$(dirname "$file")"
    if ((!DRY_RUN)); then
        cat > "$file" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Impostazioni di Glassy
Comment=Regola dock, launcher e aspetto del tema
Exec=gnome-extensions prefs $LOCAL_EXTENSION
Icon=$EXT_DIR/$LOCAL_EXTENSION/icons/glassy-settings.svg
Categories=Settings;GTK;
Keywords=glassy;tema;dock;aspetto;
DESKTOP
        manifest_add file "$file"
    fi
    ok "voce «Impostazioni di Glassy» nel menu delle app"
}

install_wallpapers() {
    step "Sfondi"
    local dest="$DATA_HOME/backgrounds/glassy" xml="$DATA_HOME/gnome-background-properties/glassy.xml"
    run mkdir -p "$dest" "$(dirname "$xml")"
    run cp "$ROOT/wallpapers/glassy-dark.jpg" "$ROOT/wallpapers/glassy-light.jpg" "$dest/"
    manifest_add dir "$dest"
    if ((!DRY_RUN)); then
        cat > "$xml" <<EOF
<?xml version="1.0"?>
<!DOCTYPE wallpapers SYSTEM "gnome-wp-list.dtd">
<wallpapers>
  <wallpaper deleted="false">
    <name>Glassy Aurora</name>
    <filename>$dest/glassy-light.jpg</filename>
    <filename-dark>$dest/glassy-dark.jpg</filename-dark>
    <options>zoom</options>
    <shade_type>solid</shade_type>
    <pcolor>#7b6cf0</pcolor>
    <scolor>#7b6cf0</scolor>
  </wallpaper>
</wallpapers>
EOF
        manifest_add file "$xml"
    fi
    WALLPAPER_DIR="$dest"
    ok "sfondi installati"
}

# Scarica un'estensione da extensions.gnome.org per la versione corrente di GNOME.
install_extension() {  # uuid
    local uuid=$1 dir="$EXT_DIR/$uuid" sys="/usr/share/gnome-shell/extensions/$uuid"

    if [[ -d "$sys" ]]; then
        ok "$uuid: già disponibile a livello di sistema"
        return 0
    fi
    if [[ -f "$dir/metadata.json" ]] && grep -qE "\"$SHELL_MAJOR(\.[0-9]+)*\"" "$dir/metadata.json"; then
        ok "$uuid: già installata e compatibile"
        [[ -f "$dir/schemas/gschemas.compiled" || ! -d "$dir/schemas" ]] || run glib-compile-schemas "$dir/schemas"
        return 0
    fi
    if ((DRY_RUN)); then
        info "[dry-run] scaricherei $uuid per GNOME $SHELL_MAJOR"
        return 0
    fi

    local info_json dl tmp
    if ! info_json="$(fetch_text "https://extensions.gnome.org/extension-info/?uuid=$uuid&shell_version=$SHELL_MAJOR")"; then
        warn "$uuid: extensions.gnome.org non raggiungibile"; return 1
    fi
    dl="$(sed -n 's/.*"download_url": *"\([^"]*\)".*/\1/p' <<<"$info_json" | head -1)"
    if [[ -z "$dl" ]]; then
        warn "$uuid: non risulta compatibile con GNOME $SHELL_MAJOR"; return 1
    fi

    tmp="$(mktemp -d)"
    if ! fetch "https://extensions.gnome.org$dl" "$tmp/ext.zip"; then
        warn "$uuid: download fallito"; rm -rf "$tmp"; return 1
    fi
    if have unzip; then unzip -q -o "$tmp/ext.zip" -d "$tmp/x"
    else python3 -I -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$tmp/ext.zip" "$tmp/x"; fi

    if ! grep -q "\"uuid\": *\"$uuid\"" "$tmp/x/metadata.json" 2>/dev/null; then
        warn "$uuid: archivio non valido"; rm -rf "$tmp"; return 1
    fi
    mkdir -p "$EXT_DIR"
    rm -rf "$dir"
    mv "$tmp/x" "$dir"
    rm -rf "$tmp"
    [[ -d "$dir/schemas" ]] && glib-compile-schemas "$dir/schemas"
    manifest_add ext "$uuid"
    ok "$uuid installata"
}

# Un'estensione scritta per Glassy: si copia dal repo (sempre, così si aggiorna).
install_local_extension() {  # uuid
    local uuid=$1 src="$ROOT/extension/$1" dest="$EXT_DIR/$1" existed=0
    [[ -d "$src" ]] || { warn "$uuid: cartella $src non trovata"; return 1; }
    [[ -d "$dest" ]] && existed=1
    run mkdir -p "$EXT_DIR"
    run rm -rf "$dest"
    run cp -r "$src" "$dest"
    if ((!DRY_RUN)) && [[ -d "$dest/schemas" ]]; then glib-compile-schemas "$dest/schemas"; fi
    # se c'era già una versione nostra la voce nel manifest c'è già; se no, è nuova
    manifest_add ext "$uuid"
    ((existed)) && ok "$uuid aggiornata" || ok "$uuid installata"
}

# Dash to Dock non serve più (il dock è nell'estensione Glassy): se l'abbiamo messo noi, lo togliamo.
retire_dash_to_dock() {
    local uuid="dash-to-dock@micxgx.gmail.com"
    grep -qxF "ext $uuid" "$MANIFEST" 2>/dev/null || return 0
    if ((!DRY_RUN)) && [[ -d "$EXT_DIR/$uuid/schemas" ]]; then
        # azzera le sue impostazioni e toglile dal backup: non servono più
        GSETTINGS_SCHEMA_DIR="$EXT_DIR/$uuid/schemas${GSETTINGS_SCHEMA_DIR:+:$GSETTINGS_SCHEMA_DIR}" \
            gsettings reset-recursively org.gnome.shell.extensions.dash-to-dock 2>/dev/null || true
        [[ -f "$GS_BACKUP" ]] && sed -i '/^org\.gnome\.shell\.extensions\.dash-to-dock\t/d' "$GS_BACKUP"
    fi
    run rm -rf "$EXT_DIR/$uuid"
    ((DRY_RUN)) || sed -i "\#^ext $uuid\$#d" "$MANIFEST"
    ok "Dash to Dock (installato da una versione precedente) rimosso: ora c'è il dock di Glassy"
}

install_extensions() {
    step "Estensioni"
    INSTALLED_EXTENSIONS=()
    local uuid
    for uuid in "${EXTENSIONS[@]}"; do
        # Senza dock niente Magic Lamp (che si appoggia alle icone del dock).
        if ((!DO_DOCK)) && [[ $uuid == compiz-alike-* ]]; then continue; fi
        if install_extension "$uuid"; then INSTALLED_EXTENSIONS+=("$uuid"); fi
    done
    if ((DO_DOCK)); then
        retire_dash_to_dock
        if install_local_extension "$LOCAL_EXTENSION"; then INSTALLED_EXTENSIONS+=("$LOCAL_EXTENSION"); fi
    fi
}

# Elenco GSETTINGS_SCHEMA_DIR con le cartelle schemi delle estensioni (per leggere/scrivere le loro chiavi).
export_extension_schemas() {
    local uuid dirs=""
    for uuid in "${EXTENSIONS[@]}" "$LOCAL_EXTENSION"; do
        [[ -d "$EXT_DIR/$uuid/schemas" ]] && dirs+="${dirs:+:}$EXT_DIR/$uuid/schemas"
    done
    [[ -z "$dirs" ]] || export GSETTINGS_SCHEMA_DIR="$dirs${GSETTINGS_SCHEMA_DIR:+:$GSETTINGS_SCHEMA_DIR}"
}

enable_extensions() {
    step "Attivazione delle estensioni"
    local current items out uuid c
    current="$(gs_get org.gnome.shell enabled-extensions || echo "[]")"
    items="$(gs_list_items "$current")"

    if ((DO_DOCK)); then
        for c in "${CONFLICTING[@]}"; do
            if grep -qxF -- "$c" <<<"$items"; then
                items="$(grep -vxF -- "$c" <<<"$items" || true)"
                info "disattivo $c"
            fi
        done
    fi
    for uuid in "${INSTALLED_EXTENSIONS[@]}"; do
        grep -qxF -- "$uuid" <<<"$items" || items+="${items:+$'\n'}$uuid"
    done
    out="$(gs_list_format <<<"$items")"
    gs_set org.gnome.shell enabled-extensions "$out"
    gs_set org.gnome.shell disable-user-extensions false
    ok "elenco delle estensioni aggiornato"
}

apply_extension_settings() {
    step "Configurazione delle estensioni"
    if ((DRY_RUN)); then info "[dry-run] applicherei le impostazioni di config/extensions.settings"; return 0; fi

    local whitelist schemas line schema key value count=0 skipped=0
    whitelist="$(grep -vE '^\s*(#|$)' "$ROOT/config/blur-apps.txt" | gs_list_format)"
    schemas="$(gsettings list-schemas 2>/dev/null)"

    while IFS= read -r line; do
        [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
        IFS='|' read -r schema key value <<<"$line"
        schema="$(trim "$schema")"; key="$(trim "$key")"; value="$(trim "$value")"
        value="${value//@WHITELIST@/$whitelist}"

        # salta le righe delle estensioni non installate
        if ! grep -qx -- "$schema" <<<"$schemas"; then skipped=$((skipped + 1)); continue; fi
        gs_set "$schema" "$key" "$value"
        count=$((count + 1))
    done < "$ROOT/config/extensions.settings"

    ok "$count impostazioni applicate$( ((skipped)) && echo " ($skipped saltate: estensione non installata)")"
}

apply_desktop_settings() {
    step "Impostazioni del desktop"
    local icon_theme gtk_theme="$THEME_NAME"
    if [[ $SCHEME == dark ]]; then icon_theme="Tela-ubuntu-dark"; else icon_theme="Tela-ubuntu-light"; fi
    ((DO_ICONS)) || icon_theme=""

    gs_set org.gnome.desktop.interface gtk-theme "'$gtk_theme'"
    # Schema e accento: al primo giro o su richiesta. Alle reinstallazioni restano quelli scelti dall'utente.
    local first=1
    grep -q $'\tcolor-scheme\t' "$GS_BACKUP" 2>/dev/null && first=0
    if ((first || SCHEME_GIVEN)); then
        gs_set org.gnome.desktop.interface color-scheme "'prefer-$SCHEME'"
        [[ -z "$icon_theme" ]] || gs_set org.gnome.desktop.interface icon-theme "'$icon_theme'"
    fi
    if ((first || ACCENT_GIVEN)); then
        gs_set org.gnome.desktop.interface accent-color "'$ACCENT'"
    fi
    gs_set org.gnome.desktop.interface enable-animations true
    gs_set org.gnome.desktop.interface clock-show-weekday true
    ((DO_DOCK)) && gs_set org.gnome.desktop.interface enable-hot-corners false
    ok "tema $gtk_theme (accento $(gs_get org.gnome.desktop.interface accent-color | tr -d "'"), schema $(gs_get org.gnome.desktop.interface color-scheme | tr -d "'"))"

    if ((DO_DOCK)); then
        gs_set org.gnome.desktop.wm.preferences button-layout "'close,minimize,maximize:'"
        gs_set org.gnome.mutter center-new-windows true
        ok "pulsanti finestra a sinistra (rosso, giallo, verde); nuove finestre al centro"
    fi

    if ((DO_WALLPAPER)); then
        gs_set org.gnome.desktop.background picture-uri "'file://$WALLPAPER_DIR/glassy-light.jpg'"
        gs_set org.gnome.desktop.background picture-uri-dark "'file://$WALLPAPER_DIR/glassy-dark.jpg'"
        gs_set org.gnome.desktop.background picture-options "'zoom'"
        ok "sfondo Glassy Aurora"
    fi

    # Tema della Shell: richiede l'estensione User Themes.
    if [[ " ${INSTALLED_EXTENSIONS[*]:-} " == *" user-theme@"* ]] || [[ -d /usr/share/gnome-shell/extensions/user-theme@gnome-shell-extensions.gcampax.github.com ]]; then
        gs_set org.gnome.shell.extensions.user-theme name "'$THEME_NAME'"
        ok "tema della Shell: $THEME_NAME"
    else
        warn "User Themes non installata: il tema della Shell non verrà applicato."
    fi
}

setup_flatpak() {
    have flatpak || return 0
    step "Flatpak"
    local shown flag added=()
    shown="$(flatpak override --user --show 2>/dev/null || true)"
    for flag in "xdg-config/gtk-4.0:ro" "xdg-data/icons:ro"; do
        if grep -qF -- "$flag" <<<"$shown"; then continue; fi
        run flatpak override --user "--filesystem=$flag"
        manifest_add flatpak "$flag"
        added+=("$flag")
    done
    if ((${#added[@]})); then ok "i Flatpak possono leggere gtk.css e le icone (${added[*]})"
    else ok "già configurato"; fi
}

# Le app GNOME restano in memoria e leggono gtk.css solo all'avvio: Nautilus, in particolare,
# tiene il vecchio stile (e il vecchio layout dei pulsanti) finché non viene chiuso.
offer_restart_apps() {
    ((DRY_RUN)) && return 0
    pgrep -x nautilus >/dev/null 2>&1 || return 0
    local reply=n
    if [[ $RESTART_APPS == yes ]]; then
        reply=s
    elif [[ -t 0 && $ASSUME_YES -eq 0 ]]; then
        read -r -p $'\nNautilus è aperto e non ha ancora il nuovo stile. Lo chiudo ora (chiude le sue finestre)? [s/N] ' reply
    fi
    if [[ "$reply" =~ ^[sSyY] ]]; then
        nautilus -q >/dev/null 2>&1 || true
        ok "Nautilus chiuso: alla prossima apertura avrà lo stile Glassy"
    else
        info "Nautilus, e ogni app già aperta, prende lo stile al prossimo avvio (puoi chiuderlo con: nautilus -q)."
    fi
}

finish() {
    step "Fatto"
    if ((DRY_RUN)); then info "Nessuna modifica effettuata (--dry-run)."; return 0; fi
    cat <<EOF
  ${C_G}${C_B}Glassy è installato.${C_0}

  • Subito attivi: tema GTK, icone, sfondo, pulsanti finestra. Le app già aperte
    (Nautilus in primis) vanno chiuse e riaperte per prendere il nuovo stile.
  • ${C_B}Esci e rientra nella sessione${C_0} per attivare dock, launcher, sfocato e tema della Shell
    (su Wayland GNOME Shell non si può riavviare a caldo).
  • Dopo il rientro: il tasto Super apre il Launchpad al posto di Attività; il dock è in basso.
  • Regolare dock, launcher e tema:  app «Impostazioni di Glassy» (o dal menu del Launchpad nel dock)
  • Cambiare accento:   ./install.sh --accent purple   (oppure dalle Impostazioni di Glassy)
  • Tornare indietro:   ./uninstall.sh
EOF
}

# ── Main ─────────────────────────────────────────────────────────────────────
SHELL_MAJOR=""
WALLPAPER_DIR=""
INSTALLED_EXTENSIONS=()

preflight
show_plan

((DRY_RUN)) || mkdir -p "$STATE_DIR"
if ((DO_ICONS)); then install_icons; fi
install_theme
if ((DO_WALLPAPER)); then install_wallpapers; fi
if ((DO_EXTENSIONS)); then
    install_extensions
    export_extension_schemas
    enable_extensions
fi
apply_desktop_settings
if ((DO_EXTENSIONS)); then apply_extension_settings; fi
render_theme
if ((DO_DOCK && DO_EXTENSIONS)); then install_settings_entry; fi
if ((DO_FLATPAK)); then setup_flatpak; fi
offer_restart_apps
finish
