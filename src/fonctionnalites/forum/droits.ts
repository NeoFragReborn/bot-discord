/**
 * Les permissions d'un salon relié, d'après les droits de son forum sur le site (0.2.5) — le calcul seul, sans appel
 * à Discord : c'est lui que les tests éprouvent.
 *
 * Le site fait foi. Les membres du site valent pour tout le serveur (@everyone) — rejoindre le serveur, c'est comme
 * s'inscrire : qui ne peut pas lire le forum ne voit pas le salon, qui ne peut pas y écrire n'y poste pas (en mode
 * « tous les fils » ; en mode « par réaction », Discord reste un lieu de discussion et seule la lecture suit). Un rôle
 * relié rend à son groupe ce que les membres n'ont pas. Le bot, s'il le faut, s'accorde ce qu'il lui faut pour recopier.
 *
 * Seules ces permissions-là sont touchées, et seulement pour @everyone, les rôles reliés et le bot : ce qu'un
 * administrateur a réglé à la main sur une autre permission, ou pour un autre rôle, reste.
 */

import { PermissionFlagsBits } from 'discord.js';

export interface Droit {
    read: boolean;
    write: boolean;
}

/** Une permission propre au salon : `type` 0 pour un rôle, 1 pour un membre ; `allow` et `deny` en bits Discord. */
export interface Ecrasement {
    id: string;
    type: 0 | 1;
    allow: bigint;
    deny: bigint;
}

export interface PlanDroits {
    /** Les écrasements à poser, celui du bot d'abord : il ne doit pas perdre la vue du salon en chemin. */
    poser: Ecrasement[];
    /** Ceux à retirer, devenus vides. */
    retirer: string[];
}

export const LIRE = PermissionFlagsBits.ViewChannel;
/** Ouvrir un fil dans un salon Forum (« Envoyer des messages »), et y répondre. */
export const ECRIRE = PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads;
/** Ce que le bot doit garder dans un salon fermé à @everyone : celles qu'il demande à son invitation pour un salon relié. */
export const DU_BOT = PermissionFlagsBits.ViewChannel
    | PermissionFlagsBits.SendMessages
    | PermissionFlagsBits.SendMessagesInThreads
    | PermissionFlagsBits.ReadMessageHistory
    | PermissionFlagsBits.ManageWebhooks
    | PermissionFlagsBits.ManageThreads
    | PermissionFlagsBits.ManageMessages
    | PermissionFlagsBits.EmbedLinks
    | PermissionFlagsBits.AttachFiles
    | PermissionFlagsBits.AddReactions;

interface Voulu {
    type: 0 | 1;
    allow: bigint;
    deny: bigint;
    geres: bigint;
}

/**
 * Le plan d'un salon : `droits` (groupe → droits, `members` compris ; vide pour un site d'avant la 1.2.48, et alors
 * rien ne change), `ecrire` (l'écriture suit-elle le site ?), les cibles, et les écrasements que le salon a déjà.
 */
export function planDesDroits(droits: Readonly<Record<string, Droit>>, ecrire: boolean, cibles: { everyone: string; bot: string; roles: readonly { group_key: string; role_id: string }[] }, existants: readonly Ecrasement[]): PlanDroits {
    const membres = droits.members;
    const plan: PlanDroits = { poser: [], retirer: [] };

    if (!membres) {
        return plan;
    }

    const geres = LIRE | (ecrire ? ECRIRE : 0n);
    const fermes = (membres.read ? 0n : LIRE) | (ecrire && !membres.write ? ECRIRE : 0n);
    const voulus = new Map<string, Voulu>();

    if (fermes !== 0n) {
        voulus.set(cibles.bot, { type: 1, allow: DU_BOT, deny: 0n, geres: DU_BOT });
    }

    voulus.set(cibles.everyone, { type: 0, allow: 0n, deny: fermes, geres });

    for (const r of cibles.roles) {
        const d = droits[r.group_key];

        if (!d || r.role_id === cibles.everyone) {
            continue;
        }

        const allow = (d.read && !membres.read ? LIRE : 0n) | (ecrire && d.write && !membres.write ? ECRIRE : 0n);
        // Un rôle relié à plusieurs groupes reçoit ce que l'un d'eux peut.
        const deja = voulus.get(r.role_id);

        voulus.set(r.role_id, { type: 0, allow: (deja?.allow ?? 0n) | allow, deny: 0n, geres });
    }

    for (const [id, v] of voulus) {
        const e = existants.find((x) => x.id === id);
        const allow = ((e?.allow ?? 0n) & ~v.geres) | v.allow;
        const deny = ((e?.deny ?? 0n) & ~v.geres) | v.deny;

        if ((e && e.allow === allow && e.deny === deny) || (!e && allow === 0n && deny === 0n)) {
            continue;
        }

        if (allow === 0n && deny === 0n) {
            plan.retirer.push(id);
        } else {
            plan.poser.push({ id, type: v.type, allow, deny });
        }
    }

    return plan;
}
