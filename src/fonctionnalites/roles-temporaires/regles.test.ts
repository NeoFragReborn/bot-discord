import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTES } from '../../textes.js';
import { enSecondes, refus, type Demande } from './regles.js';

const recevable: Demande = { roleId: '5', guildeId: '1', gere: false, relies: ['9'], positionRole: 3, positionBot: 10, positionAuteur: 6 };

test('la durée se compte en secondes selon son unité', () => {
    assert.equal(enSecondes(90, 'minutes'), 5_400);
    assert.equal(enSecondes(2, 'weeks'), 1_209_600);
    assert.equal(enSecondes(3, 'siècles'), 0);
    assert.equal(enSecondes(-4, 'days'), 0);
});

test('un rôle ordinaire, sous le bot et sous l’auteur, se donne', () => {
    assert.equal(refus(recevable), null);
    assert.equal(refus({ ...recevable, positionAuteur: null }), null, 'le propriétaire du serveur n’a pas de plafond');
});

test('@everyone et les rôles tenus par une intégration sont refusés', () => {
    assert.equal(refus({ ...recevable, roleId: '1' }), TEXTES.roleInterdit);
    assert.equal(refus({ ...recevable, gere: true }), TEXTES.roleInterdit);
});

test('un rôle relié à un groupe du site ne devient pas temporaire', () => {
    assert.equal(refus({ ...recevable, roleId: '9' }), TEXTES.roleRelie);
});

test('la hiérarchie : le bot doit être au-dessus du rôle, l’auteur aussi', () => {
    assert.equal(refus({ ...recevable, positionBot: 3 }), TEXTES.roleTropHautBot);
    assert.equal(refus({ ...recevable, positionAuteur: 3 }), TEXTES.roleAuDessus);
    assert.equal(refus({ ...recevable, positionAuteur: 2 }), TEXTES.roleAuDessus);
});
