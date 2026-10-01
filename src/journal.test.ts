import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Journal, formater } from './journal.js';

test('un modèle se remplit comme sprintf côté site', () => {
    assert.equal(formater('Serveur « %s » : %d membre(s), 100 %%', ['Neo', 3.7]), 'Serveur « Neo » : 3 membre(s), 100 %');
    assert.equal(formater('manque %s et %d', []), 'manque  et ');
});

test('une ligne part au site avec son modèle et ses valeurs, et sa phrase française', () => {
    const sortie: string[] = [];
    const journal = new Journal((l) => sortie.push(l));

    journal.info('Connecté à Discord : %s.', 'Neo#3283');

    assert.deepEqual(sortie, ['[info] Connecté à Discord : Neo#3283.']);
    assert.deepEqual(journal.prendre(), [{ level: 'info', message: 'Connecté à Discord : Neo#3283.', template: 'Connecté à Discord : %s.', args: ['Neo#3283'] }]);
});

test('un secret n’est jamais écrit, ni sur la sortie ni vers le site — valeurs comprises', () => {
    const sortie: string[] = [];
    const journal = new Journal((l) => sortie.push(l));

    journal.masquer('MTIzNDU2.secret.jeton');
    journal.error('Échec : %s', 'la clé MTIzNDU2.secret.jeton (deux fois : MTIzNDU2.secret.jeton)');

    assert.equal(sortie[0], '[error] Échec : la clé [masqué] (deux fois : [masqué])');

    const [ligne] = journal.prendre();
    assert.equal(ligne?.message, 'Échec : la clé [masqué] (deux fois : [masqué])');
    assert.deepEqual(ligne?.args, ['la clé [masqué] (deux fois : [masqué])']);
});

test('un secret trop court n’est pas masqué (il masquerait des mots ordinaires)', () => {
    const journal = new Journal(() => {});

    journal.masquer('');
    journal.masquer('abc');
    journal.info('%s', 'abc');

    assert.equal(journal.prendre()[0]?.message, 'abc');
});

test('les lignes partent par lots de 50, et reviennent en tête si le site ne les a pas reçues', () => {
    const journal = new Journal(() => {});

    for (let i = 0; i < 60; i++) {
        journal.info('ligne %d', i);
    }

    const lot = journal.prendre();
    assert.equal(lot.length, 50);
    assert.equal(journal.enAttente, 10);

    journal.rendre(lot);
    assert.equal(journal.enAttente, 60);
    assert.equal(journal.prendre()[0]?.message, 'ligne 0');
});

test('au-delà de 200 lignes en attente, les plus anciennes sont oubliées et on le dit', () => {
    const journal = new Journal(() => {});

    for (let i = 0; i < 230; i++) {
        journal.info('ligne %d', i);
    }

    const lot = journal.prendre();
    assert.equal(lot[0]?.level, 'warn');
    assert.deepEqual(lot[0]?.args, ['30']);
    assert.match(lot[0]?.message ?? '', /^30 ligne\(s\) du journal perdue\(s\)/);
    assert.equal(lot[1]?.message, 'ligne 30');
});

test('une phrase est coupée à 1000 caractères, une valeur à 500', () => {
    const journal = new Journal(() => {});

    journal.info('%s %s %s', 'x'.repeat(5000), 'y'.repeat(600), 'z');

    const [ligne] = journal.prendre();
    assert.equal(ligne?.message.length, 1000);
    assert.equal(ligne?.args[0]?.length, 500);
});
