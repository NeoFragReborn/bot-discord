# Le bot Discord de NeoFrag Reborn

Il relie un site NeoFrag Reborn et son serveur Discord. C'est un programme à part, qui tourne en
permanence sur une machine allumée (un VPS, un Raspberry Pi, un PC) : un hébergement mutualisé ne
peut pas le faire tourner, le site, lui, n'en a pas besoin.

**Tout se règle dans l'administration du site**, module « Discord » : la clé du bot (gardée
chiffrée), le serveur, l'interrupteur marche / pause, le redémarrage, les correspondances salons ↔
forums et groupes ↔ rôles. Le bot y affiche son état et son journal. Sur sa machine, il ne garde que
deux lignes : l'adresse du site et sa clé d'accès.

Le mode d'emploi complet — créer l'application Discord, l'inviter, installer le bot, le mettre à jour —
est le guide « Le bot Discord » de la documentation de NeoFrag Reborn, que tout site muni du module
Wiki publie aussi dans son wiki.

## En bref

```sh
npm ci
npm run build
cp .env.example .env      # puis y coller les deux lignes données par l'administration
npm start
```

Pour qu'il tourne en service : `neofrag-bot.service` (systemd), qui explique son installation.

- Ce qui change d'une version à l'autre, et la version du site que chacune demande : `CHANGELOG.md`.
- Écrire une fonctionnalité, lancer les tests : `CONTRIBUTING.md`.

Licence : LGPL-3.0 ou ultérieure (`COPYING`, `COPYING.LESSER`), comme NeoFrag Reborn. Les bibliothèques
qu'il emploie, et leurs licences : `NOTICE`.
