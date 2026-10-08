import { describe, expect, it } from 'vitest';
import { ObservationConflictError } from '../services/observationConflict';
import { mapUserFacingError } from '../utils/userFacingError';

describe('mapUserFacingError', () => {
    it('traduit les erreurs réseau', () => {
        expect(mapUserFacingError(new Error('Failed to fetch'))).toContain('Connexion au serveur impossible');
        expect(mapUserFacingError(new TypeError('NetworkError when attempting to fetch resource'))).toContain('Connexion au serveur impossible');
    });

    it('traduit les sessions expirées et timeouts', () => {
        expect(mapUserFacingError(new Error('JWT expired'))).toContain('session a expiré');
        expect(mapUserFacingError(new Error('Request timed out'))).toContain('trop de temps');
    });

    it('renvoie un message générique pour une erreur inconnue plutôt que le message brut', () => {
        expect(mapUserFacingError(new Error('PGRST301 something internal'))).toBe('Une erreur est survenue. Veuillez réessayer.');
    });

    it('gère les valeurs vides et non-Error', () => {
        expect(mapUserFacingError(null)).toBe('Une erreur inconnue est survenue.');
        expect(mapUserFacingError('')).toBe('Une erreur inconnue est survenue.');
    });
});


it('explique le conflit et la conservation de la saisie', () => {
    expect(mapUserFacingError(new ObservationConflictError())).toContain('Votre saisie est conservée');
});
