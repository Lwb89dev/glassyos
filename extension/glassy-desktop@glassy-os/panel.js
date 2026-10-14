// Barra superiore: a sinistra il nome dell'app in primo piano, come la barra dei menu di macOS.

import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const AppNameButton = GObject.registerClass(
class GlassyAppNameButton extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Glassy app name', true);
        this._label = new St.Label({
            style_class: 'glassy-panel-appname',
            y_align: Clutter.ActorAlign.CENTER,
            text: 'Glassy',
        });
        this.add_child(this._label);
        this.reactive = false;
        this.can_focus = false;

        this._tracker = Shell.WindowTracker.get_default();
        this._tracker.connectObject('notify::focus-app', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        const app = this._tracker.focus_app;
        this._label.text = app ? app.get_name() : 'Glassy';
    }

    destroy() {
        this._tracker.disconnectObject(this);
        super.destroy();
    }
});

export class PanelTweaks {
    constructor(settings) {
        this._settings = settings;
        this._button = new AppNameButton();
        Main.panel.addToStatusArea('glassy-appname', this._button, 0, 'left');
        this._settings.connectObject('changed::show-app-name', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        this._button.container.visible = this._settings.get_boolean('show-app-name');
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._button.destroy();
        this._button = null;
    }
}
