/**
 * Ce qu'il faut changer pour qu'un membre lié ait, sur Discord, ce que dit le site : le calcul seul,
 * sans appel à Discord — c'est lui que les tests éprouvent.
 *
 * Le site fait foi, mais seulement pour ce que l'administration a relié : un rôle Discord relié à
 * un groupe est donné aux membres du groupe et retiré aux autres membres liés ; un rôle que rien ne
 * relie n'est jamais touché.
 */

import type { RoleRelie } from '../../site.js';

export interface EtatDiscord {
    /** Les rôles que le membre a sur le serveur. */
    roles: ReadonlySet<string>;
    /** Son pseudo sur le serveur (NULL : il n'en a pas, Discord montre son nom de compte). */
    pseudo: string | null;
    /** Le propriétaire du serveur : Discord interdit à quiconque de changer son pseudo. */
    proprietaire: boolean;
}

export interface Plan {
    ajouter: string[];
    retirer: string[];
    /** Le pseudo à poser, ou NULL s'il n'y a rien à changer. */
    pseudo: string | null;
}

/** Longueur maximale d'un pseudo de serveur Discord, en caractères. */
export const PSEUDO_MAX = 32;

export function planifier(groupes: readonly string[], pseudoSite: string, etat: EtatDiscord, correspondances: readonly RoleRelie[], pseudos: boolean): Plan {
    const voulus = new Set(correspondances.filter((c) => groupes.includes(c.group_key)).map((c) => c.role_id));
    const geres = new Set(correspondances.map((c) => c.role_id));

    let pseudo: string | null = null;

    if (pseudos && !etat.proprietaire) {
        const souhaite = Array.from(pseudoSite.trim()).slice(0, PSEUDO_MAX).join('');

        if (souhaite !== '' && etat.pseudo !== souhaite) {
            pseudo = souhaite;
        }
    }

    return {
        ajouter: [...voulus].filter((r) => !etat.roles.has(r)).sort(),
        retirer: [...geres].filter((r) => !voulus.has(r) && etat.roles.has(r)).sort(),
        pseudo,
    };
}

/** Longueur maximale d'un nom de rôle Discord, en caractères. */
export const NOM_ROLE_MAX = 100;

/** Ce qu'un rôle relié doit changer pour porter le nom et la couleur de son groupe ; NULL s'il n'a rien à changer. */
export interface Apparence {
    name?: string;
    color?: number;
}

/**
 * Le nom et la couleur qu'un rôle relié doit prendre de son groupe. Un groupe sans couleur laisse celle du rôle ; un site
 * qui ne dit pas le nom (d'avant la 1.2.48) laisse le rôle tel quel.
 */
export function apparenceVoulue(groupe: Pick<RoleRelie, 'name' | 'color'>, role: { name: string; color: number }): Apparence | null {
    const voulue: Apparence = {};
    const nom = Array.from((groupe.name ?? '').trim()).slice(0, NOM_ROLE_MAX).join('');

    if (nom !== '' && nom !== role.name) {
        voulue.name = nom;
    }

    if (groupe.color && /^#[0-9a-f]{6}$/i.test(groupe.color)) {
        const couleur = parseInt(groupe.color.slice(1), 16);

        if (couleur !== role.color) {
            voulue.color = couleur;
        }
    }

    return voulue.name !== undefined || voulue.color !== undefined ? voulue : null;
}
