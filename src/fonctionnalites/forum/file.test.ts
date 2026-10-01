import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as attendre } from 'node:timers/promises';
import { FileParCle } from './file.js';

test('pour une même clé, les tâches passent dans l’ordre, même si la première est lente', async () => {
    const file = new FileParCle();
    const ordre: string[] = [];

    await Promise.all([
        file.ajouter('fil', async () => {
            await attendre(30);
            ordre.push('ouverture');
        }),
        file.ajouter('fil', async () => {
            ordre.push('réponse');
        }),
    ]);

    assert.deepEqual(ordre, ['ouverture', 'réponse']);
    assert.equal(file.taille, 0);
});

test('deux clés ne s’attendent pas', async () => {
    const file = new FileParCle();
    const ordre: string[] = [];

    await Promise.all([
        file.ajouter('a', async () => {
            await attendre(30);
            ordre.push('a');
        }),
        file.ajouter('b', async () => {
            ordre.push('b');
        }),
    ]);

    assert.deepEqual(ordre, ['b', 'a']);
});

test('une tâche en échec ne bloque pas la suivante', async () => {
    const file = new FileParCle();
    let suivante = false;

    await assert.rejects(file.ajouter('fil', async () => {
        throw new Error('raté');
    }));
    await file.ajouter('fil', async () => {
        suivante = true;
    });

    assert.equal(suivante, true);
});
