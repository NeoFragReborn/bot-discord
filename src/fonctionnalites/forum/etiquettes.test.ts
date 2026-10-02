import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correspondancesDuSalon, etiquettesDuFil, memesEtiquettes, prefixeDuFil } from './etiquettes.js';

const TAGS = [
    { channel_id: '10', prefix_id: 1, tag_id: 'question' },
    { channel_id: '10', prefix_id: 2, tag_id: 'resolu' },
    { channel_id: '99', prefix_id: 1, tag_id: 'ailleurs' },
];
const c = correspondancesDuSalon(TAGS, '10');

test('les correspondances ne retiennent que celles du salon', () => {
    assert.equal(c.versEtiquette.get(1), 'question');
    assert.equal(c.versPrefixe.get('ailleurs'), undefined);
});

test('le préfixe du site devient l’étiquette du fil, les étiquettes libres restent', () => {
    assert.deepEqual(etiquettesDuFil(['libre', 'question'], c, 2), ['resolu', 'libre']);
    assert.deepEqual(etiquettesDuFil(['libre', 'question'], c, null), ['libre']);
    assert.deepEqual(etiquettesDuFil([], c, 3), []);
});

test('jamais plus de cinq étiquettes', () => {
    assert.equal(etiquettesDuFil(['a', 'b', 'c', 'd', 'e'], c, 1).length, 5);
    assert.equal(etiquettesDuFil(['a', 'b', 'c', 'd', 'e'], c, 1)[0], 'question');
});

test('l’étiquette posée sur Discord devient le préfixe du sujet', () => {
    assert.equal(prefixeDuFil(['libre', 'resolu', 'question'], c), 2);
    assert.equal(prefixeDuFil(['libre'], c), null);
});

test('deux listes d’étiquettes égales dans le désordre', () => {
    assert.equal(memesEtiquettes(['a', 'b'], ['b', 'a']), true);
    assert.equal(memesEtiquettes(['a'], ['a', 'b']), false);
});
