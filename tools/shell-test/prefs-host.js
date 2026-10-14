#!/usr/bin/env -S gjs -m
/*
 * Apre il pannello impostazioni di un'estensione come farebbe l'app Estensioni, ma da riga
 * di comando (serve al banco di prova, dove il servizio D-Bus delle preferenze non è attivabile).
 *   gjs -m prefs-host.js <cartella-estensione> [pagina]      (pagina: 0, 1, 2, …)
 * Variabili: HOST_QUIT_MS = esce da solo dopo tot millisecondi;
 *            HOST_SHOT = file PNG dove salvare uno screenshot della finestra (poi esce).
 */
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import System from 'system';

const [extDir, pageArg] = System.programArgs;
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const {ExtensionPrefsDialog} = await import('resource:///org/gnome/Shell/Extensions/js/extensionPrefsDialog.js');

const dir = Gio.File.new_for_path(extDir);
const [, bytes] = dir.get_child('metadata.json').load_contents(null);
const metadata = JSON.parse(new TextDecoder().decode(bytes));

const app = new Adw.Application({application_id: 'org.glassy.PrefsHost', flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    const dialog = new ExtensionPrefsDialog({metadata, dir, path: extDir, stateObj: null});
    dialog.set_default_size(780, 860);
    app.add_window(dialog);
    dialog.connect('loaded', () => {
        console.log('host: caricata');
        dialog.present();
        const shotPath = GLib.getenv('HOST_SHOT');
        if (shotPath) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2200, () => {
                const snapshot = new Gtk.Snapshot();
                new Gtk.WidgetPaintable({widget: dialog}).snapshot(snapshot, dialog.get_width(), dialog.get_height());
                dialog.get_native().get_renderer().render_texture(snapshot.to_node(), null).save_to_png(shotPath);
                console.log(`host: salvato ${shotPath}`);
                app.quit();
                return GLib.SOURCE_REMOVE;
            });
        }
        if (pageArg !== undefined) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                // le pagine sono i widget Adw.PreferencesPage dentro la finestra
                const pages = [];
                const walk = w => {
                    if (w instanceof Adw.PreferencesPage)
                        pages.push(w);
                    for (let c = w.get_first_child(); c; c = c.get_next_sibling())
                        walk(c);
                };
                walk(dialog);
                console.log(`host: ${pages.length} pagine: ${pages.map(p => p.title).join(' | ')}`);
                if (pages[Number(pageArg)])
                    dialog.set_visible_page(pages[Number(pageArg)]);
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    const quitMs = Number(GLib.getenv('HOST_QUIT_MS') ?? 0);
    if (quitMs)
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, quitMs, () => { app.quit(); return GLib.SOURCE_REMOVE; });
});
app.run([]);
