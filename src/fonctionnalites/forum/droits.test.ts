import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { DU_BOT, ECRIRE, LIRE, planDesDroits, type Droit, type Ecrasement } from './droits.js';

const CIBLES = { everyone: '1', bot: '9', roles: [{ group_key: 'admins', role_id: '10' }, { group_key: 'members', role_id: '11' }, { group_key: '2', role_id: '12' }] };
const tout: Droit = { read: true, write: true };
const lire: Droit = { read: true, write: false };
const rien: Droit = { read: false, write: false };

test('un forum ouvert à tous les membres : rien à poser', () => {
    assert.deepEqual(planDesDroits({ members: tout, admins: tout, 2: tout }, true, CIBLES, []), { poser: [], retirer: [] });
});

test('un site d’avant la 1.2.48 ne dit pas les droits : rien ne change', () => {
    assert.deepEqual(planDesDroits({}, true, CIBLES, [{ id: '1', type: 0, allow: 0n, deny: LIRE }]), { poser: [], retirer: [] });
});

test('annonces : les membres lisent sans écrire, les administrateurs écrivent ; le bot garde ses permissions, posées d’abord', () => {
    const plan = planDesDroits({ members: lire, admins: tout, 2: lire }, true, CIBLES, []);

    assert.deepEqual(plan.poser, [
        { id: '9', type: 1, allow: DU_BOT, deny: 0n },
        { id: '1', type: 0, allow: 0n, deny: ECRIRE },
        { id: '10', type: 0, allow: ECRIRE, deny: 0n },
    ]);
    assert.deepEqual(plan.retirer, []);
});

test('un forum de l’équipe : caché du serveur, montré aux rôles des groupes qui le lisent', () => {
    const plan = planDesDroits({ members: rien, admins: tout, 2: lire }, true, CIBLES, []);

    assert.deepEqual(plan.poser.find((e) => e.id === '1'), { id: '1', type: 0, allow: 0n, deny: LIRE | ECRIRE });
    assert.deepEqual(plan.poser.find((e) => e.id === '10'), { id: '10', type: 0, allow: LIRE | ECRIRE, deny: 0n });
    assert.deepEqual(plan.poser.find((e) => e.id === '12'), { id: '12', type: 0, allow: LIRE, deny: 0n });
    assert.equal(plan.poser.find((e) => e.id === '11'), undefined);
});

test('en mode « par réaction », seule la lecture suit le site', () => {
    const plan = planDesDroits({ members: lire, admins: tout }, false, CIBLES, []);

    assert.deepEqual(plan, { poser: [], retirer: [] });
});

test('un réglage fait à la main sur une autre permission reste ; une permission rouverte sur le site se retire', () => {
    const existants: Ecrasement[] = [
        { id: '1', type: 0, allow: P.AttachFiles, deny: ECRIRE | P.AddReactions },
        { id: '10', type: 0, allow: ECRIRE, deny: 0n },
        { id: '42', type: 0, allow: LIRE, deny: 0n },
    ];
    const plan = planDesDroits({ members: tout, admins: tout }, true, CIBLES, existants);

    assert.deepEqual(plan.poser, [{ id: '1', type: 0, allow: P.AttachFiles, deny: P.AddReactions }]);
    assert.deepEqual(plan.retirer, ['10']);
});

test('déjà comme le site : rien à refaire', () => {
    const existants: Ecrasement[] = [
        { id: '9', type: 1, allow: DU_BOT, deny: 0n },
        { id: '1', type: 0, allow: 0n, deny: ECRIRE },
        { id: '10', type: 0, allow: ECRIRE, deny: 0n },
    ];

    assert.deepEqual(planDesDroits({ members: lire, admins: tout }, true, CIBLES, existants), { poser: [], retirer: [] });
});
