import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErreurEnvironnement, lireEnvironnement } from './environnement.js';

const CLE = 'nfr_' + 'a1'.repeat(20);

test('une configuration correcte est lue, l’adresse finit par une seule barre', () => {
    const env = lireEnvironnement({ NF_SITE_URL: ' https://exemple.fr/sous-dossier// ', NF_API_KEY: CLE });

    assert.deepEqual(env, { site: 'https://exemple.fr/sous-dossier/', cle: CLE, intervalle: 30 });
});

test('une adresse absente ou qui n’est pas http(s) est refusée', () => {
    assert.throws(() => lireEnvironnement({ NF_API_KEY: CLE }), ErreurEnvironnement);
    assert.throws(() => lireEnvironnement({ NF_SITE_URL: 'ftp://exemple.fr', NF_API_KEY: CLE }), ErreurEnvironnement);
});

test('une clé d’accès mal formée est refusée', () => {
    assert.throws(() => lireEnvironnement({ NF_SITE_URL: 'https://exemple.fr', NF_API_KEY: 'nfr_court' }), ErreurEnvironnement);
    assert.throws(() => lireEnvironnement({ NF_SITE_URL: 'https://exemple.fr', NF_API_KEY: CLE.toUpperCase() }), ErreurEnvironnement);
});

test('l’intervalle est borné entre 10 et 300 secondes', () => {
    const base = { NF_SITE_URL: 'https://exemple.fr', NF_API_KEY: CLE };

    assert.equal(lireEnvironnement({ ...base, NF_BOT_INTERVALLE: '2' }).intervalle, 10);
    assert.equal(lireEnvironnement({ ...base, NF_BOT_INTERVALLE: '9999' }).intervalle, 300);
    assert.equal(lireEnvironnement({ ...base, NF_BOT_INTERVALLE: 'n’importe quoi' }).intervalle, 30);
});
