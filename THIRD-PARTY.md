# Componenti di terzi

Glassy (questo repository) è distribuito con licenza **MIT** (vedi `LICENSE`).
Nessuno dei componenti qui sotto è incluso nel repository: l'installer li scarica sul computer
dell'utente, ognuno con la propria licenza. Per questo la licenza MIT di Glassy non si applica a loro.

| Componente | Autore | Licenza | Dove/come |
|---|---|---|---|
| [Tela icon theme](https://github.com/vinceliuice/Tela-icon-theme) (varianti `Tela-ubuntu*`) | Vinceliuice | GPL-3.0 | `install.sh` scarica il tag `2026-07-07` da GitHub e ne verifica lo SHA-256; in alternativa usa una cartella `Tela-ubuntu/` messa dall'utente accanto allo script |
| [adw-gtk3](https://github.com/lassekongo83/adw-gtk3) | lassekongo83 | LGPL-2.1 | `tools/fetch-adw-gtk3.sh` scarica una versione fissata, verificata con SHA-256 |
| [Blur my Shell](https://extensions.gnome.org/extension/3193/blur-my-shell/) | aunetx | vedi il progetto | scaricata da extensions.gnome.org |
| User Themes (gnome-shell-extensions) | progetto GNOME | vedi il progetto | scaricata da extensions.gnome.org |
| [Magic Lamp Effect](https://extensions.gnome.org/extension/3740/compiz-alike-magic-lamp-effect/) | hermes83 | vedi il progetto | scaricata da extensions.gnome.org |

## Note

- **Icone Tela e MIT.** Tela è GPL-3.0: ridistribuirla dentro un repository MIT non sarebbe corretto (la copia
  distribuita dovrebbe restare GPL-3.0). Per questo la cartella `Tela-ubuntu/` è in `.gitignore` e
  l'installer la scarica direttamente dall'autore. Glassy non modifica le icone e non ne contiene copie.
- Gli screenshot in `docs/` mostrano un desktop in cui le icone Tela sono attive: sono immagini della
  schermata in funzione, a scopo illustrativo.
- L'estensione `extension/glassy-desktop@glassy-os` usa le API di GNOME Shell (GPL-2.0-or-later) tramite i
  moduli della Shell, come ogni estensione; la licenza MIT è compatibile con la GPL.
- I marchi citati (macOS, GNOME, ecc.) appartengono ai rispettivi proprietari; Glassy è un progetto
  indipendente e non affiliato.
