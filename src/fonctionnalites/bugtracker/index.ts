/**
 * Bugtracker ↔ salon Forum de Discord (point 7, d'après un autre projet).
 *
 * Le Bugtracker reste la seule source. Chaque ticket a son fil dans le salon choisi (réglage
 * « salon ») : son type et son statut en sont les étiquettes, que le bot tient à jour quand le
 * ticket change sur le site ; le fil s'archive quand le ticket est clos. Les commentaires passent
 * dans les deux sens. Un ticket s'ouvre depuis Discord par /bug ou /idee (une fenêtre : titre,
 * description), ou en ouvrant un fil dans le salon — au nom du membre qui a lié son compte.
 */

import { ActionRowBuilder, ChannelType, Events, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, type AnyThreadChannel, type ChatInputCommandInteraction, type ForumChannel, type Interaction, type Message, type PartialMessage, type RESTPostAPIChatInputApplicationCommandsJSONBody, type Webhook } from 'discord.js';
import type { Textes } from '../../i18n.js';
import { formater, messageErreur, type Valeur } from '../../journal.js';
import { ErreurSite, type AuteurDiscord, type Evenement, type Ticket } from '../../site.js';
import { TEXTES } from '../../textes.js';
import { decrite, signature, webhookDuSalon } from '../commun.js';
import { FileParCle } from '../forum/file.js';
import { discordVersSite, tenirDansDiscord } from '../forum/markdown.js';
import type { Contexte, Fonctionnalite, Reglage } from '../types.js';
import { STATUTS_CLOS, etiquettesDuTicket, nomsDesEtiquettes, tousLesNoms, typeDesEtiquettes, type Noms } from './etiquettes.js';

const MODELES_PRIORITES: Record<Ticket['priority'], string> = {
    low: TEXTES.prioriteFaible,
    normal: TEXTES.prioriteNormale,
    high: TEXTES.prioriteHaute,
    critical: TEXTES.prioriteCritique,
};

export class SynchroBugtracker implements Fonctionnalite {
    readonly nom = 'bugtracker';
    readonly titre = 'Bugtracker';
    readonly description = 'Chaque ticket du Bugtracker devient un fil d’un salon Forum : son type et son statut en sont les étiquettes, les commentaires passent dans les deux sens, et /bug ou /idee ouvrent un ticket depuis Discord.';
    readonly defaut = false;
    readonly reglages = [
        { cle: 'salon', type: 'salon', defaut: '', salons: [15], libelle: 'Salon Forum des tickets', aide: 'Chaque ticket y devient un fil. Le bot y crée les étiquettes des types et des statuts.' },
        { cle: 'commandes', type: 'bool', defaut: true, libelle: 'Proposer /bug et /idee pour ouvrir un ticket depuis Discord' },
        { cle: 'rattrapage', type: 'bool', defaut: true, libelle: 'Donner aussi un fil aux tickets encore ouverts', aide: 'Au démarrage du bot et quand le salon change : les tickets ouverts qui n’ont pas encore de fil en reçoivent un.' },
    ] as const satisfies readonly Reglage[];
    readonly intents = [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] as const;
    readonly evenements = ['bugtracker.ticket.created', 'bugtracker.ticket.updated', 'bugtracker.ticket.deleted', 'bugtracker.comment.created', 'bugtracker.comment.edited', 'bugtracker.comment.deleted'] as const;

    private ctx: Contexte | null = null;
    private commandesActives = true;
    private webhooks = new Map<string, Webhook>();
    private file = new FileParCle();
    private avertis = new Set<string>();
    private salonPrecedent = '';
    private retraits: (() => void)[] = [];

    commandes(textes: Textes): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
        if (!this.commandesActives) {
            return [];
        }

        return [
            { name: 'bug', ...decrite(textes, TEXTES.cmdBug), dm_permission: false },
            { name: 'idee', ...decrite(textes, TEXTES.cmdIdee), dm_permission: false },
        ];
    }

    async demarrer(ctx: Contexte): Promise<void> {
        this.ctx = ctx;
        this.commandesActives = ctx.reglages.commandes !== false;

        const client = ctx.client;
        const surCree = (m: Message) => this.parFil(m.channelId, () => this.messageCree(m));
        const surModifie = (avant: Message | PartialMessage, apres: Message | PartialMessage) => this.parFil(apres.channelId, () => this.messageModifie(avant, apres));
        const surSupprime = (m: Message | PartialMessage) => this.parFil(m.channelId, () => this.messageSupprime(m));
        const surFilCree = (fil: AnyThreadChannel) => {
            if (this.ctx && fil.parentId === this.canal(this.ctx)?.id && !fil.joined && fil.joinable) {
                void fil.join().catch(() => undefined);
            }
        };
        // Le site fait foi : une étiquette changée à la main sur Discord est remise comme le dit le ticket.
        const surFilModifie = (avant: AnyThreadChannel, apres: AnyThreadChannel) => {
            if (avant.appliedTags.join() !== apres.appliedTags.join()) {
                this.parFil(apres.id, () => this.remettreEtiquettes(apres));
            }
        };

        client.on(Events.ThreadCreate, surFilCree);
        client.on(Events.ThreadUpdate, surFilModifie);
        client.on(Events.MessageCreate, surCree);
        client.on(Events.MessageUpdate, surModifie);
        client.on(Events.MessageDelete, surSupprime);

        this.retraits = [
            () => client.off(Events.ThreadCreate, surFilCree),
            () => client.off(Events.ThreadUpdate, surFilModifie),
            () => client.off(Events.MessageCreate, surCree),
            () => client.off(Events.MessageUpdate, surModifie),
            () => client.off(Events.MessageDelete, surSupprime),
        ];

        this.salonPrecedent = this.salonId(ctx);

        if ((await this.preparerSalon(ctx)) && ctx.reglages.rattrapage !== false) {
            // En arrière-plan : le bot ne fait pas attendre ses autres fonctionnalités.
            void this.rattraper(ctx).catch((e: unknown) => this.signaler(ctx, e));
        }
    }

    async reconfigurer(ctx: Contexte): Promise<void> {
        this.ctx = ctx;
        this.commandesActives = ctx.reglages.commandes !== false;
        this.avertis.clear();
        this.webhooks.clear();

        const nouveauSalon = this.salonId(ctx) !== this.salonPrecedent;

        this.salonPrecedent = this.salonId(ctx);

        if ((await this.preparerSalon(ctx)) && nouveauSalon && ctx.reglages.rattrapage !== false) {
            void this.rattraper(ctx).catch((e: unknown) => this.signaler(ctx, e));
        }
    }

    async resynchroniser(ctx: Contexte): Promise<void> {
        this.ctx = ctx;
        this.avertis.clear();
        this.webhooks.clear();

        if (await this.preparerSalon(ctx)) {
            await this.rattraper(ctx);
        }
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

    // ── /bug et /idee ──────────────────────────────────────────────────────

    async surCommande(ctx: Contexte, interaction: ChatInputCommandInteraction): Promise<void> {
        const t = (modele: string) => ctx.textes.dans(interaction.locale, modele).slice(0, 45);
        const idee = interaction.commandName === 'idee';
        const fenetre = new ModalBuilder().setCustomId(`bugtracker:${idee ? 'feature' : 'bug'}`).setTitle(t(idee ? TEXTES.fenetreIdee : TEXTES.fenetreBug));

        fenetre.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('titre').setLabel(t(TEXTES.champTitre)).setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(150).setRequired(true)),
            new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('description').setLabel(t(TEXTES.champDescription)).setPlaceholder(ctx.textes.dans(interaction.locale, TEXTES.champDescriptionAide).slice(0, 100)).setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(4000).setRequired(true)),
        );

        // La fenêtre doit être la toute première réponse : le lien du compte se vérifie à l'envoi.
        await interaction.showModal(fenetre);
    }

    async surInteraction(ctx: Contexte, interaction: Interaction): Promise<void> {
        if (!interaction.isModalSubmit()) {
            return;
        }

        const type: Ticket['type'] = interaction.customId === 'bugtracker:feature' ? 'feature' : 'bug';
        const t = (modele: string, ...args: Valeur[]) => ctx.textes.dans(interaction.locale, modele, ...args);

        await interaction.deferReply({ ephemeral: true });

        try {
            const ticket = await ctx.site.ouvrirTicket(interaction.fields.getTextInputValue('titre'), interaction.fields.getTextInputValue('description'), type, this.auteurDe(interaction.user.id, interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.username, interaction.user.displayAvatarURL({ extension: 'png', size: 128 })));
            const filId = await this.ticketVersDiscord(ctx, ticket.id);

            await interaction.editReply([t(TEXTES.ticketOuvert, ticket.id, `<${ticket.url}>`), filId ? t(TEXTES.ticketFil, `<#${filId}>`) : ''].filter(Boolean).join('\n'));
        } catch (erreur) {
            if (erreur instanceof ErreurSite && erreur.code === 'not_linked') {
                await interaction.editReply(t(TEXTES.ticketNonLie));

                return;
            }

            this.signaler(ctx, erreur);
            await interaction.editReply(t(erreur instanceof ErreurSite && erreur.code === 'unreachable' ? TEXTES.siteInjoignable : TEXTES.erreurCommande));
        }
    }

    // ── Site → Discord ─────────────────────────────────────────────────────

    async surEvenement(ctx: Contexte, evenement: Evenement): Promise<void> {
        this.ctx = ctx;

        if (!this.canal(ctx)) {
            return;
        }

        const proprePlume = evenement.source !== null && ctx.config.api_token_id !== null && evenement.source.token_id === ctx.config.api_token_id;
        const d = evenement.data;

        try {
            switch (evenement.type) {
                // Ouvert par le bot lui-même (/bug, ou un fil ouvert à la main) : ce fil-là existe déjà.
                case 'bugtracker.ticket.created':
                    if (!proprePlume) {
                        await this.ticketVersDiscord(ctx, Number(d.ticket_id));
                    }
                    break;
                case 'bugtracker.ticket.updated':
                    await this.majFil(ctx, Number(d.ticket_id), Array.isArray(d.fields) ? d.fields.map(String) : []);
                    break;
                case 'bugtracker.ticket.deleted':
                    await this.supprimerFil(ctx, Number(d.ticket_id));
                    break;
                case 'bugtracker.comment.created':
                    if (!proprePlume) {
                        await this.commentaireVersDiscord(ctx, Number(d.comment_id));
                    }
                    break;
                case 'bugtracker.comment.edited':
                    if (!proprePlume) {
                        await this.commentaireModifieVersDiscord(ctx, Number(d.comment_id));
                    }
                    break;
                case 'bugtracker.comment.deleted':
                    if (!proprePlume) {
                        await this.commentaireSupprimeVersDiscord(ctx, Number(d.comment_id), Number(d.ticket_id));
                    }
                    break;
            }
        } catch (erreur) {
            this.signaler(ctx, erreur);
        }
    }

    /**
     * Le fil d'un ticket : celui qu'il a déjà, sinon un nouveau. Rend l'identifiant du fil (NULL : pas
     * de salon). Un ticket à la fois : /bug, le fil d'événements et le rattrapage peuvent le demander
     * en même temps, et le ticket n'aura qu'un fil.
     */
    private async ticketVersDiscord(ctx: Contexte, ticketId: number): Promise<string | null> {
        let filId: string | null = null;

        await this.file.ajouter(`ticket:${ticketId}`, async () => {
            filId = await this.creerFil(ctx, ticketId);
        });

        return filId;
    }

    private async creerFil(ctx: Contexte, ticketId: number): Promise<string | null> {
        const canal = this.canal(ctx);
        const deja = await ctx.site.lien('ticket', { siteId: ticketId });

        if (!canal || deja) {
            return deja?.discord_id ?? null;
        }

        const ticket = await ctx.site.ticket(ticketId);

        if (!ticket) {
            return null;
        }

        const noms = this.noms(ctx);
        const sign = await signature(ctx.site, ticket.author);
        const webhook = await webhookDuSalon(canal, this.webhooks);
        const envoye = await webhook.send({
            content: tenirDansDiscord(ticket.description, this.ligneTicket(ctx, ticket), this.ligneTicket(ctx, ticket)),
            username: sign.nom,
            ...(sign.avatar ? { avatarURL: sign.avatar } : {}),
            threadName: Array.from(`#${ticket.id} — ${ticket.title}`).slice(0, 100).join(''),
            appliedTags: etiquettesDuTicket(canal.availableTags, noms, ticket.type, ticket.status),
            allowedMentions: { parse: [] },
        });

        await ctx.site.lier('ticket', ticket.id, envoye.channelId);
        ctx.journal.info('Bugtracker : le ticket n° %d est publié sur Discord.', ticket.id);

        if (STATUTS_CLOS.includes(ticket.status)) {
            const fil = await this.fil(ctx, envoye.channelId);

            await fil?.setArchived(true, 'NeoFrag : ticket clos').catch(() => undefined);
        }

        return envoye.channelId;
    }

    /** Le ticket a changé sur le site : étiquettes, titre, description, archivage suivent. */
    private async majFil(ctx: Contexte, ticketId: number, champs: readonly string[]): Promise<void> {
        const canal = this.canal(ctx);
        const lien = await ctx.site.lien('ticket', { siteId: ticketId });
        const fil = lien ? await this.fil(ctx, lien.discord_id) : null;
        const ticket = fil ? await ctx.site.ticket(ticketId) : null;

        if (!canal || !fil || !ticket) {
            // Un ticket d'avant la fonctionnalité, qui vient de changer : il a maintenant son fil.
            if (canal && !lien) {
                await this.ticketVersDiscord(ctx, ticketId);
            }

            return;
        }

        // Un fil archivé ne se modifie pas : on le rouvre le temps de le mettre à jour.
        if (fil.archived) {
            await fil.setArchived(false, 'NeoFrag : ticket modifié');
        }

        const voulues = etiquettesDuTicket(canal.availableTags, this.noms(ctx), ticket.type, ticket.status);

        if (voulues.join() !== fil.appliedTags.join()) {
            await fil.setAppliedTags(voulues, 'NeoFrag : statut du ticket');
        }

        const nom = Array.from(`#${ticket.id} — ${ticket.title}`).slice(0, 100).join('');

        if (champs.includes('title') && fil.name !== nom) {
            await fil.setName(nom, 'NeoFrag : titre du ticket');
        }

        if (champs.includes('description') || champs.includes('priority') || champs.includes('type')) {
            const webhook = await webhookDuSalon(canal, this.webhooks);
            const ouverture = await fil.fetchStarterMessage().catch(() => null);

            if (ouverture && ouverture.webhookId === webhook.id) {
                await webhook.editMessage(ouverture.id, { content: tenirDansDiscord(ticket.description, this.ligneTicket(ctx, ticket), this.ligneTicket(ctx, ticket)), threadId: fil.id });
            }
        }

        if (champs.includes('status') && ticket.status === 'duplicate' && ticket.duplicate_of) {
            const origine = await ctx.site.ticket(ticket.duplicate_of);

            if (origine) {
                await fil.send({ content: ctx.textes.dans(null, TEXTES.ticketDoublon, origine.id, `<${origine.url}>`), allowedMentions: { parse: [] } });
            }
        }

        if (STATUTS_CLOS.includes(ticket.status)) {
            await fil.setArchived(true, 'NeoFrag : ticket clos');
        }
    }

    private async supprimerFil(ctx: Contexte, ticketId: number): Promise<void> {
        const lien = await ctx.site.lien('ticket', { siteId: ticketId });
        const fil = lien ? await this.fil(ctx, lien.discord_id) : null;

        if (fil) {
            await fil.delete('NeoFrag : ticket supprimé sur le site');
            ctx.journal.info('Bugtracker : le ticket n° %d est supprimé sur le site, son fil aussi.', ticketId);
        }
    }

    private async commentaireVersDiscord(ctx: Contexte, commentaireId: number): Promise<void> {
        const canal = this.canal(ctx);

        if (!canal || (await ctx.site.lien('comment', { siteId: commentaireId }))) {
            return;
        }

        const commentaire = await ctx.site.commentaireTicket(commentaireId);

        if (!commentaire) {
            return;
        }

        const filId = await this.ticketVersDiscord(ctx, commentaire.ticket_id);
        const fil = filId ? await this.fil(ctx, filId) : null;

        if (!fil) {
            return;
        }

        // Écrire dans un fil archivé le rouvre : la discussion reprend.
        if (fil.archived) {
            await fil.setArchived(false, 'NeoFrag : nouveau commentaire');
        }

        const sign = await signature(ctx.site, commentaire.author, commentaire.external_author?.name);
        const webhook = await webhookDuSalon(canal, this.webhooks);
        const envoye = await webhook.send({ content: tenirDansDiscord(commentaire.content, '', ''), username: sign.nom, ...(sign.avatar ? { avatarURL: sign.avatar } : {}), threadId: fil.id, allowedMentions: { parse: [] } });

        await ctx.site.lier('comment', commentaire.id, envoye.id);
    }

    private async commentaireModifieVersDiscord(ctx: Contexte, commentaireId: number): Promise<void> {
        const canal = this.canal(ctx);
        const lien = await ctx.site.lien('comment', { siteId: commentaireId });
        const commentaire = lien ? await ctx.site.commentaireTicket(commentaireId) : null;
        const lienTicket = commentaire ? await ctx.site.lien('ticket', { siteId: commentaire.ticket_id }) : null;

        if (!canal || !lien || !commentaire || !lienTicket) {
            return;
        }

        const webhook = await webhookDuSalon(canal, this.webhooks);
        const fil = await this.fil(ctx, lienTicket.discord_id);
        const message = fil ? await fil.messages.fetch(lien.discord_id).catch(() => null) : null;

        if (fil && message?.webhookId === webhook.id) {
            await webhook.editMessage(lien.discord_id, { content: tenirDansDiscord(commentaire.content, '', ''), threadId: fil.id });
        }
    }

    private async commentaireSupprimeVersDiscord(ctx: Contexte, commentaireId: number, ticketId: number): Promise<void> {
        const lien = await ctx.site.lien('comment', { siteId: commentaireId });
        const lienTicket = lien ? await ctx.site.lien('ticket', { siteId: ticketId }) : null;
        const fil = lienTicket ? await this.fil(ctx, lienTicket.discord_id) : null;
        const message = fil && lien ? await fil.messages.fetch(lien.discord_id).catch(() => null) : null;

        await message?.delete().catch(() => undefined);
    }

    // ── Discord → site ─────────────────────────────────────────────────────

    private async messageCree(m: Message): Promise<void> {
        const ctx = this.ctx;

        if (!ctx || m.author.bot || m.webhookId || m.system || !m.channel.isThread() || m.channel.parentId !== this.canal(ctx)?.id || !ctx.intents.content) {
            return;
        }

        const fil = m.channel;
        const lien = await ctx.site.lien('ticket', { discordId: fil.id });

        // Le message d'ouverture d'un fil ouvert à la main : il devient un ticket, au nom du membre lié.
        if (m.id === fil.id) {
            if (!lien) {
                await this.filVersTicket(ctx, fil, m);
            }

            return;
        }

        if (!lien || (await ctx.site.lien('comment', { discordId: m.id }))) {
            return;
        }

        const contenu = discordVersSite(m.cleanContent, [...m.attachments.values()].map((a) => ({ nom: a.name, url: a.url })), m.url);

        if (contenu) {
            const commentaire = await ctx.site.commenterTicket(lien.site_id, contenu, this.auteurDe(m.author.id, m.member?.displayName ?? m.author.globalName ?? m.author.username, m.author.displayAvatarURL({ extension: 'png', size: 128 })));

            await ctx.site.lier('comment', commentaire.id, m.id);
        }
    }

    /** Un fil ouvert à la main dans le salon des tickets : un ticket si l'auteur a lié son compte, sinon le mode d'emploi. */
    private async filVersTicket(ctx: Contexte, fil: AnyThreadChannel, ouverture: Message): Promise<void> {
        const canal = this.canal(ctx);

        if (!canal) {
            return;
        }

        const noms = this.noms(ctx);
        const type = typeDesEtiquettes(fil.appliedTags, canal.availableTags, noms);

        try {
            const ticket = await ctx.site.ouvrirTicket(fil.name, discordVersSite(ouverture.cleanContent, [...ouverture.attachments.values()].map((a) => ({ nom: a.name, url: a.url })), ouverture.url) || fil.name, type, this.auteurDe(ouverture.author.id, ouverture.member?.displayName ?? ouverture.author.username, ouverture.author.displayAvatarURL({ extension: 'png', size: 128 })));

            await ctx.site.lier('ticket', ticket.id, fil.id);
            await fil.setAppliedTags(etiquettesDuTicket(canal.availableTags, noms, ticket.type, ticket.status), 'NeoFrag : ticket ouvert').catch(() => undefined);
            await fil.send({ content: ctx.textes.dans(null, TEXTES.filDevientTicket, ticket.id, `<${ticket.url}>`), allowedMentions: { parse: [] } });
            ctx.journal.info('Bugtracker : le fil « %s » devient le ticket n° %d.', fil.name, ticket.id);
        } catch (erreur) {
            if (erreur instanceof ErreurSite && erreur.code === 'not_linked') {
                await fil.send({ content: ctx.textes.dans(null, TEXTES.filNonLie), allowedMentions: { parse: [] } });

                return;
            }

            throw erreur;
        }
    }

    private async messageModifie(avant: Message | PartialMessage, apres: Message | PartialMessage): Promise<void> {
        const ctx = this.ctx;
        const m = apres.partial ? await apres.fetch().catch(() => null) : apres;

        if (!ctx || !m || m.author.bot || m.webhookId || !m.channel.isThread() || m.channel.parentId !== this.canal(ctx)?.id || (!avant.partial && avant.content === m.content)) {
            return;
        }

        const lien = await ctx.site.lien('comment', { discordId: m.id });
        const contenu = discordVersSite(m.cleanContent, [...m.attachments.values()].map((a) => ({ nom: a.name, url: a.url })), m.url);

        if (lien && contenu) {
            await ctx.site.modifierCommentaireTicket(lien.site_id, contenu, this.auteurDe(m.author.id)).catch((e: unknown) => this.ignorerSiPasAuteur(e));
        }
    }

    private async messageSupprime(m: Message | PartialMessage): Promise<void> {
        const ctx = this.ctx;

        // Une copie postée par le webhook, effacée sur Discord : le commentaire du site, lui, reste.
        if (!ctx || m.webhookId || m.author?.bot) {
            return;
        }

        const fil = await this.fil(ctx, m.channelId);

        if (!fil || fil.parentId !== this.canal(ctx)?.id) {
            return;
        }

        const lien = await ctx.site.lien('comment', { discordId: m.id });
        // Un message que le bot n'avait plus en mémoire : seul un auteur Discord non lié vient
        // forcément de Discord (celui d'un membre peut être la copie d'un commentaire du site).
        const commentaire = lien && !m.author ? await ctx.site.commentaireTicket(lien.site_id) : null;
        const discordId = m.author?.id ?? (commentaire?.external_author?.provider === 'discord' ? commentaire.external_author.external_id : undefined);

        if (lien && discordId) {
            await ctx.site.supprimerCommentaireTicket(lien.site_id, this.auteurDe(discordId)).catch((e: unknown) => this.ignorerSiPasAuteur(e));
        }
    }

    /** Une étiquette changée à la main sur un fil de ticket : le bot remet celles que dit le ticket. */
    private async remettreEtiquettes(fil: AnyThreadChannel): Promise<void> {
        const ctx = this.ctx;
        const canal = ctx ? this.canal(ctx) : null;

        if (!ctx || !canal || fil.parentId !== canal.id || fil.archived) {
            return;
        }

        const lien = await ctx.site.lien('ticket', { discordId: fil.id });
        const ticket = lien ? await ctx.site.ticket(lien.site_id) : null;

        if (!ticket) {
            return;
        }

        const voulues = etiquettesDuTicket(canal.availableTags, this.noms(ctx), ticket.type, ticket.status);

        if (voulues.join() !== fil.appliedTags.join()) {
            await fil.setAppliedTags(voulues, 'NeoFrag : le Bugtracker fait foi');
        }
    }

    /** Les tickets encore ouverts qui n'ont pas de fil en reçoivent un. */
    private async rattraper(ctx: Contexte): Promise<void> {
        let apres = 0;
        let publies = 0;

        for (;;) {
            const lot = await ctx.site.tickets(apres, true);

            for (const ticket of lot.tickets) {
                if (!this.canal(ctx)) {
                    return;
                }

                if (!(await ctx.site.lien('ticket', { siteId: ticket.id }))) {
                    await this.ticketVersDiscord(ctx, ticket.id);
                    publies++;
                }
            }

            if (!lot.more) {
                break;
            }

            apres = lot.next;
        }

        if (publies) {
            ctx.journal.info('Bugtracker : %d ticket(s) ouvert(s) ont reçu leur fil.', publies);
        }
    }

    // ── Outils ─────────────────────────────────────────────────────────────

    /** Le salon choisi, s'il convient : il reçoit les étiquettes des types et des statuts qui lui manquent. */
    private async preparerSalon(ctx: Contexte): Promise<boolean> {
        const id = this.salonId(ctx);

        if (!id) {
            this.avertir(ctx, 'Bugtracker : choisissez le salon Forum des tickets dans l’administration (Discord → Fonctionnalités → Bugtracker).');

            return false;
        }

        const canal = ctx.guilde.channels.cache.get(id);

        if (!canal || canal.type !== ChannelType.GuildForum) {
            this.avertir(ctx, 'Bugtracker : le salon choisi n’existe plus ou n’est pas un salon Forum.');

            return false;
        }

        if (this.salonDuForum(ctx)) {
            this.avertir(ctx, 'Bugtracker : le salon « %s » est déjà relié à un forum du site ; choisissez-en un autre pour les tickets.', canal.name);

            return false;
        }

        const existantes = canal.availableTags.map((t) => t.name.toLowerCase());
        const manquantes = tousLesNoms(this.noms(ctx)).filter((n) => !existantes.includes(n.toLowerCase())).slice(0, 20 - canal.availableTags.length);

        if (manquantes.length) {
            try {
                await canal.setAvailableTags([...canal.availableTags.map((t) => ({ id: t.id, name: t.name, moderated: t.moderated, emoji: t.emoji })), ...manquantes.map((name) => ({ name }))], 'NeoFrag : étiquettes du Bugtracker');
                ctx.journal.info('Bugtracker : étiquettes créées dans le salon : %s.', manquantes.join(', '));
            } catch (erreur) {
                this.avertir(ctx, 'Bugtracker : %s', messageErreur(erreur));
            }
        }

        return true;
    }

    private salonId(ctx: Contexte): string {
        return String(ctx.reglages.salon ?? '');
    }

    /** Le salon des tickets ; NULL s'il manque, s'il n'est pas un salon Forum, ou s'il sert déjà au forum du site. */
    private canal(ctx: Contexte): ForumChannel | null {
        const canal = ctx.guilde.channels.cache.get(this.salonId(ctx));

        return canal?.type === ChannelType.GuildForum && !this.salonDuForum(ctx) ? canal : null;
    }

    private salonDuForum(ctx: Contexte): boolean {
        return ctx.config.channels.some((s) => s.channel_id === this.salonId(ctx));
    }

    private async fil(ctx: Contexte, id: string): Promise<AnyThreadChannel | null> {
        const canal = ctx.client.channels.cache.get(id) ?? (await ctx.client.channels.fetch(id).catch(() => null));

        return canal?.isThread() ? canal : null;
    }

    private noms(ctx: Contexte): Noms {
        return nomsDesEtiquettes((modele) => ctx.textes.dans(null, modele));
    }

    /** La ligne sous un ticket recopié : son numéro, son type, sa priorité, et le lien vers le site. */
    private ligneTicket(ctx: Contexte, ticket: Ticket): string {
        const ligne = ctx.textes.dans(null, TEXTES.ticketLigne, ticket.id, this.noms(ctx).types[ticket.type], ctx.textes.dans(null, MODELES_PRIORITES[ticket.priority]));

        return `-# ${ligne} · [${ctx.textes.dans(null, TEXTES.surLeSite)}](<${ticket.url}>)`;
    }

    private auteurDe(id: string, pseudo?: string, avatar?: string): AuteurDiscord {
        return { discord: { id, ...(pseudo ? { username: pseudo } : {}), ...(avatar ? { avatar } : {}) } };
    }

    private ignorerSiPasAuteur(erreur: unknown): void {
        if (!(erreur instanceof ErreurSite && ['not_author', 'comment_not_found'].includes(erreur.code))) {
            throw erreur;
        }
    }

    /** Une erreur du site dite clairement : les droits manquants d'une clé ancienne, le module absent. */
    private signaler(ctx: Contexte, erreur: unknown): void {
        if (erreur instanceof ErreurSite && erreur.statut === 403) {
            this.avertir(ctx, 'Bugtracker : la clé d’accès du bot n’a pas les droits du Bugtracker ; créez-en une nouvelle dans l’administration (Discord → Clé d’accès du bot).');
        } else if (erreur instanceof ErreurSite && erreur.code === 'module_unavailable') {
            this.avertir(ctx, 'Bugtracker : le Bugtracker n’est pas installé sur le site.');
        } else {
            ctx.journal.error('Bugtracker : %s', messageErreur(erreur));
        }
    }

    private parFil(cle: string, tache: () => Promise<void>): void {
        void this.file.ajouter(cle, tache).catch((erreur: unknown) => {
            if (this.ctx) {
                this.signaler(this.ctx, erreur);
            }
        });
    }

    private avertir(ctx: Contexte, modele: string, ...args: Valeur[]): void {
        const cle = formater(modele, args);

        if (!this.avertis.has(cle)) {
            this.avertis.add(cle);
            ctx.journal.warn(modele, ...args);
        }
    }
}
