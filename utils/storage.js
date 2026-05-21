/**
 * Shared storage helpers for Links.mom Tracker.
 * Loaded via importScripts() in the service worker
 * and <script> in the dashboard page.
 */

const StorageKeys = {
  TARGETS: 'targets',
  SETTINGS: 'settings',
  QUEUE: 'queue',
  LOGS: 'logs',
  TAGS: 'tags',
  FOLDERS: 'folders'
};

const DEFAULTS = {
  targets: [],
  settings: {
    apiKey: '',
    apiBaseUrl: 'https://dash.looklinks.mom',
    schedule: 'daily',
    language: 'en',
    checkDelay: 60,
    lastExportAt: null
  },
  queue: { running: false, currentIndex: 0, startedAt: null, currentTabId: null },
  logs: [],
  tags: ['article', 'comment', 'profile'],
  folders: []
};

/**
 * Read one or more keys from chrome.storage.local,
 * falling back to DEFAULTS for missing values.
 */
async function getStorage(keys) {
  const keysArray = Array.isArray(keys) ? keys : [keys];
  const data = await chrome.storage.local.get(keysArray);
  const result = {};
  for (const key of keysArray) {
    if (key === StorageKeys.SETTINGS && data[key]) {
      result[key] = { ...structuredClone(DEFAULTS.settings), ...data[key] };
      continue;
    }
    result[key] = data[key] ?? structuredClone(DEFAULTS[key]) ?? null;
  }
  return result;
}

/** Write arbitrary data to chrome.storage.local. */
async function setStorage(data) {
  await chrome.storage.local.set(data);
}

/** Add a new target to the list. Returns the created target. */
async function addTarget({ url, query, tag, folderId }) {
  const { targets } = await getStorage(StorageKeys.TARGETS);
  const target = {
    id: crypto.randomUUID(),
    url,
    query,
    tag: tag || 'article',
    folderId: folderId || null,
    createdAt: Date.now(),
    lastChecked: null,
    lastResult: null
  };
  targets.push(target);
  await setStorage({ targets });
  return target;
}

/** Remove a target by id. */
async function deleteTarget(id) {
  const { targets } = await getStorage(StorageKeys.TARGETS);
  await setStorage({ targets: targets.filter(t => t.id !== id) });
}

/** Update an existing target by id. Returns the updated target or null. */
async function updateTarget(id, data) {
  const { targets } = await getStorage(StorageKeys.TARGETS);
  const idx = targets.findIndex(t => t.id === id);
  if (idx === -1) return null;
  targets[idx] = { ...targets[idx], ...data };
  await setStorage({ targets });
  return targets[idx];
}

/** Add a custom tag. No-op if it already exists. */
async function addCustomTag(name) {
  const { tags } = await getStorage(StorageKeys.TAGS);
  const lower = name.toLowerCase().trim();
  if (!lower || tags.includes(lower)) return;
  tags.push(lower);
  await setStorage({ tags });
}

/** Remove a tag by name. */
async function removeCustomTag(name) {
  const { tags } = await getStorage(StorageKeys.TAGS);
  await setStorage({ tags: tags.filter(t => t !== name) });
}

/** Add a folder. Returns the created folder. */
async function addFolder(name) {
  const { folders } = await getStorage(StorageKeys.FOLDERS);
  const folder = { id: crypto.randomUUID(), name: name.trim() };
  folders.push(folder);
  await setStorage({ folders });
  return folder;
}

/** Remove a folder by id. */
async function removeFolder(id) {
  const { folders } = await getStorage(StorageKeys.FOLDERS);
  await setStorage({ folders: folders.filter(f => f.id !== id) });
}

/** Merge partial settings into the existing settings object. */
async function updateSettings(partial) {
  const { settings } = await getStorage(StorageKeys.SETTINGS);
  await setStorage({ settings: { ...settings, ...partial } });
}

/** Append a log entry (keeps last 100 entries). */
async function addLog(message) {
  const { logs } = await getStorage(StorageKeys.LOGS);
  logs.push({ timestamp: Date.now(), message });
  await setStorage({ logs: logs.slice(-100) });
}

/**
 * Format a timestamp as DD.MM.YY.
 * Returns translated "Never" for null via the global t() when available,
 * otherwise falls back to English.
 */
function formatDate(timestamp) {
  if (!timestamp) return typeof t === 'function' ? t('never') : 'Never';
  const d = new Date(timestamp);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}
