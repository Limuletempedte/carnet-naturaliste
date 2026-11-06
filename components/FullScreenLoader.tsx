import React from 'react';

interface FullScreenLoaderProps {
    label: string;
}

// EE-4 : écran de chargement plein écran avec le logo qui « respire »
// (remplace les textes bruts « Chargement... » au démarrage).
const FullScreenLoader: React.FC<FullScreenLoaderProps> = ({ label }) => (
    <div
        role="status"
        className="flex flex-col items-center justify-center h-screen gap-4 bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface"
    >
        <img src="/logo.svg" alt="" aria-hidden="true" className="w-20 h-20 rounded-[26%] shadow-ios animate-logoBreath" />
        <p className="text-gray-500 dark:text-gray-400">{label}</p>
    </div>
);

export default FullScreenLoader;
