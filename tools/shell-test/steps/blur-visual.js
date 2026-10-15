// Sfocato di dock e Launchpad con una finestra dietro: il bordo della finestra sotto la pillola deve
// apparire sfumato (sfocato attivo) e nello stesso punto in cui sta davvero (clone allineato).
export async function run(t) {
    const g = t.ext('glassy-desktop@glassy-os');
    const s = g.settings;
    const out = t.GLib.getenv('SHOT_OUT');
    await t.sleep(5000);
    s.set_string('autohide', 'always');
    const win = global.get_window_actors().map(a => a.meta_window).find(w => w.get_wm_class());
    try { win.unmaximize(); } catch { win.unmaximize(t.Meta?.MaximizeFlags?.BOTH ?? 3); }
    await t.sleep(500);
    win.move_resize_frame(false, 800, 560, 900, 400);      // il bordo sinistro passa sotto al dock
    await t.sleep(900);
    const mon = t.Main.layoutManager.primaryMonitor;
    const reveal = async () => { t.move(mon.width / 2 - 200, mon.height - 1); await t.sleep(900); };
    await reveal();
    console.log(`[steps] dock nascosto=${g.dock._hidden} clone=${g.dock._blur._clone.x},${g.dock._blur._clone.y} size=${g.dock._blur._clone.width}x${g.dock._blur._clone.height}`);
    await t.shot(`${out}/blur-on.png`);
    s.set_boolean('dock-blur', false); await t.sleep(400);
    await t.shot(`${out}/blur-off.png`);
    s.set_boolean('dock-blur', true); await t.sleep(400);
    // hover: pillola larga, lo sfocato la segue
    const e = g.dock._entries.find(x => x.kind === 'app');
    const [x, y] = e.actor.get_transformed_position();
    t.move(x + e.actor.width / 2, y + e.actor.height / 2); await t.sleep(700);
    await t.shot(`${out}/blur-hover.png`);
    console.log(`[steps] clip=${g.dock._blurClip} scala pillola=${g.dock._pill.scale_x.toFixed(3)}`);
    g.launchpad.show(); await t.sleep(1200);
    await t.shot(`${out}/blur-launchpad.png`);
    g.launchpad.hide(); await t.sleep(500);
}
