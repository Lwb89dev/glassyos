# Glassy

Un desktop **GNOME 50** in vetro smerigliato, in stile macOS: finestre traslucide con sfocato vero,
bordi illuminati, semafori colorati a sinistra, **dock con ingrandimento**, **launcher a schermo intero**
al posto di Attività, e transizioni morbide. Segue chiaro/scuro e il colore d'accento scelto in
*Impostazioni → Aspetto*.

![Desktop](docs/desktop.jpg)

| Dock con ingrandimento | Launchpad |
|---|---|
| ![Dock](docs/dock.jpg) | ![Launchpad](docs/launchpad.jpg) |

> Le immagini sono screenshot reali di una GNOME Shell 50 con Glassy installato (sessione di prova
> senza schermo reale, quindi senza il portale GNOME: alcune app mostrano per questo il tema chiaro).

## Installazione

```bash
./install.sh
```

Fa tutto da solo: ti mostra cosa farà, chiede conferma, salva i valori originali e installa

- il tema **Glassy** per GTK4/libadwaita, GTK3 e GNOME Shell;
- le icone **Tela-ubuntu** (di Vinceliuice, GPL-3.0): se accanto a `install.sh` c'è una cartella `Tela-ubuntu/` usa
  quella, altrimenti le scarica da GitHub in una versione precisa, verificandone lo SHA-256;
- gli sfondi **Glassy Aurora** (chiaro e scuro);
- l'estensione **Glassy Desktop** (scritta per questo progetto, in `extension/`): dock, launcher, blocco di Attività;
- le estensioni **User Themes** (tema della Shell), **Blur my Shell** (sfocato di barra, menu e finestre)
  e **Magic Lamp** (animazione "genio" quando minimizzi), scaricate da extensions.gnome.org;
- le impostazioni del desktop: pulsanti finestra a sinistra, icone, sfondo, animazioni, angolo attivo spento;
- la voce **Impostazioni di Glassy** nel menu delle app (vedi sotto).

Poi **esci e rientra nella sessione**: su Wayland GNOME Shell non si riavvia a caldo, e dock, launcher,
sfocato e tema della Shell partono solo al login successivo.

> **Le app già aperte non cambiano stile.** Le app GNOME leggono il tema all'avvio, e Nautilus resta in
> memoria anche a finestre chiuse: finché non lo riavvii (`nautilus -q`, o il rientro nella sessione)
> mantiene lo stile e il layout dei pulsanti di prima. L'installer propone di chiuderlo per te.

### Opzioni

```
./install.sh --accent purple     blue (predefinito) teal green yellow orange red pink purple slate
./install.sh --light             schema chiaro (predefinito: scuro)
./install.sh --no-dock           solo tema e icone: niente dock/launcher, le tue estensioni restano attive
./install.sh --no-extensions     nessun download di estensioni
./install.sh --no-icons  --no-wallpaper  --no-flatpak
./install.sh --restart-apps      chiude Nautilus senza chiedere
./install.sh --dry-run           mostra cosa farebbe, senza modificare nulla
./install.sh -y                  senza conferma
```

Si può rilanciare quando si vuole (aggiornare, cambiare accento): non duplica nulla e conserva il backup originale.
Se avevi installato una versione precedente con Dash to Dock, viene sostituito dal dock di Glassy.

### Attenzione: il layout cambia

Il dock e il launcher sostituiscono il layout di GNOME, quindi l'installer **disattiva** (senza rimuoverle)
le estensioni che fanno cose simili: Dash to Panel, Dash to Dock, ArcMenu, Start Menu, Ubuntu Dock, Dash2Dock.
Prima di procedere te le elenca. Con `--no-dock` non tocca niente del genere.

## Com'è il desktop

**Dock** — pillola di vetro in basso al centro. Le icone si ingrandiscono al passaggio del mouse e spingono
da parte le vicine; il nome compare sopra; le app aperte hanno un pallino; mentre un'app si avvia l'icona
rimbalza. Clic = apri/porta in primo piano, clic centrale = nuova finestra, clic destro = menu (finestre,
"Nuova finestra", "Rimuovi dalla dash", "Esci"). **Trascina** le icone per riordinarle, trascinane una fuori
dal dock per toglierla. A sinistra c'è il Launchpad, a destra il Cestino. Le finestre massimizzate si fermano
sopra il dock, e l'icona è il punto verso cui "si risucchiano" quando minimizzi.

**Launchpad** — griglia di tutte le app a schermo intero, su sfondo sfocato. Si apre con il tasto **Super**,
con **Super+A** o dall'icona nel dock; si cerca scrivendo (Invio avvia il primo risultato), si cambia pagina
con rotella, trackpad, frecce o puntini; si chiude con Esc, un clic nel vuoto o di nuovo Super.

**Niente Attività/Overview** — il pulsante Attività, l'angolo attivo, il gesto a tre dita e la scorciatoia
Super non aprono più la panoramica di GNOME: Super apre il Launchpad. Per riaverla: `./uninstall.sh`, oppure
`gnome-extensions disable glassy-desktop@glassy-os`. (Impostazioni rapide, calendario e notifiche restano.)

**Barra superiore** — a sinistra il nome dell'app in primo piano, come la barra dei menu di macOS.

### Impostazioni di Glassy

Un pannello con quattro pagine, aperto dalla voce **Impostazioni di Glassy** (menu delle app, oppure clic destro
sull'icona del Launchpad nel dock):

| Pagina | Cosa regola |
|---|---|
| **Aspetto** | trasparenza di finestre e Shell, raggio degli angoli, intensità di aloni e ombre, semafori colorati, animazioni |
| **Dock** | dimensione e ingrandimento, spaziatura, margine, **nascondi automaticamente** (mai / in presenza di finestre / sempre), vetro, sfocato e raggio, Cestino, pulsante Launchpad, pallini, nomi, rimbalzo all'apertura |
| **Launchpad e barra** | Launchpad al posto di Attività sì/no, dimensione icone, colonne, sfocato e scurimento dello sfondo, nome dell'app nella barra |
| **Avanzate** | chiudi Nautilus per applicare il tema, rigenera il tema, ripristina i valori predefiniti |

Dock e launcher reagiscono subito. Le modifiche all'*Aspetto* rigenerano i CSS: la Shell si aggiorna al volo, le
app GNOME alla prossima apertura (il pannello offre un pulsante per chiudere Nautilus).

### Regolazioni

Dalla riga di comando: le impostazioni dell'estensione stanno nella sua cartella, quindi per `gsettings` serve indicarla:

```bash
S="$HOME/.local/share/gnome-shell/extensions/glassy-desktop@glassy-os/schemas"
gsettings --schemadir "$S" set org.gnome.shell.extensions.glassy-desktop icon-size 64        # 32–96
gsettings --schemadir "$S" set org.gnome.shell.extensions.glassy-desktop magnification 2.0   # 1.0 = nessun ingrandimento
gsettings --schemadir "$S" set org.gnome.shell.extensions.glassy-desktop bottom-margin 6
gsettings --schemadir "$S" set org.gnome.shell.extensions.glassy-desktop show-trash false
gsettings --schemadir "$S" set org.gnome.shell.extensions.glassy-desktop launcher-blur 100
gsettings --schemadir "$S" set org.gnome.shell.extensions.glassy-desktop autohide 'smart'    # never | smart | always
```

Sono le stesse impostazioni del pannello. Le modifiche al dock sono immediate. Le app nel dock sono i
*preferiti* di GNOME (`org.gnome.shell favorite-apps`).

## Disinstallazione

```bash
./uninstall.sh
```

Rimette ogni impostazione al valore che aveva prima (compreso l'elenco delle estensioni attive),
ripristina un eventuale tuo `~/.config/gtk-4.0/gtk.css`, e rimuove solo ciò che l'installer ha creato
da zero. Cartelle icone o estensioni che avevi già non vengono toccate.

## Come è fatto

| Parte | Dove | Note |
|---|---|---|
| Dock, Launchpad, blocco Attività, barra | `extension/glassy-desktop@glassy-os/` | Estensione GNOME Shell (ESM). Lo sfocato di dock e launcher è quello nativo della Shell (`Shell.BlurEffect`). |
| App libadwaita (GTK4) | `theme/Glassy/gtk-4.0/glassy.css` | Le app libadwaita ignorano il tema e leggono solo `~/.config/gtk-4.0/gtk.css`: l'installer lo fa puntare a questo file. Chiaro/scuro con `@media (prefers-color-scheme)`, accento di sistema. |
| App GTK4 non libadwaita | `theme/Glassy/gtk-4.0/gtk.css` | Base adw-gtk3 + override Glassy. |
| App GTK3 | `theme/Glassy/gtk-3.0/` | Base [adw-gtk3](https://github.com/lassekongo83/adw-gtk3) (scaricata dall'installer, versione fissata e verificata con SHA-256) + override Glassy. L'accento GTK3 lo scrive l'installer: GTK3 non legge quello di sistema. |
| GNOME Shell | `theme/Glassy/gnome-shell/gnome-shell.css` | Solo override sopra il CSS di default della Shell. |
| Impostazioni delle estensioni | `config/extensions.settings` | Una riga per chiave: `schema \| chiave \| valore`. |
| App con sfocato dietro la finestra | `config/blur-apps.txt` | Una per riga (wm_class). Modifica e rilancia `./install.sh`. |

**Sullo sfocato**: il CSS non può sfocare lo sfondo. Il tema disegna i fondi traslucidi; lo sfocato lo mettono
la Shell (dock, launcher) e Blur my Shell (barra, menu, e finestre di un elenco di app GTK4 in
`config/blur-apps.txt`, non di tutte, per non pesare sulla GPU). Una finestra non nell'elenco resta traslucida
ma senza sfocato.

### Limiti noti

- Con l'auto-nascondi su *mai* il dock è sempre visibile e le finestre massimizzate si fermano sopra; con
  *in presenza di finestre* (o *sempre*) si ritrae e le finestre possono occupare tutto lo schermo, anche in
  schermo intero.
- **I popup della Shell non sono sfocati** (volume, luminosità, menu rapidi): lo sfocato di Blur my Shell su
  GNOME 50 è sempre un rettangolo e sporgerebbe dagli angoli arrotondati, così il vetro di quei popup è solo
  più opaco.
- Le app con barra del titolo propria (Firefox, Chrome, Electron, VS Code…) mantengono i loro pulsanti: il
  tema non può cambiarli. Quelle GTK, libadwaita e le finestre X11 seguono lo stile e il layout.
- Le cornici delle finestre X11 sono dipinte su fondo opaco e non possono essere traslucide.
- La Shell resta in **vetro scuro** anche con lo schema chiaro (come la barra di macOS su sfondo scuro).
- Le finestre GTK3 hanno gli angoli inferiori quadrati: è un limite di GTK3.
- Cursore e font di sistema non vengono cambiati.
- Provato su GNOME Shell 50.5 (openSUSE Tumbleweed). L'estensione dichiara compatibilità solo con la 50.

## Sviluppo e anteprima

I file `theme/Glassy/templates/*.css.in` sono modelli: i CSS veri (`glassy.css`, `gnome-shell.css`, …) li
genera l'installer o il pannello delle impostazioni in base ai valori scelti (`tools/render-theme.js`).

`tools/preview.sh` mostra il tema delle app senza installare nulla (carica da cartelle temporanee):

```bash
tools/preview.sh                          # finestra di prova GTK4/libadwaita
tools/preview.sh --scheme light           # variante chiara
tools/preview.sh gtk3 --dark              # variante GTK3
tools/preview.sh --shot out.png           # salva uno screenshot (anche -popover e -dialog)
tools/make-wallpapers.sh                  # rigenera gli sfondi (serve ImageMagick)
```

`tools/shell-test/` è un banco di prova che avvia una GNOME Shell **senza testa** (bus privato, nessun
tocco alla sessione) con l'estensione, simula mouse e tastiera e salva screenshot: serve a provare dock,
autohide, launcher, popup e pannello impostazioni (`tools/shell-test/shell-test.sh --steps tools/shell-test/steps/autohide.js`).

Nei CSS, GTK4 usa variabili e `color-mix()`; GTK3 solo `@colori`, `alpha()` e `mix()`; la Shell (St) non ha
`linear-gradient()` e accetta un solo `box-shadow` per nodo, quindi usa `background-gradient-*` e un bordo chiaro
per la "luce".

## Problemi comuni

- **Dopo l'installazione non vedo il dock / vedo ancora Attività**: serve uscire e rientrare nella sessione.
  Controlla poi nell'app *Estensioni* che *Glassy Desktop* sia attiva; se ha un errore, `journalctl --user -b
  /usr/bin/gnome-shell | grep -i glassy` dice qual è.
- **Nautilus o un'app ha ancora il vecchio stile**: era già aperta. Chiudila del tutto (`nautilus -q`) e riaprila.
- **I pulsanti sono a destra in qualche app**: l'app era già aperta, oppure disegna da sé la barra del titolo.
- **Qualche app GTK3 resta chiara con lo schema scuro**: riavviala; alcune app GTK3 vecchie non seguono lo schema.
- **Il tuo `~/.config/gtk-3.0/settings.ini` imposta `gtk-theme-name` o `gtk-decoration-layout`**: ha la precedenza
  su quanto impostato in GNOME.
- **Ho cambiato idea sull'accento**: `./install.sh --accent pink` (cambia anche quello di sistema).

## Licenze

Il codice, i CSS, gli script, gli sfondi e le immagini di questo repository sono sotto **licenza MIT** (file
`LICENSE`; elenco completo in `THIRD-PARTY.md`). Le parti di terzi **non sono incluse** e hanno la loro licenza:

| Componente | Autore | Licenza | Come arriva sul tuo PC |
|---|---|---|---|
| [Tela icon theme](https://github.com/vinceliuice/Tela-icon-theme) | Vinceliuice | GPL-3.0 | scaricato dall'installer (o dalla tua cartella `Tela-ubuntu/`) |
| [adw-gtk3](https://github.com/lassekongo83/adw-gtk3) | lassekongo83 | LGPL-2.1 | scaricato dall'installer |
| Blur my Shell, User Themes, Magic Lamp | i rispettivi autori | la loro (vedi i progetti) | scaricate da extensions.gnome.org |

Le icone Tela sono GPL-3.0 e non sono compatibili con una ridistribuzione sotto MIT: per questo il repository
non le contiene (`Tela-ubuntu/` è in `.gitignore`) e vengono scaricate sul tuo computer al momento dell'installazione.
