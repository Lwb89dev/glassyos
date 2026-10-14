// Misura i frame prodotti mentre il puntatore corre sul dock (ingrandimento attivo).
export async function run(t) {
    const g = t.ext('glassy-desktop@glassy-os');
    if (!g) { console.log('[steps] estensione NON caricata'); return; }
    await t.sleep(2500);
    const dock = g.dock;
    const [ax, ay] = dock.actor.get_transformed_position();
    const y = ay + dock.actor.height - 40;
    const first = dock._entries[0].base, last = dock._entries[dock._entries.length - 1].base;

    const stamps = [];
    const id = global.stage.connect('after-update', () => stamps.push(t.GLib.get_monotonic_time() / 1000));
    t.move(ax + first, y); await t.sleep(400);

    // corsa continua per 3 s, un evento ogni 2 ms (≈ mouse da 500 Hz)
    const T0 = t.GLib.get_monotonic_time() / 1000;
    stamps.length = 0;
    let phase = 0;
    while (t.GLib.get_monotonic_time() / 1000 - T0 < 3000) {
        const u = (Math.sin(phase) + 1) / 2;
        t.move(ax + first + (last - first) * u, y);
        phase += 0.012;
        await t.sleep(2);
    }
    global.stage.disconnect(id);
    const gaps = stamps.slice(1).map((s, i) => s - stamps[i]);
    gaps.sort((a, b) => a - b);
    const fps = stamps.length / 3;
    console.log(`[steps] frame in 3s: ${stamps.length} → ${fps.toFixed(1)} fps; gap mediano ${gaps[Math.floor(gaps.length / 2)]?.toFixed(1)} ms, p95 ${gaps[Math.floor(gaps.length * 0.95)]?.toFixed(1)} ms, max ${gaps[gaps.length - 1]?.toFixed(1)} ms`);
    console.log(`[steps] scale a fine corsa: ${dock._entries.filter(e => e.kind !== 'sep').map(e => e.s.toFixed(2)).join(' ')}`);
    await t.sleep(500);
    await t.shot(`${t.GLib.getenv('SHOT_OUT')}/bench.png`);
}
