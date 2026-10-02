/**
 * Les règles des rôles temporaires, sans appel à Discord : la durée en secondes, et ce qui interdit
 * de donner (ou de retirer) un rôle.
 */

import { TEXTES } from '../../textes.js';

export type Unite = 'minutes' | 'hours' | 'days' | 'weeks';

export const SECONDES: Record<Unite, number> = { minutes: 60, hours: 3_600, days: 86_400, weeks: 604_800 };

/** La durée choisie dans la commande, en secondes (0 pour une unité inconnue). */
export function enSecondes(duree: number, unite: string): number {
    return Math.max(0, Math.floor(duree)) * (SECONDES[unite as Unite] ?? 0);
}

/** Ce qu'il faut savoir d'un rôle et des positions en jeu pour juger une demande. */
export interface Demande {
    roleId: string;
    /** L'identifiant du serveur : c'est aussi celui du rôle @everyone. */
    guildeId: string;
    /** Le rôle est tenu par Discord ou par une intégration (un bot, un abonnement). */
    gere: boolean;
    /** Les rôles reliés aux groupes du site. */
    relies: readonly string[];
    positionRole: number;
    /** Le rôle le plus haut du bot. */
    positionBot: number;
    /** Le rôle le plus haut de qui fait la demande ; NULL s'il est le propriétaire du serveur. */
    positionAuteur: number | null;
}

/**
 * Le texte du refus, ou NULL si la demande est recevable. L'ordre compte : un rôle qu'on ne peut
 * pas donner du tout passe avant une question de hiérarchie.
 */
export function refus(d: Demande): string | null {
    if (d.roleId === d.guildeId || d.gere) {
        return TEXTES.roleInterdit;
    }

    // La synchronisation des groupes le donne et le retire : elle défairait le rôle temporaire.
    if (d.relies.includes(d.roleId)) {
        return TEXTES.roleRelie;
    }

    if (d.positionBot <= d.positionRole) {
        return TEXTES.roleTropHautBot;
    }

    // Comme Discord le fait pour « Gérer les rôles » : on ne donne pas un rôle égal ou supérieur au sien.
    if (d.positionAuteur !== null && d.positionAuteur <= d.positionRole) {
        return TEXTES.roleAuDessus;
    }

    return null;
}
