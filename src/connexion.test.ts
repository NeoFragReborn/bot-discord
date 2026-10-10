import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SuiviConnexion } from './connexion.js';

/** Ce que le suivi a écrit, niveau et phrase assemblée. */
class FauxJournal {
    lignes: string[] = [];

    warn(modele: string, ...args: (string | number)[]): void {
        this.lignes.push('warn ' + args.reduce<string>((t, v) => t.replace('%d', String(v)), modele));
    }

    info(modele: string, ...args: (string | number)[]): void {
        this.lignes.push('info ' + args.reduce<string>((t, v) => t.replace('%d', String(v)), modele));
    }
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('une reconnexion qui reprend vite ne se dit pas', async () => {
    const journal = new FauxJournal();
    const suivi = new SuiviConnexion(journal, 40);

    suivi.perdue();
    await attendre(5);
    suivi.retablie();
    await attendre(60);

    assert.deepEqual(journal.lignes, []);
});

test('une coupure qui dure se dit, puis sa durée à son retour', async () => {
    const journal = new FauxJournal();
    let horloge = 1_000_000;
    const suivi = new SuiviConnexion(journal, 20, () => horloge);

    suivi.perdue();
    await attendre(40);
    horloge += 95_000;
    suivi.retablie();

    assert.deepEqual(journal.lignes, [
        'warn Connexion à Discord perdue depuis 0 s : reconnexion en cours…',
        'info Connexion à Discord rétablie après 95 s.',
    ]);
});

test('plusieurs avis de coupure ne font qu’une coupure, et un retour sans coupure ne dit rien', async () => {
    const journal = new FauxJournal();
    const suivi = new SuiviConnexion(journal, 20);

    suivi.retablie();
    suivi.perdue();
    suivi.perdue();
    await attendre(40);
    suivi.retablie();
    suivi.retablie();

    assert.equal(journal.lignes.filter((l) => l.startsWith('warn')).length, 1);
    assert.equal(journal.lignes.filter((l) => l.startsWith('info')).length, 1);
});

test('fermer la connexion pendant une coupure n’écrit plus rien', async () => {
    const journal = new FauxJournal();
    const suivi = new SuiviConnexion(journal, 20);

    suivi.perdue();
    suivi.arreter();
    await attendre(40);

    assert.deepEqual(journal.lignes, []);
});
