/**
 * Le journal du bot : chaque ligne part sur la sortie standard (que systemd range dans journald) et
 * attend dans un tampon d'être envoyée au site, où l'administration l'affiche.
 *
 * Une ligne s'écrit comme un modèle et ses valeurs — `journal.info('Connecté à Discord : %s.', tag)` —
 * et non comme une phrase déjà assemblée : le site TRADUIT le modèle dans la langue de
 * l'administrateur (le module Discord en tient la liste, cf. `Discord::textes_du_bot()`), et un test
 * vérifie que chaque modèle du bot y figure. La sortie standard, elle, reçoit la phrase française.
 *
 * Les secrets connus (la clé Discord, la clé d'accès) sont masqués AVANT d'écrire quoi que ce soit :
 * une erreur de bibliothèque qui recopierait la clé dans son message ne la ferait fuir ni dans
 * journald, ni sur le site.
 */

export type Niveau = 'info' | 'warn' | 'error';

export type Valeur = string | number;

export interface EntreeJournal {
    level: Niveau;
    /** La phrase en français, déjà assemblée (ce que montre le site s'il ne connaît pas le modèle). */
    message: string;
    /** Le modèle (`%s`, `%d`), que le site traduit. */
    template: string;
    args: string[];
}

/** Lignes gardées au plus en attendant le site ; au-delà, les plus anciennes sont oubliées. */
const TAMPON_MAX = 200;

/** Lignes envoyées au site en une fois (l'API en accepte 50). */
const LOT = 50;

/** Un modèle rempli de ses valeurs, comme le ferait `sprintf` côté site (`%s`, `%d`, `%%`). */
export function formater(modele: string, args: readonly Valeur[]): string {
    let i = 0;

    return modele.replace(/%([sd%])/g, (_, type: string) => {
        if (type === '%') {
            return '%';
        }

        const valeur = args[i++];

        return valeur === undefined ? '' : type === 'd' ? String(Math.trunc(Number(valeur)) || 0) : String(valeur);
    });
}

export class Journal {
    private tampon: EntreeJournal[] = [];
    private secrets = new Set<string>();
    private oubliees = 0;

    constructor(private readonly sortie: (ligne: string) => void = (ligne) => console.log(ligne)) {}

    /** Un texte à ne jamais écrire tel quel. */
    masquer(secret: string): void {
        if (secret.length >= 8) {
            this.secrets.add(secret);
        }
    }

    info(modele: string, ...args: Valeur[]): void {
        this.ecrire('info', modele, args);
    }

    warn(modele: string, ...args: Valeur[]): void {
        this.ecrire('warn', modele, args);
    }

    error(modele: string, ...args: Valeur[]): void {
        this.ecrire('error', modele, args);
    }

    ecrire(niveau: Niveau, modele: string, args: readonly Valeur[] = []): void {
        const valeurs = args.map((a) => this.masque(String(a)).slice(0, 500));
        const message = this.masque(formater(modele, valeurs)).slice(0, 1000);

        this.sortie(`[${niveau}] ${message}`);
        this.tampon.push({ level: niveau, message, template: modele, args: valeurs });

        if (this.tampon.length > TAMPON_MAX) {
            this.oubliees += this.tampon.length - TAMPON_MAX;
            this.tampon.splice(0, this.tampon.length - TAMPON_MAX);
        }
    }

    /** Les prochaines lignes à envoyer, retirées du tampon. */
    prendre(): EntreeJournal[] {
        const lot = this.tampon.splice(0, LOT);

        if (this.oubliees > 0) {
            const modele = '%d ligne(s) du journal perdue(s) : le site était injoignable trop longtemps.';

            lot.unshift({ level: 'warn', message: formater(modele, [this.oubliees]), template: modele, args: [String(this.oubliees)] });
            this.oubliees = 0;
        }

        return lot;
    }

    /** Remet en tête des lignes que le site n'a pas reçues. */
    rendre(lot: EntreeJournal[]): void {
        this.tampon.unshift(...lot);

        if (this.tampon.length > TAMPON_MAX) {
            this.oubliees += this.tampon.length - TAMPON_MAX;
            this.tampon.splice(TAMPON_MAX);
        }
    }

    get enAttente(): number {
        return this.tampon.length;
    }

    private masque(texte: string): string {
        let resultat = texte;

        for (const secret of this.secrets) {
            resultat = resultat.split(secret).join('[masqué]');
        }

        return resultat;
    }
}

/** Le message d'une erreur quelconque, en une ligne. */
export function messageErreur(erreur: unknown): string {
    if (erreur instanceof Error) {
        return erreur.message || erreur.name;
    }

    return String(erreur);
}
