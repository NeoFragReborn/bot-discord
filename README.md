# Le bot Discord de NeoFrag Reborn

Il relie un site NeoFrag Reborn et son serveur Discord. C'est un programme à part, qui tourne en
permanence sur une machine allumée (un VPS, un Raspberry Pi, un PC) : un hébergement mutualisé ne
peut pas le faire tourner, le site, lui, n'en a pas besoin.

**Tout se règle dans l'administration du site**, module « Discord » : la clé du bot (gardée
chiffrée), le serveur, l'interrupteur marche / pause, le redémarrage, les correspondances salons ↔
forums et groupes ↔ rôles. Le bot y affiche son état et son journal. Sur sa machine, il ne garde que
deux lignes : l'adresse du site et sa clé d'accès.

Le mode d'emploi complet — créer l'application Discord, l'inviter, installer le bot, écrire une
fonctionnalité — est dans le wiki du site, guide « Le bot Discord ».

## En bref

```sh
npm ci
npm run build
cp .env.example .env      # puis y coller les deux lignes données par l'administration
npm start
```

Pour qu'il tourne en service : `neofrag-bot.service` (systemd), qui explique son installation.

## Développer

- Node.js 22.9 ou plus, TypeScript, [discord.js](https://discord.js.org/).
- `npm test` compile et lance les tests (`src/**/*.test.ts`, lanceur intégré de Node).
- Une fonctionnalité est un dossier de `src/fonctionnalites/`, inscrit dans
  `src/fonctionnalites/index.ts` ; son contrat est dans `src/fonctionnalites/types.ts`.

Licence : LGPL-3.0, comme NeoFrag Reborn.
