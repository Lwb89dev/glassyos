#!/usr/bin/env -S gjs -m
/*
 * Genera i CSS del tema dai modelli in theme/Glassy/templates, secondo le impostazioni.
 *
 *   gjs -m tools/render-theme.js --theme theme/Glassy --out /tmp/glassy        # con i predefiniti
 *   gjs -m tools/render-theme.js --theme ~/.local/share/themes/Glassy --settings-from ~/.local/share/gnome-shell/extensions/glassy-desktop@glassy-os
 *
 *   --theme DIR           cartella del tema con templates/ (predefinito: quella installata)
 *   --out DIR             dove scrivere i CSS (predefinito: dentro --theme)
 *   --settings-from DIR   cartella dell'estensione con gli schemi: usa i valori salvati dall'utente
 *   --accent NOME         colore d'accento (predefinito: quello di sistema, o blue con --defaults)
 *   --defaults            ignora impostazioni e accento di sistema
 *   --set CHIAVE=VALORE   forza una voce (ripetibile), es. --set glass-strength=100 --set traffic-lights=false
 */
import GLib from 'gi://GLib';
import System from 'system';

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const mod = await import(`file://${GLib.build_filenamev([here, '..', 'extension', 'glassy-desktop@glassy-os', 'themegen.js'])}`);

const args = System.programArgs;
const opt = (name, def = null) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : def;
};

const theme = opt('--theme', GLib.build_filenamev([GLib.get_user_data_dir(), 'themes', 'Glassy']));
const out = opt('--out', theme);
const defaults = args.includes('--defaults');
const extDir = opt('--settings-from');

const settings = !defaults && extDir ? mod.openSettings(extDir) : null;
const cfg = mod.readConfig(settings);
args.forEach((a, i) => {
    if (a !== '--set')
        return;
    const [k, v] = args[i + 1].split('=');
    if (!(k in cfg))
        throw new Error(`chiave sconosciuta: ${k}`);
    cfg[k] = typeof cfg[k] === 'boolean' ? v === 'true' : parseInt(v, 10);
});
const accent = opt('--accent', defaults ? 'blue' : mod.systemAccent());

const changed = mod.renderTheme(theme, cfg, accent, out);
print(changed.length ? `rigenerati: ${changed.join(', ')}` : 'tema già aggiornato');
