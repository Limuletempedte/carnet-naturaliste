import React, { useId, useState, useRef, useEffect } from 'react';

interface FieldTooltipProps {
    text: string;
}

/**
 * Petite bulle d'aide accessible : hover, focus, et tap (mobile).
 * Affiche le texte d'aide en popover, avec un lien aria-describedby pour les lecteurs d'écran.
 */
const FieldTooltip: React.FC<FieldTooltipProps> = ({ text }) => {
    const id = useId();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <span ref={containerRef} className="relative inline-block ml-1 align-middle">
            <button
                type="button"
                aria-describedby={open ? id : undefined}
                aria-expanded={open}
                aria-label="Aide sur ce champ"
                onClick={() => setOpen(v => !v)}
                onBlur={() => setOpen(false)}
                className="w-4 h-4 inline-flex items-center justify-center rounded-full bg-gray-300 dark:bg-white/20 text-gray-700 dark:text-white text-[10px] font-bold hover:bg-nature-green/40 focus:outline-none focus:ring-2 focus:ring-nature-green"
            >
                ?
            </button>
            {open && (
                <span
                    id={id}
                    role="tooltip"
                    className="absolute z-50 left-0 top-6 w-64 p-2 rounded-lg bg-gray-800 text-white text-xs shadow-lg"
                >
                    {text}
                </span>
            )}
        </span>
    );
};

export default FieldTooltip;
