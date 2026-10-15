import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXCLUSION_MAX_MS, application, exclusionAPoser, raisonDuBan, sanctionDuBan, versLeSite } from './regles.js';

const maintenant = Date.UTC(2026, 9, 16, 12);
const dans = (jours: number): number => Math.round((maintenant + jours * 86_400_000) / 1_000);

test('un muet devient une exclusion temporaire, jusqu’à son échéance', () => {
    assert.deepEqual(application({ sanction_id: 1, type: 'mute', expires_at: dans(3) }, maintenant), { faire: 'exclure', jusqua: dans(3) * 1_000 });
});

test('un muet de plus de 28 jours, ou sans fin, s’exclut 28 jours (et se renouvellera)', () => {
    assert.deepEqual(application({ sanction_id: 1, type: 'mute', expires_at: dans(90) }, maintenant), { faire: 'exclure', jusqua: maintenant + EXCLUSION_MAX_MS });
    assert.deepEqual(application({ sanction_id: 1, type: 'mute', expires_at: null }, maintenant), { faire: 'exclure', jusqua: maintenant + EXCLUSION_MAX_MS });
});

test('les bannissements, temporaire ou définitif, bannissent ; une sanction échue ne fait rien', () => {
    assert.deepEqual(application({ sanction_id: 1, type: 'ban_temp', expires_at: dans(7) }, maintenant), { faire: 'bannir' });
    assert.deepEqual(application({ sanction_id: 1, type: 'ban_perm', expires_at: null }, maintenant), { faire: 'bannir' });
    assert.deepEqual(application({ sanction_id: 1, type: 'ban_temp', expires_at: dans(-1) }, maintenant), { faire: 'rien' });
});

test('l’exclusion se pose quand il n’y en a pas, se renouvelle à moins de deux jours, ne se rogne jamais', () => {
    const voulue = maintenant + 20 * 86_400_000;

    assert.equal(exclusionAPoser(null, voulue, maintenant), true);
    assert.equal(exclusionAPoser(maintenant - 1, voulue, maintenant), true, 'une exclusion finie');
    assert.equal(exclusionAPoser(maintenant + 86_400_000, voulue, maintenant), true, 'finit demain, il en faut vingt jours');
    assert.equal(exclusionAPoser(maintenant + 10 * 86_400_000, voulue, maintenant), false, 'encore dix jours : on attend');
    assert.equal(exclusionAPoser(maintenant + 25 * 86_400_000, voulue, maintenant), false, 'posée plus longue par quelqu’un : on n’y touche pas');
});

test('un bannissement du bot porte le numéro de sa sanction, et seul celui-là se relit', () => {
    assert.equal(sanctionDuBan(raisonDuBan(42, 'spam')), 42);
    assert.equal(sanctionDuBan('Spam répété'), null, 'un bannissement posé par un humain');
    assert.equal(sanctionDuBan(null), null);
    assert.equal(sanctionDuBan('Voir NeoFrag #12'), null, 'la marque est en tête, pas n’importe où');
    assert.ok(raisonDuBan(1, 'x'.repeat(900)).length <= 512, 'Discord plafonne la raison à 512 caractères');
});

test('de Discord vers le site : ce que fait le bot ne revient jamais', () => {
    assert.deepEqual(versLeSite({ action: 'ban', executeur: '9', bot: '9' }, maintenant), { faire: 'rien' });
});

test('de Discord vers le site : un ban devient définitif, une exclusion un muet de même durée', () => {
    assert.deepEqual(versLeSite({ action: 'ban', executeur: '7', bot: '9' }, maintenant), { faire: 'sanctionner', type: 'ban_perm', duree: null });
    assert.deepEqual(versLeSite({ action: 'timeout', executeur: '7', bot: '9', jusqua: maintenant + 3_600_000 }, maintenant), { faire: 'sanctionner', type: 'mute', duree: 3_600 });
});

test('de Discord vers le site : débannir et retirer l’exclusion lèvent', () => {
    assert.deepEqual(versLeSite({ action: 'unban', executeur: '7', bot: '9' }, maintenant), { faire: 'lever', type: 'ban_perm' });
    assert.deepEqual(versLeSite({ action: 'timeout', executeur: '7', bot: '9', jusqua: null }, maintenant), { faire: 'lever', type: 'mute' });
});
