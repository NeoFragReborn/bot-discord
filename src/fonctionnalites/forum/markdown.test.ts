import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITE_DISCORD, decoderEntites, discordVersSite, htmlVersMarkdown, nomDeWebhook, tenirDansDiscord } from './markdown.js';

test('les mises en forme courantes passent en Markdown', () => {
    assert.equal(htmlVersMarkdown('<p>Un <strong>gras</strong>, un <em>italique</em>, un <u>souligné</u> et un <s>barré</s>.</p>'), 'Un **gras**, un *italique*, un __souligné__ et un ~~barré~~.');
});

test('les paragraphes et les sauts de ligne sont gardés, sans lignes vides en trop', () => {
    assert.equal(htmlVersMarkdown('<p>Un</p>\n<p>Deux<br />trois</p><p></p><p>Quatre</p>'), 'Un\n\nDeux\ntrois\n\nQuatre');
});

test('un lien garde son texte, un lien nu reste nu', () => {
    assert.equal(htmlVersMarkdown('<p><a href="https://exemple.fr/a">la doc</a> et <a href="https://exemple.fr/b">https://exemple.fr/b</a></p>'), '[la doc](https://exemple.fr/a) et https://exemple.fr/b');
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
    assert.equal(discordVersSite('', [], 'x'), '');
});

test('un nom de webhook est accepté par Discord', () => {
    assert.equal(nomDeWebhook('  '), 'Visiteur');
    assert.equal(nomDeWebhook('Fan de Discord'), 'Fan de Disc​ord');
    assert.equal(Array.from(nomDeWebhook('x'.repeat(200))).length, 80);
});
