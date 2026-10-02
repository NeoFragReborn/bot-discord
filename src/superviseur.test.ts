import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErreurConnexion, type Connexion } from './discord.js';
import { Journal, type EntreeJournal } from './journal.js';
import { ErreurSite, type CommandeSite, type ConfigBot, type ReponseSigneDeVie, type SigneDeVie, type Site } from './site.js';
import { Superviseur } from './superviseur.js';

const CONFIG: ConfigBot = { token: 'jeton-discord-1', client_id: '1', guild_id: '2', running: true, nicknames: false, channels: [], roles: [], version: 1, events_cursor: 0, api_token_id: 7 };
const GUILDE = { id: '2', name: 'Serveur', channels: [{ id: '10', name: 'forum', type: 15, parent_id: '', tags: [] }], roles: [] };

/** Un faux site : l'administration qu'on règle dans le test, et ce que le bot lui a envoyé. */
class FauxSite {
    reponse: ReponseSigneDeVie = { running: false, version: 1, commands: [] };
    config: ConfigBot = { ...CONFIG };
    panne = false;
    signes: SigneDeVie[] = [];
    lignes: EntreeJournal[] = [];
    lectures = 0;

    async signeDeVie(etat: SigneDeVie): Promise<ReponseSigneDeVie> {
        if (this.panne) {
            throw new ErreurSite(0, 'unreachable', 'site injoignable');
        }

        this.signes.push(structuredClone(etat));
        const reponse = this.reponse;
        this.reponse = { ...reponse, commands: [] };

        return reponse;
    }

    async config_(): Promise<ConfigBot> {
        this.lectures++;

        return this.config;
    }

    async journal(entrees: EntreeJournal[]): Promise<void> {
        if (this.panne) {
            throw new ErreurSite(0, 'unreachable', 'site injoignable');
        }

        this.lignes.push(...entrees);
    }
}

/** Une fausse connexion à Discord, qui note ce qu'on lui fait. */
class FausseConnexion implements Connexion {
    prete = true;
    intents = { members: true, content: false };
    fermee = false;
    reconfigurations: ConfigBot[] = [];
    tours = 0;
    curseur = 0;
    resynchronisations = 0;
    executees: CommandeSite[] = [];

    constructor(readonly config: ConfigBot) {}

    instantane() {
        return GUILDE;
    }

    async reconfigurer(config: ConfigBot): Promise<void> {
        this.reconfigurations.push(config);
    }

    async tour(): Promise<void> {
        this.tours++;
        this.curseur += 5;
    }

    async resynchroniser(): Promise<void> {
        this.resynchronisations++;
    }

    async executer(commande: CommandeSite): Promise<void> {
        this.executees.push(commande);
    }

    async fermer(): Promise<void> {
        this.fermee = true;
        this.prete = false;
    }
}

function monter(ouvrir?: (config: ConfigBot) => Promise<Connexion>) {
    const site = new FauxSite();
    const connexions: FausseConnexion[] = [];
    const journal = new Journal(() => {});
    const faux = { signeDeVie: site.signeDeVie.bind(site), config: site.config_.bind(site), journal: site.journal.bind(site) } as unknown as Site;
    const superviseur = new Superviseur({
        site: faux,
        journal,
        version: '0.1.0',
        intervalle: 30,
        declarations: [],
        textes: ['Bonjour'],
        ouvrir: ouvrir ?? (async (config) => {
            const c = new FausseConnexion(config);
            connexions.push(c);

            return c;
        }),
    });

    return { site, connexions, superviseur, journal };
}

test('en pause : la configuration est lue, rien ne se connecte, le signe de vie le dit', async () => {
    const { site, connexions, superviseur } = monter();

    await superviseur.tour();

    assert.equal(site.lectures, 1);
    assert.equal(connexions.length, 0);
    assert.deepEqual(site.signes[0], { version: '0.1.0', connected: false, intents: { members: false, content: false }, guild: null, features: [], texts: ['Bonjour'] });
});

test('en marche : la connexion s’ouvre, et le signe de vie suivant décrit le serveur', async () => {
    const { site, connexions, superviseur } = monter();
    site.reponse = { running: true, version: 1, commands: [] };

    await superviseur.tour();
    await superviseur.tour();

    assert.equal(connexions.length, 1);
    assert.equal(site.signes[1]?.connected, true);
    assert.deepEqual(site.signes[1]?.guild, GUILDE);
    assert.equal(connexions[0]?.tours, 2);
});

test('la configuration n’est relue que quand son numéro change, et la connexion en est prévenue', async () => {
    const { site, connexions, superviseur } = monter();
    site.reponse = { running: true, version: 1, commands: [] };

    await superviseur.tour();
    await superviseur.tour();
    assert.equal(site.lectures, 1);

    site.config = { ...CONFIG, nicknames: true, version: 2 };
    site.reponse = { running: true, version: 2, commands: [] };
    await superviseur.tour();

    assert.equal(site.lectures, 2);
    assert.equal(connexions.length, 1);
    assert.equal(connexions[0]?.reconfigurations[0]?.nicknames, true);
});

test('une nouvelle clé Discord fait reconnecter', async () => {
    const { site, connexions, superviseur } = monter();
    site.reponse = { running: true, version: 1, commands: [] };
    await superviseur.tour();

    site.config = { ...CONFIG, token: 'jeton-discord-2', version: 2 };
    site.reponse = { running: true, version: 2, commands: [] };
    await superviseur.tour();

    assert.equal(connexions.length, 2);
    assert.equal(connexions[0]?.fermee, true);
    assert.equal(connexions[1]?.config.token, 'jeton-discord-2');
});

test('« Redémarrer » ferme et rouvre la connexion', async () => {
    const { site, connexions, superviseur } = monter();
    site.reponse = { running: true, version: 1, commands: [] };
    await superviseur.tour();

    site.reponse = { running: true, version: 1, commands: ['restart'] };
    await superviseur.tour();

    assert.equal(connexions.length, 2);
    assert.equal(connexions[0]?.fermee, true);
    assert.ok(site.lignes.some((l) => l.message.includes('Redémarrage demandé')));
});

test('« Pause » ferme la connexion, et le serveur vu en dernier reste décrit au site', async () => {
    const { site, connexions, superviseur } = monter();
    site.reponse = { running: true, version: 1, commands: [] };
    await superviseur.tour();

    site.reponse = { running: false, version: 1, commands: [] };
    await superviseur.tour();
    await superviseur.tour();

    assert.equal(connexions[0]?.fermee, true);
    assert.equal(site.signes[2]?.connected, false);
    assert.deepEqual(site.signes[2]?.guild, GUILDE);
});

test('une clé refusée pour de bon : plus d’essai tant que la configuration ne change pas', async () => {
    let essais = 0;
    const { site, superviseur } = monter(async () => {
        essais++;
        throw new ErreurConnexion(true, 'Discord refuse la clé du bot');
    });
    site.reponse = { running: true, version: 1, commands: [] };

    await superviseur.tour();
    await superviseur.tour();
    await superviseur.tour();
    assert.equal(essais, 1);

    site.config = { ...CONFIG, token: 'nouveau', version: 2 };
    site.reponse = { running: true, version: 2, commands: [] };
    await superviseur.tour();
    assert.equal(essais, 2);
});

test('une panne passagère de Discord : les essais s’espacent', async () => {
    let essais = 0;
    const { site, superviseur } = monter(async () => {
        essais++;
        throw new ErreurConnexion(false, 'Discord injoignable');
    });
    site.reponse = { running: true, version: 1, commands: [] };

    // Essais aux tours 1, 2, 4, 8 : un, puis un tour d'attente, puis trois…
    const essaisParTour: number[] = [];

    for (let i = 0; i < 8; i++) {
        await superviseur.tour();
        essaisParTour.push(essais);
    }

    assert.deepEqual(essaisParTour, [1, 2, 2, 3, 3, 3, 3, 4]);
});

test('le site en panne : le bot continue, le journal attend et repart ensuite', async () => {
    const { site, connexions, superviseur, journal } = monter();
    site.reponse = { running: true, version: 1, commands: [] };
    await superviseur.tour();

    site.panne = true;
    journal.info('pendant la panne');
    await superviseur.tour();
    await superviseur.tour();

    assert.equal(connexions[0]?.fermee, false);
    assert.ok(journal.enAttente >= 2);

    site.panne = false;
    await superviseur.tour();

    assert.ok(site.lignes.some((l) => l.message === 'pendant la panne'));
    assert.ok(site.lignes.some((l) => l.message.startsWith('Site de nouveau joignable')));
    assert.equal(journal.enAttente, 0);
});

test('la clé Discord est masquée dans le journal dès qu’elle est connue', async () => {
    const { site, superviseur, journal } = monter();
    await superviseur.tour();

    journal.error("erreur qui recopie %s", CONFIG.token);
    await superviseur.tour();

    assert.ok(site.lignes.some((l) => l.message === 'erreur qui recopie [masqué]'));
});

test('« Resynchroniser » et la mise en place passent à la connexion ; sans connexion, ils sont dits ignorés', async () => {
    const { site, connexions, superviseur } = monter();

    site.reponse = { running: false, version: 1, commands: [{ type: 'resync', data: {} }] };
    await superviseur.tour();
    assert.ok(site.lignes.some((l) => l.template === 'Commande « %s » ignorée : le bot n’est pas connecté à Discord.' && l.args[0] === 'resync'));

    site.reponse = { running: true, version: 1, commands: [{ type: 'resync', data: {} }, { type: 'setup', data: { id: '1' } }] };
    await superviseur.tour();

    assert.equal(connexions[0]?.resynchronisations, 1);
    assert.deepEqual(connexions[0]?.executees, [{ type: 'setup', data: { id: '1' } }]);
});

test('un site 1.2.11 qui n’envoie que le nom d’une commande est compris', async () => {
    const { site, connexions, superviseur } = monter();
    site.reponse = { running: true, version: 1, commands: [] };
    await superviseur.tour();

    site.reponse = { running: true, version: 1, commands: ['restart'] };
    await superviseur.tour();

    assert.equal(connexions.length, 2);
});

test('le curseur du fil d’événements part au site, et survit à la pause', async () => {
    const { site, superviseur } = monter();
    site.reponse = { running: true, version: 1, commands: [] };

    await superviseur.tour();
    await superviseur.tour();
    assert.equal(site.signes[1]?.events_cursor, 5);

    site.reponse = { running: false, version: 1, commands: [] };
    await superviseur.tour();
    await superviseur.tour();

    assert.equal(site.signes[3]?.connected, false);
    assert.equal(site.signes[3]?.events_cursor, 10);
});
