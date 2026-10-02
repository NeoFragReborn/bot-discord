/**
 * Préfixe du forum ↔ étiquette d'un salon Forum : le calcul seul, sans appel à Discord.
 *
 * Le site ne fait foi que pour les étiquettes qui représentent un préfixe (réglées dans
 * l'administration, Discord → Salons et forums → Étiquettes) ; les autres étiquettes d'un fil, posées
 * à la main sur Discord, restent où elles sont.
 */

/** Discord accepte au plus cinq étiquettes sur un fil. */
export const ETIQUETTES_PAR_FIL = 5;

export interface Correspondances {
    /** préfixe → étiquette */
    versEtiquette: Map<number, string>;
    /** étiquette → préfixe */
    versPrefixe: Map<string, number>;
}

/** Les correspondances d'un salon, tirées de la configuration. */
export function correspondancesDuSalon(tags: readonly { channel_id: string; prefix_id: number; tag_id: string }[] | undefined, salonId: string): Correspondances {
    const versEtiquette = new Map<number, string>();
    const versPrefixe = new Map<string, number>();

    for (const t of tags ?? []) {
        if (t.channel_id === salonId) {
            versEtiquette.set(t.prefix_id, t.tag_id);
            versPrefixe.set(t.tag_id, t.prefix_id);
        }
    }

    return { versEtiquette, versPrefixe };
}

/** Les étiquettes d'un fil une fois le préfixe du site reporté. */
export function etiquettesDuFil(actuelles: readonly string[], c: Correspondances, prefixe: number | null): string[] {
    const libres = actuelles.filter((t) => !c.versPrefixe.has(t));
    const voulue = prefixe !== null ? c.versEtiquette.get(prefixe) : undefined;

    return (voulue ? [voulue, ...libres] : libres).slice(0, ETIQUETTES_PAR_FIL);
}

/** Le préfixe que disent les étiquettes d'un fil : la première qui en représente un, sinon aucun. */
export function prefixeDuFil(etiquettes: readonly string[], c: Correspondances): number | null {
    for (const t of etiquettes) {
        const prefixe = c.versPrefixe.get(t);

        if (prefixe !== undefined) {
            return prefixe;
        }
    }

    return null;
}

/** Deux listes d'étiquettes disent la même chose, dans n'importe quel ordre. */
export function memesEtiquettes(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((t) => b.includes(t));
}
