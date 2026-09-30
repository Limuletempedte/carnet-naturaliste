/** Une URL historique est un identifiant, jamais une autorisation de téléchargement. */
export const privateMediaPath = (reference: string, userId: string, projectUrl = import.meta.env.VITE_SUPABASE_URL): string => {
    if (!projectUrl || !userId) throw new Error('Média privé indisponible.');
    const url = new URL(reference);
    const project = new URL(projectUrl);
    const prefix = '/storage/v1/object/public/photos/';
    if (url.origin !== project.origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(prefix)) {
        throw new Error('Référence de média privé invalide.');
    }
    const encoded = url.pathname.slice(prefix.length);
    const parts = encoded.split('/').map(segment => decodeURIComponent(segment));
    if (parts.length < 3 || parts[0] !== userId || !['photos', 'sounds'].includes(parts[1])
        || parts.some(part => !part || part === '.' || part === '..' || /[\\/%\u0000-\u001f]/.test(part))) {
        throw new Error('Accès au média refusé.');
    }
    return parts.join('/');
};
