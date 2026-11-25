import { openDB } from 'idb';

const DB_NAME = 'grimoire-jdr';
const DB_VERSION = 2;

/** Tous les magasins a cle primaire `id`, sauf `settings` (cle/valeur). */
export const STORES = {
  characters: 'characters',
  journal: 'journal',
  documents: 'documents',
  tracks: 'tracks',
  playlists: 'playlists',
  rolls: 'rolls',
  encounters: 'encounters',
  sounds: 'sounds',
};

const KEYED = Object.values(STORES);

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of KEYED) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            if (name === STORES.rolls) store.createIndex('at', 'at');
            if (name === STORES.journal) store.createIndex('updatedAt', 'updatedAt');
          }
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
      blocked() {
        console.warn('[db] mise à jour bloquée par un autre onglet');
      },
    });
  }
  return dbPromise;
}

export async function getAll(store) {
  return (await getDB()).getAll(store);
}

export async function getOne(store, id) {
  return (await getDB()).get(store, id);
}

export async function put(store, value) {
  await (await getDB()).put(store, value);
  return value;
}

export async function putMany(store, values) {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  await Promise.all([...values.map((v) => tx.store.put(v)), tx.done]);
  return values;
}

export async function remove(store, id) {
  await (await getDB()).delete(store, id);
}

export async function clearStore(store) {
  await (await getDB()).clear(store);
}

export async function getSetting(key, fallback = null) {
  const value = await (await getDB()).get('settings', key);
  return value === undefined ? fallback : value;
}

export async function setSetting(key, value) {
  await (await getDB()).put('settings', value, key);
  return value;
}

/** Ne garde que les `keep` lancers les plus recents. */
export async function trimRolls(keep = 200) {
  const db = await getDB();
  const tx = db.transaction(STORES.rolls, 'readwrite');
  const excess = (await tx.store.count()) - keep;
  if (excess > 0) {
    // getAllKeys sur l'index « at » renvoie les cles primaires du plus ancien
    // au plus recent : on supprime donc bien les plus vieux jets.
    const doomed = await tx.store.index('at').getAllKeys(null, excess);
    await Promise.all(doomed.map((k) => tx.store.delete(k)));
  }
  await tx.done;
}

/** Estimation de l'espace disque utilise par l'application. */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, ratio: quota ? usage / quota : 0 };
  } catch {
    return null;
  }
}

/**
 * Demande au navigateur de ne pas evincer les donnees en cas de pression disque.
 * Certains navigateurs (Firefox) affichent alors une fenetre d'autorisation :
 * pour ne jamais en faire surgir une au demarrage, on ne demande que si le
 * navigateur a deja repondu « accorde » (Chrome, pour une application
 * installee, sans rien afficher). Sinon, on renonce en silence.
 */
export async function requestPersistence() {
  if (!navigator.storage?.persist || !navigator.permissions) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    const etat = await navigator.permissions.query({ name: 'persistent-storage' });
    if (etat.state !== 'granted') return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/* ---------------- sauvegarde complete ---------------- */

const blobToDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export function dataURLToBlob(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:/i.test(dataUrl)) {
    throw new Error('URL de données invalide : préfixe data: requis.');
  }
  const comma = dataUrl.indexOf(',');
  if (comma === -1) {
    throw new Error('URL de données malformée.');
  }
  const header = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const parts = header.split(';').filter(Boolean);
  const isBase64 = parts.some((p) => p.toLowerCase() === 'base64');
  const mime =
    parts.find((p) => !p.includes('=') && p.toLowerCase() !== 'base64') || 'application/octet-stream';

  if (isBase64) {
    const binary = atob(payload.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

const isOptionalString = (v) => v === undefined || typeof v === 'string';
const isOptionalNumber = (v) => v === undefined || v === null || Number.isFinite(v);

/** Valide la structure minimale d'une entree de sauvegarde selon son magasin. */
function isValidBackupRow(store, row) {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id) {
    return false;
  }
  switch (store) {
    case STORES.characters:
      return (
        isOptionalString(row.name) &&
        Array.isArray(row.sections) &&
        row.sections.every((s) => s && typeof s === 'object' && Array.isArray(s.fields))
      );
    case STORES.journal:
      return (
        typeof row.title === 'string' &&
        typeof row.content === 'string' &&
        (row.characterIds === undefined || Array.isArray(row.characterIds))
      );
    case STORES.documents:
    case STORES.tracks:
    case STORES.sounds:
      return (
        isOptionalString(row.name) &&
        (row.blobOmitted === true ||
          row.blob instanceof Blob ||
          (Boolean(row.blobEncoded) && typeof row.blob === 'string'))
      );
    case STORES.playlists:
      return (
        isOptionalString(row.name) &&
        Array.isArray(row.trackIds) &&
        row.trackIds.every((id) => typeof id === 'string')
      );
    case STORES.rolls:
      return (
        typeof row.expression === 'string' &&
        Number.isFinite(row.total) &&
        Number.isFinite(row.at) &&
        Array.isArray(row.terms)
      );
    case STORES.encounters:
      return (
        isOptionalString(row.name) &&
        isOptionalNumber(row.round) &&
        Array.isArray(row.combatants) &&
        row.combatants.every(
          (c) =>
            c &&
            typeof c === 'object' &&
            typeof c.id === 'string' &&
            Number.isFinite(c.initiative) &&
            isOptionalNumber(c.initBonus) &&
            isOptionalNumber(c.hp) &&
            isOptionalNumber(c.hpMax)
        )
      );
    default:
      return true;
  }
}

/**
 * Exporte tout le contenu en JSON. Les Blob (PDF, audio) sont encodes en
 * data-URL : la sauvegarde peut donc etre volumineuse.
 */
export async function exportBackup({ includeFiles = true } = {}) {
  const dump = { format: 'grimoire-backup', version: 1, exportedAt: new Date().toISOString(), data: {} };

  for (const store of KEYED) {
    const rows = await getAll(store);
    dump.data[store] = await Promise.all(
      rows.map(async (row) => {
        if (row.blob instanceof Blob) {
          if (!includeFiles) return { ...row, blob: undefined, blobOmitted: true };
          return { ...row, blob: await blobToDataURL(row.blob), blobEncoded: true };
        }
        return row;
      })
    );
  }
  return dump;
}

export async function importBackup(dump, { merge = true } = {}) {
  if (!dump || dump.format !== 'grimoire-backup') {
    throw new Error('Fichier de sauvegarde non reconnu.');
  }
  const counts = {};
  let skipped = 0;
  for (const store of KEYED) {
    const rows = dump.data?.[store];
    if (!Array.isArray(rows)) continue;
    if (!merge) await clearStore(store);
    const restored = [];
    for (const row of rows) {
      // Ligne invalide (identifiant ou schema incoherent) : on l'ignore
      // plutot que de casser tout le retablissement.
      if (!isValidBackupRow(store, row)) {
        skipped += 1;
        continue;
      }
      if (row.blobOmitted) {
        continue; // fichier absent de la sauvegarde : on ignore l'entree
      }
      if (row.blobEncoded && typeof row.blob === 'string') {
        try {
          restored.push({ ...row, blob: dataURLToBlob(row.blob), blobEncoded: undefined });
        } catch {
          skipped += 1;
        }
      } else {
        restored.push(row);
      }
    }
    if (restored.length) await putMany(store, restored);
    counts[store] = restored.length;
  }
  return { counts, skipped };
}

export async function wipeAll() {
  for (const store of KEYED) await clearStore(store);
  await (await getDB()).clear('settings');
}
