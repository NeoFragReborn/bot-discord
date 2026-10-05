# Journal des versions du bot Discord

Le bot a ses propres numéros de version, indépendants de ceux de NeoFrag Reborn. Chaque version dit
la version du site qu'elle demande. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et les numéros le [versionnage sémantique](https://semver.org/lang/fr/).

## [0.2.4] — 2026-10-05

Demande NeoFrag Reborn **1.2.12** ou plus récent, comme la 0.2.3 ; les images envoyées sur Discord
demandent la **1.2.27** pour s'afficher sur le site — avec une version plus ancienne, elles restent des liens.

### Ajouté
- **Une image jointe sur Discord s'affiche dans le message du forum** : le bot la télécharge et la confie
  au site (JPEG, PNG, GIF ou WebP, 5 Mo au plus), qui la contrôle comme celles de son éditeur. Les autres
  fichiers, et toutes les pièces jointes du Bugtracker, gardent le lien vers le message Discord.

### Corrigé
- **Les images d'un message du forum apparaissent sur Discord.** Le bot recopiait l'adresse relative que
  l'éditeur du site écrit (`/upload/editeur/…`) : Discord la montrait en texte, sans l'image. Les images
  partent maintenant en aperçus sous le message, à leur adresse complète, et suivent ses modifications ;
  au-delà de dix, la limite de Discord, les suivantes restent des liens. Un lien relatif du site devient
  lui aussi un lien complet. Vu sur le serveur Discord officiel du projet.
- **Les liens d'un message recopié n'affichent plus de carte d'aperçu** : retirer une de ces cartes, sur
  Discord, masquait tous les aperçus du message, images comprises. Un message dont les aperçus avaient été
  masqués retrouve ses images à sa prochaine modification sur le site.

## [0.2.3] — 2026-10-04

Demande NeoFrag Reborn **1.2.12** ou plus récent, comme la 0.2.2.

### Corrigé
- **Plus d'avertissement de discord.js à chaque réponse privée** (« Supplying "ephemeral" for interaction
  response options is deprecated ») : les réponses que seul l'auteur de la commande voit — `/forum`,
  `/bug`, `/idee`, `/role` et le message d'erreur d'une commande — passent par le drapeau
  `MessageFlags.Ephemeral`. Rien ne change pour les membres. Vu dans le journal du bot du site officiel.

## [0.2.2] — 2026-10-04

Demande NeoFrag Reborn **1.2.12** ou plus récent, comme la 0.2.1.

### Corrigé
- **Les messages du forum passés à Discord perdent toutes leurs balises HTML**, même imbriquées
  (`<scr<b>ipt>`) : un seul passage en laissait reparaître. Discord n'interprète pas le HTML — rien ne s'y
  exécutait —, mais le reste d'une balise s'affichait dans le message. Relevé par l'analyse de code de
  GitHub à l'ouverture des dépôts.

### Modifié
- Le dépôt garde ses fins de ligne en LF (`.gitattributes`) : un clone sous Windows ne passe plus tout le
  code en CRLF.

## [0.2.1] — 2026-10-04

Demande NeoFrag Reborn **1.2.12** ou plus récent, comme la 0.2.0. Rien ne change dans le fonctionnement du
bot : il devient un projet à part entière, publié dans son propre dépôt.

### Modifié
- Sa licence est livrée avec lui (LGPL-3.0 ou ultérieure : `COPYING`, `COPYING.LESSER`), avec une `NOTICE`
  qui nomme les paquets npm qu'il emploie et leurs licences, un guide du contributeur et ce journal.
- Ses tests lisent son contrat avec le site (`contrat-du-site.json` : les permissions Discord qu'il
  demande et les textes traduits qu'il affiche) : ils jugent seuls, sans le code du site.
- L'exemple de service systemd et `.env.example` emploient des chemins et une adresse d'exemple.

## [0.2.0] — 2026-10-02

Demande NeoFrag Reborn **1.2.12** ou plus récent. Après la mise à jour, crée une nouvelle clé d'accès
dans l'administration du site (*Discord → Clé d'accès du bot*) : elle porte les droits du Bugtracker.

### Ajouté

- **Des fonctionnalités qui s'allument une à une.** Le bot déclare ce qu'il sait faire ; *Discord →
  Fonctionnalités* les liste, et chacune s'allume, s'éteint et se règle depuis l'administration,
  appliquée dans la minute sans redémarrer. **Resynchroniser** remet tout d'accord, et le forum rattrape
  au démarrage ce qui s'est écrit sur Discord pendant une absence du bot.
- **La mise en place du serveur.** Depuis l'administration, le bot crée sur Discord une catégorie, un
  salon Forum par forum choisi (ses préfixes en étiquettes) et un rôle par groupe, pose les
  correspondances lui-même, et reprend au lieu de dédoubler ce qui existe déjà. Un aperçu précède, et
  la dernière mise en place s'annule.
- **`/forum`.** `/forum account link` relie son compte Discord à son compte du site par un lien à usage
  unique ; `/forum account unlink` le délie. Sans compte relié, `/forum visibility` choisit comment on
  paraît sur le forum : son pseudo Discord, un nom anonyme, ou un pseudo choisi.
- **Préfixes du forum ↔ étiquettes des salons Forum**, dans les deux sens.
- **Le Bugtracker dans un salon Forum.** Chaque ticket devient un fil, son type et son statut en sont
  les étiquettes ; les commentaires passent dans les deux sens ; `/bug` et `/idee` ouvrent un ticket
  depuis Discord, et un fil ouvert à la main dans le salon devient un ticket.
- **Les rôles temporaires.** `/role` donne un rôle à un membre pour une durée, le retire ou montre ceux
  en cours ; le bot le retire à l'échéance, même après un redémarrage, et le redonne à qui quitte puis
  rejoint le serveur pour y échapper.

## [0.1.0] — 2026-10-01

Demande NeoFrag Reborn **1.2.11** ou plus récent.

### Ajouté

- **Rôles et pseudos.** Un membre qui a lié son compte Discord reçoit sur le serveur les rôles reliés à
  ses groupes et les perd en les quittant ; il y porte son pseudo du site si l'option est cochée. Le
  site fait foi, et un rôle que rien ne relie n'est jamais touché.
- **Forum ↔ salon Forum de Discord**, dans les deux sens : un sujet du site devient un fil, un fil
  devient un sujet ; réponses, modifications et suppressions suivent. Salon par salon : tout
  synchroniser, ou seulement les fils qu'un modérateur marque d'une réaction.
- Un programme à part (Node.js 22.9 ou plus, sur une machine allumée en permanence), qui ne garde sur
  sa machine que l'adresse du site et une clé d'accès : tout le reste se règle dans l'administration.
