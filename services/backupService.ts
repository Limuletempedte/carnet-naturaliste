import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Observation } from '../types';
import { dateToIsoLocal } from '../utils/dateUtils';

export const createBackup = async (observations: Observation[]) => {
    const zip = new JSZip();

    // 1. Add Data as JSON
    zip.file("data.json", JSON.stringify(observations, null, 2));

    // 2. Add Data as CSV (properly escaped)
    const csvHeader = [
        "ID", "Nom de l'espèce", "Nom latin", "Groupe taxonomique", "Date", "Heure", "Nombre",
        "Lieu-dit", "Latitude", "Longitude", "Commune", "Département", "Pays", "Altitude",
        "Statut", "Code Atlas", "Protocole", "Sexe", "Age", "Condition d'observation", "Comportement", "Commentaire"
    ].join(",");

    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const csvRows = observations.map(obs => {
        return [
            esc(obs.id),
            esc(obs.speciesName),
            esc(obs.latinName),
            esc(obs.taxonomicGroup),
            esc(obs.date),
            esc(obs.time),
            esc(obs.count),
            esc(obs.location),
            esc(obs.gps.lat),
            esc(obs.gps.lon),
            esc(obs.municipality),
            esc(obs.department),
            esc(obs.country),
            esc(obs.altitude),
            esc(obs.status),
            esc(obs.atlasCode),
            esc(obs.protocol),
            esc(obs.sexe),
            esc(obs.age),
            esc(obs.observationCondition),
            esc(obs.comportement),
            esc(obs.comment)
        ].join(",");
    });

    zip.file("data.csv", [csvHeader, ...csvRows].join("\n"));

    // 3. Add Images (Best Effort)
    const imgFolder = zip.folder("images");
    let failedImageCount = 0;
    if (imgFolder) {
        const uniqueImages = new Set<string>();

        // Collect all unique image URLs
        observations.forEach(obs => {
            if (obs.photo) uniqueImages.add(obs.photo);
            if (obs.wikipediaImage) uniqueImages.add(obs.wikipediaImage);
        });

        const imagePromises = Array.from(uniqueImages).map(async (url) => {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const blob = await response.blob();
                    const filename = url.split('/').pop()?.split('?')[0] || `image-${Math.random().toString(36).substr(2, 9)}.jpg`;
                    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
                    imgFolder.file(safeFilename, blob);
                } else {
                    failedImageCount++;
                }
            } catch (e) {
                console.warn(`Failed to download image: ${url}`, e);
                failedImageCount++;
            }
        });

        await Promise.all(imagePromises);
    }

    // Add a note file if some images failed
    if (failedImageCount > 0) {
        zip.file("IMAGES_MANQUANTES.txt", `${failedImageCount} image(s) n'ont pas pu être téléchargées et sont absentes de cette sauvegarde.\nCela peut être dû à des restrictions CORS ou à des images supprimées.`);
    }

    // 4. Generate and Save Zip
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `carnet-naturaliste-backup-${dateToIsoLocal(new Date())}.zip`);
};
