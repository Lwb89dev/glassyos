import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

const NAME = 'glassy-blur';

/**
 * Sfoca ciò che sta dietro l'attore (blur nativo della Shell, modalità BACKGROUND).
 *
 * Attenzione: in modalità BACKGROUND la Shell copia dallo schermo l'intero rettangolo dell'attore,
 * ma quando la GPU ridisegna solo una parte dello schermo (danno parziale) i pixel fuori da quella
 * parte sono quelli del fotogramma precedente, già sfocati e con sopra icone ed etichette: il
 * risultato, ridipinto solo nella parte ridisegnata, lascia riquadri persistenti. Per dock e
 * launcher si usa BackdropBlur.
 */
export function addBackgroundBlur(actor, {radius = 40, brightness = 0.9} = {}) {
    removeBackgroundBlur(actor);
    const effect = new Shell.BlurEffect({radius, brightness, mode: Shell.BlurMode.BACKGROUND});
    actor.add_effect_with_name(NAME, effect);
    return effect;
}

export function removeBackgroundBlur(actor) {
    if (actor.get_effect(NAME))
        actor.remove_effect_by_name(NAME);
}

/**
 * Sfocato "di vetro" senza leggere lo schermo: l'attore contiene un clone di sfondo e finestre
 * (global.window_group), allineato in modo da mostrare esattamente ciò che sta sotto, e lo sfoca
 * in modalità ACTOR. La Shell tiene in cache il risultato sfocato completo e lo rifà solo quando
 * cambia ciò che sta dietro: i ridisegni parziali (hover, etichette, menu) ricopiano pixel giusti.
 *
 * Ai bordi di un attore sfocato in modalità ACTOR la sfocatura "pesca" nel vuoto e sfuma verso il
 * trasparente: si vedrebbe una cornice. Per questo l'attore è più grande della zona visibile di un
 * margine (PAD) su ogni lato e si ritaglia con set_clip: i bordi sfumati restano fuori.
 *
 *   place(x, y, w, h)  zona visibile, in coordinate del genitore
 *   clip(x, y, w, h)   ritaglio dentro la zona visibile (facoltativo)
 *   sync(sx, sy)       posizione sullo stage dell'angolo (x, y): allinea il clone
 */
export class BackdropBlur {
    constructor({radius = 40, brightness = 1.0} = {}) {
        this.actor = new Clutter.Actor({reactive: false, clip_to_allocation: true});
        this._clone = new Clutter.Clone({source: global.window_group, reactive: false});
        this.actor.add_child(this._clone);
        this._effect = new Shell.BlurEffect({radius, brightness, mode: Shell.BlurMode.ACTOR});
        this.actor.add_effect_with_name(NAME, this._effect);
        this._pad = padFor(radius);
        this._place = null;
        this._clip = null;
        this._stage = null;
        this._cloneAt = null;
    }

    set radius(r) {
        if (this._effect.radius === r)
            return;
        this._effect.radius = r;
        this._pad = padFor(r);
        this._apply();
    }

    set brightness(b) {
        this._effect.brightness = b;
    }

    place(x, y, w, h) {
        this._place = [x, y, Math.max(1, w), Math.max(1, h)];
        this._apply();
    }

    clip(x, y, w, h) {
        const c = [Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))];
        if (this._clip && c.every((v, i) => v === this._clip[i]))
            return;
        this._clip = c;
        this.actor.set_clip(c[0] + this._pad, c[1] + this._pad, c[2], c[3]);
    }

    /**
     * Posizione sullo stage dell'angolo in alto a sinistra della zona visibile. Si passa esplicitamente
     * perché prima del layout get_transformed_position() non è ancora valida (restituisce NaN).
     */
    sync(sx, sy) {
        if (!Number.isFinite(sx) || !Number.isFinite(sy))
            return;
        this._stage = [sx, sy];
        this._syncClone();
    }

    _apply() {
        if (!this._place)
            return;
        const [x, y, w, h] = this._place;
        const p = this._pad;
        this.actor.set_position(Math.round(x - p), Math.round(y - p));
        this.actor.set_size(Math.round(w + 2 * p), Math.round(h + 2 * p));
        if (this._clip)
            this.actor.set_clip(this._clip[0] + p, this._clip[1] + p, this._clip[2], this._clip[3]);
        else
            this.actor.set_clip(p, p, Math.round(w), Math.round(h));
        this._syncClone();
    }

    _syncClone() {
        if (!this._stage)
            return;
        const ox = -Math.round(this._stage[0] - this._pad);
        const oy = -Math.round(this._stage[1] - this._pad);
        if (this._cloneAt && this._cloneAt[0] === ox && this._cloneAt[1] === oy)
            return;
        this._cloneAt = [ox, oy];
        this._clone.set_position(ox, oy);
    }

    destroy() {
        this.actor.destroy();
    }
}

/** Margine oltre la zona visibile: copre la sfumatura dei bordi (il kernel arriva a ~1.5 × raggio). */
function padFor(radius) {
    return Math.ceil(radius * 1.5) + 2;
}
