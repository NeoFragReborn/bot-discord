import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTES } from '../../textes.js';
import { etiquettesDuTicket, nomsDesEtiquettes, tousLesNoms, typeDesEtiquettes } from './etiquettes.js';

const anglais: Record<string, string> = { [TEXTES.etiquetteBug]: 'Bug', [TEXTES.etiquetteIdee]: 'Idea', [TEXTES.etiquetteOuvert]: 'Open', [TEXTES.etiquetteResolu]: 'Resolved' };
const noms = nomsDesEtiquettes((m) => anglais[m] ?? m);
const TAGS = [{ id: '1', name: 'bug' }, { id: '2', name: 'Idea' }, { id: '3', name: 'Open' }, { id: '4', name: 'Resolved' }, { id: '9', name: 'Libre' }];

test('les noms des étiquettes sont dans la langue du site, coupés à 20 caractères', () => {
    assert.equal(noms.types.bug, 'Bug');
    assert.equal(noms.statuts.wont_fix, TEXTES.etiquetteRefuse.slice(0, 20));
    assert.equal(tousLesNoms(noms).length, 10);
});

test('un ticket porte l’étiquette de son type et celle de son statut (sans regarder la casse)', () => {
    assert.deepEqual(etiquettesDuTicket(TAGS, noms, 'bug', 'open'), ['1', '3']);
    assert.deepEqual(etiquettesDuTicket(TAGS, noms, 'feature', 'resolved'), ['2', '4']);
    assert.deepEqual(etiquettesDuTicket(TAGS, noms, 'other', 'closed'), []);
});

test('un fil ouvert à la main dit son type par ses étiquettes, « bug » sinon', () => {
    assert.equal(typeDesEtiquettes(['9', '2'], TAGS, noms), 'feature');
    assert.equal(typeDesEtiquettes(['9'], TAGS, noms), 'bug');
});
