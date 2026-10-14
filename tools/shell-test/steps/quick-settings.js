// Apre le impostazioni rapide e fotografa il pannello (per controllare angoli e ombre dei toggle).
export async function run(t) {
    const {Main} = t;
    await t.sleep(2000);
    const qs = Main.panel.statusArea.quickSettings;
    qs.menu.open();
    await t.sleep(900);
    await t.shot(`${t.GLib.getenv('SHOT_OUT')}/qs.png`);
    qs.menu.close();
    await t.sleep(400);
    const icon = new t.Gio.ThemedIcon({name: 'audio-volume-high-symbolic'});
    Main.osdWindowManager.showAll(icon, null, 0.62, 1.0);
    await t.sleep(700);
    await t.shot(`${t.GLib.getenv('SHOT_OUT')}/osd.png`);
    Main.osdWindowManager.hideAll();
    await t.sleep(300);
    Main.osdWindowManager.showAll(icon, 'Luminosità', 0.4, 1.0);
    await t.sleep(700);
    await t.shot(`${t.GLib.getenv('SHOT_OUT')}/osd-label.png`);
}
