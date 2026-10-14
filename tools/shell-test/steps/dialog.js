// Dialoghi modali della Shell con testo lungo: la finestra deve restare dentro lo schermo.
export async function run(t) {
    const {Main} = t;
    const ModalDialog = await import('resource:///org/gnome/shell/ui/modalDialog.js');
    const Dialog = await import('resource:///org/gnome/shell/ui/dialog.js');
    await t.sleep(4000);
    const out = t.GLib.getenv('SHOT_OUT');

    const show = async (name, title, description) => {
        const d = new ModalDialog.ModalDialog({destroyOnClose: true});
        d.contentLayout.add_child(new Dialog.MessageDialogContent({title, description}));
        d.addButton({label: 'Annulla', action: () => d.close(), default: false});
        d.addButton({label: 'Termina e riapri', action: () => d.close(), default: true});
        d.open();
        await t.sleep(900);
        const [x, y] = d.dialogLayout.get_transformed_position();
        const [w, h] = d.dialogLayout.get_transformed_size();
        console.log(`[steps] ${name}: dialogo ${Math.round(x)},${Math.round(y)} ${Math.round(w)}x${Math.round(h)} su schermo ${global.stage.width}x${global.stage.height} → ${x < 0 || x + w > global.stage.width ? 'SBORDA' : 'ok'}`);
        await t.shot(`${out}/dlg-${name}.png`);
        d.close();
        await t.sleep(500);
    };

    await show('frase', 'Il browser deve essere chiuso e riaperto',
        'Per applicare le modifiche al profilo, il browser deve essere terminato forzatamente e riaperto: tutte le schede aperte verranno chiuse e le modifiche non salvate andranno perse. Vuoi procedere adesso oppure rimandare a più tardi?');
    await show('percorso', 'Profilo bloccato',
        '/home/utente/.config/Browser/Default/SingletonLock-1234567890-abcdefghijklmnopqrstuvwxyz-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ-ancora-un-altro-pezzo-lunghissimo-senza-spazi');
    await show('titolo-lungo', '“Una pagina con un titolo veramente molto molto lungo che continua ancora e ancora senza fermarsi mai - Browser” non risponde',
        'Puoi aspettare ancora un momento oppure forzare la chiusura dell’applicazione.');
}
