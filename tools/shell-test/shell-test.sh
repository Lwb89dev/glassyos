#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Banco di prova per l'estensione e il tema della Shell.
#
#  Avvia una GNOME Shell VERA ma headless (schermo virtuale) su un bus D-Bus privato,
#  con HOME e GSettings isolati: la tua sessione non viene toccata. Dentro si può
#  lanciare qualsiasi app, muovere un puntatore virtuale e fare screenshot.
#
#  Uso: tools/shell-test/shell-test.sh [opzioni]
#    --steps FILE      script ESM con `export async function run(t)` (vedi shot-test@glassy)
#    --out DIR         dove salvare gli screenshot (predefinito: /tmp)
#    --exts LISTA      estensioni da attivare, separate da virgola
#    --clients 'CMD'   comandi da avviare dentro la sessione (WAYLAND_DISPLAY già impostato)
#    --size WxH        schermo virtuale (predefinito 1600x900)
#    --delay SEC       attesa prima degli step (predefinito 6)
#    --timeout SEC     tempo massimo (predefinito 60)
#    --x11             avvia anche Xwayland (i client trovano DISPLAY/XAUTHORITY in $STATE)
#    --gsettings 'CMD' comandi gsettings da eseguire prima dell'avvio
#    --reinstall       reinstalla Glassy (install.sh) nella home di prova
#    --shell-log       stampa anche il log completo della Shell
#
#  Richiede dbus-run-session (pacchetto dbus-1-daemon). Su openSUSE, se manca, lo scarica
#  e lo estrae in ~/.cache senza installare nulla.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/glassy-os/shell-test"
VM="$CACHE/home"
RT="/run/user/$(id -u)/glassyvm"           # corto: il socket Wayland ha un limite di ~107 caratteri
STATE="$CACHE/state"

STEPS="" OUT="/tmp" EXTS="user-theme@gnome-shell-extensions.gcampax.github.com,blur-my-shell@aunetx,glassy-desktop@glassy-os"
CLIENTS="" SIZE="1600x900" DELAY=6 TIMEOUT=60 X11=0 GS_EXTRA="true" REINSTALL=0 FULLLOG=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --steps) STEPS="$(realpath "$2")"; shift 2 ;;
        --out) OUT="$(realpath -m "$2")"; shift 2 ;;
        --exts) EXTS="$2"; shift 2 ;;
        --clients) CLIENTS="$2"; shift 2 ;;
        --size) SIZE="$2"; shift 2 ;;
        --delay) DELAY="$2"; shift 2 ;;
        --timeout) TIMEOUT="$2"; shift 2 ;;
        --x11) X11=1; shift ;;
        --gsettings) GS_EXTRA="$2"; shift 2 ;;
        --reinstall) REINSTALL=1; shift ;;
        --shell-log) FULLLOG=1; shift ;;
        -h|--help) sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,2\}//'; exit 0 ;;
        *) echo "opzione sconosciuta: $1" >&2; exit 2 ;;
    esac
done

mkdir -p "$CACHE" "$VM/.config" "$VM/.local/share/gnome-shell/extensions" "$VM/.cache" "$RT" "$STATE" "$OUT"
chmod 700 "$RT"

# ── dbus-run-session ─────────────────────────────────────────────────────────
DBUS_BIN="$CACHE/dbus/usr/bin"
ensure_dbus() {
    command -v dbus-run-session >/dev/null && return 0
    [[ -x "$DBUS_BIN/dbus-run-session" ]] && { export PATH="$DBUS_BIN:$PATH"; return 0; }
    if ! command -v zypper >/dev/null; then
        echo "manca dbus-run-session: installa il pacchetto dbus-daemon (dbus-1-daemon / dbus-daemon)" >&2; exit 1
    fi
    echo "scarico dbus-1-daemon (solo in $CACHE, niente root)…" >&2
    local ver
    ver="$(LC_ALL=C zypper --no-refresh se -s -x dbus-1-daemon | awk -F'|' '/dbus-1-daemon/ {gsub(/ /,"",$4); print $4; exit}')"
    mkdir -p "$CACHE/dbus"
    curl -fsSL -o "$CACHE/dbus/pkg.rpm" "https://download.opensuse.org/tumbleweed/repo/oss/x86_64/dbus-1-daemon-$ver.x86_64.rpm"
    (cd "$CACHE/dbus" && { command -v rpm2cpio >/dev/null && rpm2cpio pkg.rpm | cpio -idm --quiet || bsdtar -xf pkg.rpm; })
    export PATH="$DBUS_BIN:$PATH"
}
ensure_dbus

cat > "$CACHE/session.conf" <<'XML'
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <keep_umask/>
  <listen>unix:tmpdir=/tmp</listen>
  <auth>EXTERNAL</auth>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
XML

# ── ambiente isolato ─────────────────────────────────────────────────────────
vmenv() {
    env -u DBUS_SESSION_BUS_ADDRESS -u GSETTINGS_SCHEMA_DIR -u WAYLAND_DISPLAY -u DISPLAY \
        HOME="$VM" XDG_CONFIG_HOME="$VM/.config" XDG_DATA_HOME="$VM/.local/share" XDG_CACHE_HOME="$VM/.cache" \
        XDG_RUNTIME_DIR="$RT" GSETTINGS_BACKEND=keyfile "$@"
}

if ((REINSTALL)) || [[ ! -d "$VM/.local/share/themes/Glassy" ]]; then
    echo "installo Glassy nella home di prova…" >&2
    vmenv "$ROOT/install.sh" -y --no-flatpak >/dev/null
fi

# File di sviluppo aggiornati ad ogni avvio (estensione, estensione di collaudo, CSS del tema)
EXTD="$VM/.local/share/gnome-shell/extensions"
for src in "$ROOT/extension/glassy-desktop@glassy-os" "$ROOT/tools/shell-test/shot-test@glassy"; do
    dest="$EXTD/$(basename "$src")"
    rm -rf "$dest"; cp -r "$src" "$dest"
    [[ -d "$dest/schemas" ]] && glib-compile-schemas "$dest/schemas"
done
T="$VM/.local/share/themes/Glassy"
rm -rf "$T/templates"; cp -r "$ROOT/theme/Glassy/templates" "$T/templates"
vmenv gjs -m "$ROOT/tools/render-theme.js" --theme "$T" --settings-from "$EXTD/glassy-desktop@glassy-os" >/dev/null
# estensioni di cui si installano gli schemi (compilati) per i gsettings della prova
SCHEMAS="$(ls -d "$EXTD"/*/schemas 2>/dev/null | tr '\n' ':')"

rm -f "$STATE"/x11-* "$CACHE/shell.log"
list="[$(printf "'%s', " ${EXTS//,/ } 'shot-test@glassy' | sed 's/, $//')]"

export SHOT_STEPS="$STEPS" SHOT_DELAY="$DELAY" SHOT_OUT="$OUT" SHOT_STATE_DIR="$STATE"
export TEST_CLIENTS="$CLIENTS" TEST_GS="$GS_EXTRA" TEST_SIZE="$SIZE" TEST_LIST="$list" TEST_X11="$X11" TEST_STATE="$STATE"
export GSETTINGS_SCHEMA_DIR="$SCHEMAS"

vmenv timeout "$TIMEOUT" dbus-run-session --config-file="$CACHE/session.conf" -- bash -c '
    gsettings set org.gnome.shell enabled-extensions "$TEST_LIST"
    gsettings set org.gnome.shell disable-user-extensions false
    eval "$TEST_GS"
    (
        if [ "$TEST_X11" = 1 ]; then
            for i in $(seq 1 40); do [ -s "$TEST_STATE/x11-display" ] && break; sleep 0.5; done
            export DISPLAY="$(cat "$TEST_STATE/x11-display" 2>/dev/null)" XAUTHORITY="$(cat "$TEST_STATE/x11-xauth" 2>/dev/null)"
        fi
        sleep 3
        export WAYLAND_DISPLAY=glassy-shell GDK_BACKEND=wayland
        eval "$TEST_CLIENTS"
    ) &
    extra=--no-x11; [ "$TEST_X11" = 1 ] && extra=
    exec gnome-shell --headless --wayland $extra --wayland-display=glassy-shell --virtual-monitor "$TEST_SIZE"
' > "$CACHE/shell.log" 2>&1 || true

# Log filtrato: solo ciò che riguarda Glassy e gli errori veri
if ((FULLLOG)); then
    cat "$CACHE/shell.log"
else
    grep -iE "glassy|\[steps\]|\[shot-test\]|JS ERROR|TypeError|ReferenceError|SyntaxError|St-CRITICAL|Clutter-CRITICAL" "$CACHE/shell.log" \
        | grep -vE "Gjs-CRITICAL|disposed" | cut -c1-300 || true
fi
