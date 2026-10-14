// Dock in stile macOS: pillola di vetro in basso al centro, icone che si ingrandiscono
// al passaggio del mouse (e spingono da parte le vicine), pallino per le app aperte,
// "rimbalzo" mentre un'app si avvia, menu contestuale, trascinamento, Cestino e Launchpad.
//
// Come è fatto, e perché (la prima versione scattava a ~10 fps):
//  • niente ricalcoli di layout né animazioni per ogni movimento del mouse: la posizione del
//    puntatore si memorizza e UN solo ciclo per frame (Meta.LaterType.BEFORE_REDRAW) porta le
//    scale verso il valore voluto con uno smorzamento esponenziale e imposta le trasformazioni;
//  • la pillola ha dimensione FISSA e si allarga con scale_x (trasformazione GPU): cambiare la
//    dimensione di un widget St con bordo, gradiente e ombra obbliga a rigenerarne le texture
//    a ogni frame, ed è la cosa più lenta che si possa fare;
//  • icone, pallini e pillola leggono gli stessi valori nello stesso frame: restano sincronizzati;
//  • lo sfocato è inscritto nella pillola (Shell.BlurEffect è sempre rettangolare) così i suoi
//    angoli non sbordano da quelli arrotondati.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';

import {addBackgroundBlur, removeBackgroundBlur} from './blur.js';

const RENDER = 96;        // le icone si disegnano a questa dimensione e si riducono: restano nitide da ingrandite
const SEP_W = 2;          // larghezza del separatore
const PAD_X = 14;         // margine interno della pillola, ai lati
const PAD_T = 10;         // sopra le icone
const PAD_B = 16;         // sotto le icone (c'è il pallino delle app aperte)
const LABEL_SPACE = 70;   // spazio sopra il dock per l'etichetta col nome
const BLUR_INSET = 9;     // lo sfocato sta dentro la pillola, per non sbordare dagli angoli
const BOUNCE_TIMEOUT = 15000;
const TAU = 38;           // ms: costante di tempo dello smorzamento dell'ingrandimento
const EDGE_H = 3;         // altezza della striscia che fa riapparire il dock nascosto

export class Dock {
    constructor(ext, launchpad) {
        this._ext = ext;
        this._launchpad = launchpad;
        this._settings = ext.settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._favorites = AppFavorites.getAppFavorites();

        this._entries = [];
        this._pointerX = null;
        this._hoverEntry = null;
        this._labelEntry = null;
        this._inside = false;
        this._leaveId = 0;
        this._hideId = 0;
        this._overlapId = 0;
        this._rebuildId = 0;
        this._frameId = 0;
        this._lastFrame = 0;
        this._menu = null;
        this._menuManager = null;
        this._trashFull = false;
        this._press = null;      // pressione su un'app: clic o trascinamento? lo dice il movimento
        this._drag = null;
        this._overlaps = false;
        this._hidden = false;
        this._g = null;

        this._buildActors();
        this._connect();
        this._rebuild();
        this._startOverlapWatch();
    }

    // ── Impostazioni ─────────────────────────────────────────────────────────

    get iconSize() { return this._settings.get_int('icon-size'); }
    get magnification() { return this._settings.get_double('magnification'); }
    get bottomMargin() { return this._settings.get_int('bottom-margin'); }
    get gap() { return this._settings.get_int('icon-spacing'); }
    get autohide() { return this._settings.get_string('autohide'); }

    /** Altezza occupata dal dock dal bordo inferiore dello schermo (pillola + margine). */
    get occupiedHeight() { return this.iconSize + PAD_T + PAD_B + this.bottomMargin; }

    // ── Struttura ────────────────────────────────────────────────────────────

    _buildActors() {
        // Contenitore a posizioni assolute, non reattivo: solo pillola e icone ricevono il mouse.
        this.actor = new St.Widget({name: 'glassy-dock', reactive: false});

        this._pill = new St.Widget({
            style_class: 'glassy-dock-pill',
            reactive: true,
            track_hover: true,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this.actor.add_child(this._pill);

        // Attore dello sfocato: inscritto nella pillola (vedi BLUR_INSET)
        this._blur = new St.Widget({reactive: false});
        this._pill.add_child(this._blur);

        this._label = new St.Label({style_class: 'glassy-dock-label', visible: false, opacity: 0});
        this.actor.add_child(this._label);

        // Attore trasparente, a tutta larghezza, che riserva lo spazio in basso alle finestre
        // (solo quando il dock non si nasconde).
        this._strut = new St.Widget({name: 'glassy-dock-strut', reactive: false});
        // Striscia sul bordo inferiore: il puntatore che la tocca fa riapparire il dock nascosto.
        this._edge = new St.Widget({name: 'glassy-dock-edge', reactive: true, track_hover: true});

        Main.layoutManager.addChrome(this._strut, {affectsStruts: true, trackFullscreen: true});
        Main.layoutManager.addChrome(this._edge, {trackFullscreen: true});
        Main.layoutManager.addChrome(this.actor, {trackFullscreen: true});

        this._pill.connectObject(
            'motion-event', (_a, ev) => this._onMotion(ev),
            'enter-event', () => this._onEnter(),
            'leave-event', () => this._onLeave(),
            this);
        this._edge.connectObject(
            'enter-event', () => { this._onEnter(); },
            'leave-event', () => this._onLeave(),
            this);
    }

    _connect() {
        const queue = () => this._queueRebuild();
        this._appSystem.connectObject(
            'app-state-changed', (_s, app) => this._onAppStateChanged(app),
            'installed-changed', queue,
            this);
        this._favorites.connectObject('changed', queue, this);
        Main.layoutManager.connectObject('monitors-changed', queue, this);
        this._settings.connectObject(
            'changed::icon-size', queue,
            'changed::magnification', queue,
            'changed::bottom-margin', queue,
            'changed::icon-spacing', queue,
            'changed::show-trash', queue,
            'changed::show-launchpad-button', queue,
            'changed::autohide', () => { this._reposition(); this._updateHidden(true); },
            'changed::dock-tint', () => this._applyStyle(),
            'changed::dock-radius', () => this._applyStyle(),
            'changed::dock-blur', () => this._applyStyle(),
            'changed::dock-blur-radius', () => this._applyStyle(),
            'changed::show-running-dots', () => this._updateRunning(),
            this);
        this._launchpad.onChanged = () => this._updateHidden(true);

        this._trashMonitor = null;
        try {
            this._trashMonitor = Gio.File.new_for_uri('trash:///').monitor_directory(Gio.FileMonitorFlags.NONE, null);
            this._trashMonitor.connect('changed', () => this._updateTrash());
        } catch (e) {
            // senza gvfs il Cestino non si può monitorare: l'icona resta quella "vuoto"
        }
    }

    destroy() {
        this._destroyed = true;
        for (const id of [this._rebuildId, this._leaveId, this._hideId, this._overlapId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._stopFrames();
        if (this._drag)
            this._dragEnd(null, true);
        this._closeMenu();
        this._appSystem.disconnectObject(this);
        this._favorites.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._settings.disconnectObject(this);
        global.display.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        this._trashMonitor?.cancel();
        this._launchpad.onChanged = null;

        for (const e of this._entries)
            this._destroyEntry(e);
        this._entries = [];

        for (const a of [this._strut, this._edge, this.actor]) {
            Main.layoutManager.removeChrome(a);
            a.destroy();
        }
    }

    // ── Stile (pillola e sfocato) ────────────────────────────────────────────

    _applyStyle() {
        if (!this._g)
            return;
        const s = this._settings;
        const tint = s.get_int('dock-tint') / 100;           // 0 = quasi trasparente, 1 = opaco
        const r = s.get_int('dock-radius');
        const top = (0.12 + 0.50 * tint).toFixed(3);
        const bottom = (0.05 + 0.40 * tint).toFixed(3);
        const border = (0.16 + 0.30 * tint).toFixed(3);
        this._pill.set_style(
            `border-radius: ${r}px; background-gradient-start: rgba(255, 255, 255, ${top}); ` +
            `background-gradient-end: rgba(255, 255, 255, ${bottom}); border: 1px solid rgba(255, 255, 255, ${border});`);

        removeBackgroundBlur(this._blur);
        if (s.get_boolean('dock-blur'))
            addBackgroundBlur(this._blur, {radius: s.get_int('dock-blur-radius'), brightness: 0.95});
    }

    // ── Voci del dock ────────────────────────────────────────────────────────

    _wantedEntries() {
        const list = [];
        if (this._settings.get_boolean('show-launchpad-button'))
            list.push({key: 'launchpad', kind: 'launchpad'});
        const seen = new Set();

        for (const app of this._favorites.getFavorites()) {
            seen.add(app.get_id());
            list.push({key: `app:${app.get_id()}`, kind: 'app', app});
        }
        for (const app of this._appSystem.get_running()) {
            if (seen.has(app.get_id()))
                continue;
            if (!app.get_windows().some(w => !w.skip_taskbar))
                continue;
            list.push({key: `app:${app.get_id()}`, kind: 'app', app, extra: true});
        }

        if (this._settings.get_boolean('show-trash')) {
            list.push({key: 'sep', kind: 'sep'});
            list.push({key: 'trash', kind: 'trash'});
        }
        return list;
    }

    _queueRebuild() {
        if (this._rebuildId || this._destroyed)
            return;
        if (this._drag) {
            this._drag.rebuildPending = true;
            return;
        }
        this._rebuildId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._rebuildId = 0;
            this._rebuild();
            return GLib.SOURCE_REMOVE;
        });
    }

    _rebuild() {
        const wanted = this._wantedEntries();
        const old = new Map(this._entries.map(e => [e.key, e]));
        const next = [];

        for (const w of wanted) {
            let e = old.get(w.key);
            if (e) {
                old.delete(w.key);
                e.app = w.app ?? e.app;
            } else {
                e = this._createEntry(w);
            }
            next.push(e);
        }
        for (const e of old.values())
            this._destroyEntry(e);

        this._entries = next;
        for (const e of next) {                       // le etichette restano sopra a tutto
            if (e.actor.get_parent() === this.actor)
                this.actor.set_child_below_sibling(e.actor, this._label);
            if (e.dot && e.dot.get_parent() === this.actor)
                this.actor.set_child_below_sibling(e.dot, this._label);
        }
        this._updateRunning();
        this._reposition();
        this._applyStyle();
        this._updateTrash();
        this._checkOverlap();
    }

    _createEntry(spec) {
        const e = {key: spec.key, kind: spec.kind, app: spec.app ?? null, extra: !!spec.extra,
            bouncing: false, s: 1, base: 0};

        if (spec.kind === 'sep') {
            e.actor = new St.Widget({style_class: 'glassy-dock-sep'});
            this.actor.add_child(e.actor);
            return e;
        }

        const button = new St.Button({
            style_class: 'glassy-dock-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO | St.ButtonMask.THREE,
            width: RENDER,
            height: RENDER,
            pivot_point: new Graphene.Point({x: 0.5, y: 1}),
        });
        button.child = this._createIcon(e);
        e.actor = button;

        e.dot = new St.Widget({style_class: 'glassy-dock-dot', visible: false});
        this.actor.add_child(e.dot);
        this.actor.add_child(button);

        button.connectObject(
            'clicked', (_b, mouseButton) => this._onClicked(e, mouseButton),
            'button-press-event', (_a, ev) => this._onPress(e, ev),
            'button-release-event', () => { this._press = null; return Clutter.EVENT_PROPAGATE; },
            'motion-event', (_a, ev) => this._onItemMotion(e, ev),
            'enter-event', () => { this._onEnter(); this._hoverEntry = e; },
            'leave-event', () => this._onLeave(),
            this);

        if (spec.kind === 'app') {
            e.app.connectObject('windows-changed', () => {
                this._updateIconGeometry();
                this._updateRunning();
                if (e.extra)
                    this._queueRebuild();
            }, this);
        }
        return e;
    }

    _destroyEntry(e) {
        e.app?.disconnectObject(this);
        e.actor?.disconnectObject(this);
        e.actor?.destroy();
        e.dot?.destroy();
        if (this._hoverEntry === e)
            this._hoverEntry = null;
        if (this._labelEntry === e)
            this._labelEntry = null;
    }

    _createIcon(e) {
        if (e.kind === 'app')
            return e.app.create_icon_texture(RENDER);
        if (e.kind === 'launchpad') {
            const file = this._ext.dir.get_child('icons').get_child('glassy-launchpad.svg');
            return new St.Icon({gicon: new Gio.FileIcon({file}), icon_size: RENDER});
        }
        return new St.Icon({icon_name: 'user-trash', icon_size: RENDER});
    }

    _entryName(e) {
        switch (e.kind) {
        case 'launchpad': return 'Launchpad';
        case 'trash': return 'Cestino';
        default: return e.app.get_name();
        }
    }

    _updateRunning() {
        const show = this._settings.get_boolean('show-running-dots');
        for (const e of this._entries) {
            if (e.kind !== 'app')
                continue;
            e.dot.visible = show && e.app.state !== Shell.AppState.STOPPED &&
                e.app.get_windows().some(w => !w.skip_taskbar);
        }
    }

    _onAppStateChanged(app) {
        const e = this._entries.find(x => x.app === app);
        if (e && app.state === Shell.AppState.STARTING)
            this._bounce(e);
        this._updateRunning();
        this._queueRebuild();
    }

    _updateTrash() {
        const e = this._entries.find(x => x.kind === 'trash');
        if (!e)
            return;
        Gio.File.new_for_uri('trash:///').query_info_async(
            'trash::item-count', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null,
            (file, res) => {
                try {
                    const full = file.query_info_finish(res).get_attribute_uint32('trash::item-count') > 0;
                    if (full !== this._trashFull && e.actor.get_stage()) {
                        this._trashFull = full;
                        e.actor.child = new St.Icon({
                            icon_name: full ? 'user-trash-full' : 'user-trash', icon_size: RENDER,
                        });
                    }
                } catch {
                    // niente gvfs / cestino non disponibile
                }
            });
    }

    // ── Geometria (stato a riposo) ───────────────────────────────────────────

    _widthOf(e, s = 1) {
        return e.kind === 'sep' ? SEP_W : this._g.icon * s;
    }

    /** Dimensioni, posizione del dock e posizione "a riposo" di ogni voce. */
    _reposition({animate = false} = {}) {
        const mon = Main.layoutManager.primaryMonitor;
        if (!mon)
            return;
        const icon = this.iconSize;
        const gap = this.gap;
        const mag = this.magnification;
        const n = this._entries.length;
        const baseWidth = this._entries.reduce((w, e) => w + (e.kind === 'sep' ? SEP_W : icon), 0) +
            gap * Math.max(0, n - 1);
        const pillH = PAD_T + icon + PAD_B;
        const extra = Math.ceil((icon + gap) * (mag - 1) * 4 + 40);
        const width = Math.ceil(baseWidth + 2 * PAD_X + extra);
        const height = Math.ceil(PAD_T + icon * mag + PAD_B + this.bottomMargin + LABEL_SPACE + (mag - 1) * icon * 0.2);
        const g = this._g = {icon, gap, mag, baseWidth, pillH, width, height, sigma: (icon + gap) * 1.05};

        this.actor.set_size(width, height);
        this.actor.set_position(Math.round(mon.x + (mon.width - width) / 2), mon.y + mon.height - height);
        this._hideDistance = pillH + this.bottomMargin + 40;

        // Struts: solo con il dock sempre visibile
        // (la Shell conta lo strut anche se l'attore è nascosto: per liberarlo si porta l'altezza a zero)
        const strutH = this.autohide === 'never' ? g.pillH + this.bottomMargin + 6 : 0;
        this._strut.set_size(mon.width, strutH);
        this._strut.set_position(mon.x, mon.y + mon.height - strutH);
        this._edge.set_size(Math.round(baseWidth + 2 * PAD_X + 160), EDGE_H);
        this._edge.set_position(Math.round(mon.x + (mon.width - this._edge.width) / 2), mon.y + mon.height - EDGE_H);
        this._edge.visible = this.autohide !== 'never';
        Main.layoutManager._queueUpdateRegions?.();

        // pillola (dimensione fissa) e sfocato inscritto
        this._pillBase = baseWidth + 2 * PAD_X;
        this._pill.set_size(Math.round(this._pillBase), pillH);
        this._pill.set_position(Math.round(width / 2 - this._pillBase / 2), height - this.bottomMargin - pillH);
        this._blur.set_size(Math.max(1, Math.round(this._pillBase - 2 * BLUR_INSET)), Math.max(1, pillH - 2 * BLUR_INSET));
        this._blur.set_position(BLUR_INSET, BLUR_INSET);

        // posizioni a riposo
        const rest = icon / RENDER;
        let x = width / 2 - baseWidth / 2;
        const itemBottom = height - this.bottomMargin - PAD_B;
        const pillBottom = height - this.bottomMargin;
        for (const e of this._entries) {
            const w = this._widthOf(e);
            e.base = x + w / 2;
            x += w + gap;
            if (e.kind === 'sep') {
                e.actor.set_size(SEP_W, icon * 0.7);
                this._moveTo(e.actor, Math.round(e.base - SEP_W / 2), itemBottom - icon * 0.7 - 2, animate);
                continue;
            }
            e.actor.set_scale(rest * e.s, rest * e.s);
            this._moveTo(e.actor, Math.round(e.base - RENDER / 2), itemBottom - RENDER, animate);
            this._moveTo(e.dot, Math.round(e.base - 2.5), pillBottom - 10, animate);
        }
        this._apply();
        this._updateIconGeometry();
        this._placeHidden();
    }

    _moveTo(actor, x, y, animate) {
        if (animate && actor.get_stage()) {
            actor.ease({x, y, duration: 150, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        } else {
            actor.remove_transition('x');
            actor.remove_transition('y');
            actor.set_position(x, y);
        }
    }

    // ── Ingrandimento: un ciclo per frame ────────────────────────────────────

    _requestFrame() {
        if (this._frameId)
            return;
        this._lastFrame = GLib.get_monotonic_time() / 1000;
        this._frameId = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => this._onFrame());
    }

    _stopFrames() {
        if (this._frameId) {
            global.compositor.get_laters().remove(this._frameId);
            this._frameId = 0;
        }
    }

    _onFrame() {
        const now = GLib.get_monotonic_time() / 1000;
        const dt = Math.min(Math.max(now - this._lastFrame, 1), 60);
        this._lastFrame = now;
        const k = 1 - Math.exp(-dt / TAU);
        const g = this._g;
        const px = this._pointerX;

        let moving = false;
        for (const e of this._entries) {
            if (e.kind === 'sep')
                continue;
            const target = (px === null || g.mag <= 1)
                ? 1 : 1 + (g.mag - 1) * Math.exp(-((px - e.base) ** 2) / (2 * g.sigma * g.sigma));
            if (Math.abs(target - e.s) > 0.002) {
                e.s += (target - e.s) * k;
                moving = true;
            } else {
                e.s = target;
            }
        }
        this._apply();

        if (!moving) {
            this._frameId = 0;
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    }

    /** Applica le scale correnti: icone, pallini, separatori, pillola ed etichetta, tutto insieme. */
    _apply() {
        const g = this._g;
        if (!g || !this._entries.length)
            return;
        const rest = g.icon / RENDER;
        const n = this._entries.length;
        const total = this._entries.reduce((w, e) => w + this._widthOf(e, e.s), 0) + g.gap * Math.max(0, n - 1);
        let x = g.width / 2 - total / 2;

        for (const e of this._entries) {
            const w = this._widthOf(e, e.s);
            const center = x + w / 2;
            x += w + g.gap;
            e.layout = {base: e.base, center, scale: e.s};
            const tx = center - e.base;
            e.actor.translation_x = tx;
            if (e.kind === 'sep')
                continue;
            e.actor.set_scale(rest * e.s, rest * e.s);
            if (e.dot)
                e.dot.translation_x = tx;
        }

        // la pillola cresce con una trasformazione, non cambiando dimensione
        this._pill.scale_x = (total + 2 * PAD_X) / this._pillBase;
        this._placeLabel();
    }

    _placeLabel() {
        const e = this._hoverEntry && this._entries.includes(this._hoverEntry) ? this._hoverEntry : null;
        if (!e || !e.layout || !this._settings.get_boolean('show-labels') || this._drag || this._menu) {
            this._hideLabel();
            return;
        }
        const g = this._g;
        if (this._labelEntry !== e) {
            this._labelEntry = e;
            this._label.text = this._entryName(e);
        }
        const [lw, lh] = this._label.get_preferred_size().slice(2);
        const itemBottom = g.height - this.bottomMargin - PAD_B;
        const x = Math.round(Math.min(Math.max(e.layout.center - lw / 2, 4), g.width - lw - 4));
        const y = Math.round(itemBottom - g.icon * e.layout.scale - lh - 12);
        this._label.set_position(x, y);
        if (!this._labelShown) {
            this._labelShown = true;
            this._label.opacity = 0;
            this._label.show();
            this._label.ease({opacity: 255, duration: 110, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        }
    }

    _hideLabel() {
        if (!this._labelShown)
            return;
        this._labelShown = false;
        this._labelEntry = null;
        this._label.ease({
            opacity: 0, duration: 90, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => { if (!this._labelShown) this._label.hide(); },
        });
    }

    /** Dice alle finestre dov'è la loro icona (a riposo): serve all'animazione "lampada" in minimizzazione. */
    _updateIconGeometry() {
        if (!this._g || !this.actor.get_stage())
            return;
        const [ax, ay] = this.actor.get_transformed_position();
        const g = this._g;
        const itemBottom = g.height - this.bottomMargin - PAD_B;
        for (const e of this._entries) {
            if (e.kind !== 'app')
                continue;
            const rect = new Mtk.Rectangle({
                x: Math.round(ax + e.base - g.icon / 2),
                y: Math.round(ay + itemBottom - g.icon),
                width: g.icon,
                height: g.icon,
            });
            for (const w of e.app.get_windows())
                w.set_icon_geometry(rect);
        }
    }

    // ── Puntatore ────────────────────────────────────────────────────────────

    _localX(event) {
        const [x] = event.get_coords();
        return x - this.actor.get_transformed_position()[0];
    }

    _onMotion(event) {
        this._pointerX = this._localX(event);
        this._requestFrame();
        return Clutter.EVENT_PROPAGATE;
    }

    _onEnter() {
        this._inside = true;
        if (this._leaveId) {
            GLib.source_remove(this._leaveId);
            this._leaveId = 0;
        }
        this._updateHidden(true);
    }

    _onLeave() {
        if (this._leaveId)
            GLib.source_remove(this._leaveId);
        // piccolo ritardo: passando dalla pillola a un'icona (e viceversa) non deve "scattare" a riposo
        this._leaveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 70, () => {
            this._leaveId = 0;
            this._inside = false;
            this._pointerX = null;
            this._hoverEntry = null;
            this._hideLabel();
            this._requestFrame();
            this._scheduleHideCheck();
            return GLib.SOURCE_REMOVE;
        });
    }

    // ── Nascondersi quando serve ─────────────────────────────────────────────

    _startOverlapWatch() {
        const check = () => this._checkOverlap();
        global.display.connectObject(
            'restacked', check, 'notify::focus-window', check, 'window-created', check, this);
        global.workspace_manager.connectObject('workspace-switched', check, this);
        // le finestre che si spostano o ridimensionano non emettono segnali comodi da qui: controllo leggero
        this._overlapId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            if (this.autohide === 'smart')
                this._checkOverlap();
            return GLib.SOURCE_CONTINUE;
        });
    }

    /** C'è una finestra che copre la zona del dock? (solo schermo principale, area di lavoro corrente) */
    _checkOverlap() {
        if (!this._g)
            return;
        const mon = Main.layoutManager.primaryMonitor;
        if (!mon || this.autohide !== 'smart') {
            if (this._overlaps) {
                this._overlaps = false;
                this._updateHidden(true);
            }
            return;
        }
        const zoneH = this.occupiedHeight + 4;
        const [ax] = this.actor.get_transformed_position();
        const zone = new Mtk.Rectangle({
            x: Math.round(ax + (this._g.width - this._pillBase) / 2), y: mon.y + mon.height - zoneH,
            width: Math.round(this._pillBase), height: zoneH,
        });
        const ws = global.workspace_manager.get_active_workspace();
        let covered = false;
        for (const w of ws.list_windows()) {
            if (w.minimized || w.skip_taskbar || w.get_monitor() !== Main.layoutManager.primaryIndex)
                continue;
            const type = w.get_window_type();
            if (type !== Meta.WindowType.NORMAL && type !== Meta.WindowType.DIALOG &&
                type !== Meta.WindowType.MODAL_DIALOG)
                continue;
            const [ok] = zone.intersect(w.get_frame_rect());
            if (ok) {
                covered = true;
                break;
            }
        }
        if (covered !== this._overlaps) {
            this._overlaps = covered;
            this._updateHidden(true);
        }
    }

    _scheduleHideCheck() {
        if (this._hideId)
            GLib.source_remove(this._hideId);
        this._hideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 420, () => {
            this._hideId = 0;
            this._updateHidden(true);
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateHidden(animate) {
        const mode = this.autohide;
        let want = false;
        if (mode === 'always')
            want = true;
        else if (mode === 'smart')
            want = this._overlaps;
        if (this._inside || this._menu || this._drag || this._launchpad.visible)
            want = false;
        if (want === this._hidden && this._hiddenApplied)
            return;
        this._hidden = want;
        this._hiddenApplied = true;
        this._placeHidden(animate);
    }

    _placeHidden(animate = false) {
        if (!this._g)
            return;
        const ty = this._hidden ? this._hideDistance : 0;
        if (animate && this.actor.get_stage()) {
            this.actor.ease({
                translation_y: ty,
                duration: this._hidden ? 240 : 170,
                mode: this._hidden ? Clutter.AnimationMode.EASE_IN_QUAD : Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this.actor.remove_transition('translation_y');
            this.actor.translation_y = ty;
        }
    }

    // ── Pressione, trascinamento, clic ───────────────────────────────────────

    _onPress(e, event) {
        if (e.kind === 'app' && event.get_button() === Clutter.BUTTON_PRIMARY) {
            const [x, y] = event.get_coords();
            this._press = {e, x, y};
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _buttonHeld(event) {
        return (event.get_state() & Clutter.ModifierType.BUTTON1_MASK) !== 0;
    }

    _onItemMotion(e, event) {
        if (this._press) {
            // Il tasto è ancora premuto? Se no, la pressione è finita (rilascio perso): niente trascinamento.
            if (!this._buttonHeld(event)) {
                this._press = null;
            } else if (this._press.e === e && !this._drag) {
                const [x, y] = event.get_coords();
                if (Math.hypot(x - this._press.x, y - this._press.y) > 10) {
                    this._startDrag(e, x, y);
                    return Clutter.EVENT_STOP;
                }
            }
        }
        return this._onMotion(event);
    }

    _startDrag(e, x, y) {
        this._press = null;
        e.actor.fake_release();          // niente "clic" al rilascio
        this._pointerX = null;
        this._requestFrame();
        this._hideLabel();
        this._closeMenu();

        const size = this.iconSize;
        const ghost = new St.Widget({reactive: true, width: 1, height: 1});
        const icon = new St.Bin({
            style_class: 'glassy-dock-dragicon',
            child: e.app.create_icon_texture(size),
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        Main.uiGroup.add_child(ghost);
        Main.uiGroup.add_child(icon);
        icon.set_scale(1.12, 1.12);
        icon.opacity = 235;

        this._drag = {
            e, ghost, icon, size,
            wasFavorite: this._favorites.isFavorite(e.app.get_id()),
            removing: false,
            rebuildPending: false,
            grab: global.stage.grab(ghost),
        };
        e.actor.opacity = 70;
        ghost.connectObject(
            'motion-event', (_a, ev) => { this._dragMove(ev); return Clutter.EVENT_STOP; },
            'button-release-event', (_a, ev) => { this._dragEnd(ev, false); return Clutter.EVENT_STOP; },
            'key-press-event', (_a, ev) => {
                if (ev.get_key_symbol() === Clutter.KEY_Escape)
                    this._dragEnd(ev, true);
                return Clutter.EVENT_STOP;
            },
            this);
        this._dragMove({get_coords: () => [x, y], get_state: () => Clutter.ModifierType.BUTTON1_MASK});
    }

    _dragMove(event) {
        const d = this._drag;
        if (!d)
            return;
        // rilascio perso (es. il compositore era occupato): si chiude il trascinamento
        if (!this._buttonHeld(event)) {
            this._dragEnd(event, false);
            return;
        }
        const [x, y] = event.get_coords();
        d.icon.set_position(Math.round(x - d.size / 2), Math.round(y - d.size / 2));

        const [ax, ay] = this.actor.get_transformed_position();
        const pillTop = ay + this._pill.y;
        d.removing = d.wasFavorite && y < pillTop - this.iconSize * 1.4;
        d.icon.opacity = d.removing ? 130 : 235;

        // Posizione di inserimento: le altre icone si scostano via via che si passa sopra.
        const lx = x - ax;
        const others = this._entries.filter(en => en !== d.e);
        let first = others.findIndex(en => en.kind === 'app');
        if (first < 0)
            first = 0;
        let last = others.findIndex(en => en.kind === 'sep' || en.kind === 'trash');
        if (last < 0)
            last = others.length;
        let idx = first;
        while (idx < last && lx > others[idx].base)
            idx++;

        // Se la si porta fuori dal dock l'icona sparisce dal layout (e le altre si richiudono).
        const order = d.removing ? others : [...others.slice(0, idx), d.e, ...others.slice(idx)];
        const same = order.length === this._entries.length && order.every((en, i) => en === this._entries[i]);
        if (!same) {
            this._entries = order;
            d.e.actor.visible = !d.removing;
            d.e.dot.visible = !d.removing && d.e.dot.visible;
            this._reposition({animate: true});
        }
    }

    _dragEnd(event, cancelled) {
        const d = this._drag;
        if (!d)
            return;
        this._drag = null;
        d.ghost.disconnectObject(this);
        d.grab.dismiss();
        d.ghost.destroy();
        d.icon.destroy();
        d.e.actor.opacity = 255;
        d.e.actor.visible = true;
        if (!this._entries.includes(d.e))
            this._entries.push(d.e);         // era uscita dal layout: la ricostruzione la gestirà

        const id = d.e.app.get_id();
        if (!cancelled) {
            if (d.removing) {
                this._favorites.removeFavorite(id);
            } else {
                const idx = this._entries.indexOf(d.e);
                const favPos = this._entries.slice(0, idx).filter(en => en.kind === 'app' && !en.extra).length;
                if (d.wasFavorite)
                    this._favorites.moveFavoriteToPos(id, favPos);
                else
                    this._favorites.addFavoriteAtPos(id, favPos);
            }
        }
        this._rebuild();
        this._updateHidden(true);
    }

    _onClicked(e, mouseButton) {
        if (e.kind === 'launchpad') {
            if (mouseButton === Clutter.BUTTON_SECONDARY)
                this._showLaunchpadMenu(e);
            else
                this._launchpad.toggle();
            return;
        }
        if (e.kind === 'trash') {
            if (mouseButton === Clutter.BUTTON_SECONDARY)
                this._showTrashMenu(e);
            else
                Gio.AppInfo.launch_default_for_uri_async('trash:///', null, null, null);
            return;
        }

        const app = e.app;
        if (mouseButton === Clutter.BUTTON_SECONDARY) {
            this._showAppMenu(e);
        } else if (mouseButton === Clutter.BUTTON_MIDDLE) {
            this._bounce(e);
            app.open_new_window(-1);
        } else if (app.state === Shell.AppState.STOPPED) {
            this._bounce(e);
            app.activate();
        } else if (app.get_windows().some(w => !w.skip_taskbar)) {
            app.activate();
        } else {
            this._bounce(e);
            app.open_new_window(-1);
        }
    }

    // ── Menu ─────────────────────────────────────────────────────────────────

    _closeMenu() {
        if (!this._menu)
            return;
        const menu = this._menu;
        this._menu = null;
        menu.close(BoxPointer.PopupAnimation.NONE);
        menu.destroy();
        this._scheduleHideCheck();
    }

    _openMenu(menu) {
        this._closeMenu();
        this._menu = menu;
        this._menuManager ??= new PopupMenu.PopupMenuManager(this.actor);
        this._menuManager.addMenu(menu);
        Main.uiGroup.add_child(menu.actor);
        menu.connect('open-state-changed', (_m, open) => {
            if (!open && this._menu === menu)
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => { if (this._menu === menu) this._closeMenu(); return GLib.SOURCE_REMOVE; });
        });
        this._hideLabel();
        menu.open(BoxPointer.PopupAnimation.FULL);
    }

    _showAppMenu(e) {
        const menu = new AppMenu(e.actor, St.Side.BOTTOM, {favoritesSection: true, showSingleWindows: true});
        menu.setApp(e.app);
        this._openMenu(menu);
    }

    _showTrashMenu(e) {
        const menu = new PopupMenu.PopupMenu(e.actor, 0.5, St.Side.BOTTOM);
        menu.addAction('Apri il Cestino', () =>
            Gio.AppInfo.launch_default_for_uri_async('trash:///', null, null, null));
        menu.addAction('Svuota il Cestino', () =>
            GLib.spawn_command_line_async('gio trash --empty'));
        this._openMenu(menu);
    }

    _showLaunchpadMenu(e) {
        const menu = new PopupMenu.PopupMenu(e.actor, 0.5, St.Side.BOTTOM);
        menu.addAction('Impostazioni di Glassy…', () => this._ext.openPreferences());
        this._openMenu(menu);
    }

    // ── Rimbalzo all'avvio ───────────────────────────────────────────────────

    _bounce(e) {
        if (!this._settings.get_boolean('bounce-on-launch'))
            return;
        if (e.bouncing || !e.actor?.get_stage())
            return;
        e.bouncing = true;
        const height = this.iconSize * 0.7;
        const started = GLib.get_monotonic_time();

        const stop = () => {
            e.bouncing = false;
            e.actor?.ease({translation_y: 0, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        };
        const hop = () => {
            const running = e.app && e.app.state === Shell.AppState.RUNNING &&
                e.app.get_windows().some(w => !w.skip_taskbar);
            if (!e.bouncing || !e.actor?.get_stage() || running ||
                (GLib.get_monotonic_time() - started) / 1000 > BOUNCE_TIMEOUT) {
                stop();
                return;
            }
            e.actor.ease({
                translation_y: -height, duration: 260, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    e.actor?.ease({
                        translation_y: 0, duration: 300, mode: Clutter.AnimationMode.EASE_OUT_BOUNCE,
                        onComplete: hop,
                    });
                },
            });
        };
        hop();
    }
}
