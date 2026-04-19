import { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../utils/logger';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallbackLabel?: string;
    onReset?: () => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        logger.error('[ErrorBoundary]', error, info.componentStack);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        this.props.onReset?.();
    };

    private handleReload = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const label = this.props.fallbackLabel || 'cette section';

        return (
            <div className="flex items-center justify-center p-8">
                <div className="bg-white dark:bg-nature-dark-surface border border-red-300 dark:border-red-700 rounded-xl shadow-lg p-6 max-w-md w-full text-center space-y-4">
                    <div className="text-red-500 text-4xl">⚠</div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Erreur dans {label}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {this.state.error?.message || 'Une erreur inattendue est survenue.'}
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={this.handleReset}
                            className="px-4 py-2 rounded-lg bg-nature-green text-white font-medium hover:bg-nature-dark transition-colors"
                        >
                            Retour
                        </button>
                        <button
                            onClick={this.handleReload}
                            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            Recharger la page
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
