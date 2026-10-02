/**
 * Une fonctionnalité du bot — l'équivalent d'un addon pour le site.
 *
 * Chaque fonctionnalité vit dans son dossier (`src/fonctionnalites/<nom>/`), et se déclare dans
 * `src/fonctionnalites/index.ts`. Elle DÉCLARE son titre, sa description et ses réglages : le bot les
 * envoie au site, dont l'administration tire un interrupteur et un formulaire — une fonctionnalité
 * ajoutée y apparaît sans toucher au site. Le bot la démarre quand elle est allumée et qu'il est sur
 * le serveur, la prévient quand ses réglages changent, l'arrête quand elle est éteinte ou qu'il se met
 * en pause. Le guide du wiki « Le bot Discord » en donne le mode d'emploi.
 *
 * Les textes déclarés (titre, description, libellés) sont des modèles français que l'administration
 * traduit : chacun doit figurer dans `Discord::textes_du_bot()` (un test le vérifie). Les textes
 * montrés sur Discord, eux, vivent dans `src/textes.ts`.
 */

import type { ChatInputCommandInteraction, Client, GatewayIntentBits, Guild, Interaction, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { Textes } from '../i18n.js';
import type { IntentsPermis } from '../intents.js';
import type { Journal } from '../journal.js';
import type { ConfigBot, Evenement, Site } from '../site.js';

/** Un réglage déclaré : l'administration en fait un champ de formulaire. */
export type Reglage =
    | { cle: string; type: 'bool'; defaut: boolean; libelle: string; aide?: string }
    | { cle: string; type: 'int'; defaut: number; min: number; max: number; libelle: string; aide?: string }
    | { cle: string; type: 'texte'; defaut: string; libelle: string; aide?: string }
    | { cle: string; type: 'choix'; defaut: string; choix: readonly { valeur: string; libelle: string }[]; libelle: string; aide?: string }
    /** Un salon du serveur ; `salons` : les types Discord acceptés (15 : Forum, 0 : texte…). */
    | { cle: string; type: 'salon'; defaut: string; salons: readonly number[]; libelle: string; aide?: string }
    | { cle: string; type: 'role'; defaut: string; libelle: string; aide?: string };

export type Valeurs = Readonly<Record<string, string | number | boolean | null>>;

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
    /** SES réglages : la valeur choisie dans l'administration, sinon celle qu'elle a déclarée. */
    reglages: Valeurs;
    /** Les textes montrés sur Discord, traduits (cf. `src/textes.ts`). */
    textes: Textes;
}

export interface Fonctionnalite {
    /** Identifiant court, stable (« roles », « forum »…). */
    readonly nom: string;
    /** Son nom dans l'administration (modèle traduit par le site). */
    readonly titre: string;
    /** Ce qu'elle fait, en une phrase (modèle traduit par le site). */
    readonly description: string;
    /** Allumée tant que l'administrateur ne l'a pas éteinte (vrai par défaut). */
    readonly defaut?: boolean;
    /** Ses réglages, que l'administration propose. */
    readonly reglages?: readonly Reglage[];
    /** Les intents dont elle a besoin, en plus de ceux de base. */
    readonly intents?: readonly GatewayIntentBits[];
    /**
     * Les types d'événements du site qu'elle suit (« user.groups.changed », « forum.post.created »…) :
     * le bot lit le fil d'événements à chaque tour et les lui passe, dans l'ordre.
     */
    readonly evenements?: readonly string[];

    /** Ses commandes Discord (« / »), décrites dans toutes les langues par `textes.localisations()`. */
    commandes?(textes: Textes): RESTPostAPIChatInputApplicationCommandsJSONBody[];
    /** Une de ses commandes a été lancée. */
    surCommande?(contexte: Contexte, interaction: ChatInputCommandInteraction): void | Promise<void>;
    /** Un bouton ou une fenêtre à elle (identifiant qui commence par « <nom>: »). */
    surInteraction?(contexte: Contexte, interaction: Interaction): void | Promise<void>;

    /** Démarre : poser ses écouteurs sur le client, lancer ses minuteries. */
    demarrer(contexte: Contexte): void | Promise<void>;
    /** Ses réglages ou la configuration du bot ont changé dans l'administration. */
    reconfigurer?(contexte: Contexte): void | Promise<void>;
    /** Un « tour » du bot, à chaque signe de vie (environ toutes les 30 secondes). */
    tour?(contexte: Contexte): void | Promise<void>;
    /** Un événement du site, parmi ceux qu'elle suit. */
    surEvenement?(contexte: Contexte, evenement: Evenement): void | Promise<void>;
    /** « Resynchroniser », depuis l'administration : tout remettre d'accord, rattraper ce qui manque. */
    resynchroniser?(contexte: Contexte): void | Promise<void>;
    /** S'arrête : retirer ses minuteries et ses écouteurs. */
    arreter?(): void | Promise<void>;
}
