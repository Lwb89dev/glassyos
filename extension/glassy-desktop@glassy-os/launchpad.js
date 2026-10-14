// Launcher a schermo intero in stile Launchpad: sfondo sfocato, ricerca in alto, griglia
// di app a pagine, puntini di pagina, animazioni di apertura/chiusura.
//
// Si apre con il tasto Super, con l'icona nel dock o con Super+A; si chiude con Esc,
// con un clic nel vuoto, di nuovo Super, o avviando un'app.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {addBackgroundBlur} from './blur.js';

const LABEL_SPACE = 76;   // spazio sotto l'icona per il nome dell'app

const OPEN_MS = 240;
const CLOSE_MS = 170;
const PAGE_MS = 320;

export class Launchpad {
    constructor(ext) {
        this._ext = ext;
        this._settings = ext.settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._visible = false;
        this._closing = false;
        this._grab = null;
        this._actor = null;
        this._page = 0;
        this._wheelAccum = 0;
        this._wheelTimer = 0;
        this.onChanged = null;     // callback: il dock deve sapere quando il launcher si apre o si chiude
        this._installedId = this._appSystem.connect('installed-changed', () => {
            if (!this._visible || this._closing)
                return;
            this._track.destroy_all_children();
            this._items = this._loadApps().map(app => this._createItem(app));
            this._applyFilter();
        });
    }

    get visible() {
        return this._visible;
    }

    destroy() {
        this._appSystem.disconnect(this._installedId);
        this._teardown();
    }

    toggle() {
        if (this._visible)
            this.hide();
        else
            this.show();
    }

    // ── Apertura / chiusura ──────────────────────────────────────────────────

    show() {
        if (this._visible)
            return;
        this._visible = true;
        this._closing = false;

        const mon = Main.layoutManager.primaryMonitor;
        this._mon = mon;
        this._build(mon);

        // Sopra le finestre ma sotto barra superiore e dock, che restano visibili.
        Main.layoutManager.addChrome(this._actor);
        Main.layoutManager.uiGroup.set_child_below_sibling(this._actor, Main.layoutManager.panelBox);

        this._rebuildGrid();    // le misure si calcolano solo con gli attori già sullo stage

        // Il grab è sullo stage intero, come fa l'Overview di GNOME: con un grab sul solo launcher
        // dock e barra superiore, che sono fuori dal suo albero, smetterebbero di ricevere il mouse.
        this._grab = Main.pushModal(global.stage, {actionMode: Shell.ActionMode.OVERVIEW});
        global.stage.set_key_focus(this._entry);
        // Su un secondo schermo o con un gesto un'altra finestra può prendere il fuoco: il launcher si chiude.
        global.display.connectObject('notify::focus-window', () => {
            if (global.display.focus_window)
                this.hide();
        }, this);

        this._actor.opacity = 0;
        this._content.set({scale_x: 1.08, scale_y: 1.08, opacity: 0});
        this._actor.ease({opacity: 255, duration: OPEN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this._content.ease({
            scale_x: 1, scale_y: 1, opacity: 255,
            duration: OPEN_MS + 60, mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
        this._staggerIn();
        this.onChanged?.();
    }

    hide() {
        if (!this._visible || this._closing)
            return;
        this._closing = true;

        global.display.disconnectObject(this);
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        this._content.ease({
            scale_x: 1.06, scale_y: 1.06, opacity: 0,
            duration: CLOSE_MS, mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });
        this._actor.ease({
            opacity: 0, duration: CLOSE_MS, mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => this._teardown(),
        });
    }

    _teardown() {
        global.display.disconnectObject(this);
        if (this._wheelTimer) {
            GLib.source_remove(this._wheelTimer);
            this._wheelTimer = 0;
        }
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        if (this._actor) {
            Main.layoutManager.removeChrome(this._actor);
            this._actor.destroy();
            this._actor = null;
        }
        this._visible = false;
        this._closing = false;
        this.onChanged?.();
    }

    // ── Costruzione ──────────────────────────────────────────────────────────

    _build(mon) {
        this._actor = new St.Widget({
            name: 'glassy-launchpad',
            style_class: 'glassy-launchpad',
            reactive: true,
            x: mon.x, y: mon.y, width: mon.width, height: mon.height,
        });
        addBackgroundBlur(this._actor, {radius: this._settings.get_int('launcher-blur'), brightness: 0.82});
        const dim = this._settings.get_int('launcher-dim') / 45;       // 45 = aspetto predefinito
        this._actor.set_style(
            `background-gradient-start: rgba(30, 24, 70, ${Math.min(0.95, 0.40 * dim).toFixed(2)}); ` +
            `background-gradient-end: rgba(10, 12, 40, ${Math.min(0.95, 0.52 * dim).toFixed(2)});`);

        // Tutto il contenuto sta qui: si anima come un blocco solo.
        this._content = new St.Widget({
            width: mon.width, height: mon.height,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this._actor.add_child(this._content);

        this._entry = new St.Entry({
            style_class: 'glassy-launchpad-search',
            hint_text: 'Cerca',
            can_focus: true,
            width: 360,
        });
        this._entry.set_primary_icon(new St.Icon({icon_name: 'edit-find-symbolic', style_class: 'glassy-launchpad-search-icon'}));
        this._content.add_child(this._entry);
        this._entry.set_position(Math.round((mon.width - 360) / 2), Math.round(mon.height * 0.06));
        this._entry.clutter_text.connect('text-changed', () => this._applyFilter());

        // Pista scorrevole con tutte le pagine affiancate.
        this._track = new St.Widget({reactive: false});
        this._content.add_child(this._track);

        this._dots = new St.BoxLayout({style_class: 'glassy-launchpad-dots'});
        this._content.add_child(this._dots);

        this._empty = new St.Label({
            style_class: 'glassy-launchpad-empty', text: 'Nessun risultato', visible: false,
        });
        this._content.add_child(this._empty);

        this._actor.connectObject(
            'key-press-event', (_a, ev) => this._onKey(ev),
            'scroll-event', (_a, ev) => this._onScroll(ev),
            'button-press-event', (_a, ev) => this._onBackgroundPress(ev),
            this);

        this._items = this._loadApps().map(app => this._createItem(app));
    }

    _loadApps() {
        const apps = [];
        for (const info of this._appSystem.get_installed()) {
            if (!info.should_show())
                continue;
            const app = this._appSystem.lookup_app(info.get_id());
            if (app)
                apps.push(app);
        }
        apps.sort((a, b) => GLib.utf8_collate(a.get_name(), b.get_name()));
        return apps;
    }

    _createItem(app) {
        const box = new St.BoxLayout({vertical: true, style_class: 'glassy-launchpad-item-box'});
        const icon = app.create_icon_texture(this._settings.get_int('launcher-icon-size'));
        icon.x_align = Clutter.ActorAlign.CENTER;
        box.add_child(icon);
        box.add_child(new St.Label({
            text: app.get_name(),
            style_class: 'glassy-launchpad-label',
            x_align: Clutter.ActorAlign.CENTER,
        }));

        const button = new St.Button({
            style_class: 'glassy-launchpad-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: box,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        const syncScale = () => {
            const s = button.hover || button.has_key_focus() ? 1.08 : 1;
            button.ease({scale_x: s, scale_y: s, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        };
        button.connectObject(
            'clicked', () => this._launch(app),
            'notify::hover', syncScale,
            'key-focus-in', syncScale,
            'key-focus-out', syncScale,
            this);
        this._track.add_child(button);
        return {app, button, score: 0, name: app.get_name().toLocaleLowerCase(), keywords: this._keywords(app)};
    }

    _keywords(app) {
        const info = app.get_app_info();
        const words = [info?.get_description?.() ?? '', info?.get_generic_name?.() ?? ''];
        try {
            words.push((info?.get_keywords?.() ?? []).join(' '));
        } catch {
            // alcune app non espongono le parole chiave
        }
        words.push(app.get_id());
        return words.join(' ').toLocaleLowerCase();
    }

    // ── Griglia e pagine ─────────────────────────────────────────────────────

    _applyFilter() {
        const q = this._entry.get_text().trim().toLocaleLowerCase();
        for (const it of this._items) {
            if (!q) {
                it.score = 0;
            } else if (it.name.startsWith(q)) {
                it.score = 0;
            } else if (it.name.includes(q)) {
                it.score = 1;
            } else if (q.length >= 3 && it.keywords.includes(q)) {
                it.score = 2;     // descrizione/parole chiave solo da 3 lettere in su: con 2 c'è troppo rumore
            } else {
                it.score = -1;
            }
        }
        this._page = 0;
        this._rebuildGrid();
    }

    _rebuildGrid() {
        if (!this._actor)
            return;
        const mon = this._mon;
        const q = this._entry.get_text().trim();
        const shown = this._items
            .filter(it => it.score >= 0)
            .sort((a, b) => a.score - b.score || GLib.utf8_collate(a.app.get_name(), b.app.get_name()));
        for (const it of this._items)
            it.button.visible = it.score >= 0;

        // Dimensioni della griglia in base allo schermo.
        const iconSize = this._settings.get_int('launcher-icon-size');
        const areaW = mon.width * 0.78;
        const dockSpace = (this._ext.dock?.occupiedHeight ?? 100) + 56;   // dock + puntini di pagina
        const areaTop = mon.height * 0.06 + 96;
        const areaH = mon.height - areaTop - dockSpace;
        const cols = Math.max(3, Math.min(this._settings.get_int('launcher-max-columns'), Math.floor(areaW / (iconSize + 82))));
        const cellW = areaW / cols;
        const cellH = iconSize + LABEL_SPACE;
        const rows = Math.max(2, Math.floor(areaH / cellH));
        const perPage = cols * rows;
        const pages = Math.max(1, Math.ceil(shown.length / perPage));
        this._pages = pages;
        this._page = Math.min(this._page, pages - 1);

        const left = (mon.width - areaW) / 2;
        const gridH = rows * cellH;
        const top = areaTop + Math.max(0, (areaH - gridH) / 2);

        shown.forEach((it, i) => {
            const p = Math.floor(i / perPage);
            const k = i % perPage;
            it.button.set_size(Math.floor(cellW), cellH - 8);
            it.button.set_position(Math.round(left + p * mon.width + (k % cols) * cellW), Math.round(top + Math.floor(k / cols) * cellH));
        });

        this._track.set_size(mon.width * pages, mon.height);
        this._track.translation_x = -this._page * mon.width;

        this._empty.visible = q !== '' && shown.length === 0;
        if (this._empty.visible) {
            this._empty.set_position(Math.round((mon.width - this._empty.width) / 2), Math.round(mon.height * 0.45));
        }
        this._rebuildDots(pages);
    }

    _rebuildDots(pages) {
        this._dots.destroy_all_children();
        for (let i = 0; i < pages; i++) {
            const dot = new St.Button({
                style_class: 'glassy-launchpad-dot',
                reactive: true,
                track_hover: true,
                width: 10, height: 10,
            });
            if (i === this._page)
                dot.add_style_pseudo_class('active');
            dot.connect('clicked', () => this._goToPage(i));
            this._dots.add_child(dot);
        }
        this._dots.visible = pages > 1;
        const mon = this._mon;
        const [w] = this._dots.get_preferred_size().slice(2);
        const dockSpace = (this._ext.dock?.occupiedHeight ?? 100) + 34;
        this._dots.set_position(Math.round((mon.width - w) / 2), Math.round(mon.height - dockSpace));
    }

    _goToPage(page) {
        page = Math.max(0, Math.min(this._pages - 1, page));
        if (page === this._page)
            return;
        this._page = page;
        this._track.ease({
            translation_x: -page * this._mon.width,
            duration: PAGE_MS, mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
        this._dots.get_children().forEach((d, i) => {
            if (i === page)
                d.add_style_pseudo_class('active');
            else
                d.remove_style_pseudo_class('active');
        });
    }

    _staggerIn() {
        // Le icone della pagina corrente "salgono" una dopo l'altra.
        const mon = this._mon;
        let i = 0;
        for (const it of this._items) {
            if (!it.button.visible)
                continue;
            const x = it.button.x;
            if (x >= mon.width)
                break;
            it.button.set({opacity: 0, translation_y: 26});
            it.button.ease({
                opacity: 255, translation_y: 0,
                duration: 280, delay: Math.min(i * 7, 160),
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
            i++;
        }
    }

    // ── Input ────────────────────────────────────────────────────────────────

    _launch(app) {
        this.hide();
        if (app.state === Shell.AppState.RUNNING && app.can_open_new_window() &&
            app.get_windows().every(w => w.skip_taskbar))
            app.open_new_window(-1);
        else
            app.activate();
    }

    _onKey(event) {
        const sym = event.get_key_symbol();
        switch (sym) {
        case Clutter.KEY_Escape:
            this.hide();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter: {
            const first = this._items.find(it => it.score >= 0 && it.button.visible);
            if (first && this._entry.get_text().trim() !== '')
                this._launch(first.app);
            return Clutter.EVENT_STOP;
        }
        case Clutter.KEY_Right:
            if (this._entry.get_text() === '') {
                this._goToPage(this._page + 1);
                return Clutter.EVENT_STOP;
            }
            break;
        case Clutter.KEY_Left:
            if (this._entry.get_text() === '') {
                this._goToPage(this._page - 1);
                return Clutter.EVENT_STOP;
            }
            break;
        case Clutter.KEY_Page_Down:
            this._goToPage(this._page + 1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Page_Up:
            this._goToPage(this._page - 1);
            return Clutter.EVENT_STOP;
        default:
            break;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onScroll(event) {
        let delta = 0;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
        case Clutter.ScrollDirection.LEFT:
            delta = -1;
            break;
        case Clutter.ScrollDirection.DOWN:
        case Clutter.ScrollDirection.RIGHT:
            delta = 1;
            break;
        case Clutter.ScrollDirection.SMOOTH: {
            const [dx, dy] = event.get_scroll_delta();
            this._wheelAccum += Math.abs(dx) > Math.abs(dy) ? dx : dy;
            if (Math.abs(this._wheelAccum) < 6)
                return Clutter.EVENT_STOP;
            delta = Math.sign(this._wheelAccum);
            this._wheelAccum = 0;
            break;
        }
        default:
            return Clutter.EVENT_PROPAGATE;
        }
        if (this._wheelTimer)
            return Clutter.EVENT_STOP;
        this._goToPage(this._page + delta);
        this._wheelTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 380, () => {
            this._wheelTimer = 0;
            return GLib.SOURCE_REMOVE;
        });
        return Clutter.EVENT_STOP;
    }

    _onBackgroundPress(event) {
        // I pulsanti consumano i loro clic: qui arrivano solo quelli nel vuoto. (event.get_source() in
        // GNOME 50 non restituisce l'attore colpito: si chiede allo stage cosa c'è sotto il puntatore.)
        const [x, y] = event.get_coords();
        if (global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y) === this._actor) {
            this.hide();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
}
