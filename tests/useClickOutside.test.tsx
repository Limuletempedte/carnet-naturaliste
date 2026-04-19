import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';

function Harness({ onOutside }: { onOutside: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useClickOutside(ref, onOutside);
    return (
        <div>
            <div ref={ref} data-testid="inside">inside</div>
            <button data-testid="outside">outside</button>
        </div>
    );
}

describe('useClickOutside', () => {
    it('ne declenche pas quand on clique a l interieur', () => {
        const onOutside = vi.fn();
        const { getByTestId } = render(<Harness onOutside={onOutside} />);
        fireEvent.mouseDown(getByTestId('inside'));
        expect(onOutside).not.toHaveBeenCalled();
    });

    it('declenche sur mousedown exterieur', () => {
        const onOutside = vi.fn();
        const { getByTestId } = render(<Harness onOutside={onOutside} />);
        fireEvent.mouseDown(getByTestId('outside'));
        expect(onOutside).toHaveBeenCalledTimes(1);
    });

    it('declenche sur touchstart exterieur', () => {
        const onOutside = vi.fn();
        const { getByTestId } = render(<Harness onOutside={onOutside} />);
        fireEvent.touchStart(getByTestId('outside'));
        expect(onOutside).toHaveBeenCalledTimes(1);
    });
});
