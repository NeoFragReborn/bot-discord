/**
 * Le site, vu du bot : l'API REST v1 (`/api/v1/…`), authentifiée par la clé d'accès du bot.
 *
 * C'est toujours le bot qui appelle le site, jamais l'inverse : il n'ouvre aucun port, et tourne
 * aussi bien sur un VPS que sur un Raspberry Pi derrière une box.
 */

import type { EntreeJournal } from './journal.js';

/** Une correspondance salon Discord ↔ forum du site. */
export interface SalonRelie {
    channel_id: string;
    forum_id: number;
    mode: 'all' | 'reaction';
    emoji: string;
}

/** Une correspondance groupe du site ↔ rôle Discord. */
export interface RoleRelie {
    group_key: string;
    role_id: string;
}

/** La configuration du bot, réglée dans l'administration du site. */
export interface ConfigBot {
    token: string;
    client_id: string;
    guild_id: string;
    running: boolean;
    nicknames: boolean;
    channels: SalonRelie[];
    roles: RoleRelie[];
    /** Préfixe du forum ↔ étiquette d'un salon Forum. */
    tags?: { channel_id: string; prefix_id: number; tag_id: string }[];
    version: number;
    /** Le dernier événement du fil d'événements quand la configuration a été lue. */
    events_cursor: number;
    /** La clé d'accès du bot : ce qu'il écrit lui-même porte cette source dans le fil. */
    api_token_id: number | null;
    /** Les fonctionnalités : allumées ou non, et leurs réglages. */
    features?: Record<string, { enabled: boolean; settings: Record<string, string | number | boolean | null> }>;
    /** La langue du site (code à deux lettres). */
    lang?: string;
    /** Les traductions des textes que le bot poste sur Discord (cf. textes.ts) : modèle → langue → texte. */
    i18n?: Record<string, Partial<Record<string, string>>>;
}

/** Une fonctionnalité telle que le bot la déclare au site. */
export interface DeclarationFonctionnalite {
    nom: string;
    titre: string;
    description: string;
    defaut: boolean;
    reglages: readonly Record<string, unknown>[];
}

/** Ce que le bot dit de lui à chaque signe de vie. */
export interface SigneDeVie {
    version: string;
    connected: boolean;
    intents: { members: boolean; content: boolean };
    guild: InstantaneGuilde | null;
    /** Ses fonctionnalités : l'administration en tire ses formulaires. */
    features?: DeclarationFonctionnalite[];
    /** Les textes qu'il montre sur Discord : la configuration lui en rend les traductions. */
    texts?: string[];
    /** Le dernier événement du site qu'il a traité : il en repartira au prochain démarrage. */
    events_cursor?: number;
}

/** Le serveur Discord décrit au site, pour les listes de l'administration. */
export interface InstantaneGuilde {
    id: string;
    name: string;
    channels: { id: string; name: string; type: number; parent_id: string; tags: { id: string; name: string }[] }[];
    roles: { id: string; name: string; managed: boolean }[];
}

/** Une commande de l'administration : `restart`, `resync`, `setup`… avec ses données. */
export interface CommandeSite {
    type: string;
    data: Record<string, unknown>;
}

/** Ce que le site répond à un signe de vie. */
export interface ReponseSigneDeVie {
    running: boolean;
    version: number;
    /** Un simple nom pour un site 1.2.11. */
    commands: (CommandeSite | string)[];
}

/** Un membre du site qui a lié son compte Discord. */
export interface MembreLie {
    discord_id: string;
    member_id: number;
    username: string;
    groups: string[];
}

/** Un membre du site, tel que l'API le décrit (`members/{id}`, `members/discord/{id}`). */
export interface Membre {
    id: number;
    username: string;
    avatar: string | null;
    groups: string[];
    discord: { id: string; username: string } | null;
}

/** L'auteur d'un sujet ou d'un message du forum, côté site. */
export interface AuteurSite {
    author: { id: number; username: string } | null;
    external_author: { provider: string; external_id: string; name: string } | null;
}

export interface Sujet extends AuteurSite {
    id: number;
    forum_id: number;
    title: string;
    locked: boolean;
    prefix: { id: number; title: string; color: string } | null;
    first_message_id: number | null;
    url: string;
}

export interface MessageForum extends AuteurSite {
    id: number;
    topic_id: number;
    forum_id: number;
    is_first: boolean;
    deleted: boolean;
    html: string | null;
    text: string | null;
    url: string;
}

/** Qui écrit sur le forum par l'API : un compte Discord (lié : sous son membre ; sinon sous son identité). */
export interface AuteurDiscord {
    discord: { id: string; username?: string; avatar?: string };
}

export interface Lien {
    site_id: number;
    discord_id: string;
}

export type TypeLien = 'topic' | 'message' | 'ticket' | 'comment';

/** Un rôle temporaire en cours (`/role give`) ; `expires_at` est un horodatage Unix. */
export interface RoleTemporaire {
    timed_id: number;
    discord_id: string;
    username: string;
    role_id: string;
    expires_at: number;
    given_by: string;
    given_by_name: string;
    reason: string;
}

/** Un ticket du Bugtracker. */
export interface Ticket {
    id: number;
    title: string;
    description: string;
    type: 'bug' | 'feature' | 'question' | 'other';
    priority: 'low' | 'normal' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'wont_fix' | 'duplicate';
    duplicate_of: number | null;
    author: { id: number; username: string } | null;
    url: string;
}

/** Un commentaire de ticket. */
export interface CommentaireTicket {
    id: number;
    ticket_id: number;
    content: string;
    author: { id: number; username: string } | null;
    external_author: { provider: string; external_id: string; name: string } | null;
    status_change: boolean;
}

export interface Evenement {
    id: number;
    type: string;
    data: Record<string, unknown>;
    source: { token_id: number } | null;
    created_at: string;
}

export interface PageEvenements {
    events: Evenement[];
    next: number;
    more: boolean;
}

/** Le compte rendu d'une mise en place du serveur (cf. mise-en-place.ts). */
export interface CompteRenduMiseEnPlace {
    id: string;
    cree: { categorie: string | null; salons: string[]; roles: string[] };
    salons: { forum_id: number; channel_id: string }[];
    roles: { group_key: string; role_id: string }[];
    /** L'étiquette de chaque préfixe, dans chaque salon créé ou repris. */
    etiquettes: { channel_id: string; prefix_id: number; tag_id: string }[];
    erreurs: string[];
}

/** Comment un compte Discord paraît sur le forum du site. */
export type EtatIdentite =
    | { linked: true; member: string }
    | { linked: false; mode: 'public' | 'guest' | 'custom'; custom_name: string | null; name: string | null; custom_change_at: number | null };

/** Une erreur rendue par l'API (ou l'absence de réponse : statut 0). */
export class ErreurSite extends Error {
    constructor(
        readonly statut: number,
        readonly code: string,
        message: string,
        /** Ce que l'erreur dit de plus (`member`, `custom_change_at`…). */
        readonly details: Record<string, unknown> = {},
    ) {
        super(message);
        this.name = 'ErreurSite';
    }
}

type Fetch = typeof fetch;

/** Une image gardée sur le site : `path`, relative au site (pour le contenu d'un message), et `url`. */
export interface ImageDuSite {
    path: string;
    url: string;
}

/** Délai d'attente d'une requête, en millisecondes. */
const DELAI = 15_000;

export class Site {
    private readonly base: string;

    constructor(
        site: string,
        private readonly cle: string,
        private readonly fetchImpl: Fetch = fetch,
    ) {
        this.base = site.replace(/\/+$/, '') + '/api/v1/';
    }

    config(): Promise<ConfigBot> {
        return this.requete<ConfigBot>('GET', 'discord/config');
    }

    signeDeVie(etat: SigneDeVie): Promise<ReponseSigneDeVie> {
        return this.requete<ReponseSigneDeVie>('POST', 'discord/heartbeat', etat);
    }

    async journal(entrees: EntreeJournal[]): Promise<void> {
        await this.requete('POST', 'discord/logs', { entries: entrees });
    }

    membres(): Promise<MembreLie[]> {
        return this.requete<MembreLie[]>('GET', 'discord/members');
    }

    /** Un membre du site par son identifiant ; NULL s'il n'existe pas (ou plus). */
    membre(id: number): Promise<Membre | null> {
        return this.ouNull(this.requete<Membre>('GET', `members/${id}`), 'member_not_found');
    }

    /** Le membre du site qui a lié ce compte Discord ; NULL si personne. */
    membreDiscord(discordId: string): Promise<Membre | null> {
        return this.ouNull(this.requete<Membre>('GET', `members/discord/${encodeURIComponent(discordId)}`), 'member_not_found');
    }

    /** Le lien d'un sujet ou d'un message, cherché par son côté site ou son côté Discord ; NULL s'il n'y en a pas. */
    async lien(type: TypeLien, cote: { siteId: number } | { discordId: string }): Promise<Lien | null> {
        const critere = 'siteId' in cote ? `site_id=${cote.siteId}` : `discord_id=${encodeURIComponent(cote.discordId)}`;

        return this.ouNull(this.requete<Lien>('GET', `discord/links?type=${type}&${critere}`), 'link_not_found');
    }

    async lier(type: TypeLien, siteId: number, discordId: string): Promise<void> {
        await this.requete('POST', 'discord/links', { type, site_id: siteId, discord_id: discordId });
    }

    /** `/forum account link` : un lien à usage unique vers le site, ou le membre déjà lié. */
    demanderLiaison(discord: { id: string; username: string; avatar?: string }): Promise<{ linked: true; member: string } | { linked: false; url: string; expires_in: number }> {
        return this.requete('POST', 'discord/link-request', { discord_id: discord.id, username: discord.username, ...(discord.avatar ? { avatar: discord.avatar } : {}) });
    }

    /** `/forum account unlink` : rend le membre délié (erreurs `not_linked`, `only_login_method`). */
    delier(discordId: string): Promise<{ unlinked: true; member: string }> {
        return this.requete('POST', 'discord/unlink', { discord_id: discordId });
    }

    /** `/forum visibility status` : comment ce compte paraît sur le forum. */
    identite(discordId: string): Promise<EtatIdentite> {
        return this.requete<EtatIdentite>('GET', `discord/identity/${encodeURIComponent(discordId)}`);
    }

    /** `/forum visibility public|guest|custom` (erreurs `linked`, `invalid_name`, `name_taken`, `too_soon`). */
    reglerIdentite(discord: { id: string; username: string; avatar?: string }, mode: 'public' | 'guest' | 'custom', nom?: string): Promise<EtatIdentite> {
        return this.requete<EtatIdentite>('PATCH', `discord/identity/${encodeURIComponent(discord.id)}`, { mode, username: discord.username, ...(discord.avatar ? { avatar: discord.avatar } : {}), ...(nom !== undefined ? { custom_name: nom } : {}) });
    }

    /** Ce que la mise en place du serveur a créé et repris : le site pose les correspondances. */
    async compteRenduMiseEnPlace(compteRendu: CompteRenduMiseEnPlace): Promise<void> {
        await this.requete('POST', 'discord/setup', compteRendu);
    }

    /** Ce que l'annulation d'une mise en place a supprimé : le site retire les correspondances. */
    async annulationMiseEnPlace(id: string, supprimes: { salons: string[]; roles: string[]; categorie: string | null }): Promise<void> {
        await this.requete('POST', 'discord/setup/undo', { id, ...supprimes });
    }

    /** Lesquels de ces éléments Discord ont déjà leur pendant sur le site (identifiant Discord → du site). */
    async liensConnus(type: TypeLien, discordIds: readonly string[]): Promise<Map<string, number>> {
        const connus = new Map<string, number>();

        for (let i = 0; i < discordIds.length; i += 500) {
            const lot = await this.requete<{ found: Record<string, number> }>('POST', 'discord/links/lookup', { type, discord_ids: discordIds.slice(i, i + 500) });

            for (const [discordId, siteId] of Object.entries(lot.found)) {
                connus.set(discordId, siteId);
            }
        }

        return connus;
    }

    sujet(id: number): Promise<Sujet | null> {
        return this.ouNull(this.requete<Sujet>('GET', `forum/topics/${id}`), 'topic_not_found');
    }

    message(id: number): Promise<MessageForum | null> {
        return this.ouNull(this.requete<MessageForum>('GET', `forum/messages/${id}`), 'message_not_found');
    }

    creerSujet(forumId: number, titre: string, contenu: string, auteur: AuteurDiscord, prefixeId?: number): Promise<Sujet> {
        return this.requete<Sujet>('POST', 'forum/topics', { forum_id: forumId, title: titre, content: contenu, author: auteur, ...(prefixeId ? { prefix_id: prefixeId } : {}) });
    }

    /** Le préfixe d'un sujet (NULL : aucun). */
    modifierSujet(id: number, prefixeId: number | null): Promise<Sujet> {
        return this.requete<Sujet>('PATCH', `forum/topics/${id}`, { prefix_id: prefixeId });
    }

    repondre(sujetId: number, contenu: string, auteur: AuteurDiscord, repondA?: number): Promise<MessageForum> {
        return this.requete<MessageForum>('POST', `forum/topics/${sujetId}/messages`, { content: contenu, author: auteur, ...(repondA ? { reply_to: repondA } : {}) });
    }

    modifierMessage(id: number, contenu: string, auteur: AuteurDiscord): Promise<MessageForum> {
        return this.requete<MessageForum>('PATCH', `forum/messages/${id}`, { content: contenu, author: auteur });
    }

    async supprimerMessage(id: number, auteur: AuteurDiscord): Promise<void> {
        await this.requete('DELETE', `forum/messages/${id}`, { author: auteur });
    }

    /** Les rôles temporaires en cours : ceux d'un membre, ou ceux arrivés à échéance (`echus`). */
    async rolesTemporaires(discordId?: string, echus = false): Promise<RoleTemporaire[]> {
        const criteres = [discordId ? `discord_id=${encodeURIComponent(discordId)}` : '', echus ? 'due=1' : ''].filter(Boolean).join('&');

        return (await this.requete<{ timed_roles: RoleTemporaire[] }>('GET', `discord/timed-roles${criteres ? `?${criteres}` : ''}`)).timed_roles;
    }

    /** Donne un rôle temporaire, ou prolonge celui que le membre a déjà (erreur `role_mapped` pour un rôle relié à un groupe). */
    donnerRoleTemporaire(r: { discord_id: string; username: string; role_id: string; duration: number; given_by: string; given_by_name: string; reason: string }): Promise<RoleTemporaire> {
        return this.requete<RoleTemporaire>('POST', 'discord/timed-roles', r);
    }

    async retirerRoleTemporaire(id: number): Promise<void> {
        await this.requete('DELETE', `discord/timed-roles/${id}`);
    }

    /** Les tickets qui suivent `apres` (les seuls encore ouverts si `ouverts`), par lots ; `next` est le curseur suivant. */
    tickets(apres: number, ouverts: boolean): Promise<{ tickets: Ticket[]; next: number; more: boolean }> {
        return this.requete('GET', `bugtracker/tickets?after=${apres}&limit=50${ouverts ? '&open=1' : ''}`);
    }

    ticket(id: number): Promise<Ticket | null> {
        return this.ouNull(this.requete<Ticket>('GET', `bugtracker/tickets/${id}`), 'ticket_not_found');
    }

    commentaireTicket(id: number): Promise<CommentaireTicket | null> {
        return this.ouNull(this.requete<CommentaireTicket>('GET', `bugtracker/comments/${id}`), 'comment_not_found');
    }

    /** Ouvre un ticket au nom d'un compte Discord lié (erreur `not_linked` sinon). */
    ouvrirTicket(titre: string, description: string, type: Ticket['type'], auteur: AuteurDiscord): Promise<Ticket> {
        return this.requete<Ticket>('POST', 'bugtracker/tickets', { title: titre, description, type, author: auteur });
    }

    commenterTicket(ticketId: number, contenu: string, auteur: AuteurDiscord): Promise<CommentaireTicket> {
        return this.requete<CommentaireTicket>('POST', `bugtracker/tickets/${ticketId}/comments`, { content: contenu, author: auteur });
    }

    modifierCommentaireTicket(id: number, contenu: string, auteur: AuteurDiscord): Promise<CommentaireTicket> {
        return this.requete<CommentaireTicket>('PATCH', `bugtracker/comments/${id}`, { content: contenu, author: auteur });
    }

    async supprimerCommentaireTicket(id: number, auteur: AuteurDiscord): Promise<void> {
        await this.requete('DELETE', `bugtracker/comments/${id}`, { author: auteur });
    }

    /**
     * Garde sur le site une image jointe sur Discord — le site la contrôle et la ré-encode comme celles de
     * son éditeur (NeoFrag Reborn 1.2.27 ou plus récent) — et rend son adresse.
     */
    envoyerImage(octets: Uint8Array<ArrayBuffer>, nom: string, type: string): Promise<ImageDuSite> {
        return this.requete<ImageDuSite>('POST', `forum/images?name=${encodeURIComponent(nom)}`, undefined, { octets, type });
    }

    evenements(apres: number, limite = 100): Promise<PageEvenements> {
        return this.requete<PageEvenements>('GET', `events?after=${apres}&limit=${limite}`);
    }

    /** Une réponse « introuvable » (ce code d'erreur) vaut NULL ; toute autre erreur remonte. */
    private async ouNull<T>(promesse: Promise<T>, code: string): Promise<T | null> {
        try {
            return await promesse;
        } catch (erreur) {
            if (erreur instanceof ErreurSite && erreur.code === code) {
                return null;
            }

            throw erreur;
        }
    }

    /** `corps` part en JSON ; `brut`, tel quel (une image), avec son type. */
    private async requete<T>(methode: string, chemin: string, corps?: unknown, brut?: { octets: Uint8Array<ArrayBuffer>; type: string }): Promise<T> {
        let reponse: Response;

        try {
            reponse = await this.fetchImpl(this.base + chemin, {
                method: methode,
                headers: {
                    Authorization: `Bearer ${this.cle}`,
                    Accept: 'application/json',
                    ...(brut ? { 'Content-Type': brut.type } : corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
                },
                ...(brut ? { body: new Blob([brut.octets], { type: brut.type }) } : corps !== undefined ? { body: JSON.stringify(corps) } : {}),
                signal: AbortSignal.timeout(DELAI),
            });
        } catch (erreur) {
            throw new ErreurSite(0, 'unreachable', `site injoignable (${erreur instanceof Error ? erreur.message : String(erreur)})`);
        }

        let json: { data?: T; error?: { code?: string; message?: string } & Record<string, unknown> } = {};

        try {
            json = (await reponse.json()) as typeof json;
        } catch {
            // Une réponse qui n'est pas du JSON : une page d'erreur du serveur web, un proxy…
        }

        if (!reponse.ok) {
            throw new ErreurSite(reponse.status, json.error?.code ?? 'http_error', json.error?.message ?? `HTTP ${reponse.status}`, json.error ?? {});
        }

        if (!('data' in json)) {
            throw new ErreurSite(reponse.status, 'invalid_response', 'réponse du site illisible (pas de JSON « data »)');
        }

        return json.data as T;
    }
}
