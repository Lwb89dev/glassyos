// Applica una scala (anche frazionaria) allo schermo virtuale della Shell di prova, come avviene su un portatile reale.
// Le chiamate D-Bus sono asincrone: la Shell parla con sé stessa, una chiamata sincrona andrebbe in stallo.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const call = (proxy, method, args) => new Promise((resolve, reject) => {
    proxy.call(method, args, Gio.DBusCallFlags.NONE, -1, null, (p, res) => {
        try { resolve(p.call_finish(res)); } catch (e) { reject(e); }
    });
});

export async function applyScale(scale) {
    const proxy = await new Promise((resolve, reject) => Gio.DBusProxy.new_for_bus(
        Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, null,
        'org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig', null,
        (_o, res) => { try { resolve(Gio.DBusProxy.new_for_bus_finish(res)); } catch (e) { reject(e); } }));
    const [serial, monitors] = (await call(proxy, 'GetCurrentState', null)).recursiveUnpack();
    const mon = monitors[0];
    const connector = mon[0][0];
    const cur = mon[1].find(m => m[6]['is-current']) ?? mon[1][0];
    const cfg = [[0, 0, scale, 0, true, [[connector, cur[0], {}]]]];
    await call(proxy, 'ApplyMonitorsConfig', new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [serial, 1, cfg, {}]));
    return `${connector} ${cur[0]} x${scale}`;
}
