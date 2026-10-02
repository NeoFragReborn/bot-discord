/**
 * Les fonctionnalités du bot, dans l'ordre où elles démarrent. Ajouter une fonctionnalité, c'est
 * créer son dossier et l'inscrire ici.
 *
 * Une fabrique plutôt qu'une liste d'objets : chaque connexion à Discord repart d'instances neuves,
 * sans état resté d'une connexion précédente.
 */

import { SynchroBugtracker } from './bugtracker/index.js';
import { RolesTemporaires } from './roles-temporaires/index.js';
import { CompteEtApparence } from './compte/index.js';
import { SynchroForum } from './forum/index.js';
import { RolesEtPseudos } from './roles/index.js';
import type { Fonctionnalite } from './types.js';

export function fonctionnalites(): Fonctionnalite[] {
    return [new RolesEtPseudos(), new SynchroForum(), new CompteEtApparence(), new SynchroBugtracker(), new RolesTemporaires()];
}
