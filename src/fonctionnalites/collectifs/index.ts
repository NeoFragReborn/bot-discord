/**
 * Collectifs (m15, v3) : chaque collectif du site qui le veut reçoit un rôle et un salon privé sur le serveur.
 *
 * Le site dit les collectifs ; le bot crée ce qui manque — le rôle, nommé comme le collectif, et un salon texte dans
 * la catégorie « Collectifs », fermé à tous sauf à ce rôle — puis le rapporte. Le rôle devient alors la
 * correspondance du groupe du collectif : c'est la fonctionnalité « Rôles et pseudos » qui le donne à ses membres
 * reliés, et le retire à qui en sort, comme pour tout groupe du site.
 *
 * Un collectif supprimé, ou dont on a décoché Discord, arrive par le fil d'événements : le bot supprime son rôle. Son
 * salon reste — sans le rôle, seuls les administrateurs du serveur le voient : ce qui s'y est écrit ne se perd pas.
 * Un rôle ou un salon supprimé à la main est recréé au passage suivant, un collectif renommé se renomme.
 */

import { ChannelType, type CategoryChannel, type Guild, type GuildBasedChannel, type Role } from 'discord.js';
import { messageErreur } from '../../journal.js';
import type { Collectif, Evenement } from '../../site.js';
import type { Contexte, Fonctionnalite, Reglage } from '../types.js';
import { droitsDuSalon, nomDeRole, nomDeSalon } from './regles.js';

/** Toutes les cinq minutes, et à chaque changement de la configuration (un collectif créé en change le numéro). */
const INTERVALLE = 5 * 60_000;

const RAISON = 'NeoFrag : collectif du site';

export class Collectifs implements Fonctionnalite {
    readonly nom = 'collectifs';
    readonly titre = 'Collectifs';
    readonly description = 'Chaque collectif du site reçoit un rôle et un salon privé sur le serveur, que seuls ses membres voient ; le rôle suit les membres du collectif.';
    readonly defaut = false;
    readonly reglages = [
        { cle: 'categorie', type: 'texte', defaut: 'Collectifs', libelle: 'Catégorie des salons des collectifs', aide: 'Le bot la crée si elle n’existe pas.' },
    ] as const satisfies readonly Reglage[];
    readonly evenements = ['discord.collective.removed'] as const;

    private dernierPassage = 0;
    private enCours = false;
    /** La dernière erreur dite pour chaque collectif : la même ne se répète pas à chaque passage. */
    private dites = new Map<number, string>();

    async demarrer(ctx: Contexte): Promise<void> {
        await this.synchroniser(ctx);
    }

    async reconfigurer(ctx: Contexte): Promise<void> {
        await this.synchroniser(ctx);
    }

    async tour(ctx: Contexte): Promise<void> {
        if (Date.now() - this.dernierPassage >= INTERVALLE) {
            await this.synchroniser(ctx);
        }
    }

    async resynchroniser(ctx: Contexte): Promise<void> {
        this.dites.clear();
        await this.synchroniser(ctx);
    }

    /** Un collectif quitte Discord : son rôle part. */
    async surEvenement(ctx: Contexte, evenement: Evenement): Promise<void> {
        const id = String(evenement.data.role_id ?? '');

        if (!/^\d+$/.test(id)) {
            return;
        }

        const role = ctx.guilde.roles.cache.get(id) ?? (await ctx.guilde.roles.fetch(id).catch(() => null));

        if (!role) {
            return;
        }

        if (!role.editable) {
            ctx.journal.warn('Collectifs : le rôle « %s » est placé au-dessus de celui du bot : supprimez-le à la main.', role.name);
            return;
        }

        await role.delete('NeoFrag : collectif supprimé, ou sans Discord').then(
            () => ctx.journal.info('Collectifs : le rôle « %s » est supprimé ; son salon reste, visible des seuls administrateurs.', role.name),
            (erreur: unknown) => ctx.journal.error('Collectifs : %s', messageErreur(erreur)),
        );
    }

    async synchroniser(ctx: Contexte): Promise<void> {
        if (this.enCours) {
            return;
        }

        this.enCours = true;
        this.dernierPassage = Date.now();

        try {
            for (const c of await ctx.site.collectifs()) {
                try {
                    await this.tenir(ctx, c);
                    this.dites.delete(c.collective_id);
                } catch (erreur) {
                    const message = messageErreur(erreur);

                    if (this.dites.get(c.collective_id) !== message) {
                        this.dites.set(c.collective_id, message);
                        ctx.journal.warn('Collectifs : l’espace de « %s » n’a pas pu être mis en place : %s', c.name, message);
                    }
                }
            }
        } catch (erreur) {
            ctx.journal.error('Collectifs : %s', messageErreur(erreur));
        } finally {
            this.enCours = false;
        }
    }

    /** Le rôle et le salon d'un collectif : créés s'ils manquent, renommés s'il a changé de nom. */
    private async tenir(ctx: Contexte, c: Collectif): Promise<void> {
        const guilde = ctx.guilde;
        const enPlace: { role_id?: string; channel_id?: string } = {};
        let role: Role | null = c.role_id ? (guilde.roles.cache.get(c.role_id) ?? null) : null;

        if (!role) {
            role = await guilde.roles.create({ name: nomDeRole(c.name), permissions: [], mentionable: false, hoist: false, reason: RAISON });
            enPlace.role_id = role.id;
            ctx.journal.info('Collectifs : le rôle « %s » est créé.', role.name);
        } else if (role.name !== nomDeRole(c.name) && role.editable) {
            await role.setName(nomDeRole(c.name), RAISON);
        }

        const nom = nomDeSalon(c.name, c.collective_id);
        let salon: GuildBasedChannel | null = c.channel_id ? (guilde.channels.cache.get(c.channel_id) ?? null) : null;

        if (!salon) {
            const categorie = await this.categorie(ctx, guilde);

            salon = await guilde.channels.create({ name: nom, type: ChannelType.GuildText, parent: categorie.id, permissionOverwrites: droitsDuSalon(guilde.id, role.id, ctx.client.user.id), reason: RAISON });
            enPlace.channel_id = salon.id;
            ctx.journal.info('Collectifs : le salon « %s » est créé, réservé au rôle « %s ».', salon.name, role.name);
        } else if (salon.type === ChannelType.GuildText) {
            // Un rôle recréé n'a pas encore sa place dans le salon.
            if (!salon.permissionOverwrites.cache.has(role.id)) {
                await salon.permissionOverwrites.create(role.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }, { reason: RAISON });
            }

            if (salon.name !== nom) {
                await salon.setName(nom, RAISON);
            }
        }

        if (enPlace.role_id || enPlace.channel_id) {
            await ctx.site.collectifEnPlace(c.collective_id, enPlace);
        }
    }

    /** La catégorie des salons des collectifs, retrouvée par son nom, sinon créée. */
    private async categorie(ctx: Contexte, guilde: Guild): Promise<CategoryChannel> {
        const nom = String(ctx.reglages.categorie || 'Collectifs').trim().slice(0, 100) || 'Collectifs';
        const existante = guilde.channels.cache.find((s): s is CategoryChannel => s.type === ChannelType.GuildCategory && s.name.toLowerCase() === nom.toLowerCase());

        return existante ?? guilde.channels.create({ name: nom, type: ChannelType.GuildCategory, reason: RAISON });
    }
}
