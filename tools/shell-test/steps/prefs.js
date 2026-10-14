// Fotografa le pagine del pannello impostazioni (lanciato come client da prefs-host.js).
export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    await t.sleep(5000);
    await t.shot(`${out}/prefs-0.png`);
}
