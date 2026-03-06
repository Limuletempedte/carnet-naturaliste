import { Observation } from '../types';

export type OfflineAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface OfflineQueueItem {
    id: string;
    action: OfflineAction;
    payload: Observation | { id: string };
    timestamp: number;
}

export const isTempId = (value: string): boolean => value.startsWith('temp-');

const getItemTargetId = (item: OfflineQueueItem): string => {
    if (item.action === 'DELETE') {
        return String((item.payload as { id: string }).id || '');
    }
    return String((item.payload as Observation).id || '');
};

const mergeObservation = (base: Observation, next: Observation): Observation => ({
    ...base,
    ...next,
    gps: {
        ...base.gps,
        ...next.gps
    }
});

export const reduceQueue = (queue: OfflineQueueItem[]): OfflineQueueItem[] => {
    const reduced = new Map<string, OfflineQueueItem>();

    for (const item of queue) {
        const key = getItemTargetId(item);
        if (!key) continue;

        const existing = reduced.get(key);
        if (!existing) {
            reduced.set(key, item);
            continue;
        }

        if (item.action === 'INSERT') {
            reduced.set(key, item);
            continue;
        }

        if (item.action === 'UPDATE') {
            if (existing.action === 'INSERT' || existing.action === 'UPDATE') {
                const mergedPayload = mergeObservation(existing.payload as Observation, item.payload as Observation);
                reduced.set(key, {
                    ...item,
                    action: existing.action,
                    payload: mergedPayload
                });
            } else {
                reduced.set(key, item);
            }
            continue;
        }

        if (item.action === 'DELETE') {
            if (existing.action === 'INSERT') {
                reduced.delete(key);
            } else {
                reduced.set(key, item);
            }
        }
    }

    return Array.from(reduced.values()).sort((a, b) => a.timestamp - b.timestamp);
};

export const mapQueueItemIds = (item: OfflineQueueItem, idMap: Map<string, string>): OfflineQueueItem => {
    if (item.action === 'DELETE') {
        const deletePayload = item.payload as { id: string };
        return {
            ...item,
            payload: {
                id: idMap.get(deletePayload.id) ?? deletePayload.id
            }
        };
    }

    const obsPayload = item.payload as Observation;
    return {
        ...item,
        payload: {
            ...obsPayload,
            id: idMap.get(obsPayload.id) ?? obsPayload.id
        }
    };
};
