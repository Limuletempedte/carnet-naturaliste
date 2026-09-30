import { useEffect, useState } from 'react';
import { acquirePrivateMedia } from '../services/privateMediaService';
import { captureSessionContext } from '../services/sessionScope';

/** Ne publie jamais la référence distante dans le DOM, même pendant le chargement. */
export const usePrivateMedia = (reference?: string): string | undefined => {
    const [resolved, setResolved] = useState<{ reference: string; url: string }>();
    useEffect(() => {
        if (!reference) return;
        let active = true;
        let release: (() => void) | undefined;
        try {
            const context = captureSessionContext();
            void acquirePrivateMedia(reference, context).then(lease => {
                if (!active) { lease.release(); return; }
                release = lease.release;
                setResolved({ reference, url: lease.url });
            }).catch(() => { if (active) setResolved(undefined); });
        } catch { /* aucune session */ }
        return () => { active = false; release?.(); };
    }, [reference]);
    return resolved?.reference === reference ? resolved?.url : undefined;
};
