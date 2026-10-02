import { test } from 'node:test';
import assert from 'node:assert/strict';
import { declarer, estActive, reglagesDe } from './discord.js';
import type { Fonctionnalite } from './fonctionnalites/types.js';
import { etiquettesManquantes, nomDeSalon } from './mise-en-place.js';
import type { ConfigBot } from './site.js';

test('le nom d’un salon s’écrit comme Discord l’écrit', () => {
    assert.equal(nomDeSalon('Discussions générales'), 'discussions-générales');
    assert.equal(nomDeSalon('Recherche d’équipe'), 'recherche-d-équipe');
    assert.equal(nomDeSalon('Bug & Suggestions !'), 'bug-suggestions');
    assert.equal(nomDeSalon('  !!! '), 'forum');
    assert.equal(nomDeSalon('x'.repeat(150)).length, 100);
});

test('seules les étiquettes manquantes sont ajoutées, sans dépasser vingt', () => {
    assert.deepEqual(etiquettesManquantes(['Question'], ['question', 'Tutoriel', 'Tutoriel', 'Un préfixe beaucoup trop long']), ['Tutoriel', 'Un préfixe beaucoup ']);

    const pleines = Array.from({ length: 19 }, (_, i) => `e${i}`);

    assert.deepEqual(etiquettesManquantes(pleines, ['a', 'b', 'c']), ['a']);
});

const FONCTIONNALITE: Fonctionnalite = {
    nom: 'essai',
    titre: 'Essai',
    description: 'Une fonctionnalité d’essai.',
    reglages: [
        { cle: 'actif', type: 'bool', defaut: true, libelle: 'Actif' },
        { cle: 'nombre', type: 'int', defaut: 10, min: 1, max: 20, libelle: 'Nombre' },
    ],
    demarrer: () => undefined,
};

const config = (features: ConfigBot['features']): ConfigBot => ({ token: '', client_id: '', guild_id: '', running: true, nicknames: false, channels: [], roles: [], version: 1, events_cursor: 0, api_token_id: null, ...(features ? { features } : {}) });

test('une fonctionnalité est allumée par défaut, et l’administration peut l’éteindre', () => {
    assert.equal(estActive(FONCTIONNALITE, config(undefined)), true);
    assert.equal(estActive({ ...FONCTIONNALITE, defaut: false }, config(undefined)), false);
    assert.equal(estActive(FONCTIONNALITE, config({ essai: { enabled: false, settings: {} } })), false);
});

test('ses réglages : la valeur choisie, sinon celle qu’elle déclare', () => {
    assert.deepEqual(reglagesDe(FONCTIONNALITE, config(undefined)), { actif: true, nombre: 10 });
    assert.deepEqual(reglagesDe(FONCTIONNALITE, config({ essai: { enabled: true, settings: { nombre: 3, inconnu: 'x' } } })), { actif: true, nombre: 3 });
});

test('la déclaration envoyée au site porte titre, description et réglages', () => {
    const [d] = declarer([FONCTIONNALITE]);

    assert.equal(d?.nom, 'essai');
    assert.equal(d?.defaut, true);
    assert.equal(d?.reglages.length, 2);
    assert.equal((d?.reglages[1] as { max?: number }).max, 20);
});
