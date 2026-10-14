// Finestra massimizzata / a schermo intero: il dock si nasconde? riappare dal bordo?
export async function run(t) {
    const {Main, Clutter} = t;
    const g = t.ext('glassy-desktop@glassy-os');
    const dock = g.dock;
    await t.sleep(5000);   // i client aprono le finestre
    const win = global.get_window_actors().map(a => a.meta_window).find(w => w.get_wm_class() === 'org.gnome.Nautilus');
    const st = label => console.log(`[steps] ${label}: nascosto=${dock._hidden} ty=${Math.round(dock.actor.translation_y)} dock.visible=${dock.actor.visible} edge.visible=${dock._edge.visible} strut=${dock._strut.visible} modo=${dock.autohide}`);
    st('finestra normale (non copre il dock)');

    win.move_resize_frame(true, 200, 300, 900, 600);   // arriva fin sotto al dock
    await t.sleep(900);
    st('finestra che copre il dock');
    await t.shot(`${t.GLib.getenv('SHOT_OUT')}/ah-1-covered.png`);

    win.maximize();
    await t.sleep(900);
    st('massimizzata');
    const mon = Main.layoutManager.primaryMonitor;
    console.log(`[steps] altezza finestra massimizzata: ${win.get_frame_rect().height} su ${mon.height} (la riserva del dock deve essere 0)`);

    // puntatore sul bordo inferiore → il dock riappare
    t.move(mon.width / 2 - 30, mon.height - 40); await t.sleep(200);
    t.move(mon.width / 2, mon.height - 1); await t.sleep(900);
    st('puntatore sul bordo');
    await t.shot(`${t.GLib.getenv('SHOT_OUT')}/ah-2-revealed.png`);

    t.move(mon.width / 2, 300); await t.sleep(1400);
    st('puntatore via');

    win.make_fullscreen();
    await t.sleep(1200);
    st('schermo intero');
    await t.shot(`${t.GLib.getenv('SHOT_OUT')}/ah-3-fullscreen.png`);
}
