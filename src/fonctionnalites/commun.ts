/**
 * Ce que partagent les fonctionnalités qui recopient le site dans un salon Forum (le forum, le
 * Bugtracker) : le webhook du bot dans le salon, et la signature d'un auteur du site.
 */

import type { ForumChannel, Webhook } from 'discord.js';
import type { Textes } from '../i18n.js';
import type { Site } from '../site.js';
import { nomDeWebhook } from './forum/markdown.js';

/** Une commande, une option ou un choix décrits dans toutes les langues de Discord. */
export function decrite(textes: Textes, modele: string): { description: string; description_localizations: Record<string, string> } {
    const { defaut, locales } = textes.localisations(modele);

    return { description: defaut, description_localizations: locales };
}

/** Le nom du webhook que le bot crée dans chaque salon où il recopie le site. */
export const NOM_WEBHOOK = 'NeoFrag Reborn';

/**
 * Le webhook du bot dans ce salon : celui qu'il a déjà créé (il garde sa clé), sinon un nouveau.
 * Un webhook poste sous le nom et l'avatar qu'on lui donne : un message du site paraît sous son auteur.
 */
export async function webhookDuSalon(canal: ForumChannel, cache: Map<string, Webhook>): Promise<Webhook> {
    const connu = cache.get(canal.id);

    if (connu) {
        return connu;
    }

    const existants = await canal.fetchWebhooks();
    const webhook = existants.find((w) => w.owner?.id === canal.client.user.id && w.token !== null) ?? (await canal.createWebhook({ name: NOM_WEBHOOK, reason: 'NeoFrag : messages venus du site' }));

    cache.set(canal.id, webhook);

    return webhook;
}

/** Le nom et l'avatar sous lesquels un auteur du site paraît sur Discord (un membre, ou un nom venu d'ailleurs). */
export async function signature(site: Site, auteur: { id: number; username: string } | null, nomExterne?: string | null): Promise<{ nom: string; avatar: string | null }> {
    if (auteur) {
        const membre = await site.membre(auteur.id).catch(() => null);

        return { nom: nomDeWebhook(auteur.username), avatar: membre?.avatar && /^https?:\/\//.test(membre.avatar) ? membre.avatar : null };
    }

    return { nom: nomDeWebhook(nomExterne ?? ''), avatar: null };
}
