import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Textes } from '../../i18n.js';
import { TEXTES } from '../../textes.js';
import type { Contexte } from '../types.js';
import { CompteEtApparence } from './index.js';

const textes = new Textes({ [TEXTES.cmdForum]: { fr: TEXTES.cmdForum, en: 'Your site account and how you appear on its forum' } }, 'fr');

test('la commande /forum : account (link, unlink) et visibility (public, guest, custom, status)', () => {
    const [forum] = new CompteEtApparence().commandes(textes);
    const groupes = (forum?.options ?? []) as { name: string; options?: { name: string; options?: { name: string; required?: boolean }[] }[] }[];

    assert.equal(forum?.name, 'forum');
    assert.equal(forum?.description, TEXTES.cmdForum);
    assert.equal(forum?.description_localizations?.['en-US'], 'Your site account and how you appear on its forum');
    assert.deepEqual(groupes.map((g) => g.name), ['account', 'visibility']);
    assert.deepEqual(groupes[0]?.options?.map((s) => s.name), ['link', 'unlink']);
    assert.deepEqual(groupes[1]?.options?.map((s) => s.name), ['public', 'guest', 'custom', 'status']);
    assert.equal(groupes[1]?.options?.[2]?.options?.[0]?.required, true);
});

test('chaque description tient dans les 100 caractères de Discord', () => {
    const [forum] = new CompteEtApparence().commandes(textes);
    const descriptions: string[] = [];
    const parcourir = (o: { description?: string; options?: unknown[] }): void => {
        if (o.description) {
            descriptions.push(o.description);
        }

        for (const enfant of (o.options ?? []) as { description?: string; options?: unknown[] }[]) {
            parcourir(enfant);
        }
    };

    parcourir(forum as { description?: string; options?: unknown[] });
    assert.ok(descriptions.length >= 9);
    assert.ok(descriptions.every((d) => d.length >= 1 && d.length <= 100));
});

test('l’administration peut retirer /forum visibility', () => {
    const compte = new CompteEtApparence();

    compte.reconfigurer({ reglages: { apparence: false } } as unknown as Contexte);

    const [forum] = compte.commandes(textes);

    assert.deepEqual((forum?.options ?? []).map((g) => g.name), ['account']);
});
