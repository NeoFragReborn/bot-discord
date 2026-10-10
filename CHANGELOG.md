# Journal des versions du bot Discord

Le bot a ses propres numéros de version, indépendants de ceux de NeoFrag Reborn. Chaque version dit
la version du site qu'elle demande. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et les numéros le [versionnage sémantique](https://semver.org/lang/fr/).

## [0.2.7] — 2026-10-10

Demande NeoFrag Reborn **1.2.12** ou plus récent ; les images d'un ticket demandent la **1.2.49** — avec une version
plus ancienne, elles restent des liens vers Discord, comme avant.

### Ajouté
- **Les images jointes à un ticket du Bugtracker gardent leur place sur le site** : une capture d'un bogue, la
  maquette d'une idée, envoyées dans le fil Discord d'un ticket — salon des tickets ou des suggestions —, à son
  ouverture ou dans une réponse. Le site les garde, comme celles du forum, et le ticket les montre ; avant, il n'en
  restait qu'un lien vers le message Discord. Le forum et le Bugtracker partagent maintenant ce code.

## [0.2.6] — 2026-10-10

Demande NeoFrag Reborn **1.2.12** ou plus récent, comme la 0.2.5.

### Modifié
- **Le journal ne note plus les reconnexions ordinaires à Discord.** Discord demande lui-même au bot de se
  reconnecter plusieurs fois par jour, et la connexion revient dans la seconde : chacune s'écrivait en
  avertissement, « Connexion à Discord perdue », que l'administration du site montrait comme un incident. Seule
  une coupure qui dure plus d'une minute se dit désormais, et sa durée à son retour.

## [0.2.5] — 2026-10-09

Demande NeoFrag Reborn **1.2.12** ou plus récent, comme la 0.2.4 ; un ticket qui change de salon demande
la **1.2.48** — avec une version plus ancienne, son fil reste où il est.

### Ajouté
- **Les idées ont leur salon, à part des bogues** : un nouveau réglage du Bugtracker, « Salon Forum des
  suggestions ». Les tickets de type Idée y ont leur fil, avec l'étiquette Idée et celles des statuts ;
  les autres restent dans le salon des tickets. Choisir ce salon y fait passer les idées encore ouvertes.
  Un fil ouvert à la main dans le salon des suggestions devient une idée ; `/idee` y ouvre son fil, et sa
  fenêtre demande l'idée et ce qu'elle apporterait au lieu des étapes d'un bogue.
- **Un ticket qui change de type change de salon** : Discord ne déplace pas un fil, le bot en ouvre un
  nouveau dans le bon salon. L'ancien fil, verrouillé et archivé, renvoie au nouveau, et le nouveau à
  l'ancien. Sur le site, le ticket garde tous ses commentaires.
- **Les rôles reliés portent le nom et la couleur de leur groupe** (NeoFrag Reborn 1.2.48) : un groupe
  renommé ou recoloré sur le site l'est aussi sur le serveur, au passage qui suit. Un nouveau réglage des
  rôles l'éteint ; un rôle relié à plusieurs groupes garde les siens.
- **Les permissions des salons reliés suivent les droits de leur forum sur le site** (NeoFrag Reborn
  1.2.48) : tout le serveur compte comme les membres du site ; qui ne peut pas lire le forum ne voit pas
  le salon, qui ne peut pas y écrire n'y poste pas (en mode « tout »), et un rôle relié rend à son groupe
  ce que les membres n'ont pas. Jusqu'ici, n'importe qui pouvait ouvrir un fil dans le salon d'un forum
  réservé à l'équipe, et le bot le recopiait sur le site. Le bot ne touche qu'à la vue et à l'écriture,
  pour @everyone, les rôles reliés et lui-même. Un nouveau réglage du forum l'éteint.
- Un message que le site refuse parce que son auteur n'a pas le droit d'écrire dans le forum reste sur
  Discord ; le journal le dit une fois, sans erreur.

### Changé
- La mise en place du serveur donne leur couleur aux rôles qu'elle crée par la propriété `colors` de
  Discord, et non plus par `color`, dépréciée.

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
