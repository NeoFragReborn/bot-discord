/**
 * Tous les textes que le bot montre SUR DISCORD — messages postés, réponses aux commandes,
 * descriptions des commandes —, et rien d'autre (le journal, lui, a ses modèles là où il s'écrit).
 *
 * Ce sont des modèles français (`%s`, `%d`). Le bot en envoie la liste au site, qui lui rend leurs
 * traductions (cf. `i18n.ts`). Un texte ajouté ici s'ajoute aussi à `Discord::textes_du_bot()`
 * (`modules/discord/discord.php`), puis `php tools/check-langs.php --fix` et `php tools/fill-langs.php`
 * le traduisent : un test du bot échoue sinon.
 */

export const TEXTES = {
    // Commun
    erreurCommande: 'Une erreur est survenue ; elle est notée dans le journal du bot.',

    siteInjoignable: 'Le site ne répond pas pour le moment ; réessaie dans un instant.',

    // /forum : le compte et l'apparence
    cmdForum: 'Ton compte du site et ton apparence sur son forum',
    cmdCompte: 'Ton compte du site',
    cmdLier: 'Relier ton compte Discord à ton compte du site',
    cmdDelier: 'Délier ton compte Discord de ton compte du site',
    cmdApparence: 'Comment tu apparais sur le forum du site si ton compte n’est pas relié',
    cmdPublic: 'Paraître sous ton pseudo Discord',
    cmdInvite: 'Paraître sous un nom anonyme',
    cmdPerso: 'Paraître sous le pseudo de ton choix (changeable tous les 7 jours)',
    cmdPersoNom: 'Le pseudo choisi, de 2 à 32 caractères',
    cmdStatut: 'Voir comment tu apparais sur le forum du site',
    lierLien: 'Pour relier ton compte Discord à ton compte du site, ouvre ce lien — valable %d minutes, une seule fois.',
    lierBouton: 'Relier mon compte',
    dejaLie: 'Ton compte Discord est déjà relié au compte « %s » du site.',
    delie: 'Ton compte Discord n’est plus relié au compte « %s ».',
    pasLie: 'Ton compte Discord n’est relié à aucun compte du site.',
    seulMoyen: 'Impossible : c’est le seul moyen de te connecter au compte « %s ». Ajoute d’abord un mot de passe à ton compte, sur le site.',
    apparenceLie: 'Ton compte est relié au compte « %s » du site : tes messages paraissent toujours sous ce compte.',
    apparencePublic: 'Sur le forum du site, tes messages venus de Discord paraissent sous ton pseudo Discord.',
    apparenceInvite: 'Sur le forum du site, tes messages venus de Discord paraissent sous un nom anonyme : « %s ».',
    apparencePerso: 'Sur le forum du site, tes messages venus de Discord paraissent sous le pseudo « %s ».',
    apparenceSuivent: 'Tous tes messages déjà publiés suivent ce choix.',
    apparenceTropTot: 'Ton pseudo choisi ne change qu’une fois tous les 7 jours : prochain changement possible %s.',
    apparenceNomInvalide: 'Le pseudo choisi doit faire de 2 à 32 caractères.',
    apparenceNomPris: 'Ce pseudo est celui d’un membre du site : choisis-en un autre.',

    // Le Bugtracker
    cmdBug: 'Signaler un bogue dans le Bugtracker du site',
    cmdIdee: 'Proposer une idée dans le Bugtracker du site',
    fenetreBug: 'Signaler un bogue',
    fenetreIdee: 'Proposer une idée',
    champTitre: 'Titre',
    champDescription: 'Description',
    champDescriptionAide: 'Ce qui se passe, ce qui était attendu, comment le reproduire.',
    ticketOuvert: 'Ticket n° %d ouvert : %s',
    ticketFil: 'La discussion continue dans %s.',
    ticketNonLie: 'Un ticket appartient à un membre du site : relie d’abord ton compte avec /forum account link.',
    filNonLie: 'Pour que ce signalement aille dans le Bugtracker du site, relie ton compte avec /forum account link, puis utilise /bug ou /idee.',
    filDevientTicket: 'Ce fil est maintenant le ticket n° %d du Bugtracker : %s',
    ticketLigne: 'Ticket n° %d · %s · priorité %s',
    ticketDoublon: 'Doublon du ticket n° %d : %s',
    etiquetteBug: 'Bogue',
    etiquetteIdee: 'Idée',
    etiquetteQuestion: 'Question',
    etiquetteAutre: 'Autre',
    etiquetteOuvert: 'Ouvert',
    etiquetteEnCours: 'En cours',
    etiquetteResolu: 'Résolu',
    etiquetteFerme: 'Fermé',
    etiquetteRefuse: 'Ne sera pas fait',
    etiquetteDoublon: 'Doublon',
    prioriteFaible: 'faible',
    prioriteNormale: 'normale',
    prioriteHaute: 'haute',
    prioriteCritique: 'critique',

    // /role : les rôles temporaires
    cmdRole: 'Donner un rôle pour un temps limité, le retirer, voir ceux en cours',
    cmdRoleDonner: 'Donner un rôle à un membre pour une durée',
    cmdRoleRetirer: 'Retirer tout de suite un rôle temporaire',
    cmdRoleListe: 'Voir les rôles temporaires en cours',
    optMembre: 'Le membre',
    optRole: 'Le rôle',
    optDuree: 'La durée (avec son unité)',
    optUnite: 'L’unité de la durée',
    optRaison: 'La raison (facultative)',
    optMembreListe: 'Seulement ce membre (facultatif)',
    uniteMinutes: 'minutes',
    uniteHeures: 'heures',
    uniteJours: 'jours',
    uniteSemaines: 'semaines',
    roleDonne: 'Rôle %s donné à %s jusqu’au %s (%s).',
    roleRetire: 'Rôle %s retiré à %s.',
    pasTemporaire: 'Ce membre n’a pas ce rôle comme rôle temporaire.',
    aucunTemporaire: 'Aucun rôle temporaire en cours.',
    ligneTemporaire: '%s — %s — fin %s',
    roleInterdit: 'Ce rôle ne peut pas être donné : il est tenu par Discord ou par une intégration.',
    roleRelie: 'Ce rôle est relié à un groupe du site : il suit les groupes du membre et ne peut pas être temporaire.',
    roleTropHautBot: 'Place le rôle du bot au-dessus de ce rôle dans les réglages du serveur : sans cela, il ne peut ni le donner ni le retirer.',
    roleAuDessus: 'Ce rôle est au niveau de ton rôle le plus haut, ou au-dessus : tu ne peux pas le donner ni le retirer.',
    dureeTropLongue: 'Cette durée dépasse le maximum permis sur ce serveur : %d jours.',
    membreBot: 'Un rôle temporaire se donne à un membre, pas à un bot.',
    membreAbsent: 'Ce membre n’est pas sur le serveur.',

    // Le forum
    surLeSite: 'Sur le site',
    lireLaSuite: 'Lire la suite sur le site',
    filPublie: 'Ce fil est maintenant aussi sur le site : %s',
} as const;

export type CleTexte = keyof typeof TEXTES;
