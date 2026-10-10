import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Message } from 'discord.js';
import { ImagesDuSite } from './images.js';
import type { Contexte } from './types.js';

/** Un message Discord réduit à ce que lit le module : son texte, ses pièces jointes, son adresse. */
function message(pieces: { id: string; name: string; contentType: string; size: number }[]): Message {
    return {
        cleanContent: 'Le bouton déborde au téléphone.',
        url: 'https://discord.com/channels/1/2/3',
        attachments: new Map(pieces.map((p) => [p.id, { ...p, url: `https://cdn.discordapp.com/${p.name}` }])),
    } as unknown as Message;
}

/** Un contexte réduit : la configuration du site, et l'envoi d'image compté. */
function contexte(ticketsImages: boolean | undefined): { ctx: Contexte; envois: string[] } {
    const envois: string[] = [];
    const ctx = {
        config: ticketsImages === undefined ? {} : { tickets_images: ticketsImages },
        journal: { warn: () => undefined, info: () => undefined },
        site: {
            envoyerImage: async (_octets: Uint8Array, nom: string) => {
                envois.push(nom);

                return { path: `/upload/editeur/2026/10/${nom}`, url: '' };
            },
        },
    } as unknown as Contexte;

    return { ctx, envois };
}

const CAPTURE = { id: '9', name: 'capture.png', contentType: 'image/png', size: 1000 };
const ORIGINAL = globalThis.fetch;

test('un site qui montre les images d’un ticket les reçoit, et le ticket porte leur marque', async () => {
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch;

    try {
        const { ctx, envois } = contexte(true);
        const texte = await new ImagesDuSite('Bugtracker').contenu(ctx, message([CAPTURE]));

        assert.deepEqual(envois, ['capture.png']);
        assert.match(texte, /!\[capture\.png\]\(\/upload\/editeur\/2026\/10\/capture\.png\)/);
    } finally {
        globalThis.fetch = ORIGINAL;
    }
});

test('un site d’avant la 1.2.49 garde un lien vers Discord, sans rien recevoir', async () => {
    const { ctx, envois } = contexte(undefined);
    const texte = await new ImagesDuSite('Bugtracker').contenu(ctx, message([CAPTURE]));

    assert.deepEqual(envois, []);
    assert.match(texte, /📎 \[capture\.png\]\(https:\/\/discord\.com\/channels\/1\/2\/3\)/);
});

test('le forum garde ses images quelle que soit l’annonce du site', async () => {
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch;

    try {
        const { ctx, envois } = contexte(undefined);

        await new ImagesDuSite('Forum').contenu(ctx, message([CAPTURE]));
        assert.deepEqual(envois, ['capture.png']);
    } finally {
        globalThis.fetch = ORIGINAL;
    }
});

test('ce qui n’est pas une image reste un lien', async () => {
    const { ctx, envois } = contexte(true);
    const texte = await new ImagesDuSite('Bugtracker').contenu(ctx, message([{ id: '8', name: 'journal.txt', contentType: 'text/plain', size: 10 }]));

    assert.deepEqual(envois, []);
    assert.match(texte, /📎 \[journal\.txt\]/);
});
