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

/**
 * Retire les balises jusqu'à ce qu'il n'en reste plus : un seul passage laisse `<scr<b>ipt>` devenir
 * `<script>`. Discord n'interprète pas le HTML — rien ne s'y exécuterait —, mais un reste de balise
 * s'afficherait tel quel dans le message (relevé par CodeQL à l'ouverture des dépôts, 2026-10-04).
 */
export function sansBalises(texte: string): string {
    let avant: string;

    do {
        avant = texte;
        texte = texte.replace(/<[^<>]*>/g, '');
    } while (texte !== avant);

    return texte;
}

/** Le nombre d'aperçus (« embeds ») qu'un message Discord peut porter. */
export const IMAGES_MAX = 10;

/** La longueur d'adresse qu'un aperçu accepte : au-delà, Discord refuserait le message ENTIER. */
export const ADRESSE_IMAGE_MAX = 2048;

/**
 * Une adresse du message, rendue complète. Discord ne connaît pas le site : l'adresse relative que
 * l'éditeur écrit (`/upload/editeur/…`) y restait du texte, et l'image n'apparaissait pas (vu par
 * le mainteneur le 2026-10-05). Elle se complète depuis `adresse`, celle du message sur le site ; les
 * anciennes formes en `../../upload/…` se rattachent à la racine. Une adresse qui a déjà son schéma
 * (`https:`, `mailto:`…) reste telle quelle.
 */
export function adresseComplete(brute: string, adresse: string): string {
    const propre = decoderEntites(brute.trim());

    if (!adresse || /^[a-z][a-z0-9+.-]*:/i.test(propre)) {
        return propre;
    }

    try {
        const ancienne = /^(?:\.\.?\/)+(upload\/.*)$/i.exec(propre);

        return new URL(ancienne ? `/${ancienne[1]}` : propre, adresse).href;
    } catch {
        return propre;
    }
}

/** Ce qu'on envoie à Discord pour un message du forum : son texte, et ses images en aperçus. */
export interface MessagePourDiscord {
    texte: string;
    images: string[];
}

/**
 * Le message du forum pour Discord. Ses images partent en aperçus — Discord les montre sous le texte —
 * et non en adresses au milieu des phrases ; au-delà de dix, la limite de Discord, les suivantes
 * restent des liens à la fin du texte.
 */
export function messagePourDiscord(html: string, adresse: string): MessagePourDiscord {
    const images: string[] = [];
    const texte = htmlVersMarkdown(html, adresse, images);
    const enTrop = images.splice(IMAGES_MAX);

    return { texte: [texte, ...enTrop].filter(Boolean).join('\n'), images };
}

/**
 * Le HTML du forum en Markdown de Discord. `adresse` (celle du message sur le site) complète les
 * adresses relatives ; `images`, s'il est donné, recueille les images au lieu de les laisser dans le
 * texte.
 */
export function htmlVersMarkdown(html: string, adresse = '', images: string[] | null = null): string {
    const blocs: string[] = [];
    // Les blocs de code d'abord, mis de côté : rien de ce qu'ils contiennent ne doit être interprété.
    let md = html.replace(/\r/g, '').replace(/<pre[^>]*>(?:\s*<code[^>]*>)?([\s\S]*?)(?:<\/code>\s*)?<\/pre>/gi, (_, code: string) => {
        blocs.push('```\n' + decoderEntites(sansBalises(code.replace(/<br\s*\/?>/gi, '\n'))).replace(/```/g, '`​``').trim() + '\n```');

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
        .replace(/<img\b[^>]*?src="([^"]+)"[^>]*>/gi, (_, src: string) => {
            const url = adresseComplete(src, adresse);

            // Seule une adresse web devient un aperçu — Discord ne sait pas montrer une image `data:` —, et
            // d'une longueur qu'il accepte : un seul aperçu refusé ferait refuser tout le message.
            if (images && /^https?:\/\//i.test(url) && url.length <= ADRESSE_IMAGE_MAX) {
                images.push(url);

                return ' ';
            }

            return ` ${url} `;
        })
        .replace(/<a\b[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, texte: string) => {
            const cible = adresseComplete(href, adresse);
            const visible = sansBalises(texte).trim();
            // Un lien web s'écrit `<adresse>` : cliquable, sans carte d'aperçu. Retirer une carte sur Discord
            // masque TOUS les aperçus du message — ses images comprises. Les chevrons sont posés à la fin :
            // le nettoyage des balises les prendrait pour une balise.
            const lien = /^https?:\/\//i.test(cible) ? `\u0001${cible}\u0002` : cible;

            return !visible || visible === href || visible === cible ? lien : `[${visible}](${lien})`;
        })
        .replace(/<li\b[^>]*>/gi, '\n- ')
        .replace(/<\/(ul|ol)>/gi, '\n')
        .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, cite: string) => '\n' + sansBalises(cite.replace(/<br\s*\/?>|<\/p>/gi, '\n')).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `> ${l}`).join('\n') + '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6])>/gi, '\n\n');

    md = sansBalises(md);

    md = decoderEntites(md)
        .split('\n')
        .map((ligne) => ligne.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // Les blocs de code reprennent leur place, et des liens nus deviennent cliquables sans aperçu bruyant.
    return md.replace(/\u0000(\d+)\u0000/g, (_, n: string) => `\n${blocs[Number(n)] ?? ''}\n`).replace(/\n{3,}/g, '\n\n').trim()
        .replace(/\u0001/g, '<').replace(/\u0002/g, '>');
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
    /** L'adresse de l'image une fois gardée sur le site (`/upload/editeur/…`), quand c'en est une. */
    chemin?: string;
}

/**
 * Le texte d'un message Discord pour le forum : son texte (mentions déjà rendues lisibles), puis
 * ses pièces jointes. Une image gardée sur le site s'y montre ; pour le reste, les adresses des
 * pièces jointes de Discord expirent : on renvoie au message sur Discord, qui, lui, reste.
 */
export function discordVersSite(texte: string, pieces: readonly PieceJointe[], lienDuMessage: string): string {
    const lignes = pieces.map((p) => {
        const nom = p.nom.replace(/[[\]]/g, '');

        return p.chemin ? `![${nom}](${p.chemin})` : `📎 [${nom}](${lienDuMessage})`;
    });

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
