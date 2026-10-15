/**
 * Les règles des sanctions reliées (m03b), sans appel à Discord : ce qu'une sanction du site devient sur Discord, la
 * marque d'un bannissement posé par le bot, et ce qu'une action d'un modérateur sur Discord devient sur le site.
 *
 * Le cadrage (2026-10-16) :
 *  - du site vers Discord, seuls le muet et les bannissements de TOUT le site, effectifs, d'un membre relié ; le bot ne
 *    lève sur Discord que ce qu'il y a posé lui-même ;
 *  - de Discord vers le site, seulement ce que fait un modérateur HUMAIN relié, et le site rejuge tout.
 */

/** Discord n'exclut pas temporairement au-delà de 28 jours : un muet plus long se renouvelle. */
export const EXCLUSION_MAX_MS = 28 * 24 * 3_600 * 1_000;

/** Une exclusion qui finit dans moins de deux jours se renouvelle, pour un muet qui dure plus longtemps. */
export const RENOUVELER_SOUS_MS = 2 * 24 * 3_600 * 1_000;

/** Ce qu'il faut savoir d'une sanction du site pour l'appliquer. */
export interface SanctionVue {
    sanction_id: number;
    type: 'mute' | 'ban_temp' | 'ban_perm';
    /** Échéance en secondes Unix ; NULL : sans fin. */
    expires_at: number | null;
}

/** Ce que Discord doit porter pour une sanction, à l'instant `maintenant` (millisecondes). */
export type Application =
    | { faire: 'exclure'; jusqua: number }
    | { faire: 'bannir' }
    | { faire: 'rien' };

export function application(s: SanctionVue, maintenant: number): Application {
    const fin = s.expires_at === null ? null : s.expires_at * 1_000;

    if (fin !== null && fin <= maintenant) {
        return { faire: 'rien' };
    }

    if (s.type === 'mute') {
        return { faire: 'exclure', jusqua: Math.min(fin ?? Infinity, maintenant + EXCLUSION_MAX_MS) };
    }

    return { faire: 'bannir' };
}

/**
 * Faut-il (re)poser l'exclusion ? Quand le membre n'en a pas, ou quand la sienne finit avant ce que la sanction demande
 * et dans moins de deux jours — sans la rogner si quelqu'un l'a déjà posée plus longue.
 */
export function exclusionAPoser(actuelle: number | null, voulue: number, maintenant: number): boolean {
    if (actuelle === null || actuelle <= maintenant) {
        return true;
    }

    return actuelle < voulue && actuelle - maintenant < RENOUVELER_SOUS_MS;
}

/** La raison d'un bannissement posé par le bot : elle porte le numéro de la sanction, que le bot relit pour le lever. */
export function raisonDuBan(sanctionId: number, texte: string): string {
    return `NeoFrag #${sanctionId} — ${texte}`.slice(0, 512);
}

/** Le numéro de la sanction qu'un bannissement porte, s'il a été posé par le bot ; NULL sinon. */
export function sanctionDuBan(raison: string | null | undefined): number | null {
    const m = /^NeoFrag #(\d+)\b/.exec(raison ?? '');

    return m ? Number(m[1]) : null;
}

/** Ce qu'une action d'un modérateur sur Discord devient sur le site. */
export type VersLeSite =
    | { faire: 'sanctionner'; type: 'mute' | 'ban_perm'; duree: number | null }
    | { faire: 'lever'; type: 'mute' | 'ban_perm' }
    | { faire: 'rien' };

/**
 * Une entrée du journal d'audit de Discord, réduite à ce qui compte : bannir, débannir, poser ou retirer une exclusion.
 * Un bannissement Discord n'a pas de fin : il devient un bannissement définitif. Une exclusion devient un muet de la
 * même durée.
 */
export function versLeSite(e: { action: 'ban' | 'unban' | 'timeout'; executeur: string; bot: string; jusqua?: number | null }, maintenant: number): VersLeSite {
    // Ce que le bot fait lui-même vient du site : le rapporter ferait une boucle.
    if (e.executeur === e.bot) {
        return { faire: 'rien' };
    }

    if (e.action === 'ban') {
        return { faire: 'sanctionner', type: 'ban_perm', duree: null };
    }

    if (e.action === 'unban') {
        return { faire: 'lever', type: 'ban_perm' };
    }

    if (e.jusqua && e.jusqua > maintenant) {
        return { faire: 'sanctionner', type: 'mute', duree: Math.round((e.jusqua - maintenant) / 1_000) };
    }

    return { faire: 'lever', type: 'mute' };
}

/** Les erreurs du site qui disent « pas sûr, rien ne passe » — à noter, sans en faire une panne. */
export const REFUS_ATTENDUS = ['executor_unlinked', 'target_unlinked', 'forbidden', 'refused', 'site_sanction'] as const;
