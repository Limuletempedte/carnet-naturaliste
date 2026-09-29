// Migration du cache public historique. Les médias privés sont gérés par compte en IndexedDB.
self.addEventListener('activate', event => {
    event.waitUntil(caches.delete('supabase-storage-cache'));
});
