// Elenca gli attori attorno all'OSD (anche quelli di Blur my Shell): dimensioni ed effetti.
export async function run(t) {
    const {Main, Gio} = t;
    await t.sleep(2500);
    const icon = new Gio.ThemedIcon({name: 'audio-volume-high-symbolic'});
    Main.osdWindowManager.showAll(icon, null, 0.62, 1.0);
    await t.sleep(900);
    const lines = [];
    const walk = (a, depth) => {
        let name = '', cls = '';
        try { name = a.name ?? ''; } catch (e) { /* */ }
        try { cls = a.style_class ?? ''; } catch (e) { /* */ }
        const interesting = a.visible && /bms|osd|blur/i.test(`${name} ${cls} ${a.constructor.name}`);
        if (interesting) {
            const [x, y] = a.get_transformed_position();
            const [w, h] = a.get_transformed_size();
            const fx = a.get_effects().map(e => `${e.constructor.name}${e.radius !== undefined ? `(r=${e.radius} corner=${e.corner_radius ?? e.unscaled_corner_radius} ucorner=${e.unscaled_corner_radius} bright=${e.brightness})` : ''}`).join(',');
            lines.push(`${' '.repeat(depth)}${a.constructor.name} "${name}" .${cls} ${Math.round(x)},${Math.round(y)} ${Math.round(w)}x${Math.round(h)} vis=${a.visible} fx=[${fx}]`);
        }
        for (const c of a.get_children()) walk(c, depth + 1);
    };
    walk(global.stage, 0);
    console.log(`[steps] ${lines.length} attori:\n${lines.join('\n')}`);
}
