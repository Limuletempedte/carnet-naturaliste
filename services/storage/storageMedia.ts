import { captureSessionContext, assertSessionContext, inSession, StaleSessionError, type SessionContext } from '../sessionScope';
import { supabase } from '../../supabaseClient';
import { generateUUID } from '../../utils/uuidUtils';
import { logger } from '../../utils/logger';
import { withTimeout } from './storageHelpers';

/**
 * Upload de médias (photo / son) vers Supabase Storage. Fonctions autonomes
 * (réseau uniquement), extraites de `storageService`. Aucune dépendance à
 * l'état mutable du module.
 */

const UPLOAD_TIMEOUT_MS = 30_000;

export const uploadPhoto = async (file: Blob, context: SessionContext = captureSessionContext()): Promise<string> => {
    assertSessionContext(context);
    if (!navigator.onLine) {
        throw new Error("Impossible d'envoyer une photo en mode hors-ligne. Veuillez réessayer une fois connecté.");
    }

    const { data: { user } } = await inSession(context, () => supabase.auth.getUser());
    if (!user) throw new Error('User not authenticated');
    if (user.id !== context.userId) throw new StaleSessionError();

    const fileName = `${user.id}/photos/${Date.now()}-${generateUUID()}.jpg`;
    const { error: uploadError } = await inSession(context, () => withTimeout(
        supabase.storage
            .from('photos')
            .upload(fileName, file, {
                contentType: 'image/jpeg',
                upsert: false
            }),
        UPLOAD_TIMEOUT_MS,
        'Upload photo'
    ));

    assertSessionContext(context);
    if (uploadError) {
        logger.error('Error uploading photo:', uploadError);
        throw new Error(uploadError.message);
    }

    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error('URL publique de la photo non disponible.');
    }

    return publicUrl;
};

const ALLOWED_AUDIO_TYPES = new Set([
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/x-m4a',
]);

export const uploadSound = async (file: Blob, context: SessionContext = captureSessionContext()): Promise<string> => {
    assertSessionContext(context);
    if (!navigator.onLine) {
        throw new Error("Impossible d'envoyer un son en mode hors-ligne. Veuillez réessayer une fois connecté.");
    }

    const { data: { user } } = await inSession(context, () => supabase.auth.getUser());
    if (!user) throw new Error('User not authenticated');
    if (user.id !== context.userId) throw new StaleSessionError();

    const contentType = file.type || 'audio/mpeg';
    if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
        throw new Error(`Type audio non autorisé (${contentType}). Formats acceptés : MP3, OGG, WAV, WebM, M4A.`);
    }
    const extension = contentType.split('/')[1]?.split(';')[0] || 'mp3';
    const fileName = `${user.id}/sounds/${Date.now()}-${generateUUID()}.${extension}`;

    const { error: uploadError } = await inSession(context, () => withTimeout(
        supabase.storage
            .from('photos')
            .upload(fileName, file, {
                contentType,
                upsert: false
            }),
        UPLOAD_TIMEOUT_MS,
        'Upload son'
    ));

    assertSessionContext(context);
    if (uploadError) {
        logger.error('Error uploading sound:', uploadError);
        throw new Error(uploadError.message);
    }

    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error('URL publique du son non disponible.');
    }

    return publicUrl;
};
