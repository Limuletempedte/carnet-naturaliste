import { useEffect, useRef } from 'react';
import { Observation } from '../types';
import {
    computeEarnedBadgeIds,
    detectNewlyEarnedBadges,
    isBadgesSeeded,
    markBadgesSeeded,
    setPreviouslyEarnedBadgeIds,
    getPreviouslyEarnedBadgeIds,
} from '../utils/badgeUtils';

type PushToast = (type: 'info' | 'success' | 'warning' | 'error', message: string, durationMs?: number) => string;

/**
 * VP-20 — Dispatch un toast célébratoire pour chaque badge nouvellement débloqué.
 *
 * Seed initial : au premier lancement après déploiement de la feature, on écrit
 * les IDs déjà gagnés dans localStorage SANS émettre de toast, pour éviter le spam
 * de badges historiques. Les sessions suivantes comparent proprement.
 */
export function useBadgeUnlockToasts(observations: Observation[], pushToast: PushToast): void {
    const prevSignatureRef = useRef<string | null>(null);

    useEffect(() => {
        const signature = `${observations.length}|${observations.map(o => o.id).slice(-5).join(',')}`;
        if (prevSignatureRef.current === signature) return;
        prevSignatureRef.current = signature;

        if (!isBadgesSeeded()) {
            const earned = computeEarnedBadgeIds(observations);
            setPreviouslyEarnedBadgeIds(earned);
            markBadgesSeeded();
            return;
        }

        const newly = detectNewlyEarnedBadges(observations);
        if (newly.length === 0) return;

        newly.forEach(badge => {
            pushToast(
                'success',
                `🏆 Badge débloqué : ${badge.name} — ${badge.description}`,
                6000,
            );
        });

        // Persister l'état courant (previous + nouveaux)
        const updated = new Set(getPreviouslyEarnedBadgeIds());
        newly.forEach(b => updated.add(b.id));
        setPreviouslyEarnedBadgeIds(updated);
    }, [observations, pushToast]);
}
