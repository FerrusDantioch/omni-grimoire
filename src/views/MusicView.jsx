import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { usePlayer, usePlayerTime } from '../state/PlayerContext.jsx';
import { debounce, formatBytes, formatDuration, pickFiles, uid } from '../lib/utils.js';
import Icon from '../components/Icon.jsx';
import Modal, { ConfirmDialog } from '../components/Modal.jsx';
import Soundboard from '../components/Soundboard.jsx';
import './music.css';

const AUDIO_ACCEPT = 'audio/*,.mp3,.ogg,.wav,.m4a,.flac,.opus,.aac';

const REPEAT_LABELS = {
  off: 'Répétition désactivée',
  all: 'Répéter la file',
  one: 'Répéter la piste',
};

function TrackTimeSlider({ onSeek }) {
  const { position, duration } = usePlayerTime();
  return (
    <>
      <input
        className="player__seek"
        type="range"
        min={0}
        max={duration || 0}
        step={0.5}
        value={Math.min(position, duration || 0)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Position de lecture"
      />
      <div className="player__times small muted">
        <span>{formatDuration(position)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </>
  );
}

function TrackRow({ track, isCurrent, playing, onPlay, onAdd, onDelete, deleteLabel }) {
  return (
    <li className={`track${isCurrent ? ' track--current' : ''}`}>
      <button type="button" className="track__play" onClick={onPlay} aria-label={`Lire ${track.name}`}>
        <Icon name={isCurrent && playing ? 'pause' : 'play'} size={16} />
      </button>
      <span className="track__body">
        <span className="track__name">{track.name}</span>
        <span className="small muted">
          {track.duration ? formatDuration(track.duration) : formatBytes(track.size)}
        </span>
      </span>
      <button
        type="button"
        className="btn btn--ghost btn--icon btn--sm"
        onClick={onAdd}
        aria-label={`Ajouter ${track.name} à une playlist`}
      >
        <Icon name="plus" />
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--icon btn--sm"
        onClick={onDelete}
        aria-label={deleteLabel || `Supprimer ${track.name}`}
      >
        <Icon name="trash" />
      </button>
    </li>
  );
}

function PlaylistDetail({
  playlist,
  items,
  currentId,
  playing,
  onBack,
  onPlayAll,
  onPlayTrack,
  onAddTrack,
  onSavePlaylist,
  onRequestDelete,
  persistRef,
}) {
  const [name, setName] = useState(playlist.name);
  const latestRef = useRef({ playlist, name });
  latestRef.current = { playlist, name };

  const persistName = useMemo(
    () =>
      debounce((pl, nextName) => {
        onSavePlaylist({ ...pl, name: nextName });
      }, 450),
    [onSavePlaylist]
  );

  useEffect(() => {
    persistRef.current = persistName;
    return () => {
      persistName.flush(latestRef.current.playlist, latestRef.current.name);
      if (persistRef.current === persistName) persistRef.current = null;
    };
  }, [persistName, persistRef]);

  return (
    <>
      <div className="page-head">
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => {
            persistName.flush(playlist, name);
            onBack();
          }}
          aria-label="Retour aux playlists"
        >
          <Icon name="arrowLeft" />
        </button>
        <h1>{name || 'Sans nom'}</h1>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={onPlayAll}
          disabled={!items.length}
        >
          <Icon name="play" />
          Lire
        </button>
      </div>

      <div className="field">
        <span className="label">Nom</span>
        <input
          className="input"
          value={name}
          onChange={(e) => {
            const nextName = e.target.value;
            setName(nextName);
            persistName(playlist, nextName);
          }}
          onBlur={() => persistName.flush(playlist, name)}
          aria-label="Nom de la playlist"
        />
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">🎵</span>
          <h3>Playlist vide</h3>
          <p className="small">Ajoute des pistes depuis l’onglet « Pistes ».</p>
        </div>
      ) : (
        <ul className="track-list">
          {items.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              isCurrent={currentId === track.id}
              playing={playing}
              onPlay={() => onPlayTrack(track)}
              onAdd={() => onAddTrack(track)}
              deleteLabel={`Retirer ${track.name} de la playlist`}
              onDelete={() =>
                onSavePlaylist({
                  ...playlist,
                  name,
                  trackIds: playlist.trackIds.filter((id) => id !== track.id),
                })
              }
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        className="btn btn--danger btn--block"
        style={{ marginTop: 16 }}
        onClick={onRequestDelete}
      >
        <Icon name="trash" />
        Supprimer la playlist
      </button>
    </>
  );
}

export default function MusicView() {
  const { tracks, playlists, sounds, addTracks, deleteTrack, savePlaylist, deletePlaylist, toast } = useApp();
  const {
    current, playing, playQueue, togglePlay, next, prev, volume, setVolume,
    seek, shuffle, toggleShuffle, repeat, cycleRepeat, queueLabel,
  } = usePlayer();

  const [tab, setTab] = useState('tracks');
  const [importing, setImporting] = useState(false);
  const [addTarget, setAddTarget] = useState(null); // piste a ranger dans une playlist
  const [confirmTrack, setConfirmTrack] = useState(null);
  const [confirmPlaylist, setConfirmPlaylist] = useState(null);
  const [openPlaylistId, setOpenPlaylistId] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creating, setCreating] = useState(false);
  const playlistPersistRef = useRef(null);

  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const openPlaylist = playlists.find((p) => p.id === openPlaylistId) || null;
  const openPlaylistItems = useMemo(
    () => (openPlaylist ? openPlaylist.trackIds.map((id) => trackById.get(id)).filter(Boolean) : []),
    [openPlaylist, trackById]
  );

  const importAudio = async () => {
    const files = await pickFiles({ accept: AUDIO_ACCEPT, multiple: true });
    if (!files.length) return;
    setImporting(true);
    try {
      const audio = files.filter((f) => f.type.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|flac|opus|aac)$/i.test(f.name));
      if (!audio.length) {
        toast('Aucun fichier audio reconnu.', 'err');
        return;
      }
      await addTracks(audio);
      toast(`${audio.length} piste(s) ajoutée(s).`, 'ok');
    } catch (err) {
      console.error(err);
      toast("L'import a échoué.", 'err');
    } finally {
      setImporting(false);
    }
  };

  const createPlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const playlist = { id: uid('pl'), name, trackIds: [], createdAt: Date.now() };
    await savePlaylist(playlist);
    setNewPlaylistName('');
    setCreating(false);
    toast('Playlist créée.', 'ok');
  };

  const playTrack = (track) => {
    if (current?.id === track.id) {
      togglePlay();
      return;
    }
    const source = openPlaylist ? openPlaylist.trackIds : tracks.map((t) => t.id);
    playQueue(source, {
      startId: track.id,
      label: openPlaylist ? openPlaylist.name : 'Toutes les pistes',
    });
  };

  const addToPlaylist = async (playlist, trackId) => {
    if (playlist.trackIds.includes(trackId)) {
      toast('Déjà dans cette playlist.');
      return;
    }
    await savePlaylist({ ...playlist, trackIds: [...playlist.trackIds, trackId] });
    toast(`Ajoutée à « ${playlist.name} ».`, 'ok');
    setAddTarget(null);
  };

  return (
    <>
      {openPlaylist ? (
        <PlaylistDetail
          key={openPlaylist.id}
          playlist={openPlaylist}
          items={openPlaylistItems}
          currentId={current?.id}
          playing={playing}
          onBack={() => setOpenPlaylistId(null)}
          onPlayAll={() => playQueue(openPlaylist.trackIds, { label: openPlaylist.name })}
          onPlayTrack={playTrack}
          onAddTrack={(track) => setAddTarget(track)}
          onSavePlaylist={savePlaylist}
          onRequestDelete={() => setConfirmPlaylist(openPlaylist)}
          persistRef={playlistPersistRef}
        />
      ) : (
        <>
          <div className="page-head">
            <h1>Musique</h1>
            <span className="spacer" />
            {tab !== 'ambiances' && (
              <button type="button" className="btn btn--primary btn--sm" onClick={importAudio} disabled={importing}>
                <Icon name="upload" />
                {importing ? 'Import…' : 'Importer'}
              </button>
            )}
          </div>

          <div className="segmented">
            <button
              type="button"
              aria-pressed={tab === 'tracks'}
              className={tab === 'tracks' ? 'is-on' : ''}
              onClick={() => setTab('tracks')}
            >
              Pistes ({tracks.length})
            </button>
            <button
              type="button"
              aria-pressed={tab === 'playlists'}
              className={tab === 'playlists' ? 'is-on' : ''}
              onClick={() => setTab('playlists')}
            >
              Playlists ({playlists.length})
            </button>
            <button
              type="button"
              aria-pressed={tab === 'ambiances'}
              className={tab === 'ambiances' ? 'is-on' : ''}
              onClick={() => setTab('ambiances')}
            >
              Ambiances ({sounds.length})
            </button>
          </div>

          {tab === 'ambiances' && <Soundboard />}

          {tab === 'tracks' ? (
            tracks.length === 0 ? (
              <div className="empty">
                <span className="empty__icon">🎼</span>
                <h3>Aucune piste</h3>
                <p className="small">
                  Importe tes ambiances (mp3, ogg, wav…). Elles restent sur l’appareil et la lecture
                  continue quand tu changes d’onglet.
                </p>
                <button type="button" className="btn btn--primary" onClick={importAudio} style={{ marginTop: 12 }}>
                  <Icon name="upload" />
                  Importer de la musique
                </button>
              </div>
            ) : (
              <>
                <div className="row" style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => playQueue(tracks.map((t) => t.id), { label: 'Toutes les pistes' })}
                  >
                    <Icon name="play" />
                    Tout lire
                  </button>
                  <span className="spacer" />
                  <span className="small muted">{tracks.length} piste(s)</span>
                </div>
                <ul className="track-list">
                  {tracks.map((track) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      isCurrent={current?.id === track.id}
                      playing={playing}
                      onPlay={() => playTrack(track)}
                      onAdd={() => setAddTarget(track)}
                      onDelete={() => setConfirmTrack(track)}
                    />
                  ))}
                </ul>
              </>
            )
          ) : tab === 'playlists' ? (
            <>
              <button type="button" className="btn btn--block" onClick={() => setCreating(true)} style={{ marginBottom: 12 }}>
                <Icon name="plus" />
                Nouvelle playlist
              </button>

              {playlists.length === 0 ? (
                <div className="empty">
                  <span className="empty__icon">📻</span>
                  <h3>Aucune playlist</h3>
                  <p className="small">Regroupe tes ambiances : combat, taverne, exploration…</p>
                </div>
              ) : (
                <div className="playlist-grid">
                  {playlists.map((playlist) => (
                    <div key={playlist.id} className="playlist-card">
                      <button type="button" className="playlist-card__open" onClick={() => setOpenPlaylistId(playlist.id)}>
                        <span className="playlist-card__icon" aria-hidden="true">
                          <Icon name="music" size={20} />
                        </span>
                        <span className="playlist-card__body">
                          <strong>{playlist.name}</strong>
                          <span className="small muted">{playlist.trackIds.length} piste(s)</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon btn--sm"
                        onClick={() => playQueue(playlist.trackIds, { label: playlist.name })}
                        disabled={!playlist.trackIds.length}
                        aria-label={`Lire ${playlist.name}`}
                      >
                        <Icon name="play" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {/* -------- lecteur complet -------- */}
          {current && (
            <section className="player card">
              <div className="player__head">
                <span className="player__cover" aria-hidden="true">
                  <Icon name="music" size={22} />
                </span>
                <div className="player__meta">
                  <strong className="player__title">{current.name}</strong>
                  <span className="small muted">{queueLabel}</span>
                </div>
              </div>

              <TrackTimeSlider onSeek={seek} />

              <div className="player__controls">
                <button
                  type="button"
                  className={`btn btn--ghost btn--icon${shuffle ? ' is-on' : ''}`}
                  onClick={toggleShuffle}
                  aria-pressed={shuffle}
                  aria-label="Lecture aléatoire"
                >
                  <Icon name="shuffle" />
                </button>
                <button type="button" className="btn btn--icon" onClick={prev} aria-label="Piste précédente">
                  <Icon name="skipBack" />
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--icon player__play"
                  onClick={togglePlay}
                  aria-label={playing ? 'Pause' : 'Lecture'}
                >
                  <Icon name={playing ? 'pause' : 'play'} size={22} />
                </button>
                <button type="button" className="btn btn--icon" onClick={next} aria-label="Piste suivante">
                  <Icon name="skipForward" />
                </button>
                <button
                  type="button"
                  className={`btn btn--ghost btn--icon${repeat !== 'off' ? ' is-on' : ''}`}
                  onClick={cycleRepeat}
                  aria-label={REPEAT_LABELS[repeat]}
                  title={REPEAT_LABELS[repeat]}
                >
                  <Icon name="repeat" />
                  {repeat === 'one' && <span className="player__repeat-one">1</span>}
                </button>
              </div>

              <div className="player__volume">
                <button
                  type="button"
                  className="btn btn--ghost btn--icon btn--sm"
                  onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
                  aria-label={volume > 0 ? 'Couper le son' : 'Rétablir le son'}
                >
                  <Icon name={volume > 0 ? 'volume' : 'volumeOff'} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Volume"
                />
              </div>
            </section>
          )}
        </>
      )}

      {/* -------- modales (partagees entre vue principale et vue playlist) -------- */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nouvelle playlist"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Annuler
            </button>
            <button type="button" className="btn btn--primary" onClick={createPlaylist} disabled={!newPlaylistName.trim()}>
              Créer
            </button>
          </>
        }
      >
        <label className="field" style={{ margin: 0 }}>
          <span className="label">Nom de la playlist</span>
          <input
            className="input"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
            placeholder="Combat, taverne, exploration…"
            autoFocus
          />
        </label>
      </Modal>

      <Modal open={Boolean(addTarget)} onClose={() => setAddTarget(null)} title="Ajouter à une playlist">
        {playlists.length === 0 ? (
          <p className="small muted">Crée d’abord une playlist depuis l’onglet « Playlists ».</p>
        ) : (
          <div className="stack">
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className="btn btn--block"
                style={{ justifyContent: 'space-between' }}
                onClick={() => addToPlaylist(playlist, addTarget.id)}
              >
                {playlist.name}
                <span className="small muted">{playlist.trackIds.length}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmTrack)}
        title="Supprimer cette piste ?"
        message={`« ${confirmTrack?.name} » sera retirée du stockage et de toutes les playlists.`}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await deleteTrack(confirmTrack.id);
          toast('Piste supprimée.');
        }}
        onClose={() => setConfirmTrack(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmPlaylist)}
        title="Supprimer cette playlist ?"
        message="Les pistes audio elles-mêmes sont conservées."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          playlistPersistRef.current?.cancel();
          await deletePlaylist(confirmPlaylist.id);
          setOpenPlaylistId(null);
          toast('Playlist supprimée.');
        }}
        onClose={() => setConfirmPlaylist(null)}
      />
    </>
  );
}
