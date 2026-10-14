// Impostazioni rapide: apre il sottomenu (seconda pagina) di un toggle e lo fotografa.
import GObject from 'gi://GObject';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const DemoToggle = GObject.registerClass(
class DemoToggle extends QuickSettings.QuickMenuToggle {
    _init() {
        super._init({title: 'Wi-Fi', subtitle: 'Rete di prova', iconName: 'network-wireless-symbolic', toggleMode: true, checked: true});
        this.menu.setHeader('network-wireless-symbolic', 'Wi-Fi', 'Rete di prova');
    }
});

export async function run(t) {
    const {Main} = t;
    const out = t.GLib.getenv('SHOT_OUT');
    await t.sleep(2500);
    const qs = Main.panel.statusArea.quickSettings;
    const toggle = new DemoToggle();
    const PopupMenu = await import('resource:///org/gnome/shell/ui/popupMenu.js');
    for (const n of ['Casa-5G', 'Ufficio', 'Telefono di Mario', 'Reti nascoste…'])
        toggle.menu.addMenuItem(new PopupMenu.PopupMenuItem(n));
    qs.menu.addItem(toggle, 2);
    qs.menu.open();
    await t.sleep(800);
    await t.shot(`${out}/qm-1-closed.png`);

    toggle.menu.open(true);
    await t.sleep(900);
    await t.shot(`${out}/qm-2-open.png`);
    const btn = toggle.get_first_child?.();
    console.log(`[steps] tree: ${toggle} figli=${toggle.get_n_children()}`);
    toggle.menu.close(true);
    await t.sleep(500);

    // spento, e con il puntatore sulla freccia / sul corpo del toggle
    toggle.checked = false;
    await t.sleep(400);
    const arrow = toggle._menuButton;
    const [ax, ay] = arrow.get_transformed_position();
    t.move(ax + arrow.width / 2, ay + arrow.height / 2); await t.sleep(500);
    await t.shot(`${out}/qm-3-off-arrow-hover.png`);
    const [bx, by] = toggle._box.get_first_child().get_transformed_position();
    t.move(bx + 60, by + 20); await t.sleep(500);
    await t.shot(`${out}/qm-4-off-body-hover.png`);
    qs.menu.close();
}
