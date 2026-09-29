import { beforeEach, describe, expect, it, vi } from 'vitest';
import { privateMediaPath } from '../services/mediaReference';
import { isPublicEncyclopediaImage } from '../utils/urlUtils';
import { setSessionIdentity, captureSessionContext } from '../services/sessionScope';
const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { storage: { from: () => ({ download }) } } }));
import { downloadPrivateMedia, acquirePrivateMedia } from '../services/privateMediaService';

const project = 'https://fixture.supabase.co';
const ref = `${project}/storage/v1/object/public/photos/A/photos/ancien.jpg`;
beforeEach(() => {
    localStorage.clear(); setSessionIdentity('A');
    vi.stubEnv('VITE_SUPABASE_URL', project);
    download.mockReset();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
    URL.revokeObjectURL = vi.fn();
});
describe('médias privés', () => {
    it('décode une photo hors ligne sans fetch interdit par la CSP', async () => {
        const network = vi.spyOn(globalThis, 'fetch');
        const blob = await downloadPrivateMedia('data:image/jpeg;base64,AQID');
        expect(blob.size).toBe(3);
        expect(blob.type).toBe('image/jpeg');
        expect(network).not.toHaveBeenCalled();
        network.mockRestore();
    });
    it('interprète une ancienne URL comme chemin du propriétaire', () => {
        expect(privateMediaPath(ref, 'A', project)).toBe('A/photos/ancien.jpg');
    });
    it('refuse origine, propriétaire et encodages ambigus', () => {
        for (const value of [ref.replace('fixture', 'autre'), ref.replace('/A/', '/B/'), ref + '?token=x', ref + '#x',
            ref.replace('ancien.jpg', '%2fsecret.jpg'), ref.replace('ancien.jpg', '%252fsecret.jpg'), ref.replace('https://', 'https://user:pass@')]) {
            expect(() => privateMediaPath(value, 'A', project)).toThrow();
        }
        expect(isPublicEncyclopediaImage(ref)).toBe(false);
        expect(isPublicEncyclopediaImage('https://upload.wikimedia.org/image.jpg')).toBe(true);
    });
    it('télécharge avec authentification SDK sans cache HTTP et publie un blob révocable', async () => {
        download.mockResolvedValue({ data: new Blob(['image'], { type: 'image/jpeg' }), error: null });
        const lease = await acquirePrivateMedia(ref);
        expect(download).toHaveBeenCalledWith('A/photos/ancien.jpg', {}, expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
        expect(lease.url.startsWith('blob:')).toBe(true);
        setSessionIdentity('B');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(lease.url);
    });
    it('ne télécharge pas une référence appartenant à B', async () => {
        await expect(downloadPrivateMedia(ref.replace('/A/', '/B/'))).rejects.toThrow();
        expect(download).not.toHaveBeenCalled();
    });
    it('rejette un téléchargement terminé après la déconnexion', async () => {
        let complete!: (value: unknown) => void;
        download.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const context = captureSessionContext();
        const promise = downloadPrivateMedia(ref, context);
        const rejected = expect(promise).rejects.toThrow(/compte actif/);
        await vi.waitFor(() => expect(download).toHaveBeenCalled());
        setSessionIdentity('B');
        complete({ data: new Blob(['image'], { type: 'image/jpeg' }), error: null });
        await rejected;
    });
});
