import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { AuthProvider } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("L'élément root est introuvable dans le DOM.");
}

// CO-06: banner DOM non-bloquant pour proposer la mise a jour du Service Worker.
// Remplace l'ancien confirm() qui bloquait le thread principal et cassait le rendu React.
const showSwUpdateBanner = (onAccept: () => void) => {
  if (document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'polite');
  banner.style.cssText = [
    'position:fixed',
    'bottom:80px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:9999',
    'background:#1C1C1E',
    'color:white',
    'padding:12px 20px',
    'border-radius:16px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.2)',
    'display:flex',
    'align-items:center',
    'gap:12px',
    'font-family:Inter,system-ui,sans-serif',
    'font-size:14px',
    'max-width:90vw'
  ].join(';');

  const message = document.createElement('span');
  message.textContent = 'Nouvelle version disponible';

  const updateBtn = document.createElement('button');
  updateBtn.type = 'button';
  updateBtn.textContent = 'Mettre a jour';
  updateBtn.style.cssText = 'background:#34C759;color:white;border:none;padding:6px 16px;border-radius:10px;font-weight:600;cursor:pointer;font-size:13px;';
  updateBtn.addEventListener('click', () => {
    banner.remove();
    onAccept();
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.textContent = '\u2715';
  dismissBtn.setAttribute('aria-label', 'Fermer la notification');
  dismissBtn.style.cssText = 'background:transparent;color:#8E8E93;border:none;cursor:pointer;font-size:18px;padding:0 4px;';
  dismissBtn.addEventListener('click', () => banner.remove());

  banner.appendChild(message);
  banner.appendChild(updateBtn);
  banner.appendChild(dismissBtn);
  document.body.appendChild(banner);
};

const updateSW = registerSW({
  onNeedRefresh() {
    showSwUpdateBanner(() => updateSW(true));
  },
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary fallbackLabel="l'application">
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
