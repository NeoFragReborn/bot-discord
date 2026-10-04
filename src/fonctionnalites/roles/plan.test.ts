import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planifier, type EtatDiscord } from './plan.js';

const RELIES = [
    { group_key: 'members', role_id: '100' },
    { group_key: 'admins', role_id: '200' },
];

const etat = (roles: string[], pseudo: string | null = null, proprietaire = false): EtatDiscord => ({ roles: new Set(roles), pseudo, proprietaire });

test('un membre du groupe reçoit le rôle relié', () => {
    assert.deepEqual(planifier(['members'], 'Alex', etat([]), RELIES, false), { ajouter: ['100'], retirer: [], pseudo: null });
});

test('un membre sorti du groupe perd le rôle relié', () => {
    assert.deepEqual(planifier(['members'], 'Alex', etat(['100', '200']), RELIES, false), { ajouter: [], retirer: ['200'], pseudo: null });
});

test('un rôle que rien ne relie n’est jamais touché', () => {
    assert.deepEqual(planifier([], 'Alex', etat(['999']), RELIES, false), { ajouter: [], retirer: [], pseudo: null });
});

test('deux groupes reliés au même rôle : il suffit d’être dans l’un', () => {
    const relies = [...RELIES, { group_key: 'vip', role_id: '100' }];

    assert.deepEqual(planifier(['vip'], 'x', etat(['100']), relies, false).retirer, []);
    assert.deepEqual(planifier([], 'x', etat(['100']), relies, false).retirer, ['100']);
});

test('rien à faire : un plan vide', () => {
    assert.deepEqual(planifier(['members', 'admins'], 'Alex', etat(['100', '200'], 'Alex'), RELIES, true), { ajouter: [], retirer: [], pseudo: null });
});

test('les pseudos : posés seulement si l’option est cochée et s’ils diffèrent', () => {
    assert.equal(planifier([], 'Alex', etat([], null), [], true).pseudo, 'Alex');
    assert.equal(planifier([], 'Alex', etat([], 'Autre'), [], true).pseudo, 'Alex');
    assert.equal(planifier([], 'Alex', etat([], 'Autre'), [], false).pseudo, null);
    assert.equal(planifier([], '  ', etat([], 'Autre'), [], true).pseudo, null);
});

test('le pseudo du propriétaire du serveur n’est jamais changé (Discord le refuse)', () => {
    assert.equal(planifier([], 'Alex', etat([], 'Autre', true), [], true).pseudo, null);
});

test('un pseudo trop long est coupé à 32 caractères, sans couper un émoji en deux', () => {
    const long = '🎮'.repeat(40);
    const pseudo = planifier([], long, etat([]), [], true).pseudo ?? '';

    assert.equal(Array.from(pseudo).length, 32);
    assert.equal(pseudo, '🎮'.repeat(32));
});
