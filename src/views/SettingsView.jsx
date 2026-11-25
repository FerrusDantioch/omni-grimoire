import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import * as db from '../lib/db.js';
import { downloadBlob, formatBytes, pickFiles } from '../lib/utils.js';
import { useInstallPrompt, useOnline } from '../lib/usePwa.js';
import Icon from '../components/Icon.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

// Thèmes proposés : l'identifiant correspond à un bloc [data-theme="..."] de
// styles/global.css.
const THEMES = [
  { id: 'grimoire', label: 'Grimoire' },
  { id: 'parchemin', label: 'Parchemin' },
  { id: 'omni-systeme', label: 'Omni-système' },
];

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0';

function Row({ icon, title, description, children }) {
  return (
    <div className="setting-row">
      <span className="setting-row__icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <div className="setting-row__body">
        <strong>{title}</strong>
        {description && <span className="small muted">{description}</span>}
      </div>
      <div className="setting-row__action">{children}</div>
    </div>
  );
}

export default function SettingsView() {
  const {
    theme,
    changeTheme,
    vibration = true,
    changeVibration,
    characters,
    journal,
    documents,
    tracks,
    playlists,
    encounters,
    sounds,
    reloadAll,
    toast,
  } = useApp();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const online = useOnline();

  const [usage, setUsage] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);

  const refreshUsage = () => db.storageEstimate().then(setUsage);
  const refreshPersistence = async () => {
    if (!navigator.storage?.persisted) {
      setPersisted(null);
      return;
    }
    try {
      setPersisted(await navigator.storage.persisted());
    } catch {
      setPersisted(null);
    }
  };

  useEffect(() => {
    refreshUsage();
    refreshPersistence();
  }, []);

  const requestPersist = async () => {
    if (!navigator.storage?.persist) return;
    setBusy('persist');
    try {
      const granted = await navigator.storage.persist();
      setPersisted(granted);
      toast(
        granted
          ? 'Tes données sont maintenant protégées contre l’effacement automatique.'
          : 'Le navigateur n’a pas accordé la protection automatique. Pense à exporter une sauvegarde régulièrement.',
        granted ? 'ok' : 'info'
      );
    } catch {
      toast('Impossible de demander la protection du stockage.', 'err');
    } finally {
      setBusy('');
    }
  };

  /**
   * Sauvegarde complète (PDF et sons encodés dans le fichier, qui peut peser
   * des centaines de Mo) ou légère (fiches, journal, combats, playlists,
   * historique de dés : quelques Ko, idéale pour une sauvegarde régulière).
   */
  const exportBackup = async (includeFiles) => {
    const kind = includeFiles ? 'export' : 'export-light';
    setBusy(kind);
    try {
      const dump = await db.exportBackup({ includeFiles });
      const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `omni-grimoire-sauvegarde${includeFiles ? '' : '-legere'}-${stamp}.json`);
      toast(`Sauvegarde ${includeFiles ? 'complète' : 'légère'} téléchargée (${formatBytes(blob.size)}).`, 'ok');
    } catch (err) {
      console.error(err);
      toast('La sauvegarde a échoué.', 'err');
    } finally {
      setBusy('');
    }
  };

  const importBackup = async () => {
    const [file] = await pickFiles({ accept: 'application/json,.json' });
    if (!file) return;
    setBusy('import');
    try {
      const dump = JSON.parse(await file.text());
      const { counts, skipped } = await db.importBackup(dump, { merge: true });
      await reloadAll();
      await refreshUsage();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast(
        skipped
          ? `${total} élément(s) restauré(s), ${skipped} ligne(s) invalide(s) ignorée(s).`
          : `${total} élément(s) restauré(s).`,
        skipped ? 'err' : 'ok'
      );
    } catch (err) {
      console.error(err);
      toast(err.message || 'Fichier de sauvegarde invalide.', 'err');
    } finally {
      setBusy('');
    }
  };

  // Poids des fichiers stockés ; l'encodage en data-URL de la sauvegarde
  // complète y ajoute environ un tiers (d'où le facteur 1,37 affiché).
  const fileBytes = [...documents, ...tracks, ...sounds].reduce((sum, item) => sum + (item.size || 0), 0);

  const counts = [
    { label: 'Personnages', value: characters.length },
    { label: 'Séances', value: journal.length },
    { label: 'Documents', value: documents.length },
    { label: 'Pistes', value: tracks.length },
    { label: 'Playlists', value: playlists.length },
    { label: 'Combats', value: encounters.length },
    { label: 'Ambiances', value: sounds.length },
  ];

  const baseUrl = import.meta.env.BASE_URL;

  return (
    <>
      <div className="page-head">
        <h1>Réglages</h1>
      </div>

      <section className="card setting-group">
        <h2 className="setting-group__title">Apparence</h2>
        <Row
          icon={theme === 'parchemin' ? 'sun' : 'moon'}
          title="Thème"
          description="Sombre pour jouer le soir, clair pour le grand jour, ou aux couleurs de l’Omni-système."
        >
          <div className="segmented segmented--inline theme-picker">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={theme === t.id ? 'is-on' : ''}
                aria-pressed={theme === t.id}
                onClick={() => changeTheme(t.id)}
              >
                {/* Aperçu : la pastille porte le data-theme du bouton, donc les
                    couleurs de ce thème-là, quel que soit le thème actif. */}
                <span className="theme-swatch" data-theme={t.id} aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>
        </Row>
      </section>

      <section className="card setting-group">
        <h2 className="setting-group__title">Application</h2>
        <Row
          icon="dice"
          title="Vibrations lors des jets de dés"
          description="Fait vibrer l’appareil à chaque lancer de dés (si ton navigateur le permet)."
        >
          <label className="setting-switch">
            <input
              type="checkbox"
              role="switch"
              aria-label="Vibrations lors des jets de dés"
              checked={Boolean(vibration)}
              onChange={(e) => changeVibration?.(e.target.checked)}
            />
            <span className="setting-switch__track" aria-hidden="true">
              <span className="setting-switch__thumb" />
            </span>
          </label>
        </Row>
        <Row
          icon="download"
          title="Installer sur l’appareil"
          description={
            installed
              ? 'Déjà installée — elle s’ouvre comme une application.'
              : canInstall
                ? 'Ajoute une icône et un lancement en plein écran.'
                : 'Utilise « Ajouter à l’écran d’accueil » dans le menu de ton navigateur.'
          }
        >
          <button type="button" className="btn btn--sm btn--primary" onClick={promptInstall} disabled={!canInstall || installed}>
            {installed ? 'Installée' : 'Installer'}
          </button>
        </Row>
        <Row
          icon="info"
          title="Fonctionnement hors ligne"
          description={
            online
              ? 'Connecté. Les fichiers de l’application sont en cache pour les coupures réseau.'
              : 'Hors ligne — toutes les fonctions restent disponibles.'
          }
        >
          <span className={`chip chip--static${online ? '' : ' chip--on'}`}>{online ? 'En ligne' : 'Hors ligne'}</span>
        </Row>
      </section>

      <section className="card setting-group">
        <h2 className="setting-group__title">Données</h2>

        <div className="stats-grid">
          {counts.map((c) => (
            <div key={c.label} className="stat">
              <strong>{c.value}</strong>
              <span className="small muted">{c.label}</span>
            </div>
          ))}
        </div>

        {usage && (
          <div className="storage">
            <div className="storage__bar">
              <span style={{ width: `${Math.min(100, Math.max(1, usage.ratio * 100))}%` }} />
            </div>
            <span className="small muted">
              {formatBytes(usage.usage)} utilisés sur {formatBytes(usage.quota)} disponibles (ce quota couvre l’ensemble
              des applications du site ferrusdantioch.github.io).
            </span>
          </div>
        )}

        {persisted !== null && (
          <Row
            icon="save"
            title="Persistance du stockage"
            description={
              persisted
                ? 'Tes données sont protégées : le navigateur ne les effacera pas automatiquement faute d’espace.'
                : 'Le navigateur peut effacer les données locales en cas de manque d’espace. Active cette protection pour l’éviter.'
            }
          >
            {persisted ? (
              <span className="chip chip--static chip--on">Protégées</span>
            ) : navigator.storage?.persist ? (
              <button
                type="button"
                className="btn btn--sm"
                onClick={requestPersist}
                disabled={Boolean(busy)}
              >
                {busy === 'persist' ? 'En cours…' : 'Protéger mes données contre l’effacement'}
              </button>
            ) : (
              <span className="chip chip--static">Non protégées</span>
            )}
          </Row>
        )}

        <Row
          icon="save"
          title="Sauvegarde légère"
          description="Fiches, journal, combats, playlists et historique de dés, sans les PDF ni les fichiers audio. Quelques Ko : idéale pour sauvegarder souvent."
        >
          <button type="button" className="btn btn--sm" onClick={() => exportBackup(false)} disabled={Boolean(busy)}>
            <Icon name="download" />
            {busy === 'export-light' ? 'En cours…' : 'Exporter'}
          </button>
        </Row>

        <Row
          icon="save"
          title="Sauvegarde complète"
          description={`Tout, y compris les PDF, musiques et ambiances${
            fileBytes ? ` (environ ${formatBytes(fileBytes * 1.37)})` : ''
          }. Peut être volumineuse.`}
        >
          <button type="button" className="btn btn--sm" onClick={() => exportBackup(true)} disabled={Boolean(busy)}>
            <Icon name="download" />
            {busy === 'export' ? 'En cours…' : 'Exporter'}
          </button>
        </Row>

        <Row
          icon="upload"
          title="Restaurer"
          description="Fusionne le contenu d’une sauvegarde (légère ou complète) avec tes données actuelles."
        >
          <button type="button" className="btn btn--sm" onClick={importBackup} disabled={Boolean(busy)}>
            <Icon name="upload" />
            {busy === 'import' ? 'En cours…' : 'Importer'}
          </button>
        </Row>

        <Row icon="trash" title="Tout effacer" description="Supprime définitivement l’ensemble de tes données locales.">
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmWipe(true)}>
            Effacer
          </button>
        </Row>
      </section>

      <section className="card setting-group">
        <h2 className="setting-group__title">À propos</h2>

        <div className="about-hero">
          <img
            src={`${baseUrl}icons/logo-omni-systeme.webp`}
            alt="Logo Omni-Système"
            width="64"
            height="64"
            className="about-hero__logo"
          />
          <div className="about-hero__meta">
            <strong className="about-hero__name">Omni-Grimoire</strong>
            <span className="about-version">Version {APP_VERSION}</span>
          </div>
        </div>

        <div className="about-body">
          <p>
            Compagnon de jeu de rôle fonctionnant entièrement sur ton appareil. Aucune donnée n’est envoyée sur un
            serveur : fiches, journal, documents et musiques restent dans le stockage local de ton navigateur. Pense à
            exporter une sauvegarde de temps en temps.
          </p>
          <p>Application réalisée par Ferrus Dantioch, avec l&apos;aide de l&apos;intelligence artificielle.</p>
          <p>
            <strong>Confidentialité et contact&nbsp;:</strong> aucune donnée personnelle n’est collectée ni transmise.
            Une idée, une remarque, un souci ? Tes retours sont les bienvenus :{' '}
            <a href="mailto:omni-systeme.choking513@passmail.net?subject=Retour%20sur%20Omni-Grimoire">
              omni-systeme.choking513@passmail.net
            </a>
          </p>
          <p>
            © 2026 Ferrus Dantioch —{' '}
            <a
              href="https://creativecommons.org/licenses/by-nc-nd/4.0/deed.fr"
              target="_blank"
              rel="noopener noreferrer"
            >
              Creative Commons Attribution - Pas d’Utilisation Commerciale - Pas de Modification 4.0 International
              (CC BY-NC-ND 4.0)
            </a>{' '}
            : partage autorisé en citant Ferrus Dantioch, sans usage commercial et sans œuvre dérivée ou modifiée sans
            autorisation.
          </p>
          <div className="about-links">
            <a
              href="https://ferrusdantioch.github.io/omni-systeme/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--sm"
            >
              Découvrir l&apos;Omni-système
            </a>
            <a
              href={`${baseUrl}licences-tierces.txt`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--sm btn--ghost"
            >
              Licences des bibliothèques tierces
            </a>
          </div>
          {/* Note d'installation : Chrome Android n'installe qu'une seule
              application par adresse de site, et toutes les applications de
              ferrusdantioch.github.io partagent la même. Masquée une fois
              l'application installée (règle .note-installation de la feuille de style). */}
          <p className="note-installation">
            <strong>Installation sur Android&nbsp;:</strong> si Chrome indique «&nbsp;Cette appli est déjà
            installée&nbsp;» alors qu’elle ne l’est pas, c’est une limite de Chrome quand une autre application de ce
            site est déjà installée. Utilise un autre navigateur (Brave, par exemple), ou choisis «&nbsp;Créer un
            raccourci&nbsp;».
          </p>
        </div>
      </section>

      <ConfirmDialog
        open={confirmWipe}
        title="Effacer toutes les données ?"
        message="Personnages, journal, documents, musiques et historique de dés seront définitivement supprimés. Exporte une sauvegarde avant si besoin."
        confirmLabel="Tout effacer"
        onConfirm={async () => {
          await db.wipeAll();
          // Rechargement complet : historique de dés, fiche active, thème et
          // lecteur vivent aussi en mémoire et resteraient affichés sinon.
          window.location.reload();
        }}
        onClose={() => setConfirmWipe(false)}
      />
    </>
  );
}
