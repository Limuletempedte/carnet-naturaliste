/** Une version périmée ne doit jamais écraser silencieusement une autre saisie. */
export class ObservationConflictError extends Error {
    constructor() {
        super('Cette observation a été modifiée ailleurs ou supprimée. Votre saisie est conservée. Copiez vos changements puis rechargez les données avant de réessayer.');
        this.name = 'ObservationConflictError';
    }
}
