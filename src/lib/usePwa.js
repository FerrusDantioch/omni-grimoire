import { useCallback, useEffect, useState } from 'react';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
  window.navigator.standalone === true;

/**
 * Capture l'evenement d'installation du navigateur pour proposer
 * un bouton « Installer » au bon moment.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setDeferred(event);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable';
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome;
  }, [deferred]);

  return { canInstall: Boolean(deferred), installed, promptInstall };
}

/*
 * Nouvelle version de l'application : main.jsx appelle signalerMiseAJour()
 * quand elle est telechargee et prete. Elle attend alors qu'on touche
 * « Mettre a jour » : rien ne change par surprise.
 */
let appliquerMiseAJour = null;
const abonnes = new Set();

export function signalerMiseAJour(appliquer) {
  appliquerMiseAJour = appliquer;
  abonnes.forEach((prevenir) => prevenir());
}

export function useMiseAJour() {
  const [prete, setPrete] = useState(() => appliquerMiseAJour !== null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    const prevenir = () => setPrete(true);
    abonnes.add(prevenir);
    return () => abonnes.delete(prevenir);
  }, []);
  const mettreAJour = useCallback(() => {
    if (!appliquerMiseAJour) return;
    setEnCours(true);
    appliquerMiseAJour();
  }, []);
  return { prete, enCours, mettreAJour };
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
