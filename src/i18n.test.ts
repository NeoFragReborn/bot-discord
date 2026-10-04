import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Textes, langueDe } from './i18n.js';

const TABLE = {
    'Bonjour %s': { fr: 'Bonjour %s', en: 'Hello %s', de: 'Hallo %s', es: 'Hola %s', it: 'Ciao %s', pt: 'Olá %s' },
    'Seulement en français': { fr: 'Seulement en français' },
};

test('une locale Discord donne la langue du produit', () => {
    assert.equal(langueDe('en-GB'), 'en');
    assert.equal(langueDe('pt-BR'), 'pt');
    assert.equal(langueDe('es-419'), 'es');
    assert.equal(langueDe('ja'), null);
    assert.equal(langueDe(null), null);
});

test('un texte se dit dans la langue du membre, sinon dans celle du site', () => {
    const textes = new Textes(TABLE, 'de');

    assert.equal(textes.dans('en-US', 'Bonjour %s', 'Alex'), 'Hello Alex');
    assert.equal(textes.dans('ja', 'Bonjour %s', 'Alex'), 'Hallo Alex');
    assert.equal(textes.dans(null, 'Bonjour %s', 'Alex'), 'Hallo Alex');
});

test('sans traduction, le français du modèle', () => {
    const textes = new Textes(TABLE, 'en');

    assert.equal(textes.dans('en-US', 'Seulement en français'), 'Seulement en français');
    assert.equal(textes.dans('en-US', 'Inconnu %d', 3), 'Inconnu 3');
});

test('les localisations d’une commande couvrent les locales Discord', () => {
    const { defaut, locales } = new Textes(TABLE, 'fr').localisations('Bonjour %s');

    assert.equal(defaut, 'Bonjour %s');
    assert.equal(locales['en-US'], 'Hello %s');
    assert.equal(locales['en-GB'], 'Hello %s');
    assert.equal(locales['pt-BR'], 'Olá %s');
    assert.equal(locales['es-419'], 'Hola %s');
});
