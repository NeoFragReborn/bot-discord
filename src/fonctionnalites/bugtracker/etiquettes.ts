/**
 * Les étiquettes d'un ticket dans son salon Forum : son type et son statut, nommés dans la langue du
 * site. Le calcul seul, sans appel à Discord.
 */

import { TEXTES } from '../../textes.js';
import type { Ticket } from '../../site.js';

export type Type = Ticket['type'];
export type Statut = Ticket['status'];

export const MODELES_TYPES: Record<Type, string> = {
    bug: TEXTES.etiquetteBug,
    feature: TEXTES.etiquetteIdee,
    question: TEXTES.etiquetteQuestion,
    other: TEXTES.etiquetteAutre,
};

export const MODELES_STATUTS: Record<Statut, string> = {
    open: TEXTES.etiquetteOuvert,
    in_progress: TEXTES.etiquetteEnCours,
    resolved: TEXTES.etiquetteResolu,
    closed: TEXTES.etiquetteFerme,
    wont_fix: TEXTES.etiquetteRefuse,
    duplicate: TEXTES.etiquetteDoublon,
};

/** Les statuts d'un ticket clos : son fil s'archive. */
export const STATUTS_CLOS: readonly Statut[] = ['resolved', 'closed', 'wont_fix', 'duplicate'];

export interface Noms {
    types: Record<Type, string>;
    statuts: Record<Statut, string>;
}

/** Les noms des étiquettes, traduits (`traduire` : un modèle → son texte dans la langue du site). */
export function nomsDesEtiquettes(traduire: (modele: string) => string): Noms {
    const types = {} as Record<Type, string>;
    const statuts = {} as Record<Statut, string>;

    for (const [cle, modele] of Object.entries(MODELES_TYPES) as [Type, string][]) {
        types[cle] = traduire(modele).slice(0, 20);
    }

    for (const [cle, modele] of Object.entries(MODELES_STATUTS) as [Statut, string][]) {
        statuts[cle] = traduire(modele).slice(0, 20);
    }

    return { types, statuts };
}

/** Tous les noms d'étiquettes dont le salon a besoin. */
export function tousLesNoms(noms: Noms): string[] {
    return [...Object.values(noms.types), ...Object.values(noms.statuts)];
}

/** Tous les types de ticket. */
export const TYPES: readonly Type[] = Object.keys(MODELES_TYPES) as Type[];

/**
 * Les types dont un salon reçoit les fils : celui des suggestions, les idées ; celui des tickets, tout le reste quand
 * les idées ont leur salon, sinon tout.
 */
export function typesDuSalon(salonDesIdees: boolean, ideesAPart: boolean): Type[] {
    if (salonDesIdees) {
        return ['feature'];
    }

    return ideesAPart ? TYPES.filter((t) => t !== 'feature') : [...TYPES];
}

/** Les noms d'étiquettes qu'un salon doit avoir : ceux de ses types, et ceux de tous les statuts. */
export function nomsDuSalon(noms: Noms, types: readonly Type[]): string[] {
    return [...types.map((t) => noms.types[t]), ...Object.values(noms.statuts)];
}

const trouver = (tags: readonly { id: string; name: string }[], nom: string): string | undefined => tags.find((t) => t.name.toLowerCase() === nom.toLowerCase())?.id;

/** Les étiquettes d'un ticket : celle de son type et celle de son statut, quand le salon les a. */
export function etiquettesDuTicket(tags: readonly { id: string; name: string }[], noms: Noms, type: Type, statut: Statut): string[] {
    return [trouver(tags, noms.types[type]), trouver(tags, noms.statuts[statut])].filter((id): id is string => id !== undefined);
}

/** Le type que disent les étiquettes d'un fil (un fil ouvert à la main sur Discord), sinon `defaut`. */
export function typeDesEtiquettes(appliquees: readonly string[], tags: readonly { id: string; name: string }[], noms: Noms, defaut: Type = 'bug'): Type {
    for (const [type, nom] of Object.entries(noms.types) as [Type, string][]) {
        const id = trouver(tags, nom);

        if (id && appliquees.includes(id)) {
            return type;
        }
    }

    return defaut;
}
