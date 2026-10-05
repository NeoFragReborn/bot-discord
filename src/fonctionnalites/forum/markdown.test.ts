import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADRESSE_IMAGE_MAX, IMAGES_MAX, LIMITE_DISCORD, adresseComplete, decoderEntites, discordVersSite, htmlVersMarkdown, messagePourDiscord, nomDeWebhook, sansBalises, tenirDansDiscord } from './markdown.js';

test('les mises en forme courantes passent en Markdown', () => {
    assert.equal(htmlVersMarkdown('<p>Un <strong>gras</strong>, un <em>italique</em>, un <u>souligné</u> et un <s>barré</s>.</p>'), 'Un **gras**, un *italique*, un __souligné__ et un ~~barré~~.');
});

test('les paragraphes et les sauts de ligne sont gardés, sans lignes vides en trop', () => {
    assert.equal(htmlVersMarkdown('<p>Un</p>\n<p>Deux<br />trois</p><p></p><p>Quatre</p>'), 'Un\n\nDeux\ntrois\n\nQuatre');
});

test('un lien garde son texte, un lien nu reste nu', () => {
    assert.equal(htmlVersMarkdown('<p><a href="https://exemple.fr/a">la doc</a> et <a href="https://exemple.fr/b">https://exemple.fr/b</a></p>'), '[la doc](<https://exemple.fr/a>) et <https://exemple.fr/b>');
});

test('listes, citations et titres', () => {
    assert.equal(htmlVersMarkdown('<h2>Titre</h2><ul><li>un</li><li>deux</li></ul>'), '**Titre**\n\n- un\n- deux');
    assert.equal(htmlVersMarkdown('<blockquote><p>cité</p><p>encore</p></blockquote><p>réponse</p>'), '> cité\n> encore\n\nréponse');
});

test('le code n’est pas interprété, et les entités sont décodées', () => {
    assert.equal(htmlVersMarkdown('<pre><code>if (a &lt; b) { &lt;b&gt;non&lt;/b&gt; }</code></pre>'), '```\nif (a < b) { <b>non</b> }\n```');
    assert.equal(htmlVersMarkdown('<p>du <code>code</code> &amp; des &laquo;&nbsp;guillemets&nbsp;&raquo;</p>'), 'du `code` & des « guillemets »');
});

test('une image devient son adresse, une balise inconnue disparaît', () => {
    assert.equal(htmlVersMarkdown('<p><img src="https://exemple.fr/i.png" alt="x" /> <span style="color:red">rouge</span></p>'), 'https://exemple.fr/i.png rouge');
});

const MESSAGE = 'https://site.fr/fr/forum/topic/5/titre#12';

test('une image de l’éditeur part en aperçu, à son adresse complète (vu le 2026-10-05)', () => {
    assert.deepEqual(messagePourDiscord('<p>Voici <img src="/upload/editeur/a.png" alt="" /> la capture.</p>', MESSAGE), {
        texte: 'Voici la capture.',
        images: ['https://site.fr/upload/editeur/a.png'],
    });
});

test('les anciennes adresses en ../../upload se rattachent à la racine du site', () => {
    assert.equal(adresseComplete('../../upload/editeur/b.jpg', MESSAGE), 'https://site.fr/upload/editeur/b.jpg');
    assert.equal(adresseComplete('https://ailleurs.fr/c.png', MESSAGE), 'https://ailleurs.fr/c.png');
    assert.equal(adresseComplete('mailto:a@b.fr', MESSAGE), 'mailto:a@b.fr');
    assert.equal(adresseComplete('/x?a=1&amp;b=2', MESSAGE), 'https://site.fr/x?a=1&b=2');
});

test('un lien relatif du site devient un lien complet', () => {
    assert.equal(htmlVersMarkdown('<p><a href="/fr/wiki/guide">le guide</a></p>', MESSAGE), '[le guide](<https://site.fr/fr/wiki/guide>)');
    // Un lien qui n'est pas web reste tel quel.
    assert.equal(htmlVersMarkdown('<p><a href="mailto:a@b.fr">écrire</a></p>', MESSAGE), '[écrire](mailto:a@b.fr)');
});

test('au-delà de dix images, les suivantes restent des liens ; une image data: n’est pas un aperçu', () => {
    const html = Array.from({ length: 12 }, (_, i) => `<img src="/upload/${i}.png" />`).join('');
    const corps = messagePourDiscord(html, MESSAGE);

    assert.equal(corps.images.length, IMAGES_MAX);
    assert.equal(corps.texte, 'https://site.fr/upload/10.png\nhttps://site.fr/upload/11.png');
    assert.deepEqual(messagePourDiscord('<p><img src="data:image/png;base64,AAAA" /></p>', MESSAGE).images, []);

    // Une adresse trop longue pour un aperçu reste un lien : Discord aurait refusé tout le message.
    const longue = `/upload/${'a'.repeat(ADRESSE_IMAGE_MAX)}.png`;

    assert.deepEqual(messagePourDiscord(`<p><img src="${longue}" /></p>`, MESSAGE), { texte: `https://site.fr${longue}`, images: [] });
});

test('les entités numériques sont décodées, les inconnues laissées', () => {
    assert.equal(decoderEntites('&#233;&#xE9;&inconnue;'), 'éé&inconnue;');
});

test('un message court garde sa fin, un message long est coupé avec un lien vers la suite', () => {
    assert.equal(tenirDansDiscord('court', '-# [site](u)', '-# [suite](u)'), 'court\n-# [site](u)');

    const long = tenirDansDiscord('mot '.repeat(1000), '-# [site](u)', '-# [Lire la suite sur le site](u)');

    assert.ok(long.length <= LIMITE_DISCORD);
    assert.ok(long.endsWith('…\n-# [Lire la suite sur le site](u)'));
});

test('un bloc de code coupé est refermé', () => {
    const long = tenirDansDiscord('```\n' + 'x'.repeat(3000), '', '-# suite');

    assert.ok(long.length <= LIMITE_DISCORD);
    assert.equal((long.match(/```/g) ?? []).length % 2, 0);
});

test('un message Discord garde son texte et renvoie à ses pièces jointes', () => {
    assert.equal(discordVersSite('  Bonjour  ', [{ nom: 'capture[1].png', url: 'https://cdn' }], 'https://discord.com/channels/1/2/3'), 'Bonjour\n\n📎 [capture1.png](https://discord.com/channels/1/2/3)');
    // Une image gardée sur le site s'y montre ; un autre fichier garde le lien vers Discord.
    assert.equal(
        discordVersSite('Regardez', [{ nom: 'capture.png', url: 'https://cdn/a', chemin: '/upload/editeur/2026/10/ab.png' }, { nom: 'notes.txt', url: 'https://cdn/b' }], 'https://discord.com/channels/1/2/3'),
        'Regardez\n\n![capture.png](/upload/editeur/2026/10/ab.png)\n\n📎 [notes.txt](https://discord.com/channels/1/2/3)',
    );
    assert.equal(discordVersSite('', [], 'x'), '');
});

test('un nom de webhook est accepté par Discord', () => {
    assert.equal(nomDeWebhook('  '), 'Visiteur');
    assert.equal(nomDeWebhook('Fan de Discord'), 'Fan de Disc​ord');
    assert.equal(Array.from(nomDeWebhook('x'.repeat(200))).length, 80);
});

test('les balises imbriquées disparaissent toutes, en un seul appel', () => {
    assert.equal(sansBalises('<scr<b>ipt>alert(1)</scr</b>ipt>'), 'alert(1)');
    assert.equal(sansBalises('a<<b>i>b</<b>i>c'), 'abc');
    assert.equal(htmlVersMarkdown('<p>avant <scr<b>ipt>x</scr</b>ipt> après</p>'), 'avant x après');
});
