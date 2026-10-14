// Generatore del tema: trasforma i modelli (*.css.in) in CSS veri, secondo le impostazioni.
//
// Usato da tre parti: l'installer (tools/render-theme.js), il pannello impostazioni (prefs.js)
// e il banco di prova. Non importa nulla della Shell, quindi gira in qualunque processo gjs.
//
// Sintassi dei modelli (i marcatori stanno dentro commenti, così un modello resta CSS valido):
//   {{radius}} {{r}} {{r-1}} {{r+4}}   raggi: finestre / controlli, con un'operazione opzionale
//   {{a:0.64}}      alpha di una superficie di vetro (scala con "Trasparenza finestre")
//   {{sa:0.90}}     alpha di una superficie della Shell (scala con "Trasparenza Shell")
//   {{glow:45}}     percentuale di un alone colorato        {{glowa:0.45}}  stesso, come alpha
//   {{glowt:0.5}}   come glowa, ma per st-transparentize()  (quanto si "toglie")
//   {{shadow:0.18}} alpha di un'ombra
//   {{ms:160}}      durata di una transizione (0ms se le animazioni sono spente)
//   /*{{#nome}}*/ … /*{{/nome}}*/   blocco incluso solo se la voce booleana "nome" è attiva
//   /*{{^nome}}*/ … /*{{/nome}}*/   blocco incluso solo se è spenta

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const SCHEMA_ID = 'org.gnome.shell.extensions.glassy-desktop';

/** Valori predefiniti (devono coincidere con lo schema). */
export const DEFAULTS = {
    'glass-strength': 60,
    'shell-glass': 60,
    'corner-radius': 12,
    'control-radius': 10,
    'glow-strength': 60,
    'shadow-strength': 60,
    'traffic-lights': true,
    'theme-animations': true,
};

export const THEME_KEYS = Object.keys(DEFAULTS);

/** Colori d'accento di GNOME → esadecimale (quelli di libadwaita). */
export const ACCENTS = {
    blue: '#3584e4', teal: '#2190a4', green: '#3a944a', yellow: '#c88800', orange: '#ed5b00',
    red: '#e62d42', pink: '#d56199', purple: '#9141ac', slate: '#6f8396',
};

/** Modelli e file generati, relativi alla cartella del tema. */
export const FILES = [
    ['templates/gtk-4.0/glassy.css.in', 'gtk-4.0/glassy.css'],
    ['templates/gtk-3.0/glassy-common.css.in', 'gtk-3.0/glassy-common.css'],
    ['templates/gtk-3.0/glassy-light.css.in', 'gtk-3.0/glassy-light.css'],
    ['templates/gtk-3.0/glassy-dark.css.in', 'gtk-3.0/glassy-dark.css'],
    ['templates/gnome-shell/gnome-shell.css.in', 'gnome-shell/gnome-shell.css'],
];

// ── Impostazioni ─────────────────────────────────────────────────────────────

/** Apre le impostazioni dell'estensione da una cartella con gli schemi compilati (None se non ci sono). */
export function openSettings(extensionDir) {
    try {
        const source = Gio.SettingsSchemaSource.new_from_directory(
            GLib.build_filenamev([extensionDir, 'schemas']), Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(SCHEMA_ID, false);
        return schema ? new Gio.Settings({settings_schema: schema}) : null;
    } catch (e) {
        return null;
    }
}

/** Legge la configurazione del tema (dai Gio.Settings se ci sono, altrimenti i predefiniti). */
export function readConfig(settings = null) {
    const cfg = {...DEFAULTS};
    if (!settings)
        return cfg;
    for (const key of THEME_KEYS)
        cfg[key] = typeof DEFAULTS[key] === 'boolean' ? settings.get_boolean(key) : settings.get_int(key);
    return cfg;
}

/** Nome del colore d'accento di sistema (blue, teal, …). */
export function systemAccent() {
    try {
        return new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}).get_string('accent-color');
    } catch (e) {
        return 'blue';
    }
}

// ── Motore dei modelli ───────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = v => String(Number(v.toFixed(2)));

function variables(cfg) {
    const glassF = cfg['glass-strength'] / 60;
    const shellF = cfg['shell-glass'] / 60;
    const glowF = cfg['glow-strength'] / 60;
    const shadowF = cfg['shadow-strength'] / 60;
    return {
        radius: cfg['corner-radius'],
        r: cfg['control-radius'],
        glassF, shellF, glowF, shadowF,
        animations: cfg['theme-animations'],
        bools: {traffic: cfg['traffic-lights'], animations: cfg['theme-animations']},
    };
}

/** α' = 1 − (1 − α)·f: con f = 1 resta α, con f = 0 diventa opaco, con f > 1 più trasparente. */
const scaleAlpha = (alpha, f) => clamp(1 - (1 - alpha) * f, 0.05, 1);

export function render(template, cfg) {
    const v = variables(cfg);

    // blocchi condizionali
    let out = template.replace(/\/\*\{\{([#^])(\w+)\}\}\*\/([\s\S]*?)\/\*\{\{\/\2\}\}\*\//g, (_m, kind, name, body) => {
        const on = Boolean(v.bools[name]);
        return (kind === '#') === on ? body : '';
    });

    // valori
    out = out.replace(/\{\{\s*(\w+)(?:\s*([+\-*])\s*([\d.]+)|:\s*([\d.]+))?\s*\}\}/g, (m, name, op, opn, arg) => {
        if (arg !== undefined) {
            const x = parseFloat(arg);
            switch (name) {
            case 'a': return num(scaleAlpha(x, v.glassF));
            case 'sa': return num(scaleAlpha(x, v.shellF));
            case 'glow': return String(clamp(Math.round(x * v.glowF), 0, 100));
            case 'glowa': return num(clamp(x * v.glowF, 0, 1));
            case 'glowt': return num(clamp(1 - (1 - x) * v.glowF, 0, 1));
            case 'shadow': return num(clamp(x * v.shadowF, 0, 1));
            case 'ms': return v.animations ? `${Math.round(x)}ms` : '0ms';
            default: throw new Error(`funzione sconosciuta nel modello: ${m}`);
            }
        }
        if (name !== 'radius' && name !== 'r')
            throw new Error(`variabile sconosciuta nel modello: ${m}`);
        let value = v[name];
        if (op) {
            const n = parseFloat(opn);
            value = op === '+' ? value + n : op === '-' ? value - n : value * n;
        }
        return String(Math.max(0, Math.round(value)));
    });
    return out;
}

function writeIfChanged(path, text) {
    const file = Gio.File.new_for_path(path);
    try {
        const [ok, bytes] = file.load_contents(null);
        if (ok && new TextDecoder().decode(bytes) === text)
            return false;
    } catch (e) {
        // non esiste ancora
    }
    GLib.mkdir_with_parents(file.get_parent().get_path(), 0o755);
    file.replace_contents(new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.NONE, null);
    return true;
}

/**
 * Rigenera tutti i file del tema in `themeDir`.
 * @param {string} themeDir  cartella del tema (contiene templates/ e riceve i CSS)
 * @param {object} cfg       configurazione (vedi readConfig)
 * @param {string} accent    nome del colore d'accento di GNOME (per GTK3)
 * @param {string} outDir    dove scrivere (predefinito: la stessa cartella dei modelli)
 * @returns {string[]} file effettivamente modificati
 */
export function renderTheme(themeDir, cfg, accent = 'blue', outDir = themeDir) {
    const changed = [];
    for (const [tpl, dest] of FILES) {
        const [ok, bytes] = Gio.File.new_for_path(GLib.build_filenamev([themeDir, tpl])).load_contents(null);
        if (!ok)
            throw new Error(`modello mancante: ${tpl}`);
        if (writeIfChanged(GLib.build_filenamev([outDir, dest]), render(new TextDecoder().decode(bytes), cfg)))
            changed.push(dest);
    }

    // GTK3 non legge l'accento di sistema: si scrive qui
    const hex = ACCENTS[accent] ?? ACCENTS.blue;
    const accentCss = `/* Generato da Glassy: accento ${accent} */\n@define-color accent_bg_color ${hex};\n@define-color accent_fg_color #ffffff;\n`;
    if (writeIfChanged(GLib.build_filenamev([outDir, 'gtk-3.0/glassy-accent.css']), accentCss))
        changed.push('gtk-3.0/glassy-accent.css');
    return changed;
}
