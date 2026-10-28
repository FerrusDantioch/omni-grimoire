import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { signalerMiseAJour } from './lib/usePwa.js';
import { AppProvider } from './state/AppContext.jsx';
import { DiceProvider } from './state/DiceContext.jsx';
import { PlayerProvider } from './state/PlayerContext.jsx';
import { AmbianceProvider } from './state/AmbianceContext.jsx';
import './styles/global.css';
import './styles/parts.css';

// pdf.js 4 s'appuie sur Promise.withResolvers, absent des navigateurs
// anterieurs a Chrome 119 / Safari 17.4.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

document.documentElement.dataset.theme = 'grimoire';

// Une nouvelle version telechargee ATTEND : la barre du haut propose
// « Mettre a jour », et updateSW(true) l'active puis recharge la page.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    signalerMiseAJour(() => updateSW(true));
  },
  onRegisteredSW(_url, registration) {
    // A chaque retour dans l'application, on regarde s'il y a du nouveau.
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
  },
  onOfflineReady() {
    console.info('[pwa] pret pour une utilisation hors ligne');
  },
  onRegisterError(error) {
    console.warn('[pwa] service worker non enregistre', error);
  },
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <PlayerProvider>
        <AmbianceProvider>
          <DiceProvider>
            <App />
          </DiceProvider>
        </AmbianceProvider>
      </PlayerProvider>
    </AppProvider>
  </React.StrictMode>
);
