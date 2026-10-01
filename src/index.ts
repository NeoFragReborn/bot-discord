/**
 * NeoFrag Reborn — le bot Discord.
 *
 * Lancement : `npm start` (lit `.env` s'il existe), ou le service systemd fourni
 * (`neofrag-bot.service`). Voir le guide du wiki « Le bot Discord ».
 */

import { readFileSync } from 'node:fs';
import { ConnexionDiscord } from './discord.js';
import { ErreurEnvironnement, lireEnvironnement } from './environnement.js';
import { fonctionnalites } from './fonctionnalites/index.js';
import { Journal, messageErreur } from './journal.js';
import { Site } from './site.js';
import { Superviseur } from './superviseur.js';

const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

let environnement;

try {
    environnement = lireEnvironnement(process.env);
} catch (erreur) {
    console.error(erreur instanceof ErreurEnvironnement ? erreur.message : messageErreur(erreur));
    process.exit(78); // EX_CONFIG : systemd ne relance pas un bot mal configuré (cf. neofrag-bot.service).
}

const journal = new Journal();
journal.masquer(environnement.cle);

const site = new Site(environnement.site, environnement.cle);
const superviseur = new Superviseur({
    site,
    journal,
    version,
    intervalle: environnement.intervalle,
    ouvrir: (config) => ConnexionDiscord.ouvrir(config, site, journal, fonctionnalites()),
});

process.on('unhandledRejection', (erreur) => journal.error('Erreur inattendue : %s', messageErreur(erreur)));

let arret = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        if (arret) {
            return;
        }

        arret = true;
        void superviseur.arreter().finally(() => process.exit(0));
    });
}

journal.info('Bot NeoFrag Reborn %s démarré — site %s', version, environnement.site);
superviseur.demarrer();
