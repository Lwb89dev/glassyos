#!/usr/bin/env python3
"""Estrae dalla libreria della Shell installata i sorgenti JS (ui/*.js ecc.) per consultarli.
Uso: extract-shell-js.py [cartella-destinazione]   (predefinito: ~/.cache/glassy-os/shell-test/shellsrc)"""
import os, sys
import gi
from gi.repository import Gio, GLib

dest = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.cache/glassy-os/shell-test/shellsrc')
lib = next(p for p in ('/usr/lib64/gnome-shell/libshell-18.so', '/usr/lib/gnome-shell/libshell-18.so') if os.path.exists(p))
data = open(lib, 'rb').read()
pos, count = 0, 0
while True:
    i = data.find(b'GVariant', pos)
    if i < 0:
        break
    pos = i + 1
    try:
        res = Gio.Resource.new_from_data(GLib.Bytes.new(data[i:]))
    except Exception:
        continue

    def walk(path):
        global count
        for name in res.enumerate_children(path, Gio.ResourceLookupFlags.NONE):
            full = path + name
            if full.endswith('/'):
                walk(full)
            else:
                out = os.path.join(dest, full.lstrip('/'))
                os.makedirs(os.path.dirname(out), exist_ok=True)
                open(out, 'wb').write(res.lookup_data(full, Gio.ResourceLookupFlags.NONE).get_data())
                count += 1
    try:
        walk('/')
    except Exception:
        pass
print(f'{count} file estratti in {dest}')
