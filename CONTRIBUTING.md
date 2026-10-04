# Contribuer au bot Discord

Le bot est écrit en **TypeScript** avec [discord.js](https://discord.js.org/), pour Node.js 22.9 ou plus.

```sh
npm ci
npm test        # compile, puis lance les tests (src/**/*.test.ts, lanceur intégré de Node)
```

Les tests ne demandent ni Discord ni site : ce que le site attend du bot — les permissions de son
invitation, les droits de sa clé d'accès, les phrases qu'il sait traduire — est écrit dans
`contrat-du-site.json`, engendré depuis le module Discord du site. Ne l'édite pas à la main.

## Écrire une fonctionnalité

Une fonctionnalité est un dossier de `src/fonctionnalites/`, inscrit dans `src/fonctionnalites/index.ts`,
qui respecte le contrat de `src/fonctionnalites/types.ts` :

```ts
import { GatewayIntentBits } from 'discord.js';
import type { Evenement } from '../../site.js';
import { TEXTES } from '../../textes.js';
import type { Contexte, Fonctionnalite, Reglage } from '../types.js';

export class Bienvenue implements Fonctionnalite {
    readonly nom = 'bienvenue';
    readonly titre = 'Bienvenue';                                   // dans l'administration
    readonly description = 'Accueille chaque nouveau membre.';
    readonly defaut = false;                                        // éteinte au départ
    readonly reglages = [
        { cle: 'salon', type: 'salon', defaut: '', salons: [0], libelle: 'Salon de bienvenue' },  // 0 : un salon texte
    ] as const satisfies readonly Reglage[];
    readonly intents = [GatewayIntentBits.GuildMembers] as const;  // en plus de ceux de base
    readonly evenements = ['forum.topic.created'] as const;         // le fil d'événements du site

    demarrer(ctx: Contexte): void {
        // ctx.client, ctx.guilde, ctx.site (l'API), ctx.config, ctx.reglages, ctx.textes, ctx.journal
        ctx.journal.info('Bienvenue : prête sur « %s ».', ctx.guilde.name);
    }

    reconfigurer(ctx: Contexte): void { /* l'administration a changé un réglage */ }
    tour(ctx: Contexte): void { /* toutes les 30 secondes environ */ }
    surEvenement(ctx: Contexte, evenement: Evenement): void { /* un événement suivi */ }
    resynchroniser(ctx: Contexte): void { /* « Resynchroniser » dans l'administration : rattraper ce qui manque */ }
    arreter(): void { /* retirer ses minuteries et ses écouteurs */ }
}
```

- Les **réglages** déclarés (`bool`, `int`, `choix`, `salon`, `role`, `texte`) font d'eux-mêmes leur
  formulaire dans l'administration, bornes vérifiées ; `ctx.reglages` donne la valeur choisie. Un
  réglage `salon` dit quels types de salons Discord il accepte (`salons` : `0` texte, `15` Forum…).
- Seul `demarrer()` est obligatoire ; les autres points d'entrée sont facultatifs.
- Une fonctionnalité qui a des **commandes** les déclare dans `commandes(textes)` et y répond dans
  `surCommande()` ; boutons et fenêtres arrivent dans `surInteraction()`, si leur `customId` commence
  par son nom (`bienvenue:…`).
- Une fonctionnalité qui lève une erreur l'écrit au journal sans emporter le bot ni les autres.
- **Tout ce qui s'affiche sur Discord** — messages, réponses, descriptions des commandes — vit dans
  `src/textes.ts` (`TEXTES`), en modèles français ; `ctx.textes.dans(locale, TEXTES.…, …)` le rend dans
  la langue de chacun, `textes.localisations()` pour les descriptions des commandes.
- **Le journal est traduit par le site** : écris un *modèle* et ses valeurs
  (`ctx.journal.warn('Le rôle « %s » est mal placé.', role.name)`), jamais une phrase assemblée.
- Chaque modèle — du journal comme de `TEXTES` — doit être connu du site : il s'ajoute à
  `Discord::textes_du_bot()`, dans le module Discord du site, qui le traduit dans ses six langues et
  régénère `contrat-du-site.json`. Un test du bot échoue tant qu'un modèle n'y est pas : propose les
  deux changements ensemble.
- Une règle qui ne dépend pas de Discord gagne à vivre dans son propre fichier, testé
  (`src/fonctionnalites/roles-temporaires/regles.ts`, `src/fonctionnalites/bugtracker/etiquettes.ts`).

## Versions

Le bot a ses propres numéros de version (`package.json`), indépendants de ceux du site ; chaque version
dit dans `CHANGELOG.md` la version du site qu'elle demande.
