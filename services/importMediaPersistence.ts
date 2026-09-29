import type { Observation } from '../types';
import { downloadPrivateMedia } from './privateMediaService';
import { savePendingMedia } from './pendingMediaStore';
import { uploadPhoto, uploadSound } from './storage/storageMedia';
import { assertSessionContext, type SessionContext } from './sessionScope';

/** Finalisation à confirmation : aucun blob: éphémère n'est écrit dans la base ou la file. */
export async function persistImportMedia(observation: Observation, context: SessionContext): Promise<Observation> {
    const next = { ...observation };
    for (const field of ['photo', 'sound'] as const) {
        const reference = next[field];
        if (!reference || (!reference.startsWith('blob:') && !reference.startsWith('data:'))) continue;
        const blob = await downloadPrivateMedia(reference, context);
        assertSessionContext(context);
        next[field] = navigator.onLine
            ? await (field === 'photo' ? uploadPhoto(blob, context) : uploadSound(blob, context))
            : await savePendingMedia(blob, context);
    }
    assertSessionContext(context);
    return next;
}
