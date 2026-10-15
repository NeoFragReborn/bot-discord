/**
 * Sanctions reliées (m03b) : une sanction du site s'applique au compte Discord relié du membre, et — quand c'est sûr —
 * une sanction prononcée sur Discord par un modérateur relié passe au site.
 *
 * Du site vers Discord (réglage « site_vers_discord ») : le muet devient une exclusion temporaire (renouvelée au-delà des
 * 28 jours que Discord permet), un bannissement temporaire un bannissement levé à l'échéance, un bannissement définitif
 * un bannissement. Seulement ceux de TOUT le site, effectifs : un avertissement, une restriction, un shadow ban ne
 * passent jamais. Une levée sur le site lève sur Discord ce que le bot y avait posé, et ce qui venait de Discord — rien
 * d'autre : un bannissement du bot se reconnaît à sa raison, qui porte le numéro de la sanction.
 *
 * De Discord vers le site (réglage « discord_vers_site », éteint par défaut) : le journal d'audit du serveur dit qui a
 * banni ou exclu. Si c'est un modérateur HUMAIN dont le compte Discord est relié à un compte du site qui en a le droit,
 * le site reçoit la sanction et la rejuge comme s'il l'avait prononcée chez lui (hiérarchie, validation). Sinon elle
 * reste sur Discord, et le journal le dit.
 *
 * Le bot relit toutes les sanctions en cours au démarrage, puis toutes les dix minutes : une échéance passée pendant
 * qu'il dormait, une levée entre-temps, un muet à renouveler sont rattrapés.
 */

import { AuditLogEvent, Events, GatewayIntentBits, PermissionFlagsBits, type Guild, type GuildAuditLogsEntry } from 'discord.js';
import { messageErreur } from '../../journal.js';
import { ErreurSite, type Evenement, type SanctionDiscord } from '../../site.js';
import type { Contexte, Fonctionnalite, Reglage } from '../types.js';
import { REFUS_ATTENDUS, application, exclusionAPoser, raisonDuBan, sanctionDuBan, versLeSite } from './regles.js';

/** Toutes les dix minutes : les échéances et les renouvellements se rattrapent à ce rythme. */
const INTERVALLE = 10 * 60_000;

/** Les droits Discord qu'il faut au rôle du bot, selon le sens. */
const DROITS_SITE_VERS_DISCORD = [['Bannir des membres', PermissionFlagsBits.BanMembers], ['Exclure temporairement des membres', PermissionFlagsBits.ModerateMembers]] as const;
const DROITS_DISCORD_VERS_SITE = [['Voir les logs du serveur', PermissionFlagsBits.ViewAuditLog]] as const;

export class SanctionsReliees implements Fonctionnalite {
    readonly nom = 'sanctions';
    readonly titre = 'Sanctions reliées';
    readonly description = 'Une sanction du site s’applique au compte Discord relié du membre : le muet devient une exclusion temporaire, un bannissement un bannissement. Et, si vous le voulez, une sanction prononcée sur Discord par un modérateur relié passe au site.';
    readonly defaut = false;
    readonly reglages = [
        { cle: 'site_vers_discord', type: 'bool', defaut: true, libelle: 'Appliquer sur Discord le muet et les bannissements de tout le site', aide: 'Il faut au rôle du bot les droits « Bannir des membres » et « Exclure temporairement des membres ».' },
        { cle: 'discord_vers_site', type: 'bool', defaut: false, libelle: 'Rapporter au site les sanctions prononcées sur Discord', aide: 'Seulement celles d’un modérateur dont le compte Discord est relié à un compte du site qui en a le droit ; le site les rejuge. Il faut au rôle du bot le droit « Voir les logs du serveur ».' },
    ] as const satisfies readonly Reglage[];
    readonly intents = [GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMembers] as const;
    readonly evenements = ['discord.sanction.created', 'discord.sanction.approved', 'discord.sanction.revoked'] as const;

    private ctx: Contexte | null = null;
    private dernierPassage = 0;
    private enCours = false;
    private avertis = new Set<string>();
    private surAudit: ((entree: GuildAuditLogsEntry, guilde: Guild) => void) | null = null;

    async demarrer(ctx: Contexte): Promise<void> {
        this.ctx = ctx;
        this.verifierDroits(ctx);

        this.surAudit = (entree, guilde) => {
            if (this.ctx && guilde.id === this.ctx.guilde.id && this.ctx.reglages.discord_vers_site === true) {
                void this.depuisDiscord(this.ctx, entree);
            }
        };
        ctx.client.on(Events.GuildAuditLogEntryCreate, this.surAudit);

        await this.resynchroniser(ctx);
    }

    reconfigurer(ctx: Contexte): void {
        this.ctx = ctx;
        this.avertis.clear();
        this.verifierDroits(ctx);
    }

    async tour(ctx: Contexte): Promise<void> {
        this.ctx = ctx;

        if (Date.now() - this.dernierPassage >= INTERVALLE) {
            await this.resynchroniser(ctx);
        }
    }

    arreter(): void {
        if (this.ctx && this.surAudit) {
            this.ctx.client.off(Events.GuildAuditLogEntryCreate, this.surAudit);
        }

        this.surAudit = null;
        this.ctx = null;
    }

    /** Un événement du fil du site : une sanction posée, validée ou levée. */
    async surEvenement(ctx: Contexte, evenement: Evenement): Promise<void> {
        if (ctx.reglages.site_vers_discord !== true) {
            return;
        }

        const d = evenement.data;
        const sanction: SanctionDiscord = {
            sanction_id: Number(d.sanction_id),
            user_id: Number(d.user_id),
            discord_id: String(d.discord_id ?? ''),
            type: String(d.type) as SanctionDiscord['type'],
            expires_at: d.expires_at === null || d.expires_at === undefined ? null : Number(d.expires_at),
            origine: d.origine === 'discord' ? 'discord' : 'site',
        };

        if (!/^\d+$/.test(sanction.discord_id) || !Number.isInteger(sanction.sanction_id)) {
            return;
        }

        try {
            if (evenement.type === 'discord.sanction.revoked') {
                await this.lever(ctx, sanction);
            } else if (sanction.origine === 'site') {
                // Une sanction venue de Discord y est déjà : la reposer ne servirait qu'à la doubler.
                await this.appliquer(ctx, sanction);
            }
        } catch (erreur) {
            this.erreur(ctx, sanction.discord_id, erreur);
        }
    }

    /** Remet Discord d'accord avec le site : les sanctions en cours appliquées, les bannissements du bot échus levés. */
    async resynchroniser(ctx: Contexte): Promise<void> {
        if (this.enCours || ctx.reglages.site_vers_discord !== true) {
            return;
        }

        this.enCours = true;
        this.dernierPassage = Date.now();

        try {
            const enCours = await ctx.site.sanctions();
            const actives = new Set<number>();

            for (const s of enCours) {
                actives.add(s.sanction_id);

                if (s.origine === 'site') {
                    await this.appliquer(ctx, s).catch((erreur: unknown) => this.erreur(ctx, s.discord_id, erreur));
                }
            }

            // Les bannissements que le bot a posés pour une sanction qui ne vaut plus : échue, ou levée pendant qu'il dormait.
            for (const ban of (await ctx.guilde.bans.fetch()).values()) {
                const numero = sanctionDuBan(ban.reason);

                if (numero !== null && !actives.has(numero)) {
                    await ctx.guilde.bans.remove(ban.user.id, raisonDuBan(numero, 'levée ou échue sur le site'));
                    ctx.journal.info('Sanctions : %s est débanni (sanction n° %d levée ou échue).', ban.user.username, numero);
                }
            }
        } catch (erreur) {
            ctx.journal.error('Sanctions : %s', messageErreur(erreur));
        } finally {
            this.enCours = false;
        }
    }

    private async appliquer(ctx: Contexte, s: SanctionDiscord): Promise<void> {
        const voulu = application(s, Date.now());

        if (voulu.faire === 'bannir') {
            const deja = await ctx.guilde.bans.fetch(s.discord_id).catch(() => null);

            if (!deja) {
                await ctx.guilde.bans.create(s.discord_id, { reason: raisonDuBan(s.sanction_id, 'sanction du site'), deleteMessageSeconds: 0 });
                ctx.journal.info('Sanctions : %s est banni du serveur (sanction n° %d du site).', s.discord_id, s.sanction_id);
            }

            return;
        }

        if (voulu.faire === 'exclure') {
            const membre = await ctx.guilde.members.fetch(s.discord_id).catch(() => null);

            // Pas sur le serveur : rien à exclure. Le tour suivant le rattrape s'il y revient.
            if (membre && exclusionAPoser(membre.communicationDisabledUntilTimestamp, voulu.jusqua, Date.now())) {
                await membre.disableCommunicationUntil(voulu.jusqua, raisonDuBan(s.sanction_id, 'muet du site'));
                ctx.journal.info('Sanctions : %s est exclu jusqu’au %s (sanction n° %d du site).', membre.displayName, new Date(voulu.jusqua).toISOString().slice(0, 16).replace('T', ' '), s.sanction_id);
            }
        }
    }

    private async lever(ctx: Contexte, s: SanctionDiscord): Promise<void> {
        if (s.type === 'mute') {
            const membre = await ctx.guilde.members.fetch(s.discord_id).catch(() => null);

            if (membre?.communicationDisabledUntilTimestamp && membre.communicationDisabledUntilTimestamp > Date.now()) {
                await membre.disableCommunicationUntil(null, raisonDuBan(s.sanction_id, 'levée sur le site'));
                ctx.journal.info('Sanctions : l’exclusion de %s est retirée (sanction n° %d levée).', membre.displayName, s.sanction_id);
            }

            return;
        }

        // Seulement le bannissement que le bot a posé pour CETTE sanction, ou celui d'un modérateur que le site a reçu.
        const ban = await ctx.guilde.bans.fetch(s.discord_id).catch(() => null);

        if (ban && (sanctionDuBan(ban.reason) === s.sanction_id || s.origine === 'discord')) {
            await ctx.guilde.bans.remove(s.discord_id, raisonDuBan(s.sanction_id, 'levée sur le site'));
            ctx.journal.info('Sanctions : %s est débanni (sanction n° %d levée ou échue).', ban.user.username, s.sanction_id);
        }
    }

    /** Une entrée du journal d'audit : bannir, débannir, exclure, retirer une exclusion. */
    private async depuisDiscord(ctx: Contexte, entree: GuildAuditLogsEntry): Promise<void> {
        const cible = entree.targetId ?? '';
        const executeur = entree.executorId ?? '';
        let action: 'ban' | 'unban' | 'timeout' | null = null;
        let jusqua: number | null = null;

        if (entree.action === AuditLogEvent.MemberBanAdd) {
            action = 'ban';
        } else if (entree.action === AuditLogEvent.MemberBanRemove) {
            action = 'unban';
        } else if (entree.action === AuditLogEvent.MemberUpdate) {
            const changement = entree.changes.find((c) => c.key === 'communication_disabled_until');

            if (!changement) {
                return;
            }

            action = 'timeout';
            jusqua = changement.new ? Date.parse(String(changement.new)) : null;
        }

        if (!action || !/^\d+$/.test(cible) || !/^\d+$/.test(executeur)) {
            return;
        }

        const verdict = versLeSite({ action, executeur, bot: ctx.client.user.id, jusqua }, Date.now());

        try {
            if (verdict.faire === 'sanctionner') {
                const r = await ctx.site.rapporterSanction({
                    target_discord_id: cible,
                    executor_discord_id: executeur,
                    type: verdict.type,
                    duration_seconds: verdict.duree,
                    reason: entree.reason ?? '',
                });

                ctx.journal.info('Sanctions : la sanction de %s par %s sur Discord est rapportée au site (n° %d).', cible, executeur, r.sanction_id);
            } else if (verdict.faire === 'lever') {
                // La sanction VENUE de Discord que ce geste lève : celle de ce membre, de ce type.
                const s = (await ctx.site.sanctions()).find((x) => x.discord_id === cible && x.origine === 'discord' && (verdict.type === 'mute' ? x.type === 'mute' : x.type !== 'mute'));

                if (s) {
                    await ctx.site.leverSanction(s.sanction_id, executeur);
                    ctx.journal.info('Sanctions : la levée sur Discord de la sanction n° %d est rapportée au site.', s.sanction_id);
                }
            }
        } catch (erreur) {
            if (erreur instanceof ErreurSite && (REFUS_ATTENDUS as readonly string[]).includes(erreur.code)) {
                ctx.journal.info('Sanctions : la sanction de %s par %s sur Discord reste sur Discord : %s', cible, executeur, erreur.message);
            } else {
                ctx.journal.error('Sanctions : %s', messageErreur(erreur));
            }
        }
    }

    /** Les droits du rôle du bot qui manquent pour ce qui est allumé : dit une fois, pas à chaque tour. */
    private verifierDroits(ctx: Contexte): void {
        const moi = ctx.guilde.members.me;
        const voulus = [
            ...(ctx.reglages.site_vers_discord === true ? DROITS_SITE_VERS_DISCORD : []),
            ...(ctx.reglages.discord_vers_site === true ? DROITS_DISCORD_VERS_SITE : []),
        ];

        for (const [nom, droit] of voulus) {
            if (moi && !moi.permissions.has(droit) && !this.avertis.has(nom)) {
                this.avertis.add(nom);
                ctx.journal.warn('Sanctions : le bot n’a pas le droit « %s » sur le serveur : donnez-le à son rôle pour appliquer les sanctions.', nom);
            }
        }
    }

    private erreur(ctx: Contexte, discordId: string, erreur: unknown): void {
        // Discord refuse de sanctionner le propriétaire du serveur, ou un membre placé au-dessus du bot.
        ctx.journal.warn('Sanctions : %s ne peut pas être sanctionné sur Discord (%s).', discordId, messageErreur(erreur));
    }
}
