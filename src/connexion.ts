/**
 * Les coupures de la connexion à Discord, dites seulement quand elles DURENT.
 *
 * Discord demande lui-même au bot de se reconnecter plusieurs fois par jour — une quinzaine sur le serveur officiel —,
 * et la session reprend dans la seconde, sans rien perdre. Le journal notait chacune en avertissement, que
 * l'administration du site montrait comme un incident (relevé le 2026-10-10). Une coupure qui dure plus que le délai
 * se dit, elle : un avertissement passé le délai, puis la durée de la coupure à son retour.
 */
import type { Journal } from './journal.js';

/** Au-delà, une coupure n'est plus une reconnexion ordinaire. */
export const DELAI_ALERTE = 60_000;

export class SuiviConnexion {
    private depuis: number | null = null;
    private minuterie: ReturnType<typeof setTimeout> | null = null;
    private signalee = false;

    constructor(
        private readonly journal: Pick<Journal, 'warn' | 'info'>,
        private readonly delai: number = DELAI_ALERTE,
        private readonly maintenant: () => number = Date.now,
    ) {}

    /** Discord a coupé la connexion et le bot se reconnecte : rien ne se dit tant que la coupure ne dure pas. */
    perdue(): void {
        if (this.depuis !== null) {
            return;
        }

        this.depuis = this.maintenant();
        this.minuterie = setTimeout(() => {
            this.signalee = true;
            this.journal.warn('Connexion à Discord perdue depuis %d s : reconnexion en cours…', Math.round(this.delai / 1000));
        }, this.delai);
        // Une minuterie en attente ne retient pas le processus à son arrêt.
        this.minuterie.unref?.();
    }

    /** La connexion est revenue : session reprise, ou nouvelle session. */
    retablie(): void {
        if (this.depuis === null) {
            return;
        }

        if (this.signalee) {
            this.journal.info('Connexion à Discord rétablie après %d s.', Math.round((this.maintenant() - this.depuis) / 1000));
        }

        this.arreter();
    }

    /** Plus de coupure suivie : à son retour, ou à la fermeture de la connexion. */
    arreter(): void {
        if (this.minuterie !== null) {
            clearTimeout(this.minuterie);
        }

        this.depuis = null;
        this.minuterie = null;
        this.signalee = false;
    }
}
