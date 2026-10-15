import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { PERMISSIONS_DU_BOT, droitsDuBot } from './discord.js';

test('un bot administrateur est signalé : il n’en a pas besoin', () => {
    assert.deepEqual(droitsDuBot(new PermissionsBitField(PermissionsBitField.Flags.Administrator)), { administrateur: true, manquants: [] });
});

test('un bot qui a exactement les droits du lien d’invitation ne dit rien', () => {
    assert.deepEqual(droitsDuBot(new PermissionsBitField([...PERMISSIONS_DU_BOT])), { administrateur: false, manquants: [] });
});

test('les droits qui manquent sont nommés comme dans le guide', () => {
    const sans = PERMISSIONS_DU_BOT.filter((p) => p !== PermissionsBitField.Flags.ManageRoles && p !== PermissionsBitField.Flags.ManageNicknames);

    assert.deepEqual(droitsDuBot(new PermissionsBitField([...sans])).manquants, ['ManageRoles', 'ManageNicknames']);
});

test('sans membre connu sur le serveur, rien n’est jugé', () => {
    assert.deepEqual(droitsDuBot(null), { administrateur: false, manquants: [] });
});
