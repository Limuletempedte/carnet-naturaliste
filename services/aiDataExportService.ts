// Données de l'assistant IA incluses dans « Exporter mes données » (art. 15 et
// 20 RGPD). Lecture avec le client de l'utilisateur : la RLS
// (`ai_access_select_own`, `ai_usage_select_own`, migration
// 20261105161500_ai_identification.sql) ne renvoie que SES lignes.
//
// Point d'extension : pour une nouvelle table IA (ex. `ai_consents`), ajouter
// une entrée à `AI_EXPORT_SOURCES`. Le reste (lecture, section du fichier,
// manifeste, tests de forme) suit sans autre changement.

import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';
import { inSession, StaleSessionError, type SessionContext } from './sessionScope';

export interface AiExportSource {
    /** Clé de la section dans `assistant_ia.json`. */
    readonly key: string;
    readonly table: string;
    /** Colonnes exportées, listées explicitement (pas de `*`). */
    readonly columns: readonly string[];
    /** Colonne de tri chronologique. */
    readonly orderBy: string;
    /** Description en français, recopiée dans le fichier. */
    readonly description: string;
}

export const AI_EXPORT_SOURCES: readonly AiExportSource[] = [
    {
        key: 'acces',
        table: 'ai_access',
        columns: ['status', 'consent_version', 'requested_at', 'decided_at', 'note', 'monthly_quota'],
        orderBy: 'requested_at',
        description: "Votre demande d'accès à l'assistant : statut, version du consentement accepté, dates de demande et de décision, note éventuelle, quota mensuel.",
    },
    {
        key: 'utilisations',
        table: 'ai_usage',
        columns: ['created_at', 'feature', 'model', 'input_tokens', 'output_tokens', 'cost_usd', 'status'],
        orderBy: 'created_at',
        description: "Journal de vos appels à l'assistant (conservé 3 mois) : date, fonctionnalité, modèle, nombre de tokens, coût en dollars US, résultat. Ni photo ni réponse de l'assistant n'y sont conservées.",
    },
];

export interface AiExportSection {
    table: string;
    description: string;
    rows: Record<string, unknown>[];
}

export interface AiDataExport {
    /** `false` si au moins une table n'a pas pu être lue (hors ligne, erreur). */
    complete: boolean;
    /** Tables illisibles au moment de l'export. */
    unavailable: string[];
    sections: Record<string, AiExportSection>;
}

/**
 * Lit les données IA de l'utilisateur connecté. Ne lève pas d'erreur de
 * lecture : une table illisible est signalée dans `unavailable`, pour que
 * l'export des observations aboutisse quand même. Un changement de compte
 * (StaleSessionError) est en revanche propagé.
 */
export async function fetchAiDataForExport(
    context: SessionContext,
    sources: readonly AiExportSource[] = AI_EXPORT_SOURCES,
): Promise<AiDataExport> {
    const sections: Record<string, AiExportSection> = {};
    const unavailable: string[] = [];

    for (const source of sources) {
        let rows: Record<string, unknown>[] = [];
        try {
            const { data, error } = await inSession(context, () =>
                supabase
                    .from(source.table)
                    .select(source.columns.join(','))
                    .eq('user_id', context.userId)
                    .order(source.orderBy, { ascending: true }));
            if (error) throw error;
            rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
        } catch (error) {
            if (error instanceof StaleSessionError) throw error;
            logger.warn(`[aiDataExport] lecture impossible : ${source.table}`, error);
            unavailable.push(source.table);
        }
        sections[source.key] = { table: source.table, description: source.description, rows };
    }

    return { complete: unavailable.length === 0, unavailable, sections };
}

/** Contenu du fichier `assistant_ia.json` placé dans l'archive d'export. */
export const buildAiExportFile = (data: AiDataExport, generatedAt: string) => ({
    titre: "Données de l'assistant IA (aide à l'identification)",
    genereLe: generatedAt,
    complet: data.complete,
    ...(data.unavailable.length > 0
        ? { avertissement: `Lecture impossible au moment de l'export (connexion ?) : ${data.unavailable.join(', ')}. Relancez l'export en ligne pour obtenir ces données.` }
        : {}),
    ...data.sections,
});
