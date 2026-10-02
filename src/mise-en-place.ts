/**
 * La mise en place du serveur, commandée depuis l'administration (Discord → Mise en place).
 *
 * L'administration montre d'abord un APERÇU de ce qui sera créé ou repris, puis envoie le plan au
 * bot : une catégorie, un salon Forum par forum du site (avec les préfixes du forum en étiquettes),
 * un rôle par groupe. Le bot reprend ce qui existe déjà sous le même nom — la mise en place se relance
 * sans rien dédoubler —, crée le reste, et rend compte au site, qui pose les correspondances. Il dit
 * aussi ce qu'IL a créé : « Annuler la dernière mise en place » supprime cela, et rien d'autre.
 */

import { ChannelType, type CategoryChannel, type ForumChannel, type Guild, type GuildForumTagData } from 'discord.js';
import { messageErreur, type Journal } from './journal.js';
import type { CommandeSite, CompteRenduMiseEnPlace, ConfigBot, Site } from './site.js';

/** Une étiquette voulue : le préfixe du forum qu'elle représente, et son nom. */
export interface EtiquetteVoulue {
    prefix_id: number;
    nom: string;
}

export interface PlanMiseEnPlace {
    id: string;
    categorie: string;
    salons: { forum_id: number; nom: string; description: string; etiquettes: (EtiquetteVoulue | string)[] }[];
    roles: { group_key: string; nom: string; couleur: string | null }[];
}

/** Ce que le bot a créé (`cree` : ce que l'annulation supprimera), et les correspondances à poser. */
type CompteRendu = CompteRenduMiseEnPlace;

/** Longueur maximale d'une étiquette de salon Forum. */
const ETIQUETTE_MAX = 20;

/**
 * Le nom d'un salon tel que Discord l'écrit : en minuscules, des tirets à la place des espaces et de
 * la ponctuation. Le site calcule le même pour son aperçu (`Discord::nom_de_salon()`).
 */
export function nomDeSalon(titre: string): string {
    return titre.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'forum';
}

/** Le nom d'une étiquette tel que Discord le garde (20 caractères au plus). */
export function nomEtiquette(nom: string): string {
    return Array.from(nom.trim()).slice(0, ETIQUETTE_MAX).join('');
}

/** Les étiquettes à ajouter à celles d'un salon : celles qui manquent, sans dépasser les 20 que Discord permet. */
export function etiquettesManquantes(existantes: readonly string[], voulues: readonly string[]): string[] {
    const connues = new Set(existantes.map((e) => e.toLowerCase()));
    const ajouts: string[] = [];

    for (const v of voulues) {
        const nom = nomEtiquette(v);

        if (nom && !connues.has(nom.toLowerCase())) {
            connues.add(nom.toLowerCase());
            ajouts.push(nom);
        }
    }

    return ajouts.slice(0, Math.max(0, 20 - existantes.length));
}

interface Outils {
    guilde: Guild;
    site: Site;
    journal: Journal;
    config: ConfigBot;
}

export async function executerMiseEnPlace(commande: CommandeSite, outils: Outils): Promise<void> {
    if (commande.type === 'setup') {
        const compteRendu = await appliquer(commande.data as unknown as PlanMiseEnPlace, outils);

        await outils.site.compteRenduMiseEnPlace(compteRendu);
        outils.journal.info('Mise en place du serveur : %d salon(s) et %d rôle(s) créés, %d repris.', compteRendu.cree.salons.length, compteRendu.cree.roles.length, compteRendu.salons.length + compteRendu.roles.length - compteRendu.cree.salons.length - compteRendu.cree.roles.length);

        for (const e of compteRendu.erreurs) {
            outils.journal.error('Mise en place du serveur : %s', e);
        }
    } else {
        const donnees = commande.data as { id?: string; categorie?: string | null; salons?: string[]; roles?: string[] };
        const supprimes = await annuler(donnees, outils);

        await outils.site.annulationMiseEnPlace(String(donnees.id ?? ''), supprimes);
        outils.journal.info('Mise en place annulée : %d salon(s) et %d rôle(s) supprimés.', supprimes.salons.length, supprimes.roles.length);
    }
}

async function appliquer(plan: PlanMiseEnPlace, { guilde }: Outils): Promise<CompteRendu> {
    const compteRendu: CompteRendu = { id: String(plan.id), cree: { categorie: null, salons: [], roles: [] }, salons: [], roles: [], etiquettes: [], erreurs: [] };
    const raison = 'NeoFrag : mise en place du serveur';
    let categorie: CategoryChannel | null = null;

    await guilde.channels.fetch();
    await guilde.roles.fetch();

    if (plan.categorie.trim()) {
        categorie = (guilde.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === plan.categorie.trim().toLowerCase()) as CategoryChannel | undefined) ?? null;

        if (!categorie) {
            try {
                categorie = await guilde.channels.create({ name: plan.categorie.trim().slice(0, 100), type: ChannelType.GuildCategory, reason: raison });
                compteRendu.cree.categorie = categorie.id;
            } catch (erreur) {
                compteRendu.erreurs.push(`« ${plan.categorie} » : ${messageErreur(erreur)}`);
            }
        }
    }

    for (const s of plan.salons ?? []) {
        const nom = nomDeSalon(s.nom);
        let salon = (guilde.channels.cache.find((c) => c.type === ChannelType.GuildForum && c.name === nom) as ForumChannel | undefined) ?? null;
        // Un site 1.2.11 n'envoie que des noms ; les suivants, le préfixe de chaque étiquette.
        const voulues: EtiquetteVoulue[] = (s.etiquettes ?? []).map((e) => (typeof e === 'string' ? { prefix_id: 0, nom: e } : e));
        const noms = voulues.map((e) => e.nom);

        try {
            if (salon) {
                const ajouts = etiquettesManquantes(salon.availableTags.map((t) => t.name), noms);

                if (ajouts.length) {
                    const tags: GuildForumTagData[] = [...salon.availableTags.map((t) => ({ id: t.id, name: t.name, moderated: t.moderated, emoji: t.emoji })), ...ajouts.map((name) => ({ name }))];

                    await salon.setAvailableTags(tags, raison);
                }
            } else {
                salon = await guilde.channels.create({
                    name: nom,
                    type: ChannelType.GuildForum,
                    ...(categorie ? { parent: categorie.id } : {}),
                    ...(s.description ? { topic: s.description.slice(0, 1024) } : {}),
                    availableTags: etiquettesManquantes([], noms).map((name) => ({ name })),
                    reason: raison,
                });
                compteRendu.cree.salons.push(salon.id);
            }

            compteRendu.salons.push({ forum_id: Number(s.forum_id), channel_id: salon.id });

            // L'étiquette de chaque préfixe, retrouvée par son nom dans le salon tel qu'il est maintenant.
            const tags = (await salon.fetch()).availableTags;

            for (const e of voulues) {
                const tag = tags.find((t) => t.name.toLowerCase() === nomEtiquette(e.nom).toLowerCase());

                if (tag && e.prefix_id > 0) {
                    compteRendu.etiquettes.push({ channel_id: salon.id, prefix_id: e.prefix_id, tag_id: tag.id });
                }
            }
        } catch (erreur) {
            compteRendu.erreurs.push(`#${nom} : ${messageErreur(erreur)}`);
        }
    }

    for (const r of plan.roles ?? []) {
        const nom = r.nom.trim().slice(0, 100);
        let role = guilde.roles.cache.find((x) => x.name === nom && !x.managed) ?? null;

        try {
            if (!role) {
                role = await guilde.roles.create({ name: nom, ...(r.couleur && /^#[0-9a-f]{6}$/i.test(r.couleur) ? { color: r.couleur as `#${string}` } : {}), mentionable: false, reason: raison });
                compteRendu.cree.roles.push(role.id);
            }

            compteRendu.roles.push({ group_key: r.group_key, role_id: role.id });
        } catch (erreur) {
            compteRendu.erreurs.push(`@${nom} : ${messageErreur(erreur)}`);
        }
    }

    return compteRendu;
}

/** Supprime ce que la mise en place avait créé — et qui existe encore. */
async function annuler(donnees: { categorie?: string | null; salons?: string[]; roles?: string[] }, { guilde }: Outils): Promise<{ salons: string[]; roles: string[]; categorie: string | null }> {
    const raison = 'NeoFrag : mise en place annulée';
    const supprimes = { salons: [] as string[], roles: [] as string[], categorie: null as string | null };

    for (const id of donnees.salons ?? []) {
        const salon = await guilde.channels.fetch(id).catch(() => null);

        if (salon && (await salon.delete(raison).then(() => true, () => false))) {
            supprimes.salons.push(id);
        } else if (!salon) {
            supprimes.salons.push(id);
        }
    }

    for (const id of donnees.roles ?? []) {
        const role = await guilde.roles.fetch(id).catch(() => null);

        if (!role || (await role.delete(raison).then(() => true, () => false))) {
            supprimes.roles.push(id);
        }
    }

    if (donnees.categorie) {
        const categorie = await guilde.channels.fetch(donnees.categorie).catch(() => null);

        // Une catégorie qui contient encore des salons (ajoutés depuis à la main) reste.
        if (!categorie || (categorie.type === ChannelType.GuildCategory && categorie.children.cache.size === 0 && (await categorie.delete(raison).then(() => true, () => false)))) {
            supprimes.categorie = donnees.categorie;
        }
    }

    return supprimes;
}
