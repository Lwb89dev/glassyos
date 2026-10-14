import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Dock} from './dock.js';
import {Launchpad} from './launchpad.js';
import {Lockdown} from './lockdown.js';
import {PanelTweaks} from './panel.js';

export default class GlassyDesktop extends Extension {
    enable() {
        this.settings = this.getSettings();

        this.launchpad = new Launchpad(this);
        this.lockdown = new Lockdown(this.launchpad, this.settings);
        this.panel = new PanelTweaks(this.settings);
        this.dock = new Dock(this, this.launchpad);

        // Il pannello impostazioni rigenera i CSS del tema e cambia questo contatore:
        // qui si ricarica il tema della Shell, così le modifiche si vedono subito.
        this.settings.connectObject('changed::theme-serial', () => Main.loadTheme(), this);
    }

    disable() {
        this.settings?.disconnectObject(this);
        this.dock?.destroy();
        this.dock = null;
        this.panel?.destroy();
        this.panel = null;
        this.lockdown?.destroy();
        this.lockdown = null;
        this.launchpad?.destroy();
        this.launchpad = null;
        this.settings = null;
    }
}
