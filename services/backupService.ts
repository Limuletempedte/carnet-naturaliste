import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Observation } from '../types';
import { dateToIsoLocal } from '../utils/dateUtils';
import { escapeCsvCell } from '../utils/csvUtils';

export interface BackupResult {
    fileName: string;
    totalObservations: number;
    downloadedImages: number;
    failedImages: number;
}

const IMAGE_FETCH_TIMEOUT_MS = 15000;
const BACKUP_IMAGE_FETCH_CONCURRENCY = 4;

const sanitizeFileName = (value: string): string => {
    const normalized = value.replace(/[^a-zA-Z0-9._-]/g, '_');
    const compacted = normalized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return compacted || 'image';
};

const deriveImageBaseName = (url: string, fallbackIndex: number): string => {
    try {
        const parsed = new URL(url);
        const raw = parsed.pathname.split('/').pop() || '';
        const cleaned = sanitizeFileName(raw.split('?')[0]);
        return cleaned || `image_${fallbackIndex + 1}`;
    } catch {
        if (url.startsWith('data:')) return `inline_image_${fallbackIndex + 1}`;
        return `image_${fallbackIndex + 1}`;
    }
};

const ensureUniqueFileName = (name: string, used: Set<string>): string => {
    if (!used.has(name)) {
        used.add(name);
        return name;
    }

    const lastDotIndex = name.lastIndexOf('.');
    const base = lastDotIndex > 0 ? name.slice(0, lastDotIndex) : name;
    const extension = lastDotIndex > 0 ? name.slice(lastDotIndex) : '';

    let suffix = 2;
    while (used.has(`${base}_${suffix}${extension}`)) {
        suffix += 1;
    }

    const unique = `${base}_${suffix}${extension}`;
    used.add(unique);
    return unique;
};

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
};

const runWithConcurrency = async (tasks: Array<() => Promise<void>>, concurrency: number): Promise<void> => {
    const safeConcurrency = Math.max(1, concurrency);
    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < tasks.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            await tasks[currentIndex]();
        }
    };

    await Promise.all(Array.from({ length: Math.min(safeConcurrency, tasks.length) }, () => worker()));
};

export const createBackup = async (observations: Observation[]): Promise<BackupResult> => {
    const zip = new JSZip();

    // 1. Add Data as JSON
    zip.file("data.json", JSON.stringify(observations, null, 2));

    // 2. Add Data as CSV (properly escaped)
    const csvHeader = [
        "ID", "Nom de l'espèce", "Nom latin", "Groupe taxonomique", "Date", "Heure", "Nombre", "Mâles", "Femelles", "Non identifiés",
        "Lieu-dit", "Latitude", "Longitude", "Commune", "Département", "Pays", "Altitude",
        "Statut", "Code Atlas", "Protocole", "Sexe", "Age", "Condition d'observation", "Comportement", "Conditions météo", "Commentaire"
    ].join(",");

    const csvRows = observations.map(obs => {
        return [
            escapeCsvCell(obs.id),
            escapeCsvCell(obs.speciesName),
            escapeCsvCell(obs.latinName),
            escapeCsvCell(obs.taxonomicGroup),
            escapeCsvCell(obs.date),
            escapeCsvCell(obs.time),
            escapeCsvCell(obs.count),
            escapeCsvCell(obs.maleCount),
            escapeCsvCell(obs.femaleCount),
            escapeCsvCell(obs.unidentifiedCount),
            escapeCsvCell(obs.location),
            escapeCsvCell(obs.gps.lat),
            escapeCsvCell(obs.gps.lon),
            escapeCsvCell(obs.municipality),
            escapeCsvCell(obs.department),
            escapeCsvCell(obs.country),
            escapeCsvCell(obs.altitude),
            escapeCsvCell(obs.status),
            escapeCsvCell(obs.atlasCode),
            escapeCsvCell(obs.protocol),
            escapeCsvCell(obs.sexe),
            escapeCsvCell(obs.age),
            escapeCsvCell(obs.observationCondition),
            escapeCsvCell(obs.comportement),
            escapeCsvCell(obs.weather),
            escapeCsvCell(obs.comment)
        ].join(",");
    });

    zip.file("data.csv", [csvHeader, ...csvRows].join("\n"));

    // 3. Add Images (Best Effort)
    const imgFolder = zip.folder("images");
    let failedImageCount = 0;
    let downloadedImageCount = 0;
    const failedImageUrls: string[] = [];
    if (imgFolder) {
        const uniqueImages = new Set<string>();
        const usedFileNames = new Set<string>();

        // Collect all unique image URLs
        observations.forEach(obs => {
            if (obs.photo) uniqueImages.add(obs.photo);
            if (obs.wikipediaImage) uniqueImages.add(obs.wikipediaImage);
        });

        const imageTasks = Array.from(uniqueImages).map((url, index) => async () => {
            try {
                const response = await fetchWithTimeout(url, IMAGE_FETCH_TIMEOUT_MS);
                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    if (buffer.byteLength === 0) {
                        failedImageCount++;
                        failedImageUrls.push(url);
                        return;
                    }
                    const filename = ensureUniqueFileName(deriveImageBaseName(url, index), usedFileNames);
                    imgFolder.file(filename, buffer, { binary: true });
                    downloadedImageCount++;
                } else {
                    failedImageCount++;
                    failedImageUrls.push(url);
                }
            } catch (e) {
                console.warn(`Failed to download image: ${url}`, e);
                failedImageCount++;
                failedImageUrls.push(url);
            }
        });

        await runWithConcurrency(imageTasks, BACKUP_IMAGE_FETCH_CONCURRENCY);
    }

    // Add a note file if some images failed
    if (failedImageCount > 0) {
        zip.file("IMAGES_MANQUANTES.txt", `${failedImageCount} image(s) n'ont pas pu être téléchargées et sont absentes de cette sauvegarde.\nCela peut être dû à des restrictions CORS ou à des images supprimées.`);
    }

    const backupDate = dateToIsoLocal(new Date());
    const fileName = `carnet-naturaliste-backup-${backupDate}.zip`;
    zip.file(
        'backup_manifest.json',
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                observations: observations.length,
                downloadedImages: downloadedImageCount,
                failedImages: failedImageCount,
                failedImageUrls
            },
            null,
            2
        )
    );

    // 4. Generate and Save Zip
    const content = await zip.generateAsync({
        type: "blob",
        mimeType: "application/zip",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
    });
    if (content.size <= 0) {
        throw new Error('Archive ZIP vide générée.');
    }
    saveAs(content, fileName);

    return {
        fileName,
        totalObservations: observations.length,
        downloadedImages: downloadedImageCount,
        failedImages: failedImageCount
    };
};
