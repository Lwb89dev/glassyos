// Finestra bloccata → dialogo "non risponde" di Mutter: dimensioni e posizione.
export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    await t.sleep(6000);
    const win = global.get_window_actors().map(a => a.meta_window).find(w => w.get_wm_class() === 'org.gnome.TextEditor');
    console.log(`[steps] finestra: ${win?.get_title()} (${win?.get_wm_class()})`);
    win.delete(global.get_current_time());
    await t.sleep(9000);
    const walk = (a, out) => { if ((a.style_class ?? '').includes('dialog')) { const [x, y] = a.get_transformed_position(); const [w, h] = a.get_transformed_size(); out.push(`${a.constructor.name}.${a.style_class} ${Math.round(x)},${Math.round(y)} ${Math.round(w)}x${Math.round(h)}`); } for (const c of a.get_children()) walk(c, out); };
    const found = []; walk(global.stage, found);
    console.log(`[steps] attori dialogo:\n${found.join('\n')}`);
    await t.shot(`${out}/dlg-close.png`);
}
