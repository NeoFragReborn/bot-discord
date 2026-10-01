/**
 * Ce que le bot lit sur sa machine : l'adresse du site et sa clé d'accès — rien d'autre.
 *
 * Tout le reste (la clé Discord, le serveur, les correspondances, l'interrupteur) se règle dans
 * l'administration du site, module « Discord », et arrive par l'API. Les deux lignes viennent de la
 * page « Clé d'accès du bot » de cette administration.
 */

export interface Environnement {
    /** L'adresse du site, sans « /api/v1 » (ex. `https://exemple.fr/`). */
    site: string;
    /** La clé d'accès du bot au site (`nfr_` + 40 caractères hexadécimaux). */
    cle: string;
    /** Secondes entre deux signes de vie. */
    intervalle: number;
}

export class ErreurEnvironnement extends Error {}

export function lireEnvironnement(env: NodeJS.ProcessEnv): Environnement {
    const site = (env.NF_SITE_URL ?? '').trim();
    const cle = (env.NF_API_KEY ?? '').trim();

    if (!/^https?:\/\/[^\s/]+/i.test(site)) {
        throw new ErreurEnvironnement('NF_SITE_URL manque ou n’est pas une adresse http(s) : copiez-la depuis l’administration du site (Discord → Clé d’accès du bot).');
    }

    if (!/^nfr_[0-9a-f]{40}$/.test(cle)) {
        throw new ErreurEnvironnement('NF_API_KEY manque ou n’a pas la forme d’une clé d’accès (nfr_…) : copiez-la depuis l’administration du site (Discord → Clé d’accès du bot).');
    }

    const intervalle = Number(env.NF_BOT_INTERVALLE ?? 30);

    return {
        site: site.replace(/\/+$/, '') + '/',
        cle,
        intervalle: Number.isFinite(intervalle) ? Math.min(Math.max(Math.round(intervalle), 10), 300) : 30,
    };
}
