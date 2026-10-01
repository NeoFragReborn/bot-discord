# Journal des versions du bot Discord

Le bot a ses propres numéros de version, indépendants de ceux de NeoFrag Reborn. Chaque version dit
la version du site qu'elle demande. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et les numéros le [versionnage sémantique](https://semver.org/lang/fr/).

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
