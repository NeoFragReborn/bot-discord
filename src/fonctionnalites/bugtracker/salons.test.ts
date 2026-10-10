/**
 * Les deux salons du Bugtracker (0.2.5) : un faux Discord et un faux site, pour jouer le parcours d'un ticket —
 * le salon de son type, son déménagement quand le type change, le rattrapage des idées ouvertes, et un site trop
 * ancien pour remplacer le lien d'un ticket.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formater, type Valeur } from '../../journal.js';
import type { Evenement, Lien, Ticket } from '../../site.js';
import type { Contexte } from '../types.js';
import { SynchroBugtracker } from './index.js';

const FORUM = 15;

interface FauxFil {
    id: string;
    name: string;
    parentId: string;
    parent: FauxSalon;
    archived: boolean;
    locked: boolean;
    appliedTags: string[];
    messages: string[];
    supprime: boolean;
}

interface FauxSalon {
    id: string;
    name: string;
    type: number;
    availableTags: { id: string; name: string; moderated: boolean; emoji: null }[];
}

/** Un serveur, un site et un contexte : `salons` sont les salons Forum du serveur, `remplace` dit si le site remplace un lien. */
function monde(reglages: Record<string, string | boolean>, remplace = true) {
    let suivant = 1000;
    const fils = new Map<string, FauxFil>();
    const salons = new Map<string, FauxSalon & Record<string, unknown>>();
    const tickets = new Map<number, Ticket>();
    const liens = new Map<number, string>();
    const journal: string[] = [];

    const fil = (salon: FauxSalon, nom: string, etiquettes: string[]): FauxFil & Record<string, unknown> => {
        const f = {
            id: String(suivant++), name: nom, parentId: salon.id, parent: salon, archived: false, locked: false, appliedTags: etiquettes, messages: [] as string[], supprime: false,
            isThread: () => true,
            send: async (m: { content: string }) => { f.messages.push(m.content); return { id: String(suivant++) }; },
            setArchived: async (v: boolean) => { f.archived = v; },
            setLocked: async (v: boolean) => { f.locked = v; },
            setAppliedTags: async (v: string[]) => { f.appliedTags = v; },
            setName: async (v: string) => { f.name = v; },
            delete: async () => { f.supprime = true; fils.delete(f.id); },
            fetchStarterMessage: async () => null,
        };

        fils.set(f.id, f);

        return f;
    };

    const salon = (id: string, nom: string): void => {
        const s: FauxSalon & Record<string, unknown> = {
            id, name: nom, type: FORUM, availableTags: [],
            client: { user: { id: 'bot' } },
            setAvailableTags: async (t: { id?: string; name: string }[]) => { s.availableTags = t.map((e, i) => ({ id: e.id ?? `${id}-t${i}`, name: e.name, moderated: false, emoji: null })); },
            fetchWebhooks: async () => [{
                id: `${id}-wh`, token: 'x', owner: { id: 'bot' },
                send: async (m: { threadName?: string; appliedTags?: string[]; threadId?: string; content: string }) => {
                    if (m.threadId) {
                        fils.get(m.threadId)?.messages.push(m.content);

                        return { id: String(suivant++), channelId: m.threadId };
                    }

                    const f = fil(s, m.threadName ?? '', m.appliedTags ?? []);

                    return { id: f.id, channelId: f.id };
                },
            }],
        };

        salons.set(id, s);
    };

    salon('100', 'bugs');
    salon('200', 'suggestions');

    const site = {
        lien: async (_type: string, cote: { siteId: number } | { discordId: string }): Promise<Lien | null> => {
            if ('siteId' in cote) {
                const d = liens.get(cote.siteId);

                return d ? { site_id: cote.siteId, discord_id: d } : null;
            }

            for (const [s, d] of liens) {
                if (d === cote.discordId) {
                    return { site_id: s, discord_id: d };
                }
            }

            return null;
        },
        lier: async (_type: string, siteId: number, discordId: string, remplacer = false) => {
            if (!liens.has(siteId) || (remplacer && remplace)) {
                liens.set(siteId, discordId);
            }
        },
        ticket: async (id: number) => tickets.get(id) ?? null,
        tickets: async () => ({ tickets: [...tickets.values()].filter((t) => !['resolved', 'closed', 'wont_fix', 'duplicate'].includes(t.status)), next: 0, more: false }),
        membre: async () => null,
    };

    const ctx = {
        client: { channels: { cache: fils, fetch: async (id: string) => fils.get(id) ?? null }, on: () => undefined, off: () => undefined, user: { id: 'bot' } },
        guilde: { channels: { cache: salons } },
        site,
        journal: {
            info: (m: string, ...a: Valeur[]) => journal.push(formater(m, a)),
            warn: (m: string, ...a: Valeur[]) => journal.push(formater(m, a)),
            error: (m: string, ...a: Valeur[]) => journal.push(formater(m, a)),
        },
        config: { channels: [], api_token_id: null },
        intents: { members: true, content: true },
        reglages,
        textes: { dans: (_l: string | null, m: string, ...a: Valeur[]) => formater(m, a) },
    } as unknown as Contexte;

    const nouveauTicket = (id: number, type: Ticket['type'], status: Ticket['status'] = 'open'): Ticket => {
        const t: Ticket = { id, title: `Ticket ${id}`, description: 'Une description assez longue.', type, priority: 'normal', status, duplicate_of: null, author: null, url: `https://exemple.fr/bugtracker/${id}` };

        tickets.set(id, t);

        return t;
    };

    const evenement = (type: string, data: Record<string, unknown>): Evenement => ({ id: suivant++, type, data, source: null, created_at: 0 }) as unknown as Evenement;

    return { ctx, fils, salons, tickets, liens, journal, nouveauTicket, evenement };
}

const filDe = (m: ReturnType<typeof monde>, ticketId: number) => m.fils.get(m.liens.get(ticketId) ?? '');

test('avec un salon des suggestions, une idée y a son fil et un bogue reste dans celui des tickets', async () => {
    const m = monde({ salon: '100', salon_idees: '200', rattrapage: false });
    const b = new SynchroBugtracker();

    await b.demarrer(m.ctx);
    m.nouveauTicket(1, 'bug');
    m.nouveauTicket(2, 'feature');
    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.created', { ticket_id: 1 }));
    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.created', { ticket_id: 2 }));

    assert.equal(filDe(m, 1)?.parentId, '100');
    assert.equal(filDe(m, 2)?.parentId, '200');
    // Le salon des suggestions n'a que l'étiquette Idée, plus celles des statuts.
    assert.deepEqual(m.salons.get('200')?.availableTags.map((t) => t.name).slice(0, 2), ['Idée', 'Ouvert']);
    assert.ok(!m.salons.get('100')?.availableTags.some((t) => t.name === 'Idée'));
});

test('sans salon des suggestions, tout reste dans celui des tickets', async () => {
    const m = monde({ salon: '100', salon_idees: '', rattrapage: false });
    const b = new SynchroBugtracker();

    await b.demarrer(m.ctx);
    m.nouveauTicket(2, 'feature');
    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.created', { ticket_id: 2 }));

    assert.equal(filDe(m, 2)?.parentId, '100');
    assert.ok(m.salons.get('100')?.availableTags.some((t) => t.name === 'Idée'));
});

test('un bogue devenu idée change de salon : un fil neuf, et l’ancien, verrouillé, y renvoie', async () => {
    const m = monde({ salon: '100', salon_idees: '200', rattrapage: false });
    const b = new SynchroBugtracker();

    await b.demarrer(m.ctx);
    const t = m.nouveauTicket(3, 'bug');

    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.created', { ticket_id: 3 }));

    const ancien = filDe(m, 3);

    t.type = 'feature';
    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.updated', { ticket_id: 3, fields: ['type'] }));

    const nouveau = filDe(m, 3);

    assert.ok(ancien && nouveau && ancien.id !== nouveau.id);
    assert.equal(nouveau.parentId, '200');
    assert.ok(ancien.locked && ancien.archived);
    assert.match(ancien.messages.at(-1) ?? '', new RegExp(`<#${nouveau.id}>`));
    assert.match(nouveau.messages.at(-1) ?? '', new RegExp(`<#${ancien.id}>`));
    assert.ok(m.journal.some((l) => l.includes('change de salon')));

    // Et retour : redevenu bogue, il revient dans le salon des tickets.
    t.type = 'bug';
    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.updated', { ticket_id: 3, fields: ['type'] }));
    assert.equal(filDe(m, 3)?.parentId, '100');
});

test('un ticket clos qui change de salon garde son fil neuf archivé', async () => {
    const m = monde({ salon: '100', salon_idees: '200', rattrapage: false });
    const b = new SynchroBugtracker();

    await b.demarrer(m.ctx);
    const t = m.nouveauTicket(4, 'bug');

    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.created', { ticket_id: 4 }));
    t.type = 'feature';
    t.status = 'closed';
    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.updated', { ticket_id: 4, fields: ['type', 'status'] }));

    assert.equal(filDe(m, 4)?.parentId, '200');
    assert.ok(filDe(m, 4)?.archived);
});

test('choisir le salon des suggestions y fait passer les idées encore ouvertes, pas les closes', async () => {
    const m = monde({ salon: '100', salon_idees: '', rattrapage: true });
    const b = new SynchroBugtracker();

    m.nouveauTicket(5, 'feature');
    m.nouveauTicket(6, 'feature', 'resolved');
    m.nouveauTicket(7, 'bug');
    await b.resynchroniser(m.ctx);
    // Le ticket clos n'a pas été rattrapé : il n'avait pas de fil, et n'en reçoit pas.
    assert.equal(filDe(m, 5)?.parentId, '100');
    assert.equal(filDe(m, 6), undefined);

    (m.ctx.reglages as Record<string, string | boolean>).salon_idees = '200';
    await b.resynchroniser(m.ctx);

    assert.equal(filDe(m, 5)?.parentId, '200');
    assert.equal(filDe(m, 7)?.parentId, '100');
});

test('un site trop ancien garde le premier fil : le fil neuf s’efface, et le bot n’essaie plus', async () => {
    const m = monde({ salon: '100', salon_idees: '200', rattrapage: false }, false);
    const b = new SynchroBugtracker();

    await b.demarrer(m.ctx);
    const t = m.nouveauTicket(8, 'bug');
    const u = m.nouveauTicket(9, 'bug');

    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.created', { ticket_id: 8 }));
    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.created', { ticket_id: 9 }));

    const avant = m.fils.size;

    t.type = 'feature';
    u.type = 'feature';
    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.updated', { ticket_id: 8, fields: ['type'] }));
    await b.surEvenement(m.ctx, m.evenement('bugtracker.ticket.updated', { ticket_id: 9, fields: ['type'] }));

    assert.equal(filDe(m, 8)?.parentId, '100');
    assert.ok(!filDe(m, 8)?.locked);
    assert.equal(m.fils.size, avant);
    assert.equal(m.journal.filter((l) => l.includes('garde le premier fil')).length, 1);
});
