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
    version: number;
    /** Le dernier événement du fil d'événements quand la configuration a été lue. */
    events_cursor: number;
    /** La clé d'accès du bot : ce qu'il écrit lui-même porte cette source dans le fil. */
    api_token_id: number | null;
    /** Les textes que le bot poste sur Discord, traduits par le site dans sa langue. */
    texts?: { on_site?: string; read_more?: string; published?: string };
}

/** Ce que le bot dit de lui à chaque signe de vie. */
export interface SigneDeVie {
    version: string;
    connected: boolean;
    intents: { members: boolean; content: boolean };
    guild: InstantaneGuilde | null;
}

/** Le serveur Discord décrit au site, pour les listes de l'administration. */
export interface InstantaneGuilde {
    id: string;
    name: string;
    channels: { id: string; name: string; type: number }[];
    roles: { id: string; name: string; managed: boolean }[];
}

/** Ce que le site répond à un signe de vie. */
export interface ReponseSigneDeVie {
    running: boolean;
    version: number;
    commands: string[];
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

export type TypeLien = 'topic' | 'message';

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

/** Une erreur rendue par l'API (ou l'absence de réponse : statut 0). */
export class ErreurSite extends Error {
    constructor(
        readonly statut: number,
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'ErreurSite';
    }
}

type Fetch = typeof fetch;

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

    sujet(id: number): Promise<Sujet | null> {
        return this.ouNull(this.requete<Sujet>('GET', `forum/topics/${id}`), 'topic_not_found');
    }

    message(id: number): Promise<MessageForum | null> {
        return this.ouNull(this.requete<MessageForum>('GET', `forum/messages/${id}`), 'message_not_found');
    }

    creerSujet(forumId: number, titre: string, contenu: string, auteur: AuteurDiscord): Promise<Sujet> {
        return this.requete<Sujet>('POST', 'forum/topics', { forum_id: forumId, title: titre, content: contenu, author: auteur });
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

    private async requete<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
        let reponse: Response;

        try {
            reponse = await this.fetchImpl(this.base + chemin, {
                method: methode,
                headers: {
                    Authorization: `Bearer ${this.cle}`,
                    Accept: 'application/json',
                    ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
                },
                ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
                signal: AbortSignal.timeout(DELAI),
            });
        } catch (erreur) {
            throw new ErreurSite(0, 'unreachable', `site injoignable (${erreur instanceof Error ? erreur.message : String(erreur)})`);
        }

        let json: { data?: T; error?: { code?: string; message?: string } } = {};

        try {
            json = (await reponse.json()) as typeof json;
        } catch {
            // Une réponse qui n'est pas du JSON : une page d'erreur du serveur web, un proxy…
        }

        if (!reponse.ok) {
            throw new ErreurSite(reponse.status, json.error?.code ?? 'http_error', json.error?.message ?? `HTTP ${reponse.status}`);
        }

        if (!('data' in json)) {
            throw new ErreurSite(reponse.status, 'invalid_response', 'réponse du site illisible (pas de JSON « data »)');
        }

        return json.data as T;
    }
}
