import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErreurSite, Site } from './site.js';

const CLE = 'nfr_' + '0'.repeat(40);

interface Appel {
    url: string;
    init: RequestInit;
}

/** Un faux `fetch` qui note les appels et rend la réponse donnée. */
function faux(reponse: () => Response | Promise<Response>): { fetch: typeof fetch; appels: Appel[] } {
    const appels: Appel[] = [];

    return {
        appels,
        fetch: (async (url: string | URL | Request, init?: RequestInit) => {
            appels.push({ url: String(url), init: init ?? {} });

            return reponse();
        }) as typeof fetch,
    };
}

const json = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

test('la configuration est lue sous /api/v1, avec la clé en en-tête', async () => {
    const f = faux(() => json(200, { data: { token: 't', client_id: '1', guild_id: '2', running: true, nicknames: false, channels: [], roles: [], version: 3 } }));
    const site = new Site('https://exemple.fr/sous/', CLE, f.fetch);

    const config = await site.config();

    assert.equal(config.version, 3);
    assert.equal(f.appels[0]?.url, 'https://exemple.fr/sous/api/v1/discord/config');
    assert.equal((f.appels[0]?.init.headers as Record<string, string>).Authorization, `Bearer ${CLE}`);
});

test('le signe de vie part en POST, en JSON', async () => {
    const f = faux(() => json(200, { data: { running: false, version: 1, commands: [] } }));
    const site = new Site('https://exemple.fr', CLE, f.fetch);

    await site.signeDeVie({ version: '0.1.0', connected: false, intents: { members: false, content: false }, guild: null });

    assert.equal(f.appels[0]?.init.method, 'POST');
    assert.equal(JSON.parse(String(f.appels[0]?.init.body)).version, '0.1.0');
    assert.equal((f.appels[0]?.init.headers as Record<string, string>)['Content-Type'], 'application/json');
});

test('une image part telle quelle, avec son type et son nom, et le site rend son adresse', async () => {
    const f = faux(() => json(201, { data: { path: '/upload/editeur/2026/10/ab.png', url: 'https://exemple.fr/upload/editeur/2026/10/ab.png' } }));
    const site = new Site('https://exemple.fr', CLE, f.fetch);
    const octets = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const image = await site.envoyerImage(octets, 'capture d’écran.png', 'image/png');

    assert.equal(image.path, '/upload/editeur/2026/10/ab.png');
    assert.equal(f.appels[0]?.url, 'https://exemple.fr/api/v1/forum/images?name=capture%20d%E2%80%99%C3%A9cran.png');
    assert.equal(f.appels[0]?.init.method, 'POST');
    assert.equal((f.appels[0]?.init.headers as Record<string, string>)['Content-Type'], 'image/png');
    assert.deepEqual(new Uint8Array(await (f.appels[0]?.init.body as Blob).arrayBuffer()), octets);
});

test('une erreur JSON de l’API garde son statut et son code', async () => {
    const site = new Site('https://exemple.fr', CLE, faux(() => json(403, { error: { code: 'forbidden', message: 'non' } })).fetch);

    await assert.rejects(site.config(), (e: unknown) => e instanceof ErreurSite && e.statut === 403 && e.code === 'forbidden' && e.message === 'non');
});

test('une page d’erreur qui n’est pas du JSON reste lisible', async () => {
    const site = new Site('https://exemple.fr', CLE, faux(() => new Response('<html>502</html>', { status: 502 })).fetch);

    await assert.rejects(site.config(), (e: unknown) => e instanceof ErreurSite && e.statut === 502 && e.code === 'http_error');
});

test('un site injoignable rend le statut 0', async () => {
    const site = new Site('https://exemple.fr', CLE, (async () => {
        throw new TypeError('fetch failed');
    }) as typeof fetch);

    await assert.rejects(site.config(), (e: unknown) => e instanceof ErreurSite && e.statut === 0 && e.code === 'unreachable');
});

test('un lien absent vaut NULL, pas une erreur', async () => {
    const f = faux(() => json(404, { error: { code: 'link_not_found', message: 'aucun' } }));
    const site = new Site('https://exemple.fr', CLE, f.fetch);

    assert.equal(await site.lien('topic', { discordId: '123' }), null);
    assert.equal(f.appels[0]?.url, 'https://exemple.fr/api/v1/discord/links?type=topic&discord_id=123');
});
