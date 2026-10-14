// Pannello impostazioni di Glassy: regola dock, launcher, barra e tutto l'aspetto del tema.
// Si apre dall'app Estensioni, con `gnome-extensions prefs glassy-desktop@glassy-os`, dal menu
// del pulsante Launchpad nel dock, o dall'icona "Impostazioni di Glassy" nel launcher.
//
// I valori stanno nelle impostazioni dell'estensione (dconf): dock, launcher e barra li leggono
// dal vivo. Per il tema, ogni modifica rigenera i CSS (themegen.js) e fa ricaricare la Shell;
// le app GTK già aperte leggono il tema solo all'avvio, quindi vanno chiuse e riaperte.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {ACCENTS, THEME_KEYS, readConfig, renderTheme, systemAccent} from './themegen.js';

/** connect() che si stacca da solo quando il widget sparisce (qui non ci sono gli helper della Shell). */
function watch(source, detail, callback, widget) {
    const id = source.connect(detail, callback);
    widget.connect('destroy', () => source.disconnect(id));
}

const PRESETS = [
    {id: 'cristallo', name: 'Cristallo', note: 'Molto trasparente, aloni vivi',
        values: {'glass-strength': 88, 'shell-glass': 80, 'glow-strength': 80, 'shadow-strength': 70}},
    {id: 'equilibrato', name: 'Equilibrato', note: 'Il look predefinito',
        values: {'glass-strength': 60, 'shell-glass': 60, 'glow-strength': 60, 'shadow-strength': 60}},
    {id: 'satinato', name: 'Satinato', note: 'Più compatto e leggibile',
        values: {'glass-strength': 35, 'shell-glass': 40, 'glow-strength': 40, 'shadow-strength': 50}},
    {id: 'opaco', name: 'Opaco', note: 'Quasi nessuna trasparenza',
        values: {'glass-strength': 8, 'shell-glass': 15, 'glow-strength': 20, 'shadow-strength': 40}},
];

const ACCENT_NAMES = {
    blue: 'Blu', teal: 'Acquamarina', green: 'Verde', yellow: 'Giallo', orange: 'Arancione',
    red: 'Rosso', pink: 'Rosa', purple: 'Viola', slate: 'Ardesia',
};

const SCHEMES = [['default', 'Automatico'], ['prefer-light', 'Chiaro'], ['prefer-dark', 'Scuro']];
const AUTOHIDE = [
    ['smart', 'Intelligente', 'Si nasconde quando una finestra lo copre'],
    ['never', 'Sempre visibile', 'Le finestre massimizzate si fermano sopra il dock'],
    ['always', 'Sempre nascosto', 'Compare toccando il bordo inferiore dello schermo'],
];

export default class GlassyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();
        this._iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._window = window;
        this._renderId = 0;

        window.set_default_size(780, 860);
        window.set_search_enabled(true);
        this._installAccentCss();

        window.add(this._lookPage());
        window.add(this._dockPage());
        window.add(this._launcherPage());
        window.add(this._advancedPage());

        // Ogni modifica a una voce del tema (o all'accento) rigenera i CSS, con un po' di calma.
        for (const key of THEME_KEYS)
            watch(this._settings, `changed::${key}`, () => this._scheduleRender(), window);
        watch(this._iface, 'changed::accent-color', () => this._scheduleRender(), window);
        window.connect('close-request', () => {
            if (this._renderId) {
                GLib.source_remove(this._renderId);
                this._renderId = 0;
                this._renderNow(false);
            }
            return false;
        });
    }

    // ── Tema: rigenerazione ──────────────────────────────────────────────────

    get _themeDir() {
        return GLib.build_filenamev([GLib.get_user_data_dir(), 'themes', 'Glassy']);
    }

    _scheduleRender() {
        if (this._renderId)
            GLib.source_remove(this._renderId);
        this._renderId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 450, () => {
            this._renderId = 0;
            this._renderNow(true);
            return GLib.SOURCE_REMOVE;
        });
    }

    _renderNow(toast) {
        try {
            const changed = renderTheme(this._themeDir, readConfig(this._settings), systemAccent());
            if (changed.length) {
                // il contatore fa ricaricare il tema alla Shell
                this._settings.set_int('theme-serial', this._settings.get_int('theme-serial') + 1);
                if (toast) {
                    this._window.add_toast(new Adw.Toast({
                        title: 'Tema aggiornato. Le app già aperte lo prendono al prossimo avvio.',
                        timeout: 3,
                    }));
                }
            }
        } catch (e) {
            this._window.add_toast(new Adw.Toast({title: `Non riesco a rigenerare il tema: ${e.message}`, timeout: 6}));
        }
    }

    // ── Componenti ───────────────────────────────────────────────────────────

    _installAccentCss() {
        const css = Object.entries(ACCENTS).map(([name, hex]) =>
            `.glassy-accent-${name} { background-color: ${hex}; border-radius: 999px; min-width: 26px; min-height: 26px; padding: 0; ` +
            `box-shadow: inset 0 1px 0 alpha(white, 0.35), 0 1px 3px alpha(black, 0.3); } ` +
            `.glassy-accent-${name}:checked { box-shadow: 0 0 0 3px alpha(@window_bg_color, 1), 0 0 0 5px ${hex}; }`).join('\n');
        const provider = new Gtk.CssProvider();
        provider.load_from_string(css);
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    _scale({title, subtitle = '', key, min, max, step = 1, digits = 0, suffix = ''}) {
        const row = new Adw.ActionRow({title, subtitle});
        const adjustment = new Gtk.Adjustment({lower: min, upper: max, step_increment: step, page_increment: step * 5});
        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL, adjustment, draw_value: true, value_pos: Gtk.PositionType.LEFT,
            digits, round_digits: digits, width_request: 280, valign: Gtk.Align.CENTER,
        });
        scale.set_format_value_func((_s, v) => `${v.toFixed(digits)}${suffix}`);
        this._settings.bind(key, adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(scale);
        row.activatable_widget = scale;
        return row;
    }

    _switch({title, subtitle = '', key}) {
        const row = new Adw.SwitchRow({title, subtitle});
        this._settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    /** Menu a tendina collegato a una voce stringa di GSettings; options = [[valore, titolo, nota?], …] */
    _combo({title, subtitle = '', settings, key, options}) {
        const row = new Adw.ComboRow({title, subtitle, model: Gtk.StringList.new(options.map(o => o[1]))});
        const sync = () => {
            const i = options.findIndex(o => o[0] === settings.get_string(key));
            if (i >= 0 && row.selected !== i)
                row.selected = i;
            row.subtitle = options[row.selected]?.[2] ?? subtitle;
        };
        sync();
        row.connect('notify::selected', () => {
            settings.set_string(key, options[row.selected][0]);
            row.subtitle = options[row.selected]?.[2] ?? subtitle;
        });
        watch(settings, `changed::${key}`, sync, row);
        return row;
    }

    // ── Pagina: Aspetto ──────────────────────────────────────────────────────

    _lookPage() {
        const page = new Adw.PreferencesPage({title: 'Aspetto', icon_name: 'color-select-symbolic'});

        // Colori
        const colors = new Adw.PreferencesGroup({title: 'Colori'});
        colors.add(this._combo({
            title: 'Schema colori', subtitle: 'Chiaro, scuro o in base all\'ora',
            settings: this._iface, key: 'color-scheme', options: SCHEMES,
        }));
        colors.add(this._accentRow());
        colors.add(this._iconThemeRow());
        page.add(colors);

        // Vetro
        const glass = new Adw.PreferencesGroup({
            title: 'Vetro', description: 'Quanto sono trasparenti e luminose le superfici.',
        });
        glass.add(this._presetRow());
        glass.add(this._scale({
            title: 'Trasparenza delle finestre', subtitle: 'App GTK e libadwaita: 0 = opache, 100 = molto trasparenti',
            key: 'glass-strength', min: 0, max: 100, step: 1,
        }));
        glass.add(this._scale({
            title: 'Trasparenza della Shell', subtitle: 'Barra superiore, menu, notifiche e popup',
            key: 'shell-glass', min: 0, max: 100, step: 1,
        }));
        glass.add(this._scale({
            title: 'Alone colorato', subtitle: 'Pulsanti, interruttori, cursori e selezioni',
            key: 'glow-strength', min: 0, max: 100, step: 1,
        }));
        glass.add(this._scale({
            title: 'Ombre', subtitle: 'Finestre, menu e dialoghi',
            key: 'shadow-strength', min: 0, max: 100, step: 1,
        }));
        page.add(glass);

        // Forma
        const shape = new Adw.PreferencesGroup({title: 'Forma e movimento'});
        shape.add(this._scale({
            title: 'Angoli delle finestre', key: 'corner-radius', min: 0, max: 24, step: 1, suffix: ' px',
        }));
        shape.add(this._scale({
            title: 'Angoli di pulsanti e campi', key: 'control-radius', min: 0, max: 20, step: 1, suffix: ' px',
        }));
        shape.add(this._switch({
            title: 'Pulsanti finestra a semaforo', subtitle: 'Rosso, giallo e verde come su macOS',
            key: 'traffic-lights',
        }));
        shape.add(this._switch({
            title: 'Transizioni morbide', subtitle: 'Animazioni al passaggio del mouse e nei controlli',
            key: 'theme-animations',
        }));
        page.add(shape);

        // Sfondo
        page.add(this._wallpaperGroup());
        return page;
    }

    _presetRow() {
        const options = [...PRESETS.map(p => [p.id, p.name, p.note]), ['custom', 'Personalizzato', 'Valori impostati a mano']];
        const row = new Adw.ComboRow({title: 'Preset', model: Gtk.StringList.new(options.map(o => o[1]))});

        const current = () => PRESETS.find(p => Object.entries(p.values).every(([k, v]) => this._settings.get_int(k) === v))?.id ?? 'custom';
        let busy = false;
        const sync = () => {
            if (busy)
                return;
            const i = options.findIndex(o => o[0] === current());
            if (row.selected !== i)
                row.selected = i;
            row.subtitle = options[row.selected][2];
        };
        sync();
        row.connect('notify::selected', () => {
            const id = options[row.selected][0];
            row.subtitle = options[row.selected][2];
            const preset = PRESETS.find(p => p.id === id);
            if (!preset)
                return;
            busy = true;
            for (const [k, v] of Object.entries(preset.values))
                this._settings.set_int(k, v);
            busy = false;
        });
        for (const key of ['glass-strength', 'shell-glass', 'glow-strength', 'shadow-strength'])
            watch(this._settings, `changed::${key}`, sync, row);
        return row;
    }

    _accentRow() {
        const row = new Adw.ActionRow({title: 'Colore d\'accento', subtitle: 'Vale per tutto il sistema'});
        const box = new Gtk.Box({spacing: 8, valign: Gtk.Align.CENTER});
        let first = null;
        const buttons = {};
        for (const name of Object.keys(ACCENTS)) {
            const b = new Gtk.ToggleButton({tooltip_text: ACCENT_NAMES[name], css_classes: [`glassy-accent-${name}`]});
            if (first)
                b.set_group(first);
            else
                first = b;
            buttons[name] = b;
            b.connect('toggled', () => {
                if (b.active)
                    this._iface.set_string('accent-color', name);
            });
            box.append(b);
        }
        const sync = () => {
            const b = buttons[this._iface.get_string('accent-color')];
            if (b && !b.active)
                b.active = true;
        };
        sync();
        watch(this._iface, 'changed::accent-color', sync, row);
        row.add_suffix(box);
        return row;
    }

    _iconThemeRow() {
        const dirs = [GLib.build_filenamev([GLib.get_user_data_dir(), 'icons']), '/usr/share/icons'];
        const names = new Set();
        for (const dir of dirs) {
            try {
                const e = Gio.File.new_for_path(dir).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
                let info;
                while ((info = e.next_file(null))) {
                    const theme = info.get_name();
                    const index = GLib.build_filenamev([dir, theme, 'index.theme']);
                    if (!GLib.file_test(index, GLib.FileTest.EXISTS))
                        continue;
                    const [ok, bytes] = GLib.file_get_contents(index);
                    if (ok && new TextDecoder().decode(bytes).includes('Directories='))
                        names.add(theme);
                }
            } catch (e) {
                // cartella assente
            }
        }
        const sorted = [...names].sort((a, b) => (b.startsWith('Tela-ubuntu') - a.startsWith('Tela-ubuntu')) || a.localeCompare(b));
        const current = this._iface.get_string('icon-theme');
        if (!sorted.includes(current))
            sorted.unshift(current);
        return this._combo({
            title: 'Icone', subtitle: 'Tema delle icone di sistema',
            settings: this._iface, key: 'icon-theme', options: sorted.map(n => [n, n]),
        });
    }

    _wallpaperGroup() {
        const group = new Adw.PreferencesGroup({title: 'Sfondo'});
        const bg = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        const dir = GLib.build_filenamev([GLib.get_user_data_dir(), 'backgrounds', 'glassy']);

        const aurora = new Adw.ActionRow({title: 'Glassy Aurora', subtitle: 'Gli sfondi chiaro e scuro inclusi nel tema'});
        const apply = new Gtk.Button({label: 'Usa', valign: Gtk.Align.CENTER});
        apply.connect('clicked', () => {
            bg.set_string('picture-uri', `file://${dir}/glassy-light.jpg`);
            bg.set_string('picture-uri-dark', `file://${dir}/glassy-dark.jpg`);
            bg.set_string('picture-options', 'zoom');
        });
        aurora.add_suffix(apply);
        group.add(aurora);

        const custom = new Adw.ActionRow({title: 'Un\'altra immagine', subtitle: 'Scegli un file dal computer'});
        const choose = new Gtk.Button({label: 'Scegli…', valign: Gtk.Align.CENTER});
        choose.connect('clicked', () => {
            const dialog = new Gtk.FileDialog({title: 'Scegli lo sfondo'});
            const filter = new Gtk.FileFilter({name: 'Immagini'});
            filter.add_mime_type('image/*');
            const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
            filters.append(filter);
            dialog.set_filters(filters);
            dialog.open(this._window, null, (d, res) => {
                try {
                    const uri = d.open_finish(res).get_uri();
                    bg.set_string('picture-uri', uri);
                    bg.set_string('picture-uri-dark', uri);
                    bg.set_string('picture-options', 'zoom');
                } catch (e) {
                    // annullato
                }
            });
        });
        custom.add_suffix(choose);
        group.add(custom);
        return group;
    }

    // ── Pagina: Dock ─────────────────────────────────────────────────────────

    _dockPage() {
        const page = new Adw.PreferencesPage({title: 'Dock', icon_name: 'view-grid-symbolic'});

        const size = new Adw.PreferencesGroup({title: 'Dimensioni e posizione'});
        size.add(this._scale({title: 'Dimensione delle icone', key: 'icon-size', min: 32, max: 96, step: 1, suffix: ' px'}));
        size.add(this._scale({
            title: 'Ingrandimento', subtitle: 'Quanto crescono le icone al passaggio del mouse (1,0 = niente)',
            key: 'magnification', min: 1, max: 2.6, step: 0.1, digits: 1, suffix: '×',
        }));
        size.add(this._scale({title: 'Spazio tra le icone', key: 'icon-spacing', min: 0, max: 30, step: 1, suffix: ' px'}));
        size.add(this._scale({title: 'Distanza dal bordo', key: 'bottom-margin', min: 0, max: 60, step: 1, suffix: ' px'}));
        size.add(this._combo({
            title: 'Nascondi il dock', settings: this._settings, key: 'autohide', options: AUTOHIDE,
        }));
        page.add(size);

        const look = new Adw.PreferencesGroup({title: 'Vetro del dock'});
        look.add(this._scale({
            title: 'Riempimento', subtitle: '0 = quasi trasparente, 100 = opaco',
            key: 'dock-tint', min: 0, max: 100, step: 1,
        }));
        look.add(this._scale({title: 'Angoli', key: 'dock-radius', min: 0, max: 40, step: 1, suffix: ' px'}));
        look.add(this._switch({title: 'Sfoca ciò che sta dietro', key: 'dock-blur'}));
        look.add(this._scale({title: 'Intensità dello sfocato', key: 'dock-blur-radius', min: 0, max: 120, step: 1}));
        page.add(look);

        const items = new Adw.PreferencesGroup({title: 'Cosa mostrare'});
        items.add(this._switch({title: 'Pulsante del Launchpad', key: 'show-launchpad-button'}));
        items.add(this._switch({title: 'Cestino', key: 'show-trash'}));
        items.add(this._switch({title: 'Pallino sotto le app aperte', key: 'show-running-dots'}));
        items.add(this._switch({title: 'Nome dell\'app sopra l\'icona', key: 'show-labels'}));
        items.add(this._switch({title: 'Rimbalzo all\'avvio di un\'app', key: 'bounce-on-launch'}));
        page.add(items);
        return page;
    }

    // ── Pagina: Launchpad e barra ────────────────────────────────────────────

    _launcherPage() {
        const page = new Adw.PreferencesPage({title: 'Launchpad e barra', icon_name: 'view-fullscreen-symbolic'});

        const lp = new Adw.PreferencesGroup({title: 'Launchpad', description: 'Il launcher a schermo intero.'});
        lp.add(this._switch({
            title: 'Sostituisci Attività di GNOME',
            subtitle: 'Il tasto Super, il pulsante Attività e l\'angolo attivo aprono il Launchpad invece della panoramica',
            key: 'block-activities',
        }));
        lp.add(this._scale({title: 'Dimensione delle icone', key: 'launcher-icon-size', min: 48, max: 128, step: 2, suffix: ' px'}));
        lp.add(this._scale({title: 'Colonne al massimo', key: 'launcher-max-columns', min: 3, max: 12, step: 1}));
        lp.add(this._scale({title: 'Sfocato dello sfondo', key: 'launcher-blur', min: 0, max: 200, step: 5}));
        lp.add(this._scale({
            title: 'Scurimento dello sfondo', subtitle: 'Quanto si scurisce ciò che sta dietro',
            key: 'launcher-dim', min: 0, max: 90, step: 1, suffix: ' %',
        }));
        page.add(lp);

        const bar = new Adw.PreferencesGroup({title: 'Barra superiore'});
        bar.add(this._switch({
            title: 'Nome dell\'app in primo piano', subtitle: 'A sinistra, come la barra dei menu di macOS',
            key: 'show-app-name',
        }));
        page.add(bar);
        return page;
    }

    // ── Pagina: Avanzate ─────────────────────────────────────────────────────

    _advancedPage() {
        const page = new Adw.PreferencesPage({title: 'Avanzate', icon_name: 'emblem-system-symbolic'});

        const apps = new Adw.PreferencesGroup({
            title: 'Applicare il tema',
            description: 'Le app GNOME leggono il tema solo quando partono. Nautilus resta in memoria anche a finestre chiuse: ' +
                'finché non lo chiudi, mantiene lo stile di prima.',
        });
        const nautilus = new Adw.ActionRow({title: 'Riavvia Nautilus', subtitle: 'Chiude tutte le sue finestre; alla riapertura avrà il tema aggiornato'});
        const quit = new Gtk.Button({label: 'Chiudi Nautilus', valign: Gtk.Align.CENTER});
        quit.connect('clicked', () => {
            GLib.spawn_command_line_async('nautilus -q');
            this._window.add_toast(new Adw.Toast({title: 'Nautilus chiuso: riaprilo per vedere il tema.', timeout: 3}));
        });
        nautilus.add_suffix(quit);
        apps.add(nautilus);

        const regen = new Adw.ActionRow({title: 'Rigenera il tema', subtitle: 'Ricostruisce i file CSS dalle impostazioni attuali'});
        const go = new Gtk.Button({label: 'Rigenera', valign: Gtk.Align.CENTER});
        go.connect('clicked', () => {
            for (const f of ['gtk-4.0/glassy.css', 'gnome-shell/gnome-shell.css'])
                GLib.unlink(GLib.build_filenamev([this._themeDir, f]));
            this._renderNow(true);
        });
        regen.add_suffix(go);
        apps.add(regen);
        page.add(apps);

        const reset = new Adw.PreferencesGroup({title: 'Ripristino'});
        const row = new Adw.ActionRow({title: 'Ripristina i valori predefiniti', subtitle: 'Dock, launcher, barra e tema. Non tocca schema colori, accento e sfondo'});
        const btn = new Gtk.Button({label: 'Ripristina', css_classes: ['destructive-action'], valign: Gtk.Align.CENTER});
        btn.connect('clicked', () => {
            for (const key of this._settings.settings_schema.list_keys()) {
                if (key !== 'theme-serial')
                    this._settings.reset(key);
            }
            this._window.add_toast(new Adw.Toast({title: 'Valori predefiniti ripristinati.', timeout: 3}));
        });
        row.add_suffix(btn);
        reset.add(row);
        page.add(reset);

        const info = new Adw.PreferencesGroup({title: 'Informazioni'});
        const about = new Adw.ActionRow({
            title: 'Glassy', subtitle: 'Tema e desktop in vetro smerigliato per GNOME 50',
        });
        const folder = new Gtk.Button({label: 'Apri la cartella del tema', valign: Gtk.Align.CENTER});
        folder.connect('clicked', () =>
            Gio.AppInfo.launch_default_for_uri_async(`file://${this._themeDir}`, null, null, null));
        about.add_suffix(folder);
        info.add(about);
        page.add(info);
        return page;
    }
}
