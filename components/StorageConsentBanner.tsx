import React, { useState, useEffect } from 'react';

const CONSENT_KEY = 'storage_consent_accepted';

const StorageConsentBanner: React.FC = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!localStorage.getItem(CONSENT_KEY)) {
            setVisible(true);
        }
    }, []);

    if (!visible) return null;

    const accept = () => {
        localStorage.setItem(CONSENT_KEY, '1');
        setVisible(false);
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[60] bg-white/95 dark:bg-nature-dark-surface/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 shadow-lg px-4 py-3 sm:px-6 sm:py-4">
            <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                    Cette application utilise le stockage local de votre navigateur (localStorage) pour conserver vos observations hors-ligne et vos préférences.
                    Aucun cookie tiers n'est déposé.
                </p>
                <button
                    onClick={accept}
                    className="shrink-0 px-5 py-2 rounded-lg bg-nature-green hover:bg-nature-dark text-white text-sm font-semibold shadow-sm transition-all"
                >
                    Compris
                </button>
            </div>
        </div>
    );
};

export default StorageConsentBanner;
