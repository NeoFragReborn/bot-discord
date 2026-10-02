/**
 * Forum du site ↔ salon « Forum » de Discord, dans les deux sens.
 *
 * Chaque forum relié dans l'administration (Discord → Salons et forums) a son salon Forum : un sujet
 * du site y devient un fil, un fil y devient un sujet, et les réponses, modifications et suppressions
 * suivent. Les messages venus du site sont postés par un webhook du bot, sous le nom et l'avatar de
 * leur auteur ; ceux venus de Discord arrivent sur le site sous le compte du membre qui a lié son
 * Discord, ou sous son identité Discord (son pseudo) s'il ne l'a pas lié.
 *
 * Deux modes par salon :
 *   - « tout » : chaque fil de Discord passe sur le site ;
 *   - « à la demande » : un fil ne passe sur le site que quand quelqu'un qui peut gérer les fils du
 *     salon y pose la réaction choisie — le fil entier, puis la suite. Les sujets du site, eux, vont
 *     toujours sur Discord : ils sont déjà publics.
 *
 * Pas d'écho : ce que le bot écrit sur le site porte sa clé dans le fil d'événements, et il ne le
 * recopie pas ; ce que son webhook poste sur Discord, il ne le reprend pas.
 */

import { ChannelType, Events, GatewayIntentBits, PermissionsBitField, type AnyThreadChannel, type ForumChannel, type GuildMember, type Message, type MessageReaction, type PartialMessage, type PartialMessageReaction, type PartialUser, type User, type Webhook } from 'discord.js';
import { formater, messageErreur, type Valeur } from '../../journal.js';
import { ErreurSite, type AuteurDiscord, type Evenement, type MessageForum, type SalonRelie, type Sujet } from '../../site.js';
import { TEXTES } from '../../textes.js';
import { signature, webhookDuSalon } from '../commun.js';
import type { Contexte, Fonctionnalite, Reglage } from '../types.js';
import { correspondancesDuSalon, etiquettesDuFil, memesEtiquettes, prefixeDuFil } from './etiquettes.js';
import { FileParCle } from './file.js';
import { discordVersSite, htmlVersMarkdown, tenirDansDiscord } from './markdown.js';

/** Messages d'un fil recopiés au plus quand on le publie à la demande. */
const FIL_MAX = 500;

/** Les permissions dont le bot a besoin dans un salon relié. */
const PERMISSIONS_DU_SALON = [
    ['ViewChannel', PermissionsBitField.Flags.ViewChannel],
    ['SendMessages', PermissionsBitField.Flags.SendMessages],
    ['SendMessagesInThreads', PermissionsBitField.Flags.SendMessagesInThreads],
    ['ReadMessageHistory', PermissionsBitField.Flags.ReadMessageHistory],
    ['ManageWebhooks', PermissionsBitField.Flags.ManageWebhooks],
    ['ManageThreads', PermissionsBitField.Flags.ManageThreads],
    ['ManageMessages', PermissionsBitField.Flags.ManageMessages],
] as const;

/** Fils d'un salon regardés au plus par un rattrapage (les actifs, puis les plus récents des archivés). */
const RATTRAPAGE_FILS = 50;

/** Messages d'un fil regardés au plus par un rattrapage (les plus récents). */
const RATTRAPAGE_MESSAGES = 100;

export class SynchroForum implements Fonctionnalite {
    readonly nom = 'forum';
    readonly titre = 'Forum et salons Forum';
    readonly description = 'Relie chaque forum du site à un salon Forum de Discord : sujets, réponses, modifications et suppressions passent d’un côté à l’autre.';
    readonly reglages = [
        { cle: 'lien_site', type: 'bool', defaut: true, libelle: 'Sous chaque sujet recopié sur Discord, un lien vers le site' },
        { cle: 'rattrapage', type: 'bool', defaut: true, libelle: 'Au démarrage, rattraper ce qui s’est écrit sur Discord pendant que le bot était éteint' },
    ] as const satisfies readonly Reglage[];
    readonly intents = [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions] as const;
    readonly evenements = ['forum.topic.created', 'forum.post.created', 'forum.post.edited', 'forum.post.deleted', 'forum.topic.prefixed'] as const;

    private ctx: Contexte | null = null;
    private webhooks = new Map<string, Webhook>();
    private file = new FileParCle();
    private avertis = new Set<string>();
    private retraits: (() => void)[] = [];
    private salonsDits = -1;

    async demarrer(ctx: Contexte): Promise<void> {
        this.ctx = ctx;

        const client = ctx.client;
        const surCree = (m: Message) => this.parFil(m.channelId, () => this.messageCree(m));
        const surModifie = (avant: Message | PartialMessage, apres: Message | PartialMessage) => this.parFil(apres.channelId, () => this.messageModifie(avant, apres));
        const surSupprime = (m: Message | PartialMessage) => this.parFil(m.channelId, () => this.messageSupprime(m));
        const surReaction = (r: MessageReaction | PartialMessageReaction, u: User | PartialUser) => this.parFil(r.message.channelId, () => this.reaction(r, u));
        const surFilSupprime = (fil: AnyThreadChannel) => void this.filSupprime(fil).catch((e: unknown) => this.erreur('Forum : %s', messageErreur(e)));
        // Le bot rejoint chaque nouveau fil d'un salon relié : membre du fil, il en reçoit tous les messages.
        const surFilCree = (fil: AnyThreadChannel) => {
            if (this.ctx && this.salon(this.ctx, fil.parentId) && !fil.joined && fil.joinable) {
                void fil.join().catch(() => undefined);
            }
        };

        // Une étiquette posée ou retirée sur un fil relié : le préfixe du sujet suit.
        const surFilModifie = (avant: AnyThreadChannel, apres: AnyThreadChannel) => {
            if (!memesEtiquettes(avant.appliedTags, apres.appliedTags)) {
                this.parFil(apres.id, () => this.etiquettesVersSite(apres));
            }
        };

        client.on(Events.ThreadCreate, surFilCree);
        client.on(Events.ThreadUpdate, surFilModifie);
        client.on(Events.MessageCreate, surCree);
        client.on(Events.MessageUpdate, surModifie);
        client.on(Events.MessageDelete, surSupprime);
        client.on(Events.MessageReactionAdd, surReaction);
        client.on(Events.ThreadDelete, surFilSupprime);

        this.retraits = [
            () => client.off(Events.ThreadCreate, surFilCree),
            () => client.off(Events.ThreadUpdate, surFilModifie),
            () => client.off(Events.MessageCreate, surCree),
            () => client.off(Events.MessageUpdate, surModifie),
            () => client.off(Events.MessageDelete, surSupprime),
            () => client.off(Events.MessageReactionAdd, surReaction),
            () => client.off(Events.ThreadDelete, surFilSupprime),
        ];

        this.verifierSalons(ctx);

        if (ctx.reglages.rattrapage) {
            // En arrière-plan : le bot ne fait pas attendre ses autres fonctionnalités.
            void this.rattraper(ctx, false).catch((e: unknown) => this.erreur('Forum : %s', messageErreur(e)));
        }
    }

    async resynchroniser(ctx: Contexte): Promise<void> {
        this.ctx = ctx;
        this.avertis.clear();
        this.webhooks.clear();
        this.verifierSalons(ctx);
        await this.rattraper(ctx, true);
    }

    reconfigurer(ctx: Contexte): void {
        this.ctx = ctx;
        this.avertis.clear();
        this.webhooks.clear();
        this.verifierSalons(ctx);
    }

    tour(ctx: Contexte): void {
        this.ctx = ctx;
    }

    arreter(): void {
        for (const retirer of this.retraits) {
            retirer();
        }

        this.retraits = [];
        this.ctx = null;
    }

    // ── Site → Discord ─────────────────────────────────────────────────────

    async surEvenement(ctx: Contexte, evenement: Evenement): Promise<void> {
        this.ctx = ctx;

        // Ce que le bot a lui-même écrit sur le site (depuis Discord) n'y retourne pas.
        if (evenement.source && ctx.config.api_token_id !== null && evenement.source.token_id === ctx.config.api_token_id) {
            return;
        }

        if (!ctx.config.channels.length) {
            return;
        }

        const d = evenement.data;

        switch (evenement.type) {
            case 'forum.topic.created':
                await this.sujetVersDiscord(ctx, Number(d.topic_id), Number(d.message_id));
                break;
            case 'forum.post.created':
                if (!d.is_starter) {
                    await this.reponseVersDiscord(ctx, Number(d.topic_id), Number(d.message_id));
                }
                break;
            case 'forum.post.edited':
                await this.modificationVersDiscord(ctx, Number(d.message_id), Boolean(d.is_topic));
                break;
            case 'forum.post.deleted':
                await this.suppressionVersDiscord(ctx, Number(d.message_id), Number(d.topic_id), Boolean(d.is_topic));
                break;
            case 'forum.topic.prefixed':
                await this.prefixeVersDiscord(ctx, Number(d.topic_id), d.prefix_id === null || d.prefix_id === undefined ? null : Number(d.prefix_id));
                break;
        }
    }

    private async sujetVersDiscord(ctx: Contexte, sujetId: number, messageId: number): Promise<void> {
        const sujet = await ctx.site.sujet(sujetId);
        const salon = sujet ? this.salonDuForum(ctx, sujet.forum_id) : null;
        const canal = salon ? this.canal(ctx, salon) : null;

        if (!sujet || !canal || (await ctx.site.lien('topic', { siteId: sujetId }))) {
            return;
        }

        const message = await ctx.site.message(messageId || sujet.first_message_id || 0);

        if (!message || message.deleted) {
            return;
        }

        const contenu = tenirDansDiscord(htmlVersMarkdown(message.html ?? ''), this.finSujet(ctx, sujet), `-# [${ctx.textes.dans(null, TEXTES.lireLaSuite)}](<${message.url}>)`);
        const signature = await this.signature(ctx, message);
        const webhook = await this.webhook(canal);
        const etiquettes = etiquettesDuFil([], correspondancesDuSalon(ctx.config.tags, canal.id), sujet.prefix?.id ?? null);
        const envoye = await webhook.send({ content: contenu, username: signature.nom, ...(signature.avatar ? { avatarURL: signature.avatar } : {}), threadName: Array.from(sujet.title).slice(0, 100).join(''), ...(etiquettes.length ? { appliedTags: etiquettes } : {}), allowedMentions: { parse: [] } });

        await ctx.site.lier('topic', sujetId, envoye.channelId);
        await ctx.site.lier('message', message.id, envoye.id);
        ctx.journal.info('Forum : le sujet « %s » est publié sur Discord.', sujet.title);
    }

    private async reponseVersDiscord(ctx: Contexte, sujetId: number, messageId: number): Promise<void> {
        const lienSujet = await ctx.site.lien('topic', { siteId: sujetId });

        if (!lienSujet || (await ctx.site.lien('message', { siteId: messageId }))) {
            return;
        }

        const message = await ctx.site.message(messageId);
        const salon = message ? this.salonDuForum(ctx, message.forum_id) : null;
        const canal = salon ? this.canal(ctx, salon) : null;

        if (!message || message.deleted || !canal) {
            return;
        }

        const contenu = tenirDansDiscord(htmlVersMarkdown(message.html ?? ''), '', `-# [${ctx.textes.dans(null, TEXTES.lireLaSuite)}](<${message.url}>)`);
        const signature = await this.signature(ctx, message);
        const webhook = await this.webhook(canal);
        const envoye = await webhook.send({ content: contenu, username: signature.nom, ...(signature.avatar ? { avatarURL: signature.avatar } : {}), threadId: lienSujet.discord_id, allowedMentions: { parse: [] } });

        await ctx.site.lier('message', message.id, envoye.id);
    }

    private async modificationVersDiscord(ctx: Contexte, messageId: number, ouverture: boolean): Promise<void> {
        const lien = await ctx.site.lien('message', { siteId: messageId });
        const message = lien ? await ctx.site.message(messageId) : null;
        const lienSujet = message ? await ctx.site.lien('topic', { siteId: message.topic_id }) : null;
        const salon = message ? this.salonDuForum(ctx, message.forum_id) : null;
        const canal = salon ? this.canal(ctx, salon) : null;

        if (!lien || !message || message.deleted || !lienSujet || !canal) {
            return;
        }

        const fil = await this.fil(ctx, lienSujet.discord_id);
        const webhook = await this.webhook(canal);
        const surDiscord = fil ? await fil.messages.fetch(lien.discord_id).catch(() => null) : null;

        // Un message écrit sur Discord appartient à son auteur : le bot ne le réécrit pas.
        if (!fil || !surDiscord || surDiscord.webhookId !== webhook.id) {
            return;
        }

        const sujet = ouverture ? await ctx.site.sujet(message.topic_id) : null;
        const fin = sujet ? this.finSujet(ctx, sujet) : '';

        await webhook.editMessage(lien.discord_id, { content: tenirDansDiscord(htmlVersMarkdown(message.html ?? ''), fin, `-# [${ctx.textes.dans(null, TEXTES.lireLaSuite)}](<${message.url}>)`), threadId: fil.id });

        const titre = sujet ? Array.from(sujet.title).slice(0, 100).join('') : '';

        if (titre && fil.name !== titre) {
            await fil.setName(titre, 'NeoFrag : titre changé sur le site');
        }
    }

    /** Le préfixe changé sur le site : l'étiquette du fil suit (les étiquettes libres restent). */
    private async prefixeVersDiscord(ctx: Contexte, sujetId: number, prefixe: number | null): Promise<void> {
        const lien = await ctx.site.lien('topic', { siteId: sujetId });
        const fil = lien ? await this.fil(ctx, lien.discord_id) : null;

        if (!fil || !fil.parentId || !this.salon(ctx, fil.parentId)) {
            return;
        }

        const voulues = etiquettesDuFil(fil.appliedTags, correspondancesDuSalon(ctx.config.tags, fil.parentId), prefixe);

        if (!memesEtiquettes(voulues, fil.appliedTags)) {
            await fil.setAppliedTags(voulues, 'NeoFrag : préfixe changé sur le site');
        }
    }

    /** Une étiquette posée ou retirée sur Discord : le préfixe du sujet suit. */
    private async etiquettesVersSite(fil: AnyThreadChannel): Promise<void> {
        const ctx = this.ctx;

        if (!ctx || !fil.parentId || !this.salon(ctx, fil.parentId)) {
            return;
        }

        const correspondances = correspondancesDuSalon(ctx.config.tags, fil.parentId);

        // Aucune étiquette ne représente de préfixe dans ce salon : rien à reporter.
        if (!correspondances.versPrefixe.size) {
            return;
        }

        const lien = await ctx.site.lien('topic', { discordId: fil.id });
        const sujet = lien ? await ctx.site.sujet(lien.site_id) : null;
        const prefixe = prefixeDuFil(fil.appliedTags, correspondances);

        if (sujet && (sujet.prefix?.id ?? null) !== prefixe) {
            await ctx.site.modifierSujet(sujet.id, prefixe);
        }
    }

    private async suppressionVersDiscord(ctx: Contexte, messageId: number, sujetId: number, toutLeSujet: boolean): Promise<void> {
        const lienSujet = await ctx.site.lien('topic', { siteId: sujetId });
        const fil = lienSujet ? await this.fil(ctx, lienSujet.discord_id) : null;

        if (!fil) {
            return;
        }

        if (toutLeSujet) {
            await fil.delete('NeoFrag : sujet supprimé sur le site');
            ctx.journal.info('Forum : le sujet n° %d est supprimé sur le site, son fil « %s » aussi sur Discord.', sujetId, fil.name);

            return;
        }

        const lien = await ctx.site.lien('message', { siteId: messageId });
        const surDiscord = lien ? await fil.messages.fetch(lien.discord_id).catch(() => null) : null;

        if (surDiscord) {
            await surDiscord.delete();
        }
    }

    // ── Discord → site ─────────────────────────────────────────────────────

    private async messageCree(m: Message): Promise<void> {
        const ctx = this.ctx;
        const fil = ctx ? this.filRelie(ctx, m) : null;

        if (!ctx || !fil || !this.lisible(ctx)) {
            return;
        }

        const salon = this.salon(ctx, fil.parentId);

        if (!salon) {
            return;
        }

        // Dans un salon Forum, le message d'ouverture porte l'identifiant du fil.
        if (m.id === fil.id) {
            if (salon.mode === 'all') {
                await this.publierFil(ctx, fil, salon, m);
            }

            return;
        }

        const lien = await ctx.site.lien('topic', { discordId: fil.id });

        if (lien) {
            await this.publierReponse(ctx, lien.site_id, m);
        }
    }

    private async messageModifie(avant: Message | PartialMessage, apres: Message | PartialMessage): Promise<void> {
        const ctx = this.ctx;

        if (!ctx || !this.lisible(ctx)) {
            return;
        }

        const m = apres.partial ? await apres.fetch().catch(() => null) : apres;
        const fil = m ? this.filRelie(ctx, m) : null;

        // Discord signale aussi une « modification » quand il ajoute l'aperçu d'un lien : rien à recopier.
        if (!m || !fil || (!avant.partial && avant.content === m.content && avant.attachments.size === m.attachments.size)) {
            return;
        }

        const lien = await ctx.site.lien('message', { discordId: m.id });
        const contenu = this.contenuVersSite(m);

        if (!lien || !contenu) {
            return;
        }

        try {
            await ctx.site.modifierMessage(lien.site_id, contenu, this.auteur(m));
        } catch (erreur) {
            if (!(erreur instanceof ErreurSite && ['not_author', 'message_not_found'].includes(erreur.code))) {
                throw erreur;
            }
        }
    }

    private async messageSupprime(m: Message | PartialMessage): Promise<void> {
        const ctx = this.ctx;

        // Une copie postée par le webhook, effacée sur Discord : le message du site, lui, reste.
        if (!ctx || m.webhookId || m.author?.bot) {
            return;
        }

        const fil = await this.fil(ctx, m.channelId);

        if (!fil || !this.salon(ctx, fil.parentId)) {
            return;
        }

        const lien = await ctx.site.lien('message', { discordId: m.id });

        if (!lien) {
            return;
        }

        const discordId = m.author?.id ?? (await this.discordDeLAuteur(ctx, lien.site_id));

        if (!discordId) {
            return;
        }

        try {
            await ctx.site.supprimerMessage(lien.site_id, { discord: { id: discordId } });
        } catch (erreur) {
            if (erreur instanceof ErreurSite && erreur.code === 'is_first_message') {
                ctx.journal.info('Forum : le message d’ouverture du fil « %s » a été supprimé sur Discord ; le sujet reste sur le site.', fil.name);

                return;
            }

            if (!(erreur instanceof ErreurSite && ['not_author', 'message_not_found'].includes(erreur.code))) {
                throw erreur;
            }
        }
    }

    private async filSupprime(fil: AnyThreadChannel): Promise<void> {
        const ctx = this.ctx;

        if (!ctx || !this.salon(ctx, fil.parentId)) {
            return;
        }

        const lien = await ctx.site.lien('topic', { discordId: fil.id });

        if (lien) {
            ctx.journal.warn('Forum : le fil « %s » a été supprimé sur Discord ; le sujet n° %d reste sur le site (à supprimer à la main au besoin).', fil.name, lien.site_id);
        }
    }

    /** Mode « à la demande » : la réaction choisie, posée par qui peut gérer les fils, publie le fil sur le site. */
    private async reaction(r: MessageReaction | PartialMessageReaction, u: User | PartialUser): Promise<void> {
        const ctx = this.ctx;

        if (!ctx) {
            return;
        }

        const reaction = r.partial ? await r.fetch().catch(() => null) : r;
        const utilisateur = u.partial ? await u.fetch().catch(() => null) : u;

        if (!reaction || !utilisateur || utilisateur.bot) {
            return;
        }

        const fil = await this.fil(ctx, reaction.message.channelId);
        const salon = fil ? this.salon(ctx, fil.parentId) : null;

        if (!fil || !salon || salon.mode !== 'reaction' || !this.memeEmoji(salon.emoji, reaction)) {
            return;
        }

        const membre: GuildMember | null = await ctx.guilde.members.fetch(utilisateur.id).catch(() => null);

        if (!membre || !fil.permissionsFor(membre)?.has(PermissionsBitField.Flags.ManageThreads)) {
            return;
        }

        if (!this.lisible(ctx) || (await ctx.site.lien('topic', { discordId: fil.id }))) {
            return;
        }

        const ouverture = await fil.fetchStarterMessage().catch(() => null);

        if (!ouverture) {
            ctx.journal.warn('Forum : le message d’ouverture du fil « %s » est introuvable, le fil n’est pas publié.', fil.name);

            return;
        }

        const sujet = await this.publierFil(ctx, fil, salon, ouverture);

        if (!sujet) {
            return;
        }

        // Puis le reste du fil, du plus ancien au plus récent.
        const suite = (await this.toutLeFil(fil)).filter((m) => m.id !== ouverture.id && !m.author.bot && !m.webhookId && !m.system);

        for (const m of suite) {
            await this.publierReponse(ctx, sujet.id, m);
        }

        ctx.journal.info('Forum : le fil « %s » est publié sur le site à la demande de %s (%d réponse(s)).', fil.name, utilisateur.tag, suite.length);
        await fil.send({ content: ctx.textes.dans(null, TEXTES.filPublie, `<${sujet.url}>`), allowedMentions: { parse: [] } }).catch(() => undefined);
    }

    private async publierFil(ctx: Contexte, fil: AnyThreadChannel, salon: SalonRelie, ouverture: Message): Promise<Sujet | null> {
        if (await ctx.site.lien('topic', { discordId: fil.id })) {
            return null;
        }

        const prefixe = prefixeDuFil(fil.appliedTags, correspondancesDuSalon(ctx.config.tags, salon.channel_id));
        const sujet = await ctx.site.creerSujet(salon.forum_id, Array.from(fil.name).slice(0, 100).join(''), this.contenuVersSite(ouverture) || fil.name, this.auteur(ouverture), prefixe ?? undefined);

        await ctx.site.lier('topic', sujet.id, fil.id);

        if (sujet.first_message_id) {
            await ctx.site.lier('message', sujet.first_message_id, ouverture.id);
        }

        ctx.journal.info('Forum : le fil « %s » est publié sur le site (sujet n° %d).', fil.name, sujet.id);

        return sujet;
    }

    /** Publie une réponse Discord sur le site ; rend vrai si elle y est maintenant (et ne l'était pas). */
    private async publierReponse(ctx: Contexte, sujetId: number, m: Message): Promise<boolean> {
        if (await ctx.site.lien('message', { discordId: m.id })) {
            return false;
        }

        const contenu = this.contenuVersSite(m);

        if (!contenu) {
            return false;
        }

        const cite = m.reference?.messageId ? await ctx.site.lien('message', { discordId: m.reference.messageId }) : null;

        try {
            const reponse = await ctx.site.repondre(sujetId, contenu, this.auteur(m), cite?.site_id);

            await ctx.site.lier('message', reponse.id, m.id);

            return true;
        } catch (erreur) {
            if (erreur instanceof ErreurSite && erreur.code === 'topic_locked') {
                ctx.journal.info('Forum : une réponse de %s n’est pas recopiée, le sujet n° %d est verrouillé sur le site.', m.author.tag, sujetId);

                return false;
            }

            throw erreur;
        }
    }

    // ── Outils ─────────────────────────────────────────────────────────────

    /** Les tâches d'un même fil passent l'une après l'autre ; une erreur va au journal. */
    private parFil(cle: string, tache: () => Promise<void>): void {
        void this.file.ajouter(cle, tache).catch((erreur: unknown) => this.erreur('Forum : %s', messageErreur(erreur)));
    }

    /** Le fil d'un salon relié où ce message compte, s'il en est un (ni bot, ni webhook, ni message système). */
    private filRelie(ctx: Contexte, m: Message): AnyThreadChannel | null {
        if (m.author.bot || m.webhookId || m.system || m.guildId !== ctx.guilde.id || !m.channel.isThread()) {
            return null;
        }

        return this.salon(ctx, m.channel.parentId) ? m.channel : null;
    }

    private salon(ctx: Contexte, salonId: string | null): SalonRelie | null {
        return salonId ? (ctx.config.channels.find((s) => s.channel_id === salonId) ?? null) : null;
    }

    private salonDuForum(ctx: Contexte, forumId: number): SalonRelie | null {
        return ctx.config.channels.find((s) => s.forum_id === forumId) ?? null;
    }

    private canal(ctx: Contexte, salon: SalonRelie): ForumChannel | null {
        const canal = ctx.guilde.channels.cache.get(salon.channel_id);

        return canal?.type === ChannelType.GuildForum ? canal : null;
    }

    private async fil(ctx: Contexte, id: string): Promise<AnyThreadChannel | null> {
        const canal = ctx.client.channels.cache.get(id) ?? (await ctx.client.channels.fetch(id).catch(() => null));

        return canal?.isThread() ? canal : null;
    }

    private webhook(canal: ForumChannel): Promise<Webhook> {
        return webhookDuSalon(canal, this.webhooks);
    }

    /** Le nom et l'avatar sous lesquels un message du site paraît sur Discord. */
    private signature(ctx: Contexte, message: MessageForum): Promise<{ nom: string; avatar: string | null }> {
        return signature(ctx.site, message.author, message.external_author?.name);
    }

    private auteur(m: Message): AuteurDiscord {
        return { discord: { id: m.author.id, username: m.member?.displayName ?? m.author.globalName ?? m.author.username, avatar: m.author.displayAvatarURL({ extension: 'png', size: 128 }) } };
    }

    private contenuVersSite(m: Message): string {
        return discordVersSite(m.cleanContent, [...m.attachments.values()].map((a) => ({ nom: a.name, url: a.url })), m.url);
    }

    /** Le compte Discord de l'auteur d'un message du site (quand Discord ne le dit plus : message effacé). */
    /**
     * L'auteur Discord d'un message supprimé que le bot n'avait plus en mémoire (après un redémarrage) :
     * Discord ne dit alors plus qui l'avait écrit. Seul un auteur Discord non lié vient forcément de
     * Discord ; le message d'un membre peut être la copie d'un message du site, qui doit rester.
     */
    private async discordDeLAuteur(ctx: Contexte, messageId: number): Promise<string | null> {
        const message = await ctx.site.message(messageId);

        return message?.external_author?.provider === 'discord' ? message.external_author.external_id : null;
    }

    private async toutLeFil(fil: AnyThreadChannel): Promise<Message[]> {
        const messages: Message[] = [];
        let avant: string | undefined;

        while (messages.length < FIL_MAX) {
            const lot = await fil.messages.fetch({ limit: 100, ...(avant ? { before: avant } : {}) });

            messages.push(...lot.values());

            if (lot.size < 100) {
                break;
            }

            avant = lot.last()?.id;
        }

        return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    }

    private memeEmoji(attendu: string, reaction: MessageReaction): boolean {
        const e = reaction.emoji;

        return attendu !== '' && (attendu === e.name || attendu === e.id || attendu === e.toString());
    }

    /** Le texte des messages Discord n'est lisible qu'avec l'intent « Message Content ». */
    private lisible(ctx: Contexte): boolean {
        if (!ctx.intents.content) {
            this.avertir(ctx, 'Forum : Discord → site en attente — activez « Message Content Intent » dans le portail des développeurs Discord, puis redémarrez le bot.');

            return false;
        }

        return true;
    }

    /** Le lien vers le site sous un sujet recopié — sauf si l'administration l'a retiré. */
    private finSujet(ctx: Contexte, sujet: Sujet): string {
        return ctx.reglages.lien_site === false ? '' : `-# [${ctx.textes.dans(null, TEXTES.surLeSite)}](<${sujet.url}>)`;
    }

    /**
     * Le rattrapage : ce qui s'est écrit sur Discord pendant que le bot était éteint (ou qu'une
     * fonctionnalité l'était). Les fils d'un salon « tout » qui n'ont pas de sujet sont publiés ; les
     * réponses récentes d'un fil relié qui manquent au site y sont ajoutées. Le sens site → Discord,
     * lui, se rattrape tout seul : le bot reprend le fil d'événements là où il l'avait laissé.
     */
    private async rattraper(ctx: Contexte, direQuandRien: boolean): Promise<void> {
        if (!ctx.config.channels.length || !this.lisible(ctx)) {
            return;
        }

        let sujets = 0;
        let reponses = 0;
        const actifs = await ctx.guilde.channels.fetchActiveThreads().catch(() => null);

        for (const salon of ctx.config.channels) {
            const canal = this.canal(ctx, salon);

            if (!canal) {
                continue;
            }

            const archives = await canal.threads.fetchArchived({ limit: RATTRAPAGE_FILS }).catch(() => null);
            const fils = [...(actifs?.threads.filter((f) => f.parentId === canal.id).values() ?? []), ...(archives?.threads.values() ?? [])].slice(0, RATTRAPAGE_FILS);
            const sujetsConnus = await ctx.site.liensConnus('topic', fils.map((f) => f.id));

            for (const fil of fils) {
                await this.file.ajouter(fil.id, async () => {
                    const sujetId = sujetsConnus.get(fil.id);

                    if (sujetId === undefined) {
                        if (salon.mode !== 'all') {
                            return;
                        }

                        const ouverture = await fil.fetchStarterMessage().catch(() => null);
                        const sujet = ouverture ? await this.publierFil(ctx, fil, salon, ouverture) : null;

                        if (!sujet) {
                            return;
                        }

                        sujets++;
                        reponses += await this.publierManquants(ctx, fil, sujet.id, ouverture?.id ?? fil.id);

                        return;
                    }

                    reponses += await this.publierManquants(ctx, fil, sujetId, fil.id);
                });
            }
        }

        if (sujets + reponses > 0 || direQuandRien) {
            ctx.journal.info('Forum : rattrapage terminé — %d sujet(s) et %d réponse(s) recopiés sur le site.', sujets, reponses);
        }
    }

    /** Les réponses récentes d'un fil qui manquent au site, publiées dans l'ordre ; rend leur nombre. */
    private async publierManquants(ctx: Contexte, fil: AnyThreadChannel, sujetId: number, ouvertureId: string): Promise<number> {
        const lot = await fil.messages.fetch({ limit: RATTRAPAGE_MESSAGES }).catch(() => null);
        const candidats = [...(lot?.values() ?? [])].filter((m) => m.id !== ouvertureId && !m.author.bot && !m.webhookId && !m.system).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const connus = await ctx.site.liensConnus('message', candidats.map((m) => m.id));
        let publies = 0;

        for (const m of candidats.filter((c) => !connus.has(c.id))) {
            if (await this.publierReponse(ctx, sujetId, m)) {
                publies++;
            }
        }

        return publies;
    }

    /** Ce qui empêche un salon relié de fonctionner, dit une fois par configuration. */
    private verifierSalons(ctx: Contexte): void {
        const moi = ctx.guilde.members.me;

        for (const salon of ctx.config.channels) {
            const canal = ctx.guilde.channels.cache.get(salon.channel_id);

            if (!canal) {
                this.avertir(ctx, 'Forum : le salon relié au forum n° %d n’existe plus sur le serveur.', salon.forum_id);
                continue;
            }

            if (canal.type !== ChannelType.GuildForum) {
                this.avertir(ctx, 'Forum : le salon « %s » n’est pas un salon Forum ; seul un salon Forum peut être relié à un forum du site.', canal.name);
                continue;
            }

            const permissions = moi ? canal.permissionsFor(moi) : null;
            const manquantes = PERMISSIONS_DU_SALON.filter(([, p]) => !permissions?.has(p)).map(([nom]) => nom);

            if (manquantes.length) {
                this.avertir(ctx, 'Forum : dans le salon « %s », il manque au bot les permissions : %s.', canal.name, manquantes.join(', '));
            }
        }

        // Le nombre de salons reliés se dit quand il change, pas à chaque réglage touché.
        if (ctx.config.channels.length && ctx.config.channels.length !== this.salonsDits) {
            ctx.journal.info('Forum : %d salon(s) relié(s) à un forum du site.', ctx.config.channels.length);
            this.lisible(ctx);
        }

        this.salonsDits = ctx.config.channels.length;
    }

    private avertir(ctx: Contexte, modele: string, ...args: Valeur[]): void {
        const cle = formater(modele, args);

        if (!this.avertis.has(cle)) {
            this.avertis.add(cle);
            ctx.journal.warn(modele, ...args);
        }
    }

    private erreur(modele: string, ...args: Valeur[]): void {
        this.ctx?.journal.error(modele, ...args);
    }
}
