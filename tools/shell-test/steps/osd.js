// Mostra il popup del volume (OSD) e lo fotografa.
export async function run(t) {
    const {Main, Gio} = t;
    await t.sleep(2000);
    const icon = new Gio.ThemedIcon({name: 'audio-volume-high-symbolic'});
    Main.osdWindowManager.showAll(icon, null, 0.62, 1.0);
    await t.sleep(700);
    await t.shot(`${t.GLib.getenv('SHOT_OUT')}/osd.png`);
}
