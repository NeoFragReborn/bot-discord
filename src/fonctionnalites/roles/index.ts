/**
 * Rôles et pseudos : le site fait foi.
 *
 * Un membre du site qui a lié son compte Discord reçoit, sur le serveur, les rôles reliés à ses
 * groupes (Discord → Groupes et rôles, dans l'administration) et les perd quand il quitte le
 * groupe ; si l'option est cochée, il y porte son pseudo du site. Les rôles reliés portent le nom et
 * la couleur de leur groupe (0.2.5) : un groupe renommé sur le site l'est aussi sur le serveur.
 *
 * Quand : au démarrage et à chaque changement de configuration (tout le monde), quand un membre
 * change de groupe sur le site (événement « user.groups.changed »), quand un membre lié rejoint le
 * serveur, et toutes les dix minutes environ pour le reste (un pseudo changé, un compte lié).
 *
 * Il faut l'intent « Server Members Intent » et, sur le serveur, les permissions « Gérer les rôles »
 * et « Gérer les pseudos », le rôle du bot placé AU-DESSUS des rôles qu'il distribue.
 */

import { DiscordAPIError, Events, GatewayIntentBits, PermissionsBitField, type GuildMember } from 'discord.js';
import { formater, messageErreur, type Valeur } from '../../journal.js';
import type { Evenement, RoleRelie } from '../../site.js';
import type { Contexte, Fonctionnalite, Reglage } from '../types.js';
import { apparenceVoulue, planifier } from './plan.js';


/** Ce qu'une synchronisation a fait, pour une seule ligne de journal. */
interface Bilan {
    membres: number;
    donnes: number;
    retires: number;
    pseudos: number;
    horsDePortee: number;
    erreurs: string[];
}

const bilanVide = (): Bilan => ({ membres: 0, donnes: 0, retires: 0, pseudos: 0, horsDePortee: 0, erreurs: [] });

export class RolesEtPseudos implements Fonctionnalite {
    readonly nom = 'roles';
    readonly titre = 'Rôles et pseudos';
    readonly description = 'Donne aux membres qui ont lié leur compte Discord les rôles reliés à leurs groupes, et leur pseudo du site s’ils le veulent.';
    readonly reglages = [
        { cle: 'pseudos', type: 'bool', defaut: false, libelle: 'Donner aux membres liés leur pseudo du site sur le serveur' },
        { cle: 'apparence', type: 'bool', defaut: true, libelle: 'Donner aux rôles reliés le nom et la couleur de leur groupe', aide: 'Le site fait foi : un groupe renommé ou recoloré l’est aussi sur le serveur. Un rôle relié à plusieurs groupes garde les siens.' },
        { cle: 'intervalle', type: 'int', defaut: 10, min: 5, max: 120, libelle: 'Minutes entre deux passages sur tous les membres', aide: 'Un changement de groupe est appliqué tout de suite ; ce passage rattrape le reste (un pseudo changé, un compte lié).' },
    ] as const satisfies readonly Reglage[];
    readonly intents = [GatewayIntentBits.GuildMembers] as const;
    readonly evenements = ['user.groups.changed', 'user.discord.linked', 'user.discord.unlinked'] as const;

    private ctx: Contexte | null = null;
    /** Le dernier passage sur tous les membres. */
    private dernierPassage = 0;
    private enCours: Promise<void> | null = null;
    /** Les avertissements déjà donnés depuis la dernière configuration : ils ne se répètent pas toutes les dix minutes. */
    private avertis = new Set<string>();
    private surArrivee: ((membre: GuildMember) => void) | null = null;

    async demarrer(ctx: Contexte): Promise<void> {
        this.ctx = ctx;
        this.surArrivee = (membre) => {
            if (this.ctx && membre.guild.id === this.ctx.guilde.id) {
                void this.membreArrive(this.ctx, membre);
            }
        };
        ctx.client.on(Events.GuildMemberAdd, this.surArrivee);

        await this.toutSynchroniser(ctx, true);
    }

    async reconfigurer(ctx: Contexte): Promise<void> {
        this.ctx = ctx;
        this.avertis.clear();
        // Un réglage touché ailleurs relit la configuration : le bilan ne se dit que s'il a changé quelque chose.
        await this.toutSynchroniser(ctx, false);
    }

    async tour(ctx: Contexte): Promise<void> {
        this.ctx = ctx;

        if (Date.now() - this.dernierPassage >= Number(ctx.reglages.intervalle ?? 10) * 60_000) {
            await this.toutSynchroniser(ctx, false);
        }
    }

    async resynchroniser(ctx: Contexte): Promise<void> {
        this.ctx = ctx;
        this.avertis.clear();
        await this.toutSynchroniser(ctx, true);
    }

    async surEvenement(ctx: Contexte, evenement: Evenement): Promise<void> {
        const id = Number(evenement.data.user_id);

        if (!Number.isInteger(id) || id <= 0 || !this.actif(ctx)) {
            return;
        }

        // Délié : le site ne fait plus foi pour ce compte Discord, les rôles qu'il lui avait donnés partent.
        if (evenement.type === 'user.discord.unlinked') {
            const discordId = String(evenement.data.discord_id ?? '');
            const discord = /^\d+$/.test(discordId) ? await ctx.guilde.members.fetch(discordId).catch(() => null) : null;

            if (discord) {
                await this.unMembre(ctx, [], '', discord);
            }

            return;
        }

        const membre = await ctx.site.membre(id);

        if (!membre?.discord) {
            return;
        }

        const discord = await ctx.guilde.members.fetch(membre.discord.id).catch(() => null);

        if (discord) {
            await this.unMembre(ctx, membre.groups, membre.username, discord);
        }
    }

    arreter(): void {
        if (this.ctx && this.surArrivee) {
            this.ctx.client.off(Events.GuildMemberAdd, this.surArrivee);
        }

        this.surArrivee = null;
        this.ctx = null;
    }

    /** Un membre lié qui rejoint le serveur reçoit tout de suite ses rôles et son pseudo. */
    private async membreArrive(ctx: Contexte, discord: GuildMember): Promise<void> {
        if (!this.actif(ctx)) {
            return;
        }

        try {
            const membre = await ctx.site.membreDiscord(discord.id);

            if (membre) {
                await this.unMembre(ctx, membre.groups, membre.username, discord);
            }
        } catch (erreur) {
            ctx.journal.warn('Rôles de %s (arrivée) : %s', discord.user.tag, messageErreur(erreur));
        }
    }

    /** Il y a quelque chose à synchroniser, et le bot en a les moyens. */
    private actif(ctx: Contexte): boolean {
        if (!ctx.config.roles.length && !ctx.reglages.pseudos) {
            return false;
        }

        if (!ctx.intents.members) {
            this.avertir(ctx, 'Rôles et pseudos en attente : activez « Server Members Intent » dans le portail des développeurs Discord, puis redémarrez le bot.');

            return false;
        }

        return true;
    }

    private toutSynchroniser(ctx: Contexte, direQuandRien: boolean): Promise<void> {
        // Une synchronisation à la fois : celle qui est demandée pendant une autre attend la même.
        this.enCours ??= this.synchroniserTous(ctx, direQuandRien).finally(() => {
            this.enCours = null;
        });

        return this.enCours;
    }

    private async synchroniserTous(ctx: Contexte, direQuandRien: boolean): Promise<void> {
        this.dernierPassage = Date.now();

        if (!this.actif(ctx)) {
            return;
        }

        const correspondances = this.correspondancesUtilisables(ctx);

        await this.apparences(ctx, correspondances);

        const lies = await ctx.site.membres();
        // Tous les membres du serveur en une requête (l'intent « membres » le permet).
        const presents = await ctx.guilde.members.fetch();
        const bilan = bilanVide();

        for (const lie of lies) {
            const discord = presents.get(lie.discord_id);

            if (discord) {
                bilan.membres++;
                await this.appliquer(ctx, lie.groups, lie.username, discord, correspondances, bilan);
            }
        }

        const changes = bilan.donnes + bilan.retires + bilan.pseudos;

        if (changes > 0 || bilan.erreurs.length > 0 || direQuandRien) {
            ctx.journal.info('Rôles et pseudos : %d membre(s) lié(s) présent(s) sur le serveur — %d rôle(s) donné(s), %d retiré(s), %d pseudo(s) changé(s).', bilan.membres, bilan.donnes, bilan.retires, bilan.pseudos);
        }

        if (bilan.horsDePortee > 0) {
            this.avertir(ctx, '%d pseudo(s) hors de portée : ces membres ont un rôle égal ou supérieur à celui du bot (ou possèdent le serveur).', bilan.horsDePortee);
        }

        this.ecrireErreurs(ctx, bilan);
    }

    private async unMembre(ctx: Contexte, groupes: readonly string[], pseudo: string, discord: GuildMember): Promise<void> {
        const bilan = bilanVide();

        await this.appliquer(ctx, groupes, pseudo, discord, this.correspondancesUtilisables(ctx), bilan);

        if (bilan.donnes + bilan.retires + bilan.pseudos > 0) {
            if (bilan.pseudos) {
                ctx.journal.info('Rôles et pseudo de %s : %d rôle(s) donné(s), %d retiré(s), pseudo changé.', discord.user.tag, bilan.donnes, bilan.retires);
            } else {
                ctx.journal.info('Rôles et pseudo de %s : %d rôle(s) donné(s), %d retiré(s).', discord.user.tag, bilan.donnes, bilan.retires);
            }
        }

        this.ecrireErreurs(ctx, bilan);
    }

    private async appliquer(ctx: Contexte, groupes: readonly string[], pseudo: string, discord: GuildMember, correspondances: readonly RoleRelie[], bilan: Bilan): Promise<void> {
        const plan = planifier(groupes, pseudo, {
            roles: new Set(discord.roles.cache.keys()),
            pseudo: discord.nickname,
            proprietaire: discord.id === ctx.guilde.ownerId,
        }, correspondances, Boolean(ctx.reglages.pseudos));

        try {
            if (plan.ajouter.length) {
                await discord.roles.add(plan.ajouter, 'NeoFrag : groupe du site');
                bilan.donnes += plan.ajouter.length;
            }

            if (plan.retirer.length) {
                await discord.roles.remove(plan.retirer, 'NeoFrag : groupe du site');
                bilan.retires += plan.retirer.length;
            }
        } catch (erreur) {
            bilan.erreurs.push(`${discord.user.tag} (roles) : ${this.explication(erreur)}`);
        }

        // Le bot lui-même (un compte d'essai peut l'avoir « lié ») garde le pseudo que le serveur lui donne.
        if (plan.pseudo !== null && discord.id !== ctx.client.user.id) {
            if (!discord.manageable) {
                bilan.horsDePortee++;

                return;
            }

            try {
                await discord.setNickname(plan.pseudo, 'NeoFrag : pseudo du site');
                bilan.pseudos++;
            } catch (erreur) {
                bilan.erreurs.push(`${discord.user.tag} (nickname) : ${this.explication(erreur)}`);
            }
        }
    }

    /**
     * Les rôles reliés prennent le nom et la couleur de leur groupe (réglage « apparence ») : le site fait foi. Un rôle
     * relié à plusieurs groupes garde les siens — lequel suivre ? Un groupe sans couleur laisse celle du rôle.
     */
    private async apparences(ctx: Contexte, correspondances: readonly RoleRelie[]): Promise<void> {
        if (ctx.reglages.apparence === false) {
            return;
        }

        for (const c of correspondances) {
            const role = ctx.guilde.roles.cache.get(c.role_id);
            const voulue = role && ctx.config.roles.filter((r) => r.role_id === c.role_id).length === 1 ? apparenceVoulue(c, { name: role.name, color: role.colors.primaryColor }) : null;

            if (!role || !voulue) {
                continue;
            }

            const avant = role.name;

            try {
                await role.edit({ ...(voulue.name !== undefined ? { name: voulue.name } : {}), ...(voulue.color !== undefined ? { colors: { primaryColor: voulue.color } } : {}), reason: 'NeoFrag : nom et couleur du groupe du site' });
                ctx.journal.info('Rôle « %s » : nom et couleur repris du groupe « %s » du site.', avant, voulue.name ?? avant);
            } catch (erreur) {
                this.avertir(ctx, 'Rôle « %s » : nom et couleur non repris de son groupe — %s', avant, this.explication(erreur));
            }
        }
    }

    /**
     * Les correspondances que le bot peut appliquer. Un rôle disparu du serveur, tenu par une
     * intégration, ou placé au-dessus du rôle du bot est écarté — et dit une fois dans le journal.
     */
    private correspondancesUtilisables(ctx: Contexte): RoleRelie[] {
        const moi = ctx.guilde.members.me;

        if (ctx.config.roles.length && moi && !moi.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            this.avertir(ctx, 'Le bot n’a pas la permission « Gérer les rôles » sur le serveur : les rôles ne sont pas synchronisés.');

            return [];
        }

        const plafond = moi?.roles.highest.position ?? 0;

        return ctx.config.roles.filter((c) => {
            const role = ctx.guilde.roles.cache.get(c.role_id);

            if (!role) {
                this.avertir(ctx, 'Le rôle relié au groupe « %s » n’existe plus sur le serveur : défaites ou refaites la correspondance dans l’administration.', c.group_key);

                return false;
            }

            if (role.managed) {
                this.avertir(ctx, 'Le rôle « %s » est tenu par une intégration : Discord interdit de le donner.', role.name);

                return false;
            }

            if (role.position >= plafond) {
                this.avertir(ctx, 'Le rôle « %s » est au-dessus du rôle du bot : dans les réglages du serveur (Rôles), placez le rôle du bot plus haut.', role.name);

                return false;
            }

            return true;
        });
    }

    private explication(erreur: unknown): string {
        if (erreur instanceof DiscordAPIError && erreur.code === 50013) {
            return 'Missing Permissions (50013)';
        }

        return messageErreur(erreur);
    }

    private ecrireErreurs(ctx: Contexte, bilan: Bilan): void {
        if (!bilan.erreurs.length) {
            return;
        }

        const premieres = bilan.erreurs.slice(0, 3).join(' ; ') + (bilan.erreurs.length > 3 ? ' ; …' : '');
        ctx.journal.error('Rôles et pseudos : %d échec(s) — %s. Le rôle du bot doit être placé au-dessus des rôles qu’il donne et des membres qu’il renomme.', bilan.erreurs.length, premieres);
    }

    private avertir(ctx: Contexte, modele: string, ...args: Valeur[]): void {
        const cle = formater(modele, args);

        if (!this.avertis.has(cle)) {
            this.avertis.add(cle);
            ctx.journal.warn(modele, ...args);
        }
    }
}
