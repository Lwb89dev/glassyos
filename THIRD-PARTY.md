# Third-party components

Glassy (this repository) is distributed under the **MIT** license (see `LICENSE`).
None of the components below is included in the repository: the installer downloads them onto the user's
computer, each under its own license. For that reason Glassy's MIT license does not apply to them.

| Component | Author | License | Where/how |
|---|---|---|---|
| [Tela icon theme](https://github.com/vinceliuice/Tela-icon-theme) (`Tela-ubuntu*` variants) | Vinceliuice | GPL-3.0 | `install.sh` downloads tag `2026-07-07` from GitHub and verifies its SHA-256; alternatively it uses a `Tela-ubuntu/` folder the user places next to the script |
| [adw-gtk3](https://github.com/lassekongo83/adw-gtk3) | lassekongo83 | LGPL-2.1 | `tools/fetch-adw-gtk3.sh` downloads a pinned version, verified with SHA-256 |
| [Blur my Shell](https://extensions.gnome.org/extension/3193/blur-my-shell/) | aunetx | see the project | downloaded from extensions.gnome.org |
| User Themes (gnome-shell-extensions) | GNOME project | see the project | downloaded from extensions.gnome.org |
| [Magic Lamp Effect](https://extensions.gnome.org/extension/3740/compiz-alike-magic-lamp-effect/) | hermes83 | see the project | downloaded from extensions.gnome.org |

## Notes

- **Tela icons and MIT.** Tela is GPL-3.0: redistributing it inside an MIT repository would not be correct (the
  distributed copy would have to stay GPL-3.0). That is why the `Tela-ubuntu/` folder is in `.gitignore` and the
  installer downloads it straight from the author. Glassy does not modify the icons and contains no copy of them.
- The screenshots in `docs/` show a desktop where the Tela icons are active: they are pictures of the running
  screen, included for illustration.
- The `extension/glassy-desktop@glassy-os` extension uses GNOME Shell's APIs (GPL-2.0-or-later) through the
  Shell's modules, like every extension; the MIT license is compatible with the GPL.
- Trademarks mentioned (macOS, GNOME, etc.) belong to their respective owners; Glassy is an independent project
  and is not affiliated with them.
