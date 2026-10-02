/**
 * Le superviseur : la boucle du bot.
 *
 * À chaque tour (toutes les 30 secondes environ), il donne un signe de vie au site et reçoit en
 * retour l'interrupteur, le numéro de configuration et les commandes de l'administration. Il relit
 * la configuration quand ce numéro change, ouvre ou ferme la connexion à Discord selon
 * l'interrupteur, redémarre quand on le lui demande, et envoie son journal.
 *
 * Le site injoignable n'arrête rien : la connexion à Discord continue, le journal attend.
 */

import { ErreurConnexion, type Connexion } from './discord.js';
import { messageErreur, type Journal } from './journal.js';
import { ErreurSite, type CommandeSite, type ConfigBot, type DeclarationFonctionnalite, type InstantaneGuilde, type ReponseSigneDeVie, type SigneDeVie, type Site } from './site.js';

export interface OptionsSuperviseur {
    site: Site;
    journal: Journal;
    /** La version du bot, montrée dans l'administration. */
    version: string;
    /** Secondes entre deux tours. */
    intervalle: number;
    /** Ouvre la connexion à Discord (remplacée par une fausse dans les tests). */
    ouvrir: (config: ConfigBot) => Promise<Connexion>;
    /** Les fonctionnalités, déclarées au site à chaque signe de vie — même en pause : l'administration les règle avant la marche. */
    declarations?: DeclarationFonctionnalite[];
    /** Les textes que le bot montre sur Discord (textes.ts), dont la configuration rend les traductions. */
    textes?: string[];
}

/** Après un changement d'état, le tour suivant vient vite : l'administration le voit tout de suite. */
const DELAI_APRES_CHANGEMENT = 2_000;

/** Lots de journal envoyés au plus par tour. */
const LOTS_PAR_TOUR = 4;

export class Superviseur {
    private config: ConfigBot | null = null;
    private versionConfig = -1;
    private connexion: Connexion | null = null;
    private dernierInstantane: InstantaneGuilde | null = null;
    /** Une connexion refusée pour de bon (clé invalide…) : on attend que la configuration change. */
    private refus = false;
    /** Échecs de connexion d'affilée, pour espacer les essais. */
    private echecs = 0;
    private toursAvantEssai = 0;
    private echecsSite = 0;
    private arrete = false;
    private minuterie: NodeJS.Timeout | null = null;
    private changement = false;
    /** Le dernier événement du site traité, gardé même connexion fermée : le site le retient pour la reprise. */
    private curseur: number | null = null;

    constructor(private readonly o: OptionsSuperviseur) {}

    /** Lance la boucle. */
    demarrer(): void {
        const boucle = async (): Promise<void> => {
            if (this.arrete) {
                return;
            }

            try {
                await this.tour();
            } catch (erreur) {
                this.o.journal.error('Erreur inattendue du superviseur : %s', messageErreur(erreur));
            }

            if (!this.arrete) {
                this.minuterie = setTimeout(() => void boucle(), this.changement ? DELAI_APRES_CHANGEMENT : this.o.intervalle * 1000);
                this.changement = false;
            }
        };

        void boucle();
    }

    /** Arrête la boucle et ferme la connexion ; un dernier signe de vie dit au site que le bot s'en va. */
    async arreter(): Promise<void> {
        this.arrete = true;

        if (this.minuterie) {
            clearTimeout(this.minuterie);
        }

        await this.fermer();
        this.o.journal.info('Bot arrêté.');

        try {
            await this.o.site.signeDeVie(this.etat());
            await this.envoyerJournal();
        } catch {
            // Le site est injoignable : il verra le bot hors ligne faute de signe de vie.
        }
    }

    /** Un tour de la boucle (public pour les tests). */
    async tour(): Promise<void> {
        let reponse: ReponseSigneDeVie;

        try {
            reponse = await this.o.site.signeDeVie(this.etat());

            if (this.echecsSite > 0) {
                this.o.journal.info('Site de nouveau joignable, après %d signe(s) de vie manqué(s).', this.echecsSite);
                this.echecsSite = 0;
            }
        } catch (erreur) {
            this.echecSite(erreur);

            return;
        }

        // Un site 1.2.11 n'envoie qu'un nom ; les suivants, un type et des données.
        const commandes: CommandeSite[] = reponse.commands.map((c) => (typeof c === 'string' ? { type: c, data: {} } : c));
        let redemarrer = commandes.some((c) => c.type === 'restart');

        if (reponse.version !== this.versionConfig) {
            let config: ConfigBot;

            try {
                config = await this.o.site.config();
            } catch (erreur) {
                this.echecSite(erreur);

                return;
            }

            const ancienne = this.config;

            this.o.journal.masquer(config.token);
            this.config = config;
            this.versionConfig = reponse.version;
            this.refus = false;
            this.echecs = 0;
            this.toursAvantEssai = 0;

            if (ancienne !== null) {
                this.o.journal.info('Configuration relue depuis l’administration.');
            }

            if (this.connexion && ancienne && (ancienne.token !== config.token || ancienne.guild_id !== config.guild_id || ancienne.client_id !== config.client_id)) {
                this.o.journal.info('La connexion à Discord a changé : reconnexion.');
                redemarrer = true;
            } else if (this.connexion) {
                await this.connexion.reconfigurer(config);
            }
        }

        if (redemarrer) {
            if (commandes.some((c) => c.type === 'restart')) {
                this.o.journal.info('Redémarrage demandé depuis l’administration.');
            }

            await this.fermer();
            this.refus = false;
            this.echecs = 0;
            this.toursAvantEssai = 0;
        }

        if (reponse.running && !this.connexion) {
            await this.ouvrirConnexion();
        } else if (!reponse.running && this.connexion) {
            this.o.journal.info('Mis en pause depuis l’administration : déconnexion de Discord.');
            await this.fermer();
        }

        for (const commande of commandes) {
            if (commande.type === 'restart') {
                continue;
            }

            if (!this.connexion) {
                this.o.journal.warn('Commande « %s » ignorée : le bot n’est pas connecté à Discord.', commande.type);
            } else if (commande.type === 'resync') {
                this.o.journal.info('Resynchronisation demandée depuis l’administration.');
                await this.connexion.resynchroniser();
            } else {
                await this.connexion.executer(commande);
            }
        }

        if (this.connexion) {
            await this.connexion.tour();
            this.dernierInstantane = this.connexion.instantane() ?? this.dernierInstantane;
            this.curseur = this.connexion.curseur;
        }

        await this.envoyerJournal();
    }

    /** Ce que le bot dit de lui au site. */
    etat(): SigneDeVie {
        const curseur = this.connexion?.curseur ?? this.curseur;

        return {
            version: this.o.version,
            connected: this.connexion?.prete ?? false,
            intents: this.connexion?.intents ?? { members: false, content: false },
            // En pause, le bot redit le serveur tel qu'il l'a vu en dernier : les listes de salons et
            // de rôles de l'administration restent remplies.
            guild: this.connexion?.instantane() ?? this.dernierInstantane,
            ...(this.o.declarations ? { features: this.o.declarations } : {}),
            ...(this.o.textes ? { texts: this.o.textes } : {}),
            ...(curseur !== null ? { events_cursor: curseur } : {}),
        };
    }

    private async ouvrirConnexion(): Promise<void> {
        if (this.refus || !this.config) {
            return;
        }

        if (this.toursAvantEssai > 0) {
            this.toursAvantEssai--;

            return;
        }

        try {
            this.connexion = await this.o.ouvrir(this.config);
            this.dernierInstantane = this.connexion.instantane() ?? this.dernierInstantane;
            this.echecs = 0;
            this.changement = true;
        } catch (erreur) {
            if (erreur instanceof ErreurConnexion) {
                this.o.journal.error(erreur.modele, ...erreur.args);
            } else {
                this.o.journal.error('Connexion à Discord impossible : %s', messageErreur(erreur));
            }

            if (erreur instanceof ErreurConnexion && erreur.definitive) {
                this.refus = true;
            } else {
                // 1, 2, 4, 8… tours d'attente, jusqu'à une dizaine de minutes.
                this.echecs++;
                this.toursAvantEssai = Math.min(2 ** (this.echecs - 1), 20) - 1;
            }
        }
    }

    private async fermer(): Promise<void> {
        const connexion = this.connexion;

        if (!connexion) {
            return;
        }

        this.curseur = connexion.curseur;
        this.connexion = null;
        this.changement = true;

        try {
            await connexion.fermer();
        } catch (erreur) {
            this.o.journal.warn('Fermeture de la connexion à Discord : %s', messageErreur(erreur));
        }
    }

    private async envoyerJournal(): Promise<void> {
        for (let i = 0; i < LOTS_PAR_TOUR && this.o.journal.enAttente > 0; i++) {
            const lot = this.o.journal.prendre();

            try {
                await this.o.site.journal(lot);
            } catch {
                this.o.journal.rendre(lot);

                return;
            }
        }
    }

    private echecSite(erreur: unknown): void {
        this.echecsSite++;

        // Une fois au premier échec, puis de loin en loin : un site en panne ne doit pas noyer journald.
        if (this.echecsSite !== 1 && this.echecsSite % 20 !== 0) {
            return;
        }

        if (erreur instanceof ErreurSite && erreur.statut === 401) {
            this.o.journal.error('Le site refuse la clé d’accès du bot (NF_API_KEY) : créez-en une nouvelle dans l’administration (Discord → Clé d’accès du bot).');
        } else if (erreur instanceof ErreurSite && erreur.statut === 403) {
            this.o.journal.error('La clé d’accès du bot n’a pas le droit « discord:bot » : créez-la depuis l’administration (Discord → Clé d’accès du bot).');
        } else if (erreur instanceof ErreurSite && erreur.code === 'module_unavailable') {
            this.o.journal.error('Le module Discord n’est pas installé sur le site.');
        } else {
            this.o.journal.error('Site injoignable : %s', messageErreur(erreur));
        }
    }
}
