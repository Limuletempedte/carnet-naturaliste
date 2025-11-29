import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Observation } from '../types';

export const createBackup = async (observations: Observation[]) => {
    const zip = new JSZip();

    // 1. Add Data as JSON
    zip.file("data.json", JSON.stringify(observations, null, 2));

    // 2. Add Data as CSV
    const csvHeader = [
        "ID", "Nom de l'espèce", "Nom latin", "Groupe taxonomique", "Date", "Heure", "Nombre",
        "Lieu-dit", "Latitude", "Longitude", "Commune", "Département", "Pays", "Altitude",
        "Statut", "Code Atlas", "Protocole", "Sexe", "Age", "Condition", "Comportement", "Commentaire"
    ].join(",");

    const csvRows = observations.map(obs => {
        return [
            obs.id,
            `"${obs.speciesName}"`,
            `"${obs.latinName || ''}"`,
            obs.taxonomicGroup,
            obs.date,
            obs.time,
            obs.count,
            `"${obs.location || ''}"`,
            obs.gps.lat,
            obs.gps.lon,
            `"${obs.municipality || ''}"`,
            `"${obs.department || ''}"`,
            `"${obs.country || ''}"`,
            obs.altitude,
            obs.status,
            `"${obs.atlasCode || ''}"`,
            obs.protocol,
            obs.sexe,
            obs.age,
            `"${obs.observationCondition || ''}"`,
            `"${obs.comportement || ''}"`,
            `"${obs.comment || ''}"`
        ].join(",");
    });

    zip.file("data.csv", [csvHeader, ...csvRows].join("\n"));

    // 3. Add Images (Best Effort)
    const imgFolder = zip.folder("images");
    if (imgFolder) {
        const uniqueImages = new Set<string>();

        // Collect all unique image URLs
        observations.forEach(obs => {
            if (obs.photo) uniqueImages.add(obs.photo);
            if (obs.wikipediaImage) uniqueImages.add(obs.wikipediaImage);
        });

        const imagePromises = Array.from(uniqueImages).map(async (url) => {
            try {
                // Skip data URLs if they are too large or handle them differently? 
                // For now, we assume they are external URLs or small data URLs.
                // Note: Fetching external URLs (like Wikipedia) might fail due to CORS.
                // We attempt to fetch them.
                const response = await fetch(url);
                if (response.ok) {
                    const blob = await response.blob();
                    // Create a filename from the URL or a hash
                    const filename = url.split('/').pop()?.split('?')[0] || `image-${Math.random().toString(36).substr(2, 9)}.jpg`;
                    // Clean filename
                    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
                    imgFolder.file(safeFilename, blob);
                }
            } catch (e) {
                console.warn(`Failed to download image: ${url}`, e);
            }
        });

        await Promise.all(imagePromises);
    }

    // 4. Generate and Save Zip
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `carnet-naturaliste-backup-${new Date().toISOString().split('T')[0]}.zip`);
};
