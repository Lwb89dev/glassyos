import Shell from 'gi://Shell';

const NAME = 'glassy-blur';

/** Sfoca ciò che sta dietro l'attore (blur nativo della Shell). */
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
