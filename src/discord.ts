/**
 * La connexion à Discord : ouverte quand l'interrupteur de l'administration est sur « marche »,
 * fermée en pause. Elle démarre les fonctionnalités quand le bot est sur le serveur du site.
 */

import { Client, Events, Partials, PermissionsBitField, REST, Routes, type APIApplication, type Guild } from 'discord.js';
import type { Fonctionnalite, Contexte } from './fonctionnalites/types.js';
import { intentsDemandes, intentsPermis, type IntentsPermis } from './intents.js';
import { formater, messageErreur, type Journal, type Valeur } from './journal.js';
import type { ConfigBot, InstantaneGuilde, Site } from './site.js';

/**
 * Les permissions que le bot demande sur le serveur — et rien de plus : pas « Administrateur ».
 * Le lien d'invitation de l'administration du site les porte.
 */
export const PERMISSIONS_DU_BOT = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.SendMessagesInThreads,
    PermissionsBitField.Flags.CreatePublicThreads,
    PermissionsBitField.Flags.ManageThreads,
    // Une suppression ou une modération sur le site retire aussi le message recopié sur Discord.
    PermissionsBitField.Flags.ManageMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.AddReactions,
    PermissionsBitField.Flags.EmbedLinks,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.ManageNicknames,
    PermissionsBitField.Flags.ManageWebhooks,
    PermissionsBitField.Flags.UseApplicationCommands,
] as const;

export function lienInvitation(clientId: string): string {
    const permissions = new PermissionsBitField([...PERMISSIONS_DU_BOT]).bitfield.toString();

    return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=bot%20applications.commands&permissions=${permissions}`;
}

/**
 * Une connexion impossible. « Définitive » : inutile de réessayer tant que la configuration ne
 * change pas. Elle porte un modèle et ses valeurs, comme une ligne du journal (cf. journal.ts).
 */
export class ErreurConnexion extends Error {
    readonly args: Valeur[];

    constructor(
        readonly definitive: boolean,
        readonly modele: string,
        ...args: Valeur[]
    ) {
        super(formater(modele, args));
        this.args = args;
        this.name = 'ErreurConnexion';
    }
}

/** Ce que le superviseur attend d'une connexion (une fausse, dans les tests). */
export interface Connexion {
    readonly prete: boolean;
    readonly intents: IntentsPermis;
    instantane(): InstantaneGuilde | null;
    reconfigurer(config: ConfigBot): Promise<void>;
    tour(): Promise<void>;
    fermer(): Promise<void>;
}

/** Temps laissé à Discord pour accepter la connexion, en millisecondes. */
const DELAI_CONNEXION = 60_000;

export class ConnexionDiscord implements Connexion {
    private guilde: Guild | null = null;
    private demarrees: Fonctionnalite[] = [];
    private ouverte = true;
    /** Le dernier événement du site lu. */
    private curseur: number;

    private constructor(
        private readonly client: Client<true>,
        private config: ConfigBot,
        private readonly site: Site,
        private readonly journal: Journal,
        private readonly fonctionnalites: readonly Fonctionnalite[],
        readonly intents: IntentsPermis,
    ) {
        this.curseur = config.events_cursor;
    }

    static async ouvrir(config: ConfigBot, site: Site, journal: Journal, fonctionnalites: readonly Fonctionnalite[]): Promise<ConnexionDiscord> {
        if (!config.token) {
            throw new ErreurConnexion(true, 'Aucune clé de bot enregistrée : renseignez-la dans l’administration du site (Discord → Connexion).');
        }

        if (!config.guild_id) {
            throw new ErreurConnexion(true, 'Aucun serveur Discord choisi : renseignez son identifiant dans l’administration du site (Discord → Connexion).');
        }

        // Ce que l'application a le droit de recevoir : on ne demande que cela (cf. intents.ts).
        const rest = new REST({ version: '10' }).setToken(config.token);
        let application: APIApplication;

        try {
            application = (await rest.get(Routes.currentApplication())) as APIApplication;
        } catch (erreur) {
            const statut = (erreur as { status?: number }).status;

            if (statut === 401) {
                throw new ErreurConnexion(true, 'Discord refuse la clé du bot : elle a peut-être été régénérée. Collez la nouvelle dans l’administration du site (Discord → Connexion).');
            }

            throw new ErreurConnexion(false, 'Discord injoignable : %s', messageErreur(erreur));
        }

        const permis = intentsPermis(application.flags ?? 0);

        if (!permis.members) {
            journal.warn('« Server Members Intent » n’est pas activé dans le portail des développeurs Discord : les rôles et les pseudos ne seront pas synchronisés.');
        }

        if (!permis.content) {
            journal.warn('« Message Content Intent » n’est pas activé dans le portail des développeurs Discord : le texte des messages ne sera pas recopié sur le forum.');
        }

        const client = new Client({
            intents: intentsDemandes(permis, fonctionnalites.flatMap((f) => f.intents ?? [])),
            partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
            // Le bot ne mentionne jamais personne de lui-même : un message recopié du forum ne doit
            // pas pouvoir notifier @everyone.
            allowedMentions: { parse: [] },
        });

        client.on(Events.Error, (erreur) => journal.error('Discord : %s', messageErreur(erreur)));
        client.on(Events.Warn, (message) => journal.warn('Discord : %s', message));
        client.on(Events.ShardReconnecting, () => journal.warn('Connexion à Discord perdue : reconnexion…'));
        client.on(Events.ShardResume, () => journal.info('Connexion à Discord rétablie.'));

        const prete = new Promise<Client<true>>((resolve, reject) => {
            const minuterie = setTimeout(() => reject(new ErreurConnexion(false, 'Discord n’a pas accepté la connexion dans la minute.')), DELAI_CONNEXION);

            client.once(Events.ClientReady, (c) => {
                clearTimeout(minuterie);
                resolve(c);
            });
        });

        try {
            await client.login(config.token);
        } catch (erreur) {
            await client.destroy();

            if ((erreur as { code?: string }).code === 'TokenInvalid') {
                throw new ErreurConnexion(true, 'Discord refuse la clé du bot : collez la bonne dans l’administration du site (Discord → Connexion).');
            }

            throw new ErreurConnexion(false, 'Connexion à Discord impossible : %s', messageErreur(erreur));
        }

        let connecte: Client<true>;

        try {
            connecte = await prete;
        } catch (erreur) {
            await client.destroy();
            throw erreur;
        }

        const connexion = new ConnexionDiscord(connecte, config, site, journal, fonctionnalites, permis);

        // Invité plus tard sur le serveur : les fonctionnalités démarrent à ce moment-là.
        connecte.on(Events.GuildCreate, (guilde) => {
            if (guilde.id === connexion.config.guild_id && !connexion.guilde) {
                void connexion.rejoindre(guilde);
            }
        });

        journal.info('Connecté à Discord : %s.', connecte.user.tag);

        const guilde = connecte.guilds.cache.get(config.guild_id) ?? null;

        if (guilde) {
            await connexion.rejoindre(guilde);
        } else {
            journal.error('Le bot n’est pas sur le serveur %s. Invitez-le avec ce lien : %s', config.guild_id, lienInvitation(config.client_id || application.id));
        }

        return connexion;
    }

    get prete(): boolean {
        return this.ouverte && this.client.isReady();
    }

    instantane(): InstantaneGuilde | null {
        const guilde = this.guilde;

        if (!guilde) {
            return null;
        }

        return {
            id: guilde.id,
            name: guilde.name,
            channels: [...guilde.channels.cache.values()]
                .filter((salon) => !salon.isThread())
                .sort((a, b) => ('rawPosition' in a ? a.rawPosition : 0) - ('rawPosition' in b ? b.rawPosition : 0))
                .map((salon) => ({ id: salon.id, name: salon.name, type: salon.type })),
            roles: [...guilde.roles.cache.values()]
                .sort((a, b) => b.position - a.position)
                .map((role) => ({ id: role.id, name: role.name, managed: role.managed })),
        };
    }

    async reconfigurer(config: ConfigBot): Promise<void> {
        this.config = config;

        for (const f of this.demarrees) {
            await this.prudemment(f, 'reconfigurer', () => f.reconfigurer?.(this.contexte()));
        }
    }

    async tour(): Promise<void> {
        await this.lireEvenements();

        for (const f of this.demarrees) {
            await this.prudemment(f, 'tour', () => f.tour?.(this.contexte()));
        }
    }

    /** Lit le fil d'événements du site depuis le curseur, et passe à chaque fonctionnalité ceux qu'elle suit. */
    private async lireEvenements(): Promise<void> {
        const abonnees = this.demarrees.filter((f) => f.evenements?.length && f.surEvenement);

        if (!abonnees.length) {
            return;
        }

        // Cinq pages de cent au plus par tour : le reste attend le tour suivant.
        for (let page = 0; page < 5; page++) {
            let lot;

            try {
                lot = await this.site.evenements(this.curseur, 100);
            } catch (erreur) {
                this.journal.warn('Fil d’événements du site illisible : %s', messageErreur(erreur));

                return;
            }

            for (const evenement of lot.events) {
                for (const f of abonnees) {
                    if (f.evenements?.includes(evenement.type)) {
                        await this.prudemment(f, `événement ${evenement.type}`, () => f.surEvenement?.(this.contexte(), evenement));
                    }
                }
            }

            this.curseur = lot.next;

            if (!lot.more) {
                return;
            }
        }
    }

    async fermer(): Promise<void> {
        this.ouverte = false;

        for (const f of this.demarrees) {
            await this.prudemment(f, 'arrêt', () => f.arreter?.());
        }

        this.demarrees = [];
        // Les écouteurs d'abord : fermer la connexion émet « reconnexion », que le journal
        // rapporterait comme une coupure.
        this.client.removeAllListeners();
        await this.client.destroy();
    }

    private async rejoindre(guilde: Guild): Promise<void> {
        this.guilde = guilde;
        this.journal.info('Serveur « %s » rejoint : %d fonctionnalité(s) à démarrer.', guilde.name, this.fonctionnalites.length);

        for (const f of this.fonctionnalites) {
            if (await this.prudemment(f, 'démarrage', () => f.demarrer(this.contexte()))) {
                this.demarrees.push(f);
            }
        }
    }

    private contexte(): Contexte {
        if (!this.guilde) {
            throw new Error('serveur Discord pas encore rejoint');
        }

        return { client: this.client, guilde: this.guilde, site: this.site, journal: this.journal, config: this.config, intents: this.intents };
    }

    /** Une fonctionnalité qui échoue l'écrit au journal, sans emporter le bot ni les autres. */
    private async prudemment(f: Fonctionnalite, etape: string, action: () => void | Promise<void>): Promise<boolean> {
        try {
            await action();

            return true;
        } catch (erreur) {
            this.journal.error('Fonctionnalité « %s » (%s) : %s', f.nom, etape, messageErreur(erreur));

            return false;
        }
    }
}
