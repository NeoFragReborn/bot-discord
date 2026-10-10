/**
 * Les images jointes à un message Discord, gardées par le site (`POST forum/images`) : les adresses des fichiers de
 * Discord expirent, celles du site restent. Le forum s'en servait seul ; un ticket du Bugtracker et ses commentaires —
 * une capture d'un bogue, la maquette d'une idée — n'en gardaient qu'un lien vers le message (m10, bot 0.2.6).
 */
import type { Attachment, Message } from 'discord.js';
import { messageErreur } from '../journal.js';
import { ErreurSite } from '../site.js';
import { discordVersSite, type PieceJointe } from './forum/markdown.js';
import type { Contexte } from './types.js';

/** Ce que le site garde : ce que l'éditeur accepte (Editeur_Images). */
export const IMAGES_GARDEES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const IMAGE_TAILLE_MAX = 5 * 1024 * 1024;
/** Les adresses déjà gardées, en mémoire : un message modifié renvoie ses images. */
const IMAGES_EN_MEMOIRE = 500;

export class ImagesDuSite {
    /** Pièce jointe Discord → son adresse sur le site, une fois l'image gardée. */
    private gardees = new Map<string, string>();
    /** Le site ne garde pas d'images (d'avant la 1.2.27) : on ne lui en envoie plus. */
    private siteSansImages = false;

    /** @param module le nom qui précède un avertissement au journal (« Forum », « Bugtracker »). */
    constructor(private readonly module: 'Forum' | 'Bugtracker') {}

    /** Le texte d'un message pour le site : son texte, puis ses pièces jointes — une image gardée s'y montre. */
    async contenu(ctx: Contexte, m: Message): Promise<string> {
        const pieces: PieceJointe[] = [];
        // Un site d'avant la 1.2.49 montre le texte d'un ticket tel quel : la marque d'une image y paraîtrait en clair.
        const gardees = this.module === 'Forum' || ctx.config.tickets_images === true;

        for (const a of m.attachments.values()) {
            const chemin = gardees ? await this.chemin(ctx, a) : null;

            pieces.push({ nom: a.name, url: a.url, ...(chemin ? { chemin } : {}) });
        }

        return discordVersSite(m.cleanContent, pieces, m.url);
    }

    /** L'adresse sur le site d'une image jointe, ou NULL : pas une image, trop lourde, ou le site la refuse. */
    async chemin(ctx: Contexte, a: Attachment): Promise<string | null> {
        const type = (a.contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

        if (this.siteSansImages || !IMAGES_GARDEES.includes(type) || a.size > IMAGE_TAILLE_MAX) {
            return null;
        }

        const connue = this.gardees.get(a.id);

        if (connue) {
            return connue;
        }

        try {
            const reponse = await fetch(a.url, { signal: AbortSignal.timeout(15_000) });

            if (!reponse.ok) {
                throw new Error(`Discord : HTTP ${reponse.status}`);
            }

            const octets = new Uint8Array(await reponse.arrayBuffer());

            if (octets.byteLength > IMAGE_TAILLE_MAX) {
                return null;
            }

            const image = await ctx.site.envoyerImage(octets, a.name, type);

            if (this.gardees.size >= IMAGES_EN_MEMOIRE) {
                this.gardees.delete(this.gardees.keys().next().value ?? '');
            }

            this.gardees.set(a.id, image.path);

            return image.path;
        } catch (erreur) {
            // Un site d'avant la 1.2.27 ne connaît pas cette adresse : on le dit une fois, et l'on garde les liens.
            if (erreur instanceof ErreurSite && erreur.code === 'not_found') {
                this.siteSansImages = true;
            }

            if (this.module === 'Forum') {
                ctx.journal.warn('Forum : %s', `${a.name} — ${messageErreur(erreur)}`);
            } else {
                ctx.journal.warn('Bugtracker : %s', `${a.name} — ${messageErreur(erreur)}`);
            }

            return null;
        }
    }
}
