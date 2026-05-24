import React from 'react';

/** Section de formulaire (titre + grille responsive de champs). */
const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white/80 dark:bg-nature-dark-surface/80 p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-serif font-bold text-nature-dark dark:text-white mb-4 border-b-2 border-nature-green/30 pb-2">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {children}
        </div>
    </div>
);

export default FormSection;
