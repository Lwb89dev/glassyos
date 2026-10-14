// Cerca resti grafici nel Launchpad: dopo ogni azione si riporta il puntatore nel vuoto e si confronta lo
// screenshot con quello di partenza. Qualunque differenza (a parte la barra in alto) è un residuo.
import {applyScale} from './_scale.js';

export async function run(t) {
    const {Clutter, GLib} = t;
    const scale = Number(GLib.getenv('SHOT_SCALE') ?? 1);
    const g = t.ext('glassy-desktop@glassy-os');
    const lp = g.launchpad;
    const out = GLib.getenv('SHOT_OUT');
    const seat = global.stage.context.get_backend().get_default_seat();
    const wheel = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const now = () => GLib.get_monotonic_time();
    const items = () => lp._items.filter(it => it.button.visible);
    const center = it => { const [x, y] = it.button.get_transformed_position(); return [x + it.button.width / 2, y + it.button.height / 2 - 8]; };
    const idle = async () => { t.move(20, 450); await t.sleep(900); };
    const state = label => {
        const odd = lp._items.filter(it => it.button.visible && (it.button.hover || it.button.has_key_focus() || it.button.get_child().scale_x !== 1 || it.button.opacity !== 255 || it.button.translation_y !== 0 || it.button.get_style_pseudo_class()?.replace(/first-child|last-child/g, '').trim()))
            .map(it => `${it.app.get_name()}[hover=${it.button.hover} focus=${it.button.has_key_focus()} scala=${it.button.get_child().scale_x.toFixed(2)} op=${it.button.opacity} pseudo='${it.button.get_style_pseudo_class()}']`);
        console.log(`[steps] ${label}: pagina=${lp._page} stranezze=${JSON.stringify(odd)} key_focus=${global.stage.key_focus}`);
    };
    const snap = async name => { await t.shot(`${out}/${name}.png`); };

    await t.sleep(2500);
    if (scale !== 1) {
        console.log(`[steps] scala: ${await applyScale(scale)}`);
        await t.sleep(2500);
        console.log(`[steps] monitor logico ${global.stage.width}x${global.stage.height}`);
    }
    lp.show();
    await t.sleep(1800);
    await idle();
    await snap('art-0-base');
    state('base');

    // A: scorrimento con il puntatore lungo due righe
    for (const row of [0, 7, 14]) {
        const list = items();
        const [sx, sy] = center(list[row]);
        const [ex] = center(list[row + 6]);
        for (let x = sx - 40; x <= ex + 40; x += 11) { t.move(x, sy); await t.sleep(10); }
    }
    await idle(); await snap('art-1-hover'); state('dopo hover');

    // B: rotella (scorrimento tra le pagine)
    for (const dir of [Clutter.ScrollDirection.DOWN, Clutter.ScrollDirection.UP]) {
        t.move(800, 450); await t.sleep(200);
        wheel.notify_discrete_scroll(now(), dir, Clutter.ScrollSource.WHEEL, false);
        await t.sleep(700);
        const list = items(); const [x, y] = center(list[8]); t.move(x, y); await t.sleep(300);
        await snap(`art-2-rotella-${dir === Clutter.ScrollDirection.DOWN ? 'giu' : 'su'}`);
        state(`rotella ${dir === Clutter.ScrollDirection.DOWN ? 'giù' : 'su'}`);
    }
    await idle(); await snap('art-2-rotella-fine'); state('dopo rotella');

    // B2: scorrimento fluido (trackpad)
    for (let i = 0; i < 12; i++) { wheel.notify_scroll_continuous(now(), 0, 2.5, Clutter.ScrollSource.FINGER, Clutter.ScrollFinishFlags.NONE); await t.sleep(16); }
    wheel.notify_scroll_continuous(now(), 0, 0, Clutter.ScrollSource.FINGER, Clutter.ScrollFinishFlags.VERTICAL);
    await t.sleep(700);
    await idle(); await snap('art-3-trackpad'); state('dopo trackpad');

    // C: tastiera
    for (const k of [Clutter.KEY_Tab, Clutter.KEY_Tab, Clutter.KEY_Tab, Clutter.KEY_Right, Clutter.KEY_Down, Clutter.KEY_Left, Clutter.KEY_Up]) {
        t.key(k); await t.sleep(250);
        console.log(`[steps] tasto ${k}: key_focus=${global.stage.key_focus}`);
    }
    await snap('art-4-tastiera'); state('dopo tastiera');
    await idle(); await snap('art-4-tastiera-idle');

    // D: pallini di pagina
    const dots = lp._dots.get_children();
    if (dots.length > 1) {
        const [dx, dy] = dots[1].get_transformed_position();
        t.move(dx + 5, dy + 5); await t.sleep(300); t.click(); await t.sleep(700);
        const [d0x, d0y] = lp._dots.get_children()[0].get_transformed_position();
        t.move(d0x + 5, d0y + 5); await t.sleep(300); t.click(); await t.sleep(700);
        await idle(); await snap('art-5-pallini'); state('dopo pallini');
    }

    // E: pressione su un'icona e trascinamento fuori, senza rilasciare sopra
    {
        const [x, y] = center(items()[9]);
        t.move(x, y); await t.sleep(300); t.press(); await t.sleep(200);
        await snap('art-6-premuto');
        t.move(x + 300, y + 40); await t.sleep(300); t.release(); await t.sleep(500);
        await idle(); await snap('art-6-trascinato'); state('dopo pressione e trascinamento');
    }

    // F: ricerca e cancellazione
    for (const k of [Clutter.KEY_c, Clutter.KEY_a]) { t.key(k); await t.sleep(200); }
    await t.sleep(500); await snap('art-7-ricerca');
    for (let i = 0; i < 2; i++) { t.key(Clutter.KEY_BackSpace); await t.sleep(200); }
    await t.sleep(900); await idle(); await snap('art-7-ricerca-fine'); state('dopo ricerca');
}
