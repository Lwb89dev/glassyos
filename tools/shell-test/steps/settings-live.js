// Cambia le impostazioni dal vivo: il dock e il tema devono reagire senza errori.
export async function run(t) {
    const g = t.ext('glassy-desktop@glassy-os');
    const s = g.settings;
    const out = t.GLib.getenv('SHOT_OUT');
    await t.sleep(2500);
    const probe = label => console.log(`[steps] ${label}: icone=${g.dock.iconSize}px voci=${g.dock._entries.length} strut=${Math.round(g.dock._strut.height)} nascosto=${g.dock._hidden} panel-app=${g.panel._button.container.visible} attivita=${t.Main.panel.statusArea.activities.container.visible}`);
    probe('iniziale');

    s.set_int('icon-size', 72); s.set_double('magnification', 2.2); s.set_string('autohide', 'never'); s.set_int('dock-tint', 85); s.set_int('dock-radius', 12);
    await t.sleep(900);
    probe('dock grande, sempre visibile');
    await t.shot(`${out}/live-1.png`);

    s.set_boolean('show-app-name', false); s.set_boolean('block-activities', false);
    await t.sleep(500);
    probe('nome app spento, Attività sbloccata');
    s.set_boolean('block-activities', true);

    // il contatore fa ricaricare il tema della Shell (come farebbe il pannello dopo aver rigenerato i CSS)
    s.set_int('theme-serial', s.get_int('theme-serial') + 1);
    await t.sleep(900);
    console.log('[steps] tema ricaricato (nessuna eccezione = ok)');

    s.reset('icon-size'); s.reset('magnification'); s.reset('autohide'); s.reset('dock-tint'); s.reset('dock-radius'); s.reset('show-app-name');
    await t.sleep(900);
    probe('ripristinato');
    await t.shot(`${out}/live-2.png`);
}
