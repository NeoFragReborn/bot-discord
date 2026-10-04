import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { ApplicationFlagsBitField, GatewayIntentBits, PermissionsBitField } from 'discord.js';
import { intentsDemandes, intentsPermis } from './intents.js';
import { PERMISSIONS_DU_BOT, lienInvitation } from './discord.js';
import { TEXTES } from './textes.js';

const F = ApplicationFlagsBitField.Flags;

test('les intents privilégiés se lisent dans les drapeaux de l’application', () => {
    assert.deepEqual(intentsPermis(0), { members: false, content: false });
    assert.deepEqual(intentsPermis(F.GatewayGuildMembers | F.GatewayMessageContentLimited), { members: true, content: true });
    assert.deepEqual(intentsPermis(F.GatewayGuildMembersLimited), { members: true, content: false });
});

test('un intent privilégié non permis n’est jamais demandé, même si une fonctionnalité le veut', () => {
    const demandes = intentsDemandes({ members: false, content: false }, [GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent]);

    assert.ok(demandes.includes(GatewayIntentBits.Guilds));
    assert.ok(!demandes.includes(GatewayIntentBits.GuildMembers));
    assert.ok(!demandes.includes(GatewayIntentBits.MessageContent));
});

test('un intent privilégié permis est demandé', () => {
    const demandes = intentsDemandes({ members: true, content: true });

    assert.ok(demandes.includes(GatewayIntentBits.GuildMembers));
    assert.ok(demandes.includes(GatewayIntentBits.MessageContent));
});

test('le lien d’invitation ne demande pas « Administrateur »', () => {
    const lien = new URL(lienInvitation('123456789012345678'));
    const permissions = new PermissionsBitField(BigInt(lien.searchParams.get('permissions') ?? '0'));

    assert.equal(lien.searchParams.get('client_id'), '123456789012345678');
    assert.equal(lien.searchParams.get('scope'), 'bot applications.commands');
    assert.ok(!permissions.has(PermissionsBitField.Flags.Administrator, false));
    assert.ok(permissions.has([...PERMISSIONS_DU_BOT], false));
});

// Ce que le site attend du bot, engendré depuis son module Discord (bot/contrat-du-site.json) : le bot
// distribué seul n'a pas le site à côté de lui, mais il a son contrat, et ses tests jugent toujours.
const CONTRAT = JSON.parse(readFileSync(new URL('../contrat-du-site.json', import.meta.url), 'utf8')) as {
    permissions: string;
    droits: string[];
    textes: string[];
};

test('le site invite le bot avec les mêmes permissions que lui', () => {
    const lien = new URL(lienInvitation('1'));

    assert.equal(CONTRAT.permissions, lien.searchParams.get('permissions'));
});

// Chaque phrase que le bot écrit dans son journal est traduite par le site : son modèle doit figurer
// dans Discord::textes_du_bot(). Une phrase oubliée s'afficherait en français seulement.
test('chaque phrase du journal du bot est dans les traductions du site', () => {
    const connus = new Set(CONTRAT.textes);
    const sources = new URL('../src/', import.meta.url);
    // Le journal, les erreurs de connexion, et ce que les fonctionnalités déclarent (titre,
    // description, libellés des réglages) : l'administration traduit tout cela.
    const motif = /(?:\.(?:info|warn|error|erreur)\(|avertir\(ctx, |ErreurConnexion\((?:true|false), |const modele = |readonly (?:titre|description) = |(?:libelle|aide): )'([^']*)'/g;
    const absents: string[] = [];

    const parcourir = (dossier: URL): void => {
        for (const entree of readdirSync(dossier, { withFileTypes: true })) {
            const chemin = new URL(entree.name + (entree.isDirectory() ? '/' : ''), dossier);

            if (entree.isDirectory()) {
                parcourir(chemin);
            } else if (entree.name.endsWith('.ts') && !entree.name.endsWith('.test.ts')) {
                for (const m of readFileSync(chemin, 'utf8').matchAll(motif)) {
                    if (!connus.has(m[1] ?? '')) {
                        absents.push(m[1] ?? '');
                    }
                }
            }
        }
    };

    parcourir(sources);

    // Les textes montrés sur Discord (textes.ts), dont la configuration rend les traductions.
    for (const texte of Object.values(TEXTES)) {
        if (!connus.has(texte)) {
            absents.push(texte);
        }
    }

    assert.deepEqual(absents, []);
});
