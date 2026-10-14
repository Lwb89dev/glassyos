// Launchpad aperto: passando il puntatore sulle app non deve restare nessun contorno, e il dock deve restare cliccabile.
export async function run(t) {
    const {Main} = t;
    const g = t.ext('glassy-desktop@glassy-os');
    const out = t.GLib.getenv('SHOT_OUT');
    await t.sleep(2500);
    g.launchpad.show();
    await t.sleep(1000);
    const lp = g.launchpad;
    const visibleItems = lp._items.filter(it => it.button.visible);
    const pos = it => { const [x, y] = it.button.get_transformed_position(); return [x + it.button.width / 2, y + it.button.height / 2 - 8]; };
    for (let i = 0; i < 4; i++) {
        const [x, y] = pos(visibleItems[i]);
        t.move(x, y);
        await t.sleep(500);
        console.log(`[steps] hover ${i}: ${visibleItems[i].app.get_name()} hover=${visibleItems[i].button.hover} focus=${visibleItems[i].button.has_key_focus()} pseudo=${visibleItems[i].button.get_style_pseudo_class()}`);
    }
    await t.shot(`${out}/lp-hover-1.png`);
    const [x, y] = pos(visibleItems[5]);
    t.move(x, y); await t.sleep(500);
    t.move(20, 400); await t.sleep(500);
    await t.shot(`${out}/lp-hover-2.png`);
    console.log(`[steps] key focus: ${global.stage.key_focus}`);

    // scorrimento veloce lungo una riga: alla fine deve risultare in hover una sola voce
    const row = visibleItems.slice(0, 7);
    const [sx, sy] = pos(row[0]);
    const [ex2] = pos(row[6]);
    for (let x = sx - 60; x <= ex2 + 60; x += 9) { t.move(x, sy); await t.sleep(8); }
    await t.sleep(400);
    const hovered = lp._items.filter(it => it.button.visible && it.button.hover).map(it => it.app.get_name());
    console.log(`[steps] dopo lo scorrimento: in hover = ${JSON.stringify(hovered)}`);
    t.move(20, 400); await t.sleep(500);
    console.log(`[steps] puntatore fuori: in hover = ${JSON.stringify(lp._items.filter(it => it.button.hover).map(it => it.app.get_name()))}`);

    // tastiera: con il grab sullo stage il testo deve arrivare ancora alla ricerca
    t.key(t.Clutter.KEY_c); t.key(t.Clutter.KEY_a); await t.sleep(300);
    console.log(`[steps] ricerca = '${lp._entry.get_text()}', app mostrate = ${lp._items.filter(it => it.score >= 0).length}`);
    t.key(t.Clutter.KEY_Escape); await t.sleep(600);
    console.log(`[steps] dopo Esc: launchpad.visible=${lp.visible}`);

    // clic su un'icona del dock con il launchpad aperto
    const dock = g.dock;
    const hoverCheck = async label => {
        const entry = dock._entries.find(e => e.kind === 'app');
        const [ex, ey] = entry.actor.get_transformed_position();
        t.move(ex + 10, ey - 30); await t.sleep(150);
        t.move(ex + entry.actor.width / 2, ey + entry.actor.height / 2); await t.sleep(500);
        console.log(`[steps] ${label}: puntatore sull'icona '${entry.app.get_id()}' hover=${entry.actor.hover} scala=${entry.actor.scale_x.toFixed(2)} etichetta=${dock._label.visible}`);
        return entry;
    };
    lp.show(); await t.sleep(900);
    const entry = await hoverCheck('launchpad aperto');
    await t.shot(`${out}/lp-dock-hover.png`);
    t.click(); await t.sleep(1500);
    console.log(`[steps] dopo il clic sul dock: launchpad.visible=${lp.visible} finestre=${global.get_window_actors().length}`);
    await t.shot(`${out}/lp-dock-click.png`);

    // il pulsante Launchpad del dock chiude il launcher aperto
    lp.show(); await t.sleep(900);
    const lpEntry = dock._entries.find(e => e.kind === 'launchpad');
    const [lx, ly] = lpEntry.actor.get_transformed_position();
    t.move(lx + lpEntry.actor.width / 2, ly + lpEntry.actor.height / 2); await t.sleep(500);
    t.click(); await t.sleep(800);
    console.log(`[steps] clic sul pulsante Launchpad: launchpad.visible=${lp.visible}`);

    // clic nel vuoto chiude
    lp.show(); await t.sleep(900);
    t.move(800, 120); await t.sleep(200); t.click(); await t.sleep(600);
    console.log(`[steps] clic nel vuoto: launchpad.visible=${lp.visible}`);

    // i clic sulla barra restano possibili (menu di sistema) e poi il launcher è ancora usabile
    lp.show(); await t.sleep(900);
    const qs = Main.panel.statusArea.quickSettings;
    qs.menu.open(); await t.sleep(600);
    console.log(`[steps] menu rapido aperto sopra il launcher: ${qs.menu.isOpen}, launchpad.visible=${lp.visible}`);
    await t.shot(`${out}/lp-qs.png`);
    qs.menu.close(); await t.sleep(400);
    t.key(t.Clutter.KEY_Escape); await t.sleep(600);
    console.log(`[steps] fine: launchpad.visible=${lp.visible}`);
}
