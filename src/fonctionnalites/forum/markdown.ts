/**
 * Le passage d'un message d'un côté à l'autre.
 *
 * Site → Discord : le forum rend du HTML (celui de l'éditeur), Discord affiche du Markdown. On garde
 * ce que Discord sait montrer — gras, italique, souligné, barré, liens, code, citations, listes — et
 * on retire le reste. Un message trop long pour Discord (2 000 caractères) est coupé, avec un lien
 * vers la suite sur le site.
 *
 * Discord → site : le forum accepte le Markdown de Discord tel quel (l'API le convertit et le
 * nettoie). On y ajoute seulement les pièces jointes, qui ne sont pas dans le texte.
 */

/** Longueur maximale d'un message Discord. */
export const LIMITE_DISCORD = 2000;

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—' };

export function decoderEntites(texte: string): string {
    return texte.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, code: string) => {
        if (code[0] === '#') {
            const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);

            return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : tout;
        }

        return ENTITES[code.toLowerCase()] ?? tout;
    });
}

/** Le HTML du forum en Markdown de Discord. */
export function htmlVersMarkdown(html: string): string {
    const blocs: string[] = [];
    // Les blocs de code d'abord, mis de côté : rien de ce qu'ils contiennent ne doit être interprété.
    let md = html.replace(/\r/g, '').replace(/<pre[^>]*>(?:\s*<code[^>]*>)?([\s\S]*?)(?:<\/code>\s*)?<\/pre>/gi, (_, code: string) => {
        blocs.push('```\n' + decoderEntites(code.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/```/g, '`​``').trim() + '\n```');

        return `\u0000${blocs.length - 1}\u0000`;
    });

    md = md
        .replace(/\n/g, ' ')
        .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, c: string) => '`' + c.replace(/`/g, 'ʹ') + '`')
        .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
        .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
        .replace(/<u\b[^>]*>([\s\S]*?)<\/u>/gi, '__$1__')
        .replace(/<(s|del|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~')
        .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n**$1**\n')
        .replace(/<img\b[^>]*?src="([^"]+)"[^>]*>/gi, (_, src: string) => ` ${src} `)
        .replace(/<a\b[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, texte: string) => {
            const visible = texte.replace(/<[^>]+>/g, '').trim();

            return !visible || visible === href ? href : `[${visible}](${href})`;
        })
        .replace(/<li\b[^>]*>/gi, '\n- ')
        .replace(/<\/(ul|ol)>/gi, '\n')
        .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, cite: string) => '\n' + cite.replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `> ${l}`).join('\n') + '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
        .replace(/<[^>]+>/g, '');

    md = decoderEntites(md)
        .split('\n')
        .map((ligne) => ligne.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // Les blocs de code reprennent leur place, et des liens nus deviennent cliquables sans aperçu bruyant.
    return md.replace(/\u0000(\d+)\u0000/g, (_, n: string) => `\n${blocs[Number(n)] ?? ''}\n`).replace(/\n{3,}/g, '\n\n').trim();
}

/** Un texte coupé pour tenir dans un message Discord, avec la fin donnée (un lien vers le site). */
export function tenirDansDiscord(texte: string, fin: string, finSiCoupe: string): string {
    const complet = fin ? `${texte}\n${fin}` : texte;

    if (complet.length <= LIMITE_DISCORD) {
        return complet;
    }

    const place = LIMITE_DISCORD - finSiCoupe.length - 2;
    let coupe = texte.slice(0, Math.max(place, 0));
    const espace = coupe.lastIndexOf(' ');

    if (espace > place * 0.8) {
        coupe = coupe.slice(0, espace);
    }

    // Un bloc de code laissé ouvert avalerait la suite : on le ferme.
    if ((coupe.match(/```/g)?.length ?? 0) % 2 === 1) {
        coupe = coupe.slice(0, Math.max(place - 4, 0)) + '\n```';
    }

    return `${coupe}…\n${finSiCoupe}`;
}

/** Une pièce jointe Discord, telle qu'on l'ajoute au message du site. */
export interface PieceJointe {
    nom: string;
    url: string;
}

/**
 * Le texte d'un message Discord pour le forum : son texte (mentions déjà rendues lisibles), puis
 * ses pièces jointes. Les adresses des pièces jointes de Discord expirent : on renvoie au message
 * sur Discord, qui, lui, reste.
 */
export function discordVersSite(texte: string, pieces: readonly PieceJointe[], lienDuMessage: string): string {
    const lignes = pieces.map((p) => `📎 [${p.nom.replace(/[[\]]/g, '')}](${lienDuMessage})`);

    return [texte.trim(), ...lignes].filter(Boolean).join('\n\n');
}

/**
 * Un nom acceptable pour un webhook Discord : de 1 à 80 caractères, et sans « discord » ni « clyde »,
 * que Discord refuse.
 */
export function nomDeWebhook(nom: string): string {
    const propre = Array.from(nom.trim() || 'Visiteur').slice(0, 80).join('');

    return propre.replace(/(disc)(ord)/gi, '$1​$2').replace(/(cly)(de)/gi, '$1​$2');
}
