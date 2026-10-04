<div align="center">

<a href="https://neofrag-reborn.xyz"><img src="https://neofrag-reborn.xyz/themes/vitrine/images/partage/fr.png" alt="NeoFrag Reborn — le CMS libre des communautés" width="720"></a>

# Le bot Discord de NeoFrag Reborn

**Il relie un site NeoFrag Reborn et son serveur Discord — et se règle entièrement depuis l'administration du site.**

[![Version](https://img.shields.io/github/v/release/NeoFragReborn/bot-discord?label=version&color=2dd4bf)](https://github.com/NeoFragReborn/bot-discord/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/NeoFragReborn/bot-discord/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white)](https://github.com/NeoFragReborn/bot-discord/actions/workflows/ci.yml)
[![Node.js 22.9 ou plus](https://img.shields.io/badge/Node.js-%E2%89%A5%2022.9-339933.svg?logo=nodedotjs&logoColor=white)](package.json)
[![discord.js 14](https://img.shields.io/badge/discord.js-14-5865F2.svg?logo=discord&logoColor=white)](https://discord.js.org/)
[![Licence LGPL-3.0-or-later](https://img.shields.io/badge/licence-LGPL--3.0--or--later-blue.svg)](COPYING.LESSER)
[![Discord](https://img.shields.io/badge/Discord-rejoindre-5865F2.svg?logo=discord&logoColor=white)](https://discord.gg/UmBRbwxtch)

[Le CMS](https://github.com/NeoFragReborn/neofrag) · [Guide complet](https://neofrag-reborn.xyz/wiki/bot-discord) ·
[Versions](https://github.com/NeoFragReborn/bot-discord/releases) · [Discord](https://discord.gg/UmBRbwxtch) ·
[English](#-in-english)

</div>

Le bot est un programme à part, qui tourne en permanence sur une machine allumée (un VPS, un
Raspberry Pi, un PC) : un hébergement mutualisé ne peut pas le faire tourner, le site, lui, n'en a pas
besoin.

## ✨ Ce qu'il fait

Ses fonctionnalités s'allument une à une, depuis l'administration du site :

- 👥 **Rôles et pseudos** — un membre qui a lié son compte Discord reçoit sur le serveur les rôles reliés
  à ses groupes, et son pseudo du site si l'option est cochée ;
- 💬 **Forum ↔ salons Forum** — un sujet du site devient un fil, un fil devient un sujet ; réponses,
  modifications et suppressions suivent dans les deux sens, et les préfixes deviennent des étiquettes ;
- 🔗 **`/forum`** — relier son compte Discord à son compte du site, ou choisir comment on paraît sur le
  forum sans compte relié ;
- 🐛 **Bugtracker** — chaque ticket devient un fil, son type et son statut en étiquettes ; `/bug` et
  `/idee` ouvrent un ticket depuis Discord ;
- ⏳ **Rôles temporaires** — `/role` donne un rôle pour une durée, que le bot retire à l'échéance.

## 🧰 Réglé depuis le site

**Tout se règle dans l'administration du site**, module « Discord » : la clé du bot (gardée
chiffrée), le serveur, l'interrupteur marche / pause, le redémarrage, les correspondances salons ↔
forums et groupes ↔ rôles. Le bot y affiche son état et son journal. Sur sa machine, il ne garde que
deux lignes : l'adresse du site et sa clé d'accès.

## 🚀 En bref

Il faut **Node.js 22.9 ou plus**, sur une machine allumée en permanence.

```sh
npm ci
npm run build
cp .env.example .env      # puis y coller les deux lignes données par l'administration
npm start
```

Pour qu'il tourne en service : [`neofrag-bot.service`](neofrag-bot.service) (systemd), qui explique son
installation.

## 📚 Documentation

- 📖 Le mode d'emploi complet — créer l'application Discord, l'inviter, installer le bot, le mettre à
  jour — est le guide « Le bot Discord » de la documentation de NeoFrag Reborn :
  [dans le dépôt du CMS](https://github.com/NeoFragReborn/neofrag/blob/main/docs/guide/bot-discord.md), ou
  [dans le wiki du site du projet](https://neofrag-reborn.xyz/wiki/bot-discord). Tout site muni du module
  Wiki le publie aussi dans son wiki.
- 📝 Ce qui change d'une version à l'autre, et la version du site que chacune demande :
  [CHANGELOG.md](CHANGELOG.md).

## 🤝 Contribuer

- 🔧 Écrire une fonctionnalité, lancer les tests :
  [CONTRIBUTING.md](https://github.com/NeoFragReborn/bot-discord/blob/main/CONTRIBUTING.md).
- 🐛 Un bug : une [issue](https://github.com/NeoFragReborn/bot-discord/issues), avec la version du bot et
  celle du site.
- 💡 Une question, une idée : le [serveur Discord](https://discord.gg/UmBRbwxtch).
- 🔒 Une faille de sécurité : jamais d'issue publique — la
  [politique de sécurité](https://github.com/NeoFragReborn/.github/blob/main/SECURITY.md).

## 📜 Licence

Licence : LGPL-3.0 ou ultérieure ([COPYING](COPYING), [COPYING.LESSER](COPYING.LESSER)), comme NeoFrag
Reborn. Les bibliothèques qu'il emploie, et leurs licences : [NOTICE](NOTICE) — merci en particulier à
[discord.js](https://discord.js.org/).

## 🌍 In English

This is the Discord bot of [NeoFrag Reborn](https://github.com/NeoFragReborn/neofrag), a free PHP CMS
for communities. It links a site to its Discord server — roles and nicknames, forum ↔ Forum channels,
Bugtracker threads, temporary roles — and is configured entirely from the site's administration. It runs
as a separate program (Node.js 22.9 or later) on an always-on machine; shared hosting cannot run it, and
the site itself does not need it. The full guide is in French, in the
[CMS documentation](https://github.com/NeoFragReborn/neofrag/blob/main/docs/guide/bot-discord.md).
