/**
 * Les « intents » : ce que le bot demande à recevoir de Discord.
 *
 * Deux sont « privilégiés » et doivent être cochés à la main dans le portail des développeurs
 * Discord (onglet « Bot ») : la liste des membres (rôles, pseudos) et le contenu des messages
 * (recopier un message sur le forum). Demander un intent non coché fait refuser la connexion : le
 * bot lit donc d'abord ce que l'application a le droit de recevoir, et ne demande que cela — il
 * fonctionne en mode réduit plutôt que pas du tout, et le dit dans son journal.
 */

import { ApplicationFlagsBitField, GatewayIntentBits } from 'discord.js';

export interface IntentsPermis {
    /** « Server Members Intent » coché. */
    members: boolean;
    /** « Message Content Intent » coché. */
    content: boolean;
}

/** Ce que les drapeaux de l'application Discord permettent (l'onglet « Bot » du portail). */
export function intentsPermis(drapeaux: number): IntentsPermis {
    const f = ApplicationFlagsBitField.Flags;

    return {
        members: (drapeaux & (f.GatewayGuildMembers | f.GatewayGuildMembersLimited)) !== 0,
        content: (drapeaux & (f.GatewayMessageContent | f.GatewayMessageContentLimited)) !== 0,
    };
}

/** Les intents toujours demandés : le serveur et ses salons, les messages, les réactions. */
export const INTENTS_DE_BASE: readonly GatewayIntentBits[] = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
];

/** Les intents à demander : la base, les privilégiés permis, et ce que veulent les fonctionnalités. */
export function intentsDemandes(permis: IntentsPermis, voulus: readonly GatewayIntentBits[] = []): GatewayIntentBits[] {
    const intents = new Set<GatewayIntentBits>([...INTENTS_DE_BASE, ...voulus]);

    if (permis.members) {
        intents.add(GatewayIntentBits.GuildMembers);
    } else {
        intents.delete(GatewayIntentBits.GuildMembers);
    }

    if (permis.content) {
        intents.add(GatewayIntentBits.MessageContent);
    } else {
        intents.delete(GatewayIntentBits.MessageContent);
    }

    return [...intents].sort((a, b) => a - b);
}
