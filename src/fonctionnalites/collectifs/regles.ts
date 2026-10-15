/**
 * Les règles des collectifs (m15, v3), sans Discord : le nom d'un salon, et ses droits. Éprouvées par `regles.test.ts`.
 */

import { OverwriteType, PermissionFlagsBits } from 'discord.js';

/** Le nom d'un salon texte, à la façon de Discord : minuscules, sans accent, des tirets — `collectif-<id>` s'il n'en reste rien. */
export function nomDeSalon(nom: string, id: number): string {
    const slug = nom
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 90)
        .replace(/-+$/, '');

    return slug || `collectif-${id}`;
}

/** Le nom d'un rôle : celui du collectif, à la longueur que Discord accepte. */
export function nomDeRole(nom: string): string {
    return nom.trim().slice(0, 100) || 'Collectif';
}

/** Ce que voit le rôle du collectif dans son salon : le lire, y écrire, relire l'historique. */
export const DROITS_DU_ROLE = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] as const;

/**
 * Les droits d'un salon de collectif : fermé à `@everyone` (dont l'identifiant est celui du serveur), ouvert au rôle
 * du collectif — et au bot, qui doit pouvoir le voir pour le tenir.
 */
export function droitsDuSalon(serveur: string, role: string, bot: string): { id: string; type: OverwriteType; allow?: bigint[]; deny?: bigint[] }[] {
    return [
        { id: serveur, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: role, type: OverwriteType.Role, allow: [...DROITS_DU_ROLE] },
        { id: bot, type: OverwriteType.Member, allow: [...DROITS_DU_ROLE] },
    ];
}
