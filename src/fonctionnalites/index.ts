/**
 * Les fonctionnalités du bot, dans l'ordre où elles démarrent. Ajouter une fonctionnalité, c'est
 * créer son dossier et l'inscrire ici.
 *
 * Une fabrique plutôt qu'une liste d'objets : chaque connexion à Discord repart d'instances neuves,
 * sans état resté d'une connexion précédente.
 */

import { SynchroForum } from './forum/index.js';
import { RolesEtPseudos } from './roles/index.js';
import type { Fonctionnalite } from './types.js';

export function fonctionnalites(): Fonctionnalite[] {
    return [new RolesEtPseudos(), new SynchroForum()];
}
