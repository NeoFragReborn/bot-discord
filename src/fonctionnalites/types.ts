/**
 * Une fonctionnalité du bot — l'équivalent d'un addon pour le site.
 *
 * Chaque fonctionnalité vit dans son dossier (`src/fonctionnalites/<nom>/`), et se déclare dans
 * `src/fonctionnalites/index.ts`. Le bot la démarre quand il est connecté à Discord, la prévient
 * quand la configuration change, et l'arrête quand il se met en pause. Le guide du wiki « Écrire une
 * fonctionnalité du bot » en donne le mode d'emploi.
 */

import type { Client, Guild, GatewayIntentBits } from 'discord.js';
import type { Journal } from '../journal.js';
import type { ConfigBot, Evenement, Site } from '../site.js';
import type { IntentsPermis } from '../intents.js';

/** Ce qu'une fonctionnalité reçoit pour travailler. */
export interface Contexte {
    /** Le client discord.js, connecté. */
    client: Client<true>;
    /** Le serveur Discord du site. */
    guilde: Guild;
    /** L'API du site. */
    site: Site;
    /** Le journal, que l'administration du site affiche. */
    journal: Journal;
    /** La configuration en cours (relue quand l'administration la change). */
    config: ConfigBot;
    /** Les intents privilégiés dont le bot dispose. */
    intents: IntentsPermis;
}

export interface Fonctionnalite {
    /** Identifiant court, stable (« roles », « forum »…). */
    readonly nom: string;
    /** Les intents dont elle a besoin, en plus de ceux de base. */
    readonly intents?: readonly GatewayIntentBits[];
    /** Démarre : poser ses écouteurs sur le client, lancer ses minuteries. */
    demarrer(contexte: Contexte): void | Promise<void>;
    /** La configuration a changé dans l'administration (correspondances, pseudos…). */
    reconfigurer?(contexte: Contexte): void | Promise<void>;
    /** Un « tour » du bot, à chaque signe de vie (environ toutes les 30 secondes). */
    tour?(contexte: Contexte): void | Promise<void>;
    /**
     * Les types d'événements du site qu'elle suit (« user.groups.changed », « forum.post.created »…) :
     * le bot lit le fil d'événements à chaque tour et les lui passe, dans l'ordre.
     */
    readonly evenements?: readonly string[];
    /** Un événement du site, parmi ceux qu'elle suit. */
    surEvenement?(contexte: Contexte, evenement: Evenement): void | Promise<void>;
    /** S'arrête : retirer ses minuteries (les écouteurs du client partent avec lui). */
    arreter?(): void | Promise<void>;
}
