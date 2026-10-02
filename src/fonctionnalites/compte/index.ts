/**
 * Compte et apparence : la commande `/forum` (modèle Cadernis).
 *
 * - `/forum account link` : un lien à usage unique (quinze minutes) vers le site, où le membre,
 *   connecté, confirme la liaison — et peut reprendre à son nom ce qu'il avait publié depuis Discord.
 * - `/forum account unlink` : délier, sauf si Discord est son seul moyen de se connecter au site.
 * - `/forum visibility public | guest | custom | status` : comment paraît sur le forum quelqu'un qui
 *   n'a pas relié son compte — son pseudo Discord, un nom anonyme, ou un pseudo choisi (changeable
 *   tous les sept jours). Ses messages déjà publiés suivent : le nom se calcule à l'affichage.
 *
 * Toutes les réponses sont privées (seul le membre les voit), dans sa langue Discord.
 */

import { ActionRowBuilder, ApplicationCommandOptionType, ButtonBuilder, ButtonStyle, type APIApplicationCommandBasicOption, type APIApplicationCommandSubcommandOption, type ChatInputCommandInteraction, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { Textes } from '../../i18n.js';
import { messageErreur } from '../../journal.js';
import { ErreurSite, type EtatIdentite } from '../../site.js';
import { TEXTES } from '../../textes.js';
import { decrite } from '../commun.js';
import type { Contexte, Fonctionnalite, Reglage } from '../types.js';

export class CompteEtApparence implements Fonctionnalite {
    readonly nom = 'compte';
    readonly titre = 'Compte et apparence';
    readonly description = 'La commande /forum : relier ou délier son compte Discord depuis Discord, et choisir comment on apparaît sur le forum sans compte relié.';
    readonly reglages = [
        { cle: 'apparence', type: 'bool', defaut: true, libelle: 'Proposer /forum visibility : choisir son apparence sur le forum sans compte relié' },
    ] as const satisfies readonly Reglage[];

    private apparence = true;

    commandes(textes: Textes): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
        const sousCommande = (name: string, modele: string, options: APIApplicationCommandBasicOption[] = []): APIApplicationCommandSubcommandOption => ({ type: ApplicationCommandOptionType.Subcommand, name, ...decrite(textes, modele), ...(options.length ? { options } : {}) });
        const groupes: NonNullable<RESTPostAPIChatInputApplicationCommandsJSONBody['options']> = [
            {
                type: ApplicationCommandOptionType.SubcommandGroup,
                name: 'account',
                ...decrite(textes, TEXTES.cmdCompte),
                options: [sousCommande('link', TEXTES.cmdLier), sousCommande('unlink', TEXTES.cmdDelier)],
            },
        ];

        if (this.apparence) {
            groupes.push({
                type: ApplicationCommandOptionType.SubcommandGroup,
                name: 'visibility',
                ...decrite(textes, TEXTES.cmdApparence),
                options: [
                    sousCommande('public', TEXTES.cmdPublic),
                    sousCommande('guest', TEXTES.cmdInvite),
                    sousCommande('custom', TEXTES.cmdPerso, [{ type: ApplicationCommandOptionType.String, name: 'name', ...decrite(textes, TEXTES.cmdPersoNom), required: true, min_length: 2, max_length: 32 }]),
                    sousCommande('status', TEXTES.cmdStatut),
                ],
            });
        }

        return [{ name: 'forum', ...decrite(textes, TEXTES.cmdForum), options: groupes, dm_permission: false }];
    }

    demarrer(ctx: Contexte): void {
        this.apparence = ctx.reglages.apparence !== false;
    }

    reconfigurer(ctx: Contexte): void {
        this.apparence = ctx.reglages.apparence !== false;
    }

    async surCommande(ctx: Contexte, interaction: ChatInputCommandInteraction): Promise<void> {
        const groupe = interaction.options.getSubcommandGroup(false);
        const sous = interaction.options.getSubcommand(false);
        const t = (modele: string, ...args: (string | number)[]) => ctx.textes.dans(interaction.locale, modele, ...args);
        const discord = {
            id: interaction.user.id,
            username: interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.globalName ?? interaction.user.username,
            avatar: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
        };

        // Le site peut mettre un instant à répondre : Discord attend au plus trois secondes une première réponse.
        await interaction.deferReply({ ephemeral: true });

        try {
            if (groupe === 'account' && sous === 'link') {
                const r = await ctx.site.demanderLiaison(discord);

                if (r.linked) {
                    await interaction.editReply(t(TEXTES.dejaLie, r.member));

                    return;
                }

                const bouton = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(r.url).setLabel(t(TEXTES.lierBouton).slice(0, 80));

                await interaction.editReply({ content: t(TEXTES.lierLien, Math.round(r.expires_in / 60)), components: [new ActionRowBuilder<ButtonBuilder>().addComponents(bouton)] });

                return;
            }

            if (groupe === 'account' && sous === 'unlink') {
                const r = await ctx.site.delier(discord.id);

                await interaction.editReply(t(TEXTES.delie, r.member));

                return;
            }

            if (groupe === 'visibility') {
                const etat = sous === 'status' ? await ctx.site.identite(discord.id) : await ctx.site.reglerIdentite(discord, sous === 'guest' ? 'guest' : sous === 'custom' ? 'custom' : 'public', sous === 'custom' ? interaction.options.getString('name', true) : undefined);

                await interaction.editReply(this.decrire(etat, t, sous !== 'status'));
            }
        } catch (erreur) {
            await interaction.editReply(this.expliquer(erreur, t, ctx));
        }
    }

    /** Comment ce compte paraît, en une phrase ; après un changement, le rappel que les anciens messages suivent. */
    private decrire(etat: EtatIdentite, t: (modele: string, ...args: (string | number)[]) => string, apresChangement: boolean): string {
        if (etat.linked) {
            return t(TEXTES.apparenceLie, etat.member);
        }

        const phrase = etat.mode === 'guest' ? t(TEXTES.apparenceInvite, etat.name ?? '') : etat.mode === 'custom' ? t(TEXTES.apparencePerso, etat.name ?? '') : t(TEXTES.apparencePublic);

        return apresChangement ? `${phrase}\n${t(TEXTES.apparenceSuivent)}` : phrase;
    }

    /** Une erreur du site en réponse lisible ; le reste au journal. */
    private expliquer(erreur: unknown, t: (modele: string, ...args: (string | number)[]) => string, ctx: Contexte): string {
        if (erreur instanceof ErreurSite) {
            const membre = typeof erreur.details.member === 'string' ? erreur.details.member : '';

            switch (erreur.code) {
                case 'not_linked':
                    return t(TEXTES.pasLie);
                case 'only_login_method':
                    return t(TEXTES.seulMoyen, membre);
                case 'linked':
                    return t(TEXTES.apparenceLie, membre);
                case 'invalid_name':
                    return t(TEXTES.apparenceNomInvalide);
                case 'name_taken':
                    return t(TEXTES.apparenceNomPris);
                case 'too_soon':
                    return t(TEXTES.apparenceTropTot, typeof erreur.details.custom_change_at === 'number' ? `<t:${erreur.details.custom_change_at}:R>` : '');
                case 'unreachable':
                    return t(TEXTES.siteInjoignable);
            }
        }

        ctx.journal.error('Compte et apparence : %s', messageErreur(erreur));

        return t(TEXTES.erreurCommande);
    }
}
