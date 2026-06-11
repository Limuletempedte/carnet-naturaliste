import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;

/**
 * Liste récursivement TOUS les fichiers sous un préfixe, avec pagination.
 * Nécessaire car les uploads sont rangés en sous-dossiers ({uid}/photos/…,
 * {uid}/sounds/…) : list() ne renvoie que les enfants directs, et les
 * entrées de dossier virtuel (id === null) ne sont pas supprimables.
 */
async function listAllFiles(client: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
    const paths: string[] = [];
    let offset = 0;
    for (;;) {
        const { data, error } = await client.storage.from(bucket).list(prefix, {
            limit: LIST_PAGE_SIZE,
            offset,
        });
        if (error) {
            throw new Error(`Listing Storage impossible (${prefix}): ${error.message}`);
        }
        if (!data || data.length === 0) break;

        for (const entry of data) {
            const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.id) {
                paths.push(fullPath);
            } else {
                // Dossier virtuel → descendre
                paths.push(...await listAllFiles(client, bucket, fullPath));
            }
        }

        if (data.length < LIST_PAGE_SIZE) break;
        offset += LIST_PAGE_SIZE;
    }
    return paths;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Méthode non autorisée' }, 405);
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Missing authorization header' }, 401);
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Verify the user's JWT
        const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) {
            return jsonResponse({ error: 'Invalid token' }, 401);
        }

        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        // Delete user's files from Storage BEFORE deleting the user: a failure
        // here must abort the whole operation, otherwise the media would be
        // orphaned forever in the public bucket (RGPD art. 17).
        const filePaths = await listAllFiles(adminClient, 'photos', user.id);
        for (let i = 0; i < filePaths.length; i += REMOVE_BATCH_SIZE) {
            const batch = filePaths.slice(i, i + REMOVE_BATCH_SIZE);
            const { error: removeError } = await adminClient.storage.from('photos').remove(batch);
            if (removeError) {
                return jsonResponse(
                    { error: `Suppression des fichiers impossible: ${removeError.message}. Réessayez.` },
                    500,
                );
            }
        }

        // Delete the user — CASCADE on FK will remove all observations
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
        if (deleteError) {
            return jsonResponse({ error: deleteError.message }, 500);
        }

        return jsonResponse({ success: true, removedFiles: filePaths.length }, 200);
    } catch (err) {
        return jsonResponse({ error: err instanceof Error ? err.message : 'Erreur interne' }, 500);
    }
});
