// Bouton « Réessayer » de la page hors-ligne (offline.html).
// Fichier séparé : la CSP de production (script-src 'self', sans 'unsafe-inline')
// bloque les gestionnaires onclick écrits directement dans le HTML.
var retryButton = document.getElementById('retry-button');
if (retryButton) {
    retryButton.addEventListener('click', function () {
        location.reload();
    });
}
