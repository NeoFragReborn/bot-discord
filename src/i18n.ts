/**
 * Les textes que le bot poste sur Discord, dans la langue de chacun.
 *
 * Le bot n'a aucune traduction à lui. Ses textes visibles sur Discord sont réunis dans `textes.ts` ;
 * il en envoie la liste au site à chaque signe de vie, et la configuration lui rend leurs traductions
 * dans les six langues du produit (`i18n`), tenues par l'outillage du site comme toutes les autres.
 *
 * - Une réponse à un membre (une commande) est écrite dans SA langue Discord.
 * - Ce qui est posté dans un salon, vu de tous, est écrit dans la langue du site (`lang`).
 * - Une commande déclare sa description dans toutes les langues (`localisations()`).
 */

import { formater, type Valeur } from './journal.js';

export type Langue = 'fr' | 'en' | 'de' | 'es' | 'it' | 'pt';

const LANGUES: readonly Langue[] = ['fr', 'en', 'de', 'es', 'it', 'pt'];

/** Les codes de langue de Discord, pour chaque langue du produit. */
const LOCALES_DISCORD: Record<Langue, readonly string[]> = {
    fr: ['fr'],
    en: ['en-US', 'en-GB'],
    de: ['de'],
    es: ['es-ES', 'es-419'],
    it: ['it'],
    pt: ['pt-BR'],
};

export type Table = Record<string, Partial<Record<string, string>>>;

/** La langue du produit qui correspond à une locale Discord (« en-GB » → « en »), ou NULL. */
export function langueDe(locale: string | null | undefined): Langue | null {
    if (!locale) {
        return null;
    }

    const court = locale.slice(0, 2).toLowerCase();

    return (LANGUES as readonly string[]).includes(court) ? (court as Langue) : null;
}

export class Textes {
    private readonly langueSite: Langue;

    constructor(
        private readonly table: Table = {},
        langueSite: string = 'fr',
    ) {
        this.langueSite = langueDe(langueSite) ?? 'fr';
    }

    /**
     * Un texte dans la langue d'une locale Discord (NULL : celle du site), rempli de ses valeurs. Sans
     * traduction, la langue du site ; sans elle, le français du modèle.
     */
    dans(locale: string | null, modele: string, ...args: Valeur[]): string {
        const langue = langueDe(locale) ?? this.langueSite;
        const traductions = this.table[modele] ?? {};

        return formater(traductions[langue] ?? traductions[this.langueSite] ?? modele, args);
    }

    /** Un texte dans toutes les langues, à la façon des commandes Discord : la langue du site par défaut, et les autres. */
    localisations(modele: string): { defaut: string; locales: Record<string, string> } {
        const locales: Record<string, string> = {};

        for (const langue of LANGUES) {
            const texte = this.table[modele]?.[langue] ?? modele;

            for (const locale of LOCALES_DISCORD[langue]) {
                locales[locale] = texte.slice(0, 100);
            }
        }

        const defaut = this.table[modele]?.[this.langueSite] ?? modele;

        return { defaut: defaut.slice(0, 100), locales };
    }
}
