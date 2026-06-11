import { Observation } from '../types';
import { dateToIsoLocal } from '../utils/dateUtils';
import { escapeCsvCell } from '../utils/csvUtils';
import { isSensitiveSpecies } from '../utils/gpsPrivacy';
import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchUtils';
import { parseJsonImport } from './jsonImportValidation';
import type { ImportResult } from './excelImportService';
import { getEventLog } from '../utils/eventLog';

export interface BackupResult {
    fileName: string;
    totalObservations: number;
    downloadedImages: number;
    failedImages: number;
    downloadedSounds: number;
    failedSounds: number;
    inlineMediaCount: number;
    skippedImages?: boolean;
    skippedSounds?: boolean;
}

export interface BackupOptions {
    /** Inclure les images dans le ZIP. Défaut : true. */
    includeImages?: boolean;
    /** Inclure les sons dans le ZIP. Défaut : true. */
    includeSounds?: boolean;
}

const IMAGE_FETCH_TIMEOUT_MS = 15000;
const BACKUP_IMAGE_FETCH_CONCURRENCY = 4;
/** SR-04 : au-delà de cette taille estimée, on signale l'utilisateur. */
export const BACKUP_WARN_SIZE_BYTES = 300 * 1024 * 1024; // 300 MB

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

/**
 * SR-02 : décode une data: URL en { buffer, extension }.
 * Retourne null si la chaîne n'est pas une data: URL valide.
 */
const decodeDataUrl = (dataUrl: string): { buffer: ArrayBuffer; extension: string } | null => {
    const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
    if (!match) return null;
    const [, mime, isBase64, payload] = match;
    try {
        let bytes: Uint8Array;
        if (isBase64) {
            const binary = atob(payload);
            bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        } else {
            bytes = new TextEncoder().encode(decodeURIComponent(payload));
        }
        const extension = (() => {
            const subtype = (mime.split('/')[1] || '').toLowerCase();
            if (!subtype) return 'bin';
            if (subtype === 'jpeg') return 'jpg';
            if (subtype === 'svg+xml') return 'svg';
            if (subtype.includes('mpeg')) return 'mp3';
            if (subtype === 'wav' || subtype === 'x-wav') return 'wav';
            if (subtype === 'ogg' || subtype === 'webm') return subtype;
            return subtype.replace(/[^a-z0-9]/g, '') || 'bin';
        })();
        return { buffer: bytes.buffer as ArrayBuffer, extension };
    } catch {
        return null;
    }
};

const classifyMediaUrl = (url: string): 'data' | 'http' | 'blob' | 'other' => {
    if (url.startsWith('data:')) return 'data';
    if (url.startsWith('blob:')) return 'blob';
    if (url.startsWith('http://') || url.startsWith('https://')) return 'http';
    return 'other';
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

/**
 * SR-04 : estime la taille du backup avant génération.
 * Sert à prévenir l'utilisateur (toast) sans bloquer.
 * Heuristique : ~2 Ko par observation + 500 Ko par image distante (moyenne photo web),
 * + taille réelle pour les data: URLs (base64).
 */
export const estimateBackupSize = (observations: Observation[]): number => {
    const JSON_BYTES_PER_OBS = 2 * 1024;
    const AVG_REMOTE_MEDIA_BYTES = 500 * 1024;
    let size = observations.length * JSON_BYTES_PER_OBS;
    const seen = new Set<string>();
    for (const obs of observations) {
        for (const url of [obs.photo, obs.sound, obs.wikipediaImage]) {
            if (!url || seen.has(url)) continue;
            seen.add(url);
            if (url.startsWith('data:')) {
                // base64 : ~3/4 de la chaîne
                const commaIdx = url.indexOf(',');
                const b64Length = commaIdx >= 0 ? url.length - commaIdx - 1 : url.length;
                size += Math.floor(b64Length * 0.75);
            } else if (url.startsWith('blob:')) {
                // Ignoré — non sérialisable.
            } else {
                size += AVG_REMOTE_MEDIA_BYTES;
            }
        }
    }
    return size;
};

export const createBackup = async (
    observations: Observation[],
    options: BackupOptions = {}
): Promise<BackupResult> => {
    const { includeImages = true, includeSounds = true } = options;
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    // Audit v2 (H2/RGPD-03) : la sauvegarde est FIDÈLE — coordonnées exactes.
    // data.json est la source de restauration : l'obfuscation VP-11 (~11 km) y
    // détruirait définitivement la précision des espèces sensibles au moment de
    // la restauration en mode merge. C'est aussi l'export de portabilité du
    // titulaire (art. 20 RGPD), qui doit restituer SES données exactes.
    // L'obfuscation reste appliquée aux exports DESTINÉS AU PARTAGE
    // (Excel/PDF/GeoJSON/Darwin Core) dans observationExportService.

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

    // 2b. Add GPS notice for sensitive species
    const hasSensitive = observations.some(obs => isSensitiveSpecies(obs.status));
    if (hasSensitive) {
        zip.file("NOTICE_GPS.txt",
            "Cette sauvegarde est FIDELE : elle contient les coordonnees GPS\n" +
            "EXACTES de toutes vos observations, y compris les especes menacees\n" +
            "(VU, EN, CR, EW), afin de permettre une restauration sans perte.\n\n" +
            "Ne la partagez pas publiquement : la divulgation des localisations\n" +
            "precises d'especes protegees expose au braconnage et au pillage\n" +
            "(Code de l'environnement L411-1). Pour partager vos donnees, utilisez\n" +
            "les exports Excel / PDF / GeoJSON / Darwin Core, dont les coordonnees\n" +
            "des especes sensibles sont automatiquement arrondies (~11 km).\n"
        );
    }

    // 2c. Add attributions for third-party data sources (VP-18)
    zip.file("ATTRIBUTIONS.txt",
        "== Sources de donnees tierces ==\n\n" +
        "- iNaturalist (https://www.inaturalist.org)\n" +
        "  Suggestions taxonomiques et images d'especes.\n" +
        "  Licence : CC BY-NC 4.0 (photos communautaires).\n\n" +
        "- GBIF (https://www.gbif.org)\n" +
        "  Donnees de biodiversite pour la validation taxonomique.\n" +
        "  Licence : CC BY 4.0 / CC0.\n\n" +
        "- OpenStreetMap / Nominatim (https://nominatim.openstreetmap.org)\n" +
        "  Geocodage inverse pour les noms de communes.\n" +
        "  Licence : ODbL (Open Database License).\n\n" +
        "- Open-Meteo (https://open-meteo.com)\n" +
        "  Donnees meteorologiques.\n" +
        "  Licence : CC BY 4.0.\n"
    );

    // 3. Add media (SR-02 + SR-03 + SR-04)
    //    - data:*     → embed inline (aucun fetch réseau)
    //    - http(s):*  → fetch best-effort
    //    - blob:*     → non sérialisable, listé dans MEDIAS_MANQUANTS.txt
    const imgFolder = includeImages ? zip.folder("images") : null;
    const soundFolder = includeSounds ? zip.folder("sounds") : null;
    let failedImageCount = 0;
    let downloadedImageCount = 0;
    let failedSoundCount = 0;
    let downloadedSoundCount = 0;
    let inlineMediaCount = 0;
    const failedImageUrls: string[] = [];
    const failedSoundUrls: string[] = [];
    const blobOnlyAssets: string[] = [];
    const usedImageFileNames = new Set<string>();
    const usedSoundFileNames = new Set<string>();

    type MediaTask = { url: string; kind: 'image' | 'sound' };

    // Collect unique media tasks (de-duped per kind to avoid collisions on same url used twice)
    const seenImage = new Set<string>();
    const seenSound = new Set<string>();
    const mediaTasks: MediaTask[] = [];
    observations.forEach(obs => {
        if (includeImages) {
            if (obs.photo && !seenImage.has(obs.photo)) { seenImage.add(obs.photo); mediaTasks.push({ url: obs.photo, kind: 'image' }); }
            if (obs.wikipediaImage && !seenImage.has(obs.wikipediaImage)) { seenImage.add(obs.wikipediaImage); mediaTasks.push({ url: obs.wikipediaImage, kind: 'image' }); }
        }
        if (includeSounds) {
            if (obs.sound && !seenSound.has(obs.sound)) { seenSound.add(obs.sound); mediaTasks.push({ url: obs.sound, kind: 'sound' }); }
        }
    });

    // JSZip#folder(name) returns JSZip | null when called with a string.
    type ZipFolder = typeof zip | null;
    const handleSuccess = (kind: 'image' | 'sound', folder: ZipFolder, name: string, buffer: ArrayBuffer, fromInline: boolean) => {
        if (!folder) return;
        const used = kind === 'image' ? usedImageFileNames : usedSoundFileNames;
        const unique = ensureUniqueFileName(name, used);
        folder.file(unique, buffer, { binary: true });
        if (fromInline) inlineMediaCount += 1;
        if (kind === 'image') downloadedImageCount += 1; else downloadedSoundCount += 1;
    };
    const handleFailure = (kind: 'image' | 'sound', url: string) => {
        if (kind === 'image') { failedImageCount += 1; failedImageUrls.push(url); }
        else { failedSoundCount += 1; failedSoundUrls.push(url); }
    };

    const tasks = mediaTasks.map((media, index) => async () => {
        const { url, kind } = media;
        const targetFolder = kind === 'image' ? imgFolder : soundFolder;
        if (!targetFolder) return;
        const classified = classifyMediaUrl(url);
        if (classified === 'data') {
            const decoded = decodeDataUrl(url);
            if (!decoded) {
                handleFailure(kind, url);
                return;
            }
            const baseName = kind === 'image'
                ? `inline_image_${index + 1}.${decoded.extension}`
                : `inline_sound_${index + 1}.${decoded.extension}`;
            handleSuccess(kind, targetFolder, baseName, decoded.buffer, true);
            return;
        }
        if (classified === 'blob') {
            blobOnlyAssets.push(url);
            handleFailure(kind, url);
            return;
        }
        if (classified === 'other') {
            handleFailure(kind, url);
            return;
        }
        // http(s)
        try {
            const response = await fetchWithTimeout(url, IMAGE_FETCH_TIMEOUT_MS);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                if (buffer.byteLength === 0) {
                    handleFailure(kind, url);
                    return;
                }
                const baseName = deriveImageBaseName(url, index);
                handleSuccess(kind, targetFolder, baseName, buffer, false);
            } else {
                handleFailure(kind, url);
            }
        } catch (e) {
            logger.warn(`Failed to download ${kind}: ${url}`, e);
            handleFailure(kind, url);
        }
    });

    await runWithConcurrency(tasks, BACKUP_IMAGE_FETCH_CONCURRENCY);

    // Add a combined note file if some media failed or are blob:-only (SR-02, SR-03)
    const totalFailed = failedImageCount + failedSoundCount;
    if (totalFailed > 0) {
        const lines: string[] = [
            `${totalFailed} média(s) n'ont pas pu être inclus dans cette sauvegarde.`,
            '',
        ];
        if (failedImageCount > 0) {
            lines.push(`Images manquantes (${failedImageCount}) — CORS, supprimées, hors-ligne ou blob: non sérialisable :`);
            lines.push(...failedImageUrls.map((url, i) => `  ${i + 1}. ${url}`));
            lines.push('');
        }
        if (failedSoundCount > 0) {
            lines.push(`Sons manquants (${failedSoundCount}) — CORS, supprimés, hors-ligne ou blob: non sérialisable :`);
            lines.push(...failedSoundUrls.map((url, i) => `  ${i + 1}. ${url}`));
            lines.push('');
        }
        if (blobOnlyAssets.length > 0) {
            lines.push('Note : certaines URLs en blob: ne peuvent pas être sauvegardées (référence');
            lines.push('mémoire éphémère). Uploadez-les ou convertissez-les d\'abord en data: URL.');
        }
        zip.file('MEDIAS_MANQUANTS.txt', lines.join('\n'));
    }

    // SR-16b : inclure le journal d'évènements pour faciliter le debug post-mortem
    try {
        zip.file('event_log.json', JSON.stringify(getEventLog(), null, 2));
    } catch {
        // best effort — ne jamais bloquer la sauvegarde pour un journal indisponible
    }

    const backupDate = dateToIsoLocal(new Date());
    const fileName = `carnet-naturaliste-backup-${backupDate}.zip`;
    zip.file(
        'backup_manifest.json',
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                observations: observations.length,
                includeImages,
                includeSounds,
                downloadedImages: downloadedImageCount,
                failedImages: failedImageCount,
                failedImageUrls,
                downloadedSounds: downloadedSoundCount,
                failedSounds: failedSoundCount,
                failedSoundUrls,
                inlineMediaCount,
                blobOnlyAssets,
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
    const { saveAs } = await import('file-saver');
    saveAs(content, fileName);

    return {
        fileName,
        totalObservations: observations.length,
        downloadedImages: downloadedImageCount,
        failedImages: failedImageCount,
        downloadedSounds: downloadedSoundCount,
        failedSounds: failedSoundCount,
        inlineMediaCount,
        skippedImages: !includeImages,
        skippedSounds: !includeSounds,
    };
};

/** SR-01 : taille maximale d'un backup ZIP acceptée pour restauration. */
export const BACKUP_RESTORE_MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
});

const mediaFilenameCandidates = (url: string | undefined): string[] => {
    if (!url) return [];
    if (url.startsWith('data:') || url.startsWith('blob:')) return [];
    try {
        const parsed = new URL(url);
        const raw = parsed.pathname.split('/').pop() || '';
        const cleaned = sanitizeFileName(raw.split('?')[0]);
        return cleaned ? [cleaned] : [];
    } catch {
        // Relative or non-URL — try last segment
        const raw = url.split('/').pop() || '';
        const cleaned = sanitizeFileName(raw.split('?')[0]);
        return cleaned ? [cleaned] : [];
    }
};

/**
 * SR-01 : relit un backup ZIP créé par `createBackup` et prépare un `ImportResult`
 * consommable par le flux d'import existant (ImportPreviewDialog + buildImportPersistencePlan).
 *
 * Les fichiers `images/*` et `sounds/*` référencés par les observations sont
 * convertis en `data:` URL : la queue offline (INSERT/UPDATE) ré-uploadera
 * automatiquement les médias vers Supabase Storage à la prochaine sync (voir SI-16).
 */
export const readBackupZip = async (file: File): Promise<ImportResult> => {
    if (file.size > BACKUP_RESTORE_MAX_SIZE_BYTES) {
        const mb = Math.round(file.size / (1024 * 1024));
        throw new Error(`Archive trop volumineuse (${mb} Mo). Limite : ${Math.round(BACKUP_RESTORE_MAX_SIZE_BYTES / (1024 * 1024))} Mo.`);
    }

    const { default: JSZip } = await import('jszip');
    let zip: import('jszip');
    try {
        zip = await JSZip.loadAsync(file);
    } catch (err) {
        logger.error('[backupService] ZIP illisible:', err);
        throw new Error('Archive ZIP invalide ou corrompue.');
    }

    const dataEntry = zip.file('data.json');
    if (!dataEntry) {
        throw new Error('Archive ZIP invalide : data.json manquant.');
    }
    const jsonText = await dataEntry.async('string');
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch (err) {
        logger.error('[backupService] data.json corrompu:', err);
        throw new Error('Archive ZIP : data.json corrompu.');
    }

    // Pré-charger un index des médias pour résolution par nom de fichier
    const imageFiles = new Map<string, import('jszip').JSZipObject>();
    const soundFiles = new Map<string, import('jszip').JSZipObject>();
    zip.forEach((path, entry) => {
        if (entry.dir) return;
        if (path.startsWith('images/')) imageFiles.set(path.slice('images/'.length), entry);
        else if (path.startsWith('sounds/')) soundFiles.set(path.slice('sounds/'.length), entry);
    });

    // Validation des observations via le parseur JSON existant
    const importResult = parseJsonImport(parsed);

    // Le validateur JSON (`asOptionalUrl`) ne conserve que http(s) — les data: URLs
    // légitimes d'un backup sont donc réintroduites ici par correspondance d'ID.
    const rawById = new Map<string, Record<string, unknown>>();
    if (Array.isArray(parsed)) {
        for (const row of parsed) {
            if (row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string') {
                rawById.set((row as { id: string }).id, row as Record<string, unknown>);
            }
        }
    }
    const isAllowedDataUrl = (value: unknown, mimePrefix: 'image/' | 'audio/'): value is string => {
        if (typeof value !== 'string') return false;
        return value.startsWith(`data:${mimePrefix}`);
    };
    for (const obs of importResult.observations) {
        const raw = rawById.get(obs.id);
        if (!raw) continue;
        if (!obs.photo && isAllowedDataUrl(raw.photo, 'image/')) obs.photo = raw.photo;
        if (!obs.wikipediaImage && isAllowedDataUrl(raw.wikipediaImage, 'image/')) obs.wikipediaImage = raw.wikipediaImage;
        if (!obs.sound && isAllowedDataUrl(raw.sound, 'audio/')) obs.sound = raw.sound;
    }

    // Résolution des médias : URL → data: URL si un fichier local correspond
    const resolveMedia = async (
        url: string | undefined,
        index: Map<string, import('jszip').JSZipObject>,
    ): Promise<string | undefined> => {
        if (!url) return url;
        if (url.startsWith('data:')) return url; // déjà inline
        const candidates = mediaFilenameCandidates(url);
        for (const name of candidates) {
            const entry = index.get(name);
            if (entry) {
                try {
                    const blob = await entry.async('blob');
                    return await blobToDataUrl(blob);
                } catch (err) {
                    logger.warn(`[backupService] Impossible de lire ${name} depuis le ZIP:`, err);
                }
            }
        }
        return url; // fallback : conserver l'URL d'origine
    };

    for (const obs of importResult.observations) {
        obs.photo = await resolveMedia(obs.photo, imageFiles);
        obs.wikipediaImage = await resolveMedia(obs.wikipediaImage, imageFiles);
        obs.sound = await resolveMedia(obs.sound, soundFiles);
    }

    return importResult;
};
