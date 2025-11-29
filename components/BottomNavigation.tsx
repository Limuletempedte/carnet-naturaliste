import React from 'react';
import { View } from '../types';

interface BottomNavigationProps {
    currentView: View;
    onViewChange: (view: View) => void;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({ currentView, onViewChange }) => {
    const tabs = [
        { id: View.LIST, label: 'Liste', icon: '📝' },
        { id: View.MAP, label: 'Carte', icon: '🗺️' },
        { id: View.STATS, label: 'Stats', icon: '📊' },
        { id: View.CALENDAR, label: 'Calendrier', icon: '📅' },
        { id: View.GALLERY, label: 'Galerie', icon: '🖼️' }
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-xl border-t border-gray-200 dark:border-white/10 pb-safe pt-2 px-4 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            <div className="flex justify-around items-center">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onViewChange(tab.id)}
                        className={`flex flex-col items-center p-2 transition-all duration-300 ${currentView === tab.id
                                ? 'text-nature-green transform scale-110'
                                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                    >
                        <span className="text-xl mb-1">{tab.icon}</span>
                        <span className="text-[10px] font-medium uppercase tracking-wide">{tab.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default BottomNavigation;
