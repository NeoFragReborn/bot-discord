/**
 * Rôles temporaires : la commande `/role`.
 *
 * - `/role give` : donner un rôle à un membre pour une durée — une sanction, un accès d'essai, un
 *   rôle d'événement — avec une raison si l'on veut ;
 * - `/role remove` : le retirer tout de suite ;
 * - `/role list` : ceux en cours, pour tout le serveur ou pour un membre.
 *
 * Réservée à qui peut « Gérer les rôles », et comme Discord le fait pour ce droit : on ne donne pas un
 * rôle égal ou supérieur au sien. Un rôle relié à un groupe du site est refusé : la synchronisation des
 * groupes le donne et le retire déjà.
 *
 * Le site garde la liste (Discord → Rôles temporaires, dans l'administration) : un redémarrage du bot
 * ne perd rien. Le bot retire chaque rôle à son échéance, vérifiée chaque minute ; il le redonne à un
 * membre qui quitte puis rejoint le serveur avant la fin, si l'option est cochée.
 */

import { ApplicationCommandOptionType, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction, type GuildMember, type RESTPostAPIChatInputApplicationCommandsJSONBody, type User } from 'discord.js';
import type { Textes } from '../../i18n.js';
import { formater, messageErreur, type Valeur } from '../../journal.js';
import { ErreurSite } from '../../site.js';
import { TEXTES } from '../../textes.js';
import { decrite } from '../commun.js';
import type { Contexte, Fonctionnalite, Reglage } from '../types.js';
import { enSecondes, refus } from './regles.js';

/** Toutes les minutes : les échéances se vérifient à ce rythme. */
const INTERVALLE = 60_000;

const UNITES = [
    ['minutes', TEXTES.uniteMinutes],
    ['hours', TEXTES.uniteHeures],
    ['days', TEXTES.uniteJours],
    ['weeks', TEXTES.uniteSemaines],
] as const;

type Traduire = (modele: string, ...args: Valeur[]) => string;

export class RolesTemporaires implements Fonctionnalite {
    readonly nom = 'roles-temporaires';
    readonly titre = 'Rôles temporaires';
    readonly description = 'La commande /role : donner un rôle pour un temps limité — une sanction, un accès d’essai, un rôle d’événement. Le bot le retire à la fin, même après un redémarrage.';
    readonly defaut = false;
    readonly reglages = [
        { cle: 'duree_max', type: 'int', defaut: 90, min: 1, max: 365, libelle: 'Durée maximale d’un rôle temporaire, en jours' },
        { cle: 'reattribuer', type: 'bool', defaut: true, libelle: 'Redonner le rôle à un membre qui quitte puis rejoint le serveur avant la fin' },
    ] as const satisfies readonly Reglage[];
    readonly intents = [GatewayIntentBits.GuildMembers] as const;

    private ctx: Contexte | null = null;
    private dernierPassage = 0;
    private enCours = false;
    private avertis = new Set<string>();
    private surArrivee: ((membre: GuildMember) => void) | null = null;

    commandes(textes: Textes): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
        const membre = (modele: string, required: boolean) => ({ type: ApplicationCommandOptionType.User as const, name: 'member', ...decrite(textes, modele), required });
        const role = { type: ApplicationCommandOptionType.Role as const, name: 'role', ...decrite(textes, TEXTES.optRole), required: true };
        const unites = UNITES.map(([value, modele]) => {
            const { defaut, locales } = textes.localisations(modele);

            return { name: defaut, name_localizations: locales, value };
        });

        return [{
            name: 'role',
            ...decrite(textes, TEXTES.cmdRole),
            dm_permission: false,
            default_member_permissions: PermissionFlagsBits.ManageRoles.toString(),
            options: [
                {
                    type: ApplicationCommandOptionType.Subcommand,
                    name: 'give',
                    ...decrite(textes, TEXTES.cmdRoleDonner),
                    options: [
                        membre(TEXTES.optMembre, true),
                        role,
                        { type: ApplicationCommandOptionType.Integer, name: 'duration', ...decrite(textes, TEXTES.optDuree), required: true, min_value: 1, max_value: 1000 },
                        { type: ApplicationCommandOptionType.String, name: 'unit', ...decrite(textes, TEXTES.optUnite), required: true, choices: unites },
                        { type: ApplicationCommandOptionType.String, name: 'reason', ...decrite(textes, TEXTES.optRaison), required: false, max_length: 200 },
                    ],
                },
                { type: ApplicationCommandOptionType.Subcommand, name: 'remove', ...decrite(textes, TEXTES.cmdRoleRetirer), options: [membre(TEXTES.optMembre, true), role] },
                { type: ApplicationCommandOptionType.Subcommand, name: 'list', ...decrite(textes, TEXTES.cmdRoleListe), options: [membre(TEXTES.optMembreListe, false)] },
            ],
        }];
    }

    async demarrer(ctx: Contexte): Promise<void> {
        this.ctx = ctx;
        this.surArrivee = (m) => {
            if (this.ctx && m.guild.id === this.ctx.guilde.id && this.ctx.reglages.reattribuer !== false) {
                const c = this.ctx;

                void this.revenu(c, m).catch((e: unknown) => c.journal.error('Rôles temporaires : %s', messageErreur(e)));
            }
        };
        ctx.client.on(Events.GuildMemberAdd, this.surArrivee);

        await this.tour(ctx);
    }

    reconfigurer(ctx: Contexte): void {
        this.ctx = ctx;
        this.avertis.clear();
    }

    async tour(ctx: Contexte): Promise<void> {
        this.ctx = ctx;

        if (this.enCours || Date.now() - this.dernierPassage < INTERVALLE) {
            return;
        }

        this.enCours = true;
        this.dernierPassage = Date.now();

        try {
            await this.retirerEchus(ctx);
        } catch (erreur) {
            this.avertir(ctx, 'Rôles temporaires : %s', messageErreur(erreur));
        } finally {
            this.enCours = false;
        }
    }

    arreter(): void {
        if (this.ctx && this.surArrivee) {
            this.ctx.client.off(Events.GuildMemberAdd, this.surArrivee);
        }

        this.surArrivee = null;
        this.ctx = null;
    }

    async surCommande(ctx: Contexte, interaction: ChatInputCommandInteraction): Promise<void> {
        const t: Traduire = (modele, ...args) => ctx.textes.dans(interaction.locale, modele, ...args);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const sous = interaction.options.getSubcommand(true);

            if (sous === 'list') {
                await interaction.editReply({ content: await this.liste(ctx, interaction.options.getUser('member'), t), allowedMentions: { parse: [] } });

                return;
            }

            const cible = interaction.options.getUser('member', true);
            const roleId = interaction.options.getRole('role', true).id;
            const role = ctx.guilde.roles.cache.get(roleId);
            const auteur = interaction.inCachedGuild() ? interaction.member : null;
            const moi = ctx.guilde.members.me;
            const pourquoiPas = refus({
                roleId,
                guildeId: ctx.guilde.id,
                gere: role?.managed ?? true,
                relies: ctx.config.roles.map((r) => r.role_id),
                positionRole: role?.position ?? Number.MAX_SAFE_INTEGER,
                positionBot: moi?.roles.highest.position ?? 0,
                positionAuteur: interaction.user.id === ctx.guilde.ownerId ? null : (auteur?.roles.highest.position ?? 0),
            });

            if (pourquoiPas) {
                await interaction.editReply(t(pourquoiPas));

                return;
            }

            const membre = await ctx.guilde.members.fetch(cible.id).catch(() => null);
            const par = auteur?.displayName ?? interaction.user.username;

            if (sous === 'remove') {
                const entree = (await ctx.site.rolesTemporaires(cible.id)).find((r) => r.role_id === roleId);

                if (!entree) {
                    await interaction.editReply(t(TEXTES.pasTemporaire));

                    return;
                }

                if (membre?.roles.cache.has(roleId)) {
                    await membre.roles.remove(roleId, `NeoFrag : rôle temporaire retiré par ${par}`);
                }

                await ctx.site.retirerRoleTemporaire(entree.timed_id);
                ctx.journal.info('Rôles temporaires : %s retire le rôle « %s » à %s.', par, role?.name ?? roleId, membre?.displayName ?? cible.username);
                await interaction.editReply({ content: t(TEXTES.roleRetire, `<@&${roleId}>`, `<@${cible.id}>`), allowedMentions: { parse: [] } });

                return;
            }

            // /role give
            if (cible.bot) {
                await interaction.editReply(t(TEXTES.membreBot));

                return;
            }

            if (!membre) {
                await interaction.editReply(t(TEXTES.membreAbsent));

                return;
            }

            const secondes = enSecondes(interaction.options.getInteger('duration', true), interaction.options.getString('unit', true));
            const maxJours = Number(ctx.reglages.duree_max ?? 90);

            if (secondes < 60 || secondes > maxJours * 86_400) {
                await interaction.editReply(t(TEXTES.dureeTropLongue, maxJours));

                return;
            }

            const raison = (interaction.options.getString('reason') ?? '').trim();
            const entree = await ctx.site.donnerRoleTemporaire({ discord_id: cible.id, username: membre.displayName, role_id: roleId, duration: secondes, given_by: interaction.user.id, given_by_name: par, reason: raison });

            try {
                await membre.roles.add(roleId, `NeoFrag : rôle temporaire donné par ${par}${raison ? ` (${raison})` : ''}`.slice(0, 500));
            } catch (erreur) {
                // Sans le rôle sur Discord, la ligne du site ne veut rien dire.
                await ctx.site.retirerRoleTemporaire(entree.timed_id).catch(() => undefined);
                throw erreur;
            }

            ctx.journal.info('Rôles temporaires : %s donne le rôle « %s » à %s.', par, role?.name ?? roleId, membre.displayName);
            await interaction.editReply({ content: t(TEXTES.roleDonne, `<@&${roleId}>`, `<@${cible.id}>`, `<t:${entree.expires_at}:f>`, `<t:${entree.expires_at}:R>`), allowedMentions: { parse: [] } });
        } catch (erreur) {
            await interaction.editReply(this.expliquer(ctx, erreur, t));
        }
    }

    /** Les rôles temporaires en cours, une ligne chacun : rôle, membre, fin (dans le fuseau de qui lit). */
    private async liste(ctx: Contexte, membre: User | null, t: Traduire): Promise<string> {
        const lignes = (await ctx.site.rolesTemporaires(membre?.id)).map((r) => t(TEXTES.ligneTemporaire, `<@&${r.role_id}>`, `<@${r.discord_id}>`, `<t:${r.expires_at}:R>`));

        if (!lignes.length) {
            return t(TEXTES.aucunTemporaire);
        }

        // Un message Discord tient en 2 000 caractères.
        const texte = lignes.join('\n');

        return texte.length <= 2_000 ? texte : `${texte.slice(0, 1_990).replace(/\n[^\n]*$/, '')}\n…`;
    }

    /** Les rôles arrivés à échéance : retirés du membre (s'il l'a encore), puis de la liste du site. */
    private async retirerEchus(ctx: Contexte): Promise<void> {
        for (const r of await ctx.site.rolesTemporaires(undefined, true)) {
            const role = ctx.guilde.roles.cache.get(r.role_id);
            // Un membre parti du serveur, ou un rôle supprimé : il n'y a plus rien à retirer.
            const membre = role ? await ctx.guilde.members.fetch(r.discord_id).catch(() => null) : null;
            const nom = membre?.displayName ?? (r.username || r.discord_id);

            try {
                if (role && membre?.roles.cache.has(role.id)) {
                    await membre.roles.remove(role.id, 'NeoFrag : rôle temporaire arrivé à échéance');
                }

                await ctx.site.retirerRoleTemporaire(r.timed_id);
                ctx.journal.info('Rôles temporaires : le rôle « %s » de %s est arrivé à échéance.', role?.name ?? r.role_id, nom);
            } catch (erreur) {
                this.avertir(ctx, 'Rôles temporaires : impossible de retirer le rôle « %s » à %s (%s).', role?.name ?? r.role_id, nom, messageErreur(erreur));
            }
        }
    }

    /** Un membre revient sur le serveur : ses rôles temporaires encore en cours lui sont redonnés. */
    private async revenu(ctx: Contexte, membre: GuildMember): Promise<void> {
        for (const r of await ctx.site.rolesTemporaires(membre.id)) {
            const role = ctx.guilde.roles.cache.get(r.role_id);

            if (role && r.expires_at * 1000 > Date.now() && !membre.roles.cache.has(role.id)) {
                await membre.roles.add(role.id, 'NeoFrag : rôle temporaire encore en cours');
                ctx.journal.info('Rôles temporaires : le rôle « %s » est redonné à %s, revenu sur le serveur avant la fin.', role.name, membre.displayName);
            }
        }
    }

    /** Une erreur en réponse lisible ; le reste au journal. */
    private expliquer(ctx: Contexte, erreur: unknown, t: Traduire): string {
        if (erreur instanceof ErreurSite && erreur.code === 'role_mapped') {
            return t(TEXTES.roleRelie);
        }

        if (erreur instanceof ErreurSite && erreur.code === 'unreachable') {
            return t(TEXTES.siteInjoignable);
        }

        ctx.journal.error('Rôles temporaires : %s', messageErreur(erreur));

        return t(TEXTES.erreurCommande);
    }

    private avertir(ctx: Contexte, modele: string, ...args: Valeur[]): void {
        const cle = formater(modele, args);

        if (!this.avertis.has(cle)) {
            this.avertis.add(cle);
            ctx.journal.warn(modele, ...args);
        }
    }
}
