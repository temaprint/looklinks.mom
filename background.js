/**
 * background.js — Service worker for looklinks.mom.
 *
 * Handles:
 *  - Daily check scheduling via chrome.alarms
 *  - Sequential queue that processes targets one-by-one
 *  - Page checking via tab creation + content script injection
 *  - Message-based communication with the dashboard UI
 */

importScripts('utils/storage.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALARM_DAILY   = 'dailyCheck';
const ALARM_QUEUE   = 'processNext';
const PAGE_TIMEOUT  = 15_000; // 15 s per page load

/** Map schedule values to alarm period in minutes. */
const SCHEDULE_MINUTES = {
  daily:   24 * 60,       // 1 440 min
  weekly:  7 * 24 * 60,   // 10 080 min
  monthly: 30 * 24 * 60   // 43 200 min
};

/** (Re)create the recurring check alarm based on the saved schedule. */
async function scheduleAlarm() {
  const { settings } = await getStorage(StorageKeys.SETTINGS);
  const minutes = SCHEDULE_MINUTES[settings.schedule] || SCHEDULE_MINUTES.daily;
  chrome.alarms.create(ALARM_DAILY, { periodInMinutes: minutes });
  console.log(`[looklinks.mom] Alarm rescheduled — ${settings.schedule} (every ${minutes} min)`);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** First install — seed defaults and schedule the daily alarm. */
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.get(
    [StorageKeys.TARGETS, StorageKeys.SETTINGS, StorageKeys.QUEUE, StorageKeys.TAGS, StorageKeys.FOLDERS],
    async (data) => {
      if (data.targets === undefined) {
        await chrome.storage.local.set({
          targets: structuredClone(DEFAULTS.targets),
          settings: structuredClone(DEFAULTS.settings),
          queue: structuredClone(DEFAULTS.queue),
          logs: structuredClone(DEFAULTS.logs),
          tags: structuredClone(DEFAULTS.tags),
          folders: structuredClone(DEFAULTS.folders)
        });
      }
    }
  );
  // Schedule the recurring check based on user settings
  await scheduleAlarm();
  console.log('[looklinks.mom] Extension installed — alarm set.');
});

/** Browser startup — resume an interrupted queue if one was running. */
chrome.runtime.onStartup.addListener(async () => {
  const { queue } = await getStorage(StorageKeys.QUEUE);
  if (queue.running) {
    console.log('[looklinks.mom] Resuming interrupted queue at index', queue.currentIndex);
    await cleanupOrphanTab(queue.currentTabId);
    processNextTarget();
  }
});

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_DAILY) {
    console.log('[looklinks.mom] Daily alarm fired.');
    await startQueue();
  } else if (alarm.name === ALARM_QUEUE) {
    await processNextTarget();
  }
});

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

/**
 * Start the check queue from the beginning.
 * Rejects if a queue is already running or there are no targets.
 */
async function startQueue() {
  const { queue, targets } = await getStorage([StorageKeys.QUEUE, StorageKeys.TARGETS]);

  if (queue.running) {
    console.log('[looklinks.mom] Queue already running — skipping.');
    return;
  }

  if (!targets || targets.length === 0) {
    console.log('[looklinks.mom] No targets — nothing to check.');
    return;
  }

  await setStorage({
    queue: { running: true, currentIndex: 0, startedAt: Date.now(), currentTabId: null }
  });
  await addLog('Queue started — ' + targets.length + ' target(s)');

  await processNextTarget();
}

/**
 * Process the target at queue.currentIndex, then schedule the next one
 * (with a 1-minute delay) or finish the queue.
 */
async function processNextTarget() {
  const { queue, targets } = await getStorage([StorageKeys.QUEUE, StorageKeys.TARGETS]);

  // Guard — queue may have been stopped between alarm fires
  if (!queue.running) return;

  // Queue complete
  if (!targets || queue.currentIndex >= targets.length) {
    await finishQueue();
    return;
  }

  const target = targets[queue.currentIndex];
  await addLog(`Checking [${queue.currentIndex + 1}/${targets.length}]: ${target.url}`);

  try {
    const found = await checkPage(target);

    // Resolve folder name from folderId
    const { folders } = await getStorage(StorageKeys.FOLDERS);
    const folderName = folders.find(f => f.id === target.folderId)?.name ?? null;

    // Persist result locally
    const updated = [...targets];
    updated[queue.currentIndex] = {
      ...target,
      lastChecked: Date.now(),
      lastResult: found
    };
    await setStorage({ targets: updated });
    await addLog(`Result: ${found ? 'FOUND' : 'NOT FOUND'} — ${target.url}`);

    // Send to external API when a key is configured
    const { settings } = await getStorage(StorageKeys.SETTINGS);
    if (settings.apiKey) {
      sendToApi(target, found, settings.apiKey, folderName).catch(() => {});
      // Auto-sync full state after each check
      syncToDashboard().catch(err => {
        console.warn('[looklinks.mom][auto-sync]', err);
      });
    }
  } catch (err) {
    await addLog(`Error: ${target.url} — ${err.message}`);
  }

  // Advance the queue
  const nextIndex = queue.currentIndex + 1;
  if (nextIndex >= targets.length) {
    await finishQueue();
  } else {
    await setStorage({
      queue: { running: true, currentIndex: nextIndex, startedAt: queue.startedAt, currentTabId: null }
    });
    // Delay from settings (seconds → minutes, minimum 0.17 ≈ 10s)
    const { settings } = await getStorage(StorageKeys.SETTINGS);
    const delaySec = settings.checkDelay || 60;
    const delayMin = Math.max(0.17, delaySec / 60);
    chrome.alarms.create(ALARM_QUEUE, { delayInMinutes: delayMin });
    await addLog(`Waiting ${delaySec}s before next check…`);
  }
}

/** Mark the queue as finished and clear any pending queue alarm. */
async function finishQueue() {
  await setStorage({
    queue: { running: false, currentIndex: 0, startedAt: null, currentTabId: null }
  });
  chrome.alarms.clear(ALARM_QUEUE);
  await addLog('Queue completed');
}

// ---------------------------------------------------------------------------
// Page checking
// ---------------------------------------------------------------------------

/**
 * Open an inactive tab, wait for it to load, inject a search script,
 * and return whether the query matched. Retries once on failure.
 *
 * @param {object} target
 * @param {boolean} retry  — set to false on the retry path to prevent loops
 */
async function checkPage(target, retry = true) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: target.url, active: false });

    // Persist tab id so we can clean up if the service worker is killed
    const { queue } = await getStorage(StorageKeys.QUEUE);
    await setStorage({ queue: { ...queue, currentTabId: tab.id } });

    await waitForTabLoad(tab.id, PAGE_TIMEOUT);

    const [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: searchInPage,
      args: [target.query]
    });

    return injectionResult?.result ?? false;
  } catch (err) {
    if (retry) {
      await addLog(`Retrying: ${target.url}`);
      return checkPage(target, false);
    }
    throw err;
  } finally {
    await safelyCloseTab(tab?.id);
  }
}

/**
 * Returns a Promise that resolves when the tab's status becomes "complete",
 * or rejects after `timeout` ms.
 */
function waitForTabLoad(tabId, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Page load timeout'));
    }, timeout);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Injected into the target page via chrome.scripting.executeScript.
 * Runs a case-insensitive RegExp match against the visible text.
 * Must be self-contained (no closure over external variables).
 */
function searchInPage(query) {
  try {
    const text = document.body ? document.body.innerText : '';
    const re = new RegExp(query, 'i');
    return re.test(text);
  } catch {
    // Invalid regex — fall back to plain-text search
    return (document.body ? document.body.innerText : '').toLowerCase().includes(query.toLowerCase());
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Close a tab, ignoring errors if it no longer exists. */
async function safelyCloseTab(tabId) {
  if (!tabId) return;
  try { await chrome.tabs.remove(tabId); } catch { /* already closed */ }
}

/** Close an orphan tab left over from a previous interrupted run. */
async function cleanupOrphanTab(tabId) {
  if (!tabId) return;
  await safelyCloseTab(tabId);
  const { queue } = await getStorage(StorageKeys.QUEUE);
  await setStorage({ queue: { ...queue, currentTabId: null } });
}

// ---------------------------------------------------------------------------
// External API
// ---------------------------------------------------------------------------

/**
 * Send a single check result to the dashboard ingest endpoint.
 */
async function sendToApi(target, found, apiKey, folderName) {
  const { settings } = await getStorage(StorageKeys.SETTINGS);
  const baseRaw = (settings.apiBaseUrl || 'https://dash.looklinks.mom').trim().replace(/\/$/, '');
  const payload = {
    url: target.url,
    query: target.query,
    found,
    checkedAt: new Date().toISOString(),
    tag: target.tag || null,
    folder: folderName,
    status: 'checked'
  };
  try {
    const res = await fetch(`${baseRaw}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[looklinks.mom][API]', res.status, text);
    }
  } catch (err) {
    console.warn('[looklinks.mom][API]', err.message);
  }
}

// ---------------------------------------------------------------------------
// Sync with Dashboard
// ---------------------------------------------------------------------------

/** Sync all targets, folders, tags, and settings TO the dashboard. */
async function syncToDashboard() {
  const { targets, folders, tags, settings } = await getStorage([
    StorageKeys.TARGETS,
    StorageKeys.FOLDERS,
    StorageKeys.TAGS,
    StorageKeys.SETTINGS
  ]);

  if (!settings.apiKey) {
    return { success: false, error: 'No API key configured' };
  }

  const baseRaw = (settings.apiBaseUrl || 'https://dash.looklinks.mom').trim().replace(/\/$/, '');

  const payload = {
    _app: 'looklinks.mom',
    _version: '1.0',
    targets: targets.map(t => ({
      id: t.id,
      url: t.url,
      query: t.query,
      tag: t.tag,
      folderId: t.folderId,
      createdAt: t.createdAt,
      lastChecked: t.lastChecked,
      lastResult: t.lastResult
    })),
    folders,
    tags,
    settings: {
      schedule: settings.schedule,
      language: settings.language,
      checkDelay: settings.checkDelay,
      apiBaseUrl: settings.apiBaseUrl
    }
  };

  try {
    const res = await fetch(`${baseRaw}/api/targets/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, error: text };
    }

    const data = await res.json();
    await addLog(`Synced to dashboard: ${data.imported} new, ${data.updated} updated`);
    return { success: true, data };
  } catch (err) {
    console.warn('[looklinks.mom][sync]', err.message);
    return { success: false, error: err.message };
  }
}

/** Pull targets, folders, tags, and settings FROM the dashboard. */
async function syncFromDashboard() {
  const { settings } = await getStorage(StorageKeys.SETTINGS);

  if (!settings.apiKey) {
    return { success: false, error: 'No API key configured' };
  }

  const baseRaw = (settings.apiBaseUrl || 'https://dash.looklinks.mom').trim().replace(/\/$/, '');

  try {
    const [targetsRes, settingsRes] = await Promise.all([
      fetch(`${baseRaw}/api/targets/export`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${settings.apiKey}` }
      }),
      fetch(`${baseRaw}/api/settings`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${settings.apiKey}` }
      })
    ]);

    if (!targetsRes.ok) {
      return { success: false, error: 'Failed to fetch targets' };
    }
    if (!settingsRes.ok) {
      return { success: false, error: 'Failed to fetch settings' };
    }

    const data = await targetsRes.json();
    const settingsData = await settingsRes.json();

    if (data._app !== 'looklinks.mom') {
      return { success: false, error: 'Invalid format' };
    }

    await setStorage({
      targets: data.targets || [],
      folders: data.folders || [],
      tags: data.tags || ['article', 'comment', 'profile'],
      settings: {
        ...settings,
        schedule: settingsData.schedule || settings.schedule,
        language: settingsData.language || settings.language,
        checkDelay: settingsData.checkDelay ?? settings.checkDelay,
        apiBaseUrl: settingsData.apiBaseUrl || settings.apiBaseUrl
      }
    });

    await addLog(`Synced from dashboard: ${(data.targets || []).length} targets`);
    return { success: true, data };
  } catch (err) {
    console.warn('[looklinks.mom][sync]', err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Message handler — used by the dashboard UI
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case 'startQueue':
          await startQueue();
          sendResponse({ status: 'started' });
          break;

        case 'stopQueue':
          await finishQueue();
          await addLog('Queue stopped manually');
          sendResponse({ status: 'stopped' });
          break;

        case 'updateSchedule':
          await scheduleAlarm();
          sendResponse({ status: 'rescheduled' });
          break;

        case 'checkSingle': {
          console.log('[looklinks.mom] checkSingle received, targetId:', message.targetId);
          const { targets } = await getStorage(StorageKeys.TARGETS);
          const target = targets.find(t => t.id === message.targetId);
          if (!target) {
            console.log('[looklinks.mom] Target not found:', message.targetId);
            sendResponse({ error: 'Not found' });
            break;
          }
          await addLog(`Single check: ${target.url}`);
          try {
            const found = await checkPage(target);
            const updated = targets.map(t =>
              t.id === target.id
                ? { ...t, lastChecked: Date.now(), lastResult: found }
                : t
            );
            await setStorage({ targets: updated });
            await addLog(`Result: ${found ? 'FOUND' : 'NOT FOUND'} — ${target.url}`);
            sendResponse({ found });
          } catch (err) {
            await addLog(`Error: ${target.url} — ${err.message}`);
            sendResponse({ error: err.message });
          }
          break;
        }

        case 'getStatus': {
          const { queue } = await getStorage(StorageKeys.QUEUE);
          sendResponse(queue);
          break;
        }

        case 'syncToDashboard': {
          const result = await syncToDashboard();
          sendResponse(result);
          break;
        }

        case 'syncFromDashboard': {
          const result = await syncFromDashboard();
          sendResponse(result);
          break;
        }

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (err) {
      console.error('[looklinks.mom] Message handler error:', err);
      sendResponse({ error: err.message });
    }
  })();
  // Return true to indicate the response is sent asynchronously
  return true;
});

// ---------------------------------------------------------------------------
// Open dashboard when the extension icon is clicked
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});
