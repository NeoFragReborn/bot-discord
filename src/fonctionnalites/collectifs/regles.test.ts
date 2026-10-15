import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OverwriteType, PermissionFlagsBits } from 'discord.js';
import { droitsDuSalon, nomDeRole, nomDeSalon } from './regles.js';

test('le nom d’un salon : minuscules, sans accent, des tirets', () => {
    assert.equal(nomDeSalon('Équipe Rédaction', 3), 'equipe-redaction');
    assert.equal(nomDeSalon('  Les « Bâtisseurs » !  ', 3), 'les-batisseurs');
    assert.equal(nomDeSalon('Modo & Co.', 3), 'modo-co');
});

test('un nom qui ne laisse rien devient « collectif-<id> »', () => {
    assert.equal(nomDeSalon('★★★', 12), 'collectif-12');
    assert.equal(nomDeSalon('', 7), 'collectif-7');
});

test('un nom trop long est coupé, sans tiret au bout', () => {
    const nom = nomDeSalon('a'.repeat(89) + ' b' + 'c'.repeat(40), 1);

    assert.ok(nom.length <= 90);
    assert.ok(!nom.endsWith('-'));
});

test('le nom d’un rôle tient dans les cent caractères de Discord', () => {
    assert.equal(nomDeRole('x'.repeat(150)).length, 100);
    assert.equal(nomDeRole('   '), 'Collectif');
});

test('le salon est fermé à tous, ouvert au rôle du collectif et au bot', () => {
    const droits = droitsDuSalon('100', '200', '300');
    const [tous, role, bot] = droits;

    assert.ok(tous && role && bot);
    assert.deepEqual(tous, { id: '100', type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] });
    assert.equal(role.id, '200');
    assert.ok(role.allow?.includes(PermissionFlagsBits.ViewChannel) && role.allow.includes(PermissionFlagsBits.SendMessages));
    assert.equal(bot.id, '300');
    assert.equal(bot.type, OverwriteType.Member);
    assert.ok(!droits.some((d) => d.allow?.includes(PermissionFlagsBits.Administrator) || d.allow?.includes(PermissionFlagsBits.ManageRoles)));
});
