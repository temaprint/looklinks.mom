/**
 * dashboard.js — UI logic for the looklinks.mom dashboard.
 *
 * Features: folders, quick filters (domain/tag/status),
 * sortable columns, cached storage, live updates.
 */

// ---------------------------------------------------------------------------
// Helpers — tag colors & labels
// ---------------------------------------------------------------------------

const TAG_PALETTE = [
  { bg: '#e0e7ff', fg: '#3730a3' },
  { bg: '#fef3c7', fg: '#92400e' },
  { bg: '#d1fae5', fg: '#065f46' },
  { bg: '#fce7f3', fg: '#9d174d' },
  { bg: '#e0f2fe', fg: '#075985' },
  { bg: '#f3e8ff', fg: '#6b21a8' },
  { bg: '#fef9c3', fg: '#854d0e' },
  { bg: '#ffedd5', fg: '#9a3412' }
];

const TAG_DEFAULT_COLORS = {
  article: { bg: '#e0e7ff', fg: '#3730a3' },
  comment: { bg: '#fef3c7', fg: '#92400e' },
  profile: { bg: '#d1fae5', fg: '#065f46' }
};

function tagColor(tag) {
  if (TAG_DEFAULT_COLORS[tag]) return TAG_DEFAULT_COLORS[tag];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = tag.charCodeAt(i) + ((h << 5) - h);
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

function tagLabel(tag) {
  const key = 'tag_' + tag;
  return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.en?.[key] || tag;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** In-memory cache of the latest storage snapshot. */
let cache = {};

let currentSort = { field: 'createdAt', direction: 'desc' };
let activeFilters = { folderId: null, domain: null, tag: null, status: null };

const PAGE_SIZE = 25;
let currentPage = 1;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const $ = id => document.getElementById(id);

const $statusBadge    = $('statusBadge');
const $statusText     = $('statusText');
const $btnRunCheck    = $('btnRunCheck');
const $btnStopQueue   = $('btnStopQueue');
const $langSelect     = $('langSelect');
const $addForm        = $('addTargetForm');
const $inputUrl       = $('inputUrl');
const $inputQuery     = $('inputQuery');
const $inputTag       = $('inputTag');
const $inputFolder    = $('inputFolder');
const $targetsBody    = $('targetsBody');
const $targetCount    = $('targetCount');
const $emptyState     = $('emptyState');
const $emptyText      = $('emptyText');
const $targetsTable   = $('targetsTable');
const $pagination     = $('pagination');
const $inputDelay     = $('inputDelay');
const $warningBanner  = $('warningBanner');
const $warningText    = $('warningText');
const $warningDismiss = $('warningDismiss');
const $btnExport      = $('btnExport');
const $btnImport      = $('btnImport');
const $importFile     = $('importFile');
const $lastSavedInfo  = $('lastSavedInfo');
const $btnSyncTo      = $('btnSyncTo');
const $btnSyncFrom    = $('btnSyncFrom');
const $syncStatus     = $('syncStatus');
const $inputApiKey    = $('inputApiKey');
const $inputSchedule  = $('inputSchedule');
const $btnSaveSettings = $('btnSaveSettings');
const $logsPanel      = $('logsPanel');
const $btnClearLogs   = $('btnClearLogs');
const $tagsList       = $('tagsList');
const $addTagForm     = $('addTagForm');
const $newTagName     = $('newTagName');
const $foldersList    = $('foldersList');
const $addFolderForm  = $('addFolderForm');
const $newFolderName  = $('newFolderName');
const $folderTabs     = $('folderTabs');
const $filterBar      = $('filterBar');
const $editModal      = $('editModal');
const $editForm       = $('editTargetForm');
const $editId         = $('editId');
const $editUrl        = $('editUrl');
const $editQuery      = $('editQuery');
const $editTag        = $('editTag');
const $editFolder     = $('editFolder');
const $btnCancelEdit  = $('btnCancelEdit');
const $btnOpenBulk    = $('btnOpenBulk');
const $bulkModal      = $('bulkModal');
const $bulkForm       = $('bulkForm');
const $bulkUrls       = $('bulkUrls');
const $bulkQuery      = $('bulkQuery');
const $bulkTag        = $('bulkTag');
const $bulkFolder     = $('bulkFolder');
const $bulkResult     = $('bulkResult');
const $btnCancelBulk  = $('btnCancelBulk');

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initI18n(() => refreshAll());

  $langSelect.addEventListener('change', async () => {
    await setLanguage($langSelect.value);
    refreshAll();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key in changes) cache[key] = changes[key].newValue;
    if (changes.targets) {
      renderFolderTabs();
      renderFilterBar();
      renderTargets();
    }
    if (changes.queue)    renderStatus();
    if (changes.logs)     renderLogs();
    if (changes.tags)     { renderTagsList(); renderTagSelects(); renderFilterBar(); }
    if (changes.folders)  { renderFolderTabs(); renderFolderSelects(); renderFoldersList(); }
  });
});

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function refreshAll() {
  cache = await getStorage([
    StorageKeys.TARGETS, StorageKeys.QUEUE, StorageKeys.SETTINGS,
    StorageKeys.LOGS, StorageKeys.TAGS, StorageKeys.FOLDERS
  ]);
  renderStatus();
  $inputApiKey.value = cache.settings.apiKey || '';
  $inputSchedule.value = cache.settings.schedule || 'daily';
  renderLogs();
  renderTagsList();
  renderTagSelects();
  renderFoldersList();
  renderFolderSelects();
  renderFolderTabs();
  renderFilterBar();
  renderTargets();
  renderWarning();
  renderLastExport();
}

// ---------------------------------------------------------------------------
// Folder tabs
// ---------------------------------------------------------------------------

function renderFolderTabs() {
  const targets  = cache.targets || [];
  const folders  = cache.folders || [];
  const all      = targets.length;
  const uncateg  = targets.filter(t => !t.folderId).length;

  let html = `<button class="folder-tab${activeFilters.folderId === null ? ' active' : ''}" data-folder="">${t('allTargets')} (${all})</button>`;

  if (uncateg > 0 && folders.length > 0) {
    html += `<button class="folder-tab${activeFilters.folderId === 'uncategorized' ? ' active' : ''}" data-folder="uncategorized">${t('uncategorized')} (${uncateg})</button>`;
  }

  folders.forEach(f => {
    const cnt   = targets.filter(t => t.folderId === f.id).length;
    const act   = activeFilters.folderId === f.id ? ' active' : '';
    html += `<button class="folder-tab${act}" data-folder="${f.id}">${escapeHtml(f.name)} (${cnt})</button>`;
  });

  $folderTabs.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function renderFilterBar() {
  const targets = cache.targets || [];
  const tags    = cache.tags || [];
  if (targets.length === 0) { $filterBar.innerHTML = ''; return; }

  let html = '';

  // Domain chips
  const domains = {};
  targets.forEach(t => { const d = extractDomain(t.url); domains[d] = (domains[d] || 0) + 1; });
  const domainEntries = Object.entries(domains).sort((a, b) => b[1] - a[1]);
  if (domainEntries.length > 1) {
    html += `<div class="filter-group"><span class="filter-label">${t('filterDomain')}</span>`;
    domainEntries.forEach(([dom, cnt]) => {
      const act = activeFilters.domain === dom ? ' active' : '';
      html += `<button class="filter-chip${act}" data-filter-domain="${escapeHtml(dom)}">${escapeHtml(dom)} (${cnt})</button>`;
    });
    html += '</div>';
  }

  // Tag chips
  if (tags.length > 1) {
    html += `<div class="filter-group"><span class="filter-label">${t('filterTag')}</span>`;
    tags.forEach(tag => {
      const cnt = targets.filter(t => t.tag === tag).length;
      if (!cnt) return;
      const act = activeFilters.tag === tag ? ' active' : '';
      html += `<button class="filter-chip${act}" data-filter-tag="${escapeHtml(tag)}">${escapeHtml(tagLabel(tag))} (${cnt})</button>`;
    });
    html += '</div>';
  }

  // Status chips
  const sFound = targets.filter(t => t.lastResult === true).length;
  const sMiss  = targets.filter(t => t.lastResult === false).length;
  const sPend  = targets.filter(t => t.lastResult === null).length;
  html += `<div class="filter-group"><span class="filter-label">${t('filterStatus')}</span>`;
  if (sFound) html += `<button class="filter-chip${activeFilters.status === 'found' ? ' active' : ''}" data-filter-status="found">${t('found')} (${sFound})</button>`;
  if (sMiss)  html += `<button class="filter-chip${activeFilters.status === 'not_found' ? ' active' : ''}" data-filter-status="not_found">${t('notFound')} (${sMiss})</button>`;
  if (sPend)  html += `<button class="filter-chip${activeFilters.status === 'pending' ? ' active' : ''}" data-filter-status="pending">${t('pending')} (${sPend})</button>`;
  html += '</div>';

  // Clear button
  const hasFilters = activeFilters.domain || activeFilters.tag || activeFilters.status;
  if (hasFilters) {
    html += `<button class="filter-clear" data-clear-filters>${t('clearFilters')}</button>`;
  }

  $filterBar.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Sort headers
// ---------------------------------------------------------------------------

function renderSortHeaders() {
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === currentSort.field) {
      th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// ---------------------------------------------------------------------------
// Targets — filter + sort + render
// ---------------------------------------------------------------------------

function getFilteredSorted() {
  let list = [...(cache.targets || [])];

  // Filter: folder
  if (activeFilters.folderId === 'uncategorized') {
    list = list.filter(t => !t.folderId);
  } else if (activeFilters.folderId) {
    list = list.filter(t => t.folderId === activeFilters.folderId);
  }

  // Filter: domain
  if (activeFilters.domain) {
    list = list.filter(t => extractDomain(t.url) === activeFilters.domain);
  }

  // Filter: tag
  if (activeFilters.tag) {
    list = list.filter(t => t.tag === activeFilters.tag);
  }

  // Filter: status
  if (activeFilters.status) {
    if (activeFilters.status === 'found')     list = list.filter(t => t.lastResult === true);
    if (activeFilters.status === 'not_found') list = list.filter(t => t.lastResult === false);
    if (activeFilters.status === 'pending')   list = list.filter(t => t.lastResult === null);
  }

  // Sort
  list.sort((a, b) => {
    let va, vb;
    switch (currentSort.field) {
      case 'url':         va = a.url.toLowerCase(); vb = b.url.toLowerCase(); break;
      case 'tag':         va = (a.tag || ''); vb = (b.tag || ''); break;
      case 'query':       va = a.query.toLowerCase(); vb = b.query.toLowerCase(); break;
      case 'status':
        va = a.lastResult === null ? 1 : a.lastResult ? 0 : 2;
        vb = b.lastResult === null ? 1 : b.lastResult ? 0 : 2;
        break;
      case 'lastChecked': va = a.lastChecked || 0; vb = b.lastChecked || 0; break;
      default:            va = a.createdAt || 0; vb = b.createdAt || 0; break;
    }
    if (typeof va === 'string') {
      const c = va.localeCompare(vb);
      return currentSort.direction === 'asc' ? c : -c;
    }
    return currentSort.direction === 'asc' ? va - vb : vb - va;
  });

  return list;
}

function renderTargets() {
  const all     = cache.targets || [];
  const visible = getFilteredSorted();

  renderSortHeaders();

  if (visible.length === 0) {
    $targetsTable.style.display = 'none';
    $pagination.style.display = 'none';
    $emptyState.style.display = 'block';
    $emptyText.textContent = all.length === 0 ? t('emptyState') : t('noMatches');
    $targetCount.textContent = all.length === 0 ? '' : `(0/${all.length})`;
    return;
  }

  // Clamp page
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = visible.slice(start, start + PAGE_SIZE);

  $targetsTable.style.display = '';
  $emptyState.style.display = 'none';
  $targetCount.textContent = visible.length === all.length
    ? `(${all.length})`
    : `(${visible.length}/${all.length})`;

  $targetsBody.innerHTML = page.map(tgt => `
    <tr>
      <td class="url-cell"><a href="${escapeHtml(tgt.url)}" target="_blank" rel="noopener" title="${escapeHtml(tgt.url)}">${escapeHtml(tgt.url)}</a></td>
      <td>${tagBadge(tgt.tag)}</td>
      <td class="query-cell" title="${escapeHtml(tgt.query)}">${escapeHtml(tgt.query)}</td>
      <td>${resultBadge(tgt.lastResult)}</td>
      <td>${formatDate(tgt.lastChecked)}</td>
      <td>${formatDate(tgt.createdAt)}</td>
      <td class="actions-cell">
        <button class="btn btn-ghost btn-sm" data-play="${tgt.id}" title="${t('checkOne')}">&#9654;</button>
        <button class="btn btn-ghost btn-sm" data-edit="${tgt.id}" title="${t('edit')}">&#9998;</button>
        <button class="btn btn-ghost btn-sm" data-delete="${tgt.id}" title="Delete">&#10005;</button>
      </td>
    </tr>
  `).join('');

  // Pagination controls
  if (totalPages <= 1) {
    $pagination.style.display = 'none';
    return;
  }
  $pagination.style.display = '';

  const rangeStart = start + 1;
  const rangeEnd   = Math.min(start + PAGE_SIZE, visible.length);

  $pagination.innerHTML = `
    <span class="pag-info">${t('pagRange').replace('{s}', rangeStart).replace('{e}', rangeEnd).replace('{t}', visible.length)}</span>
    <button class="btn btn-ghost btn-sm" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}>&larr;</button>
    <button class="btn btn-ghost btn-sm pag-num${currentPage === 1 ? ' active' : ''}" data-page="1">1</button>
    ${currentPage > 3 ? '<span class="pag-dots">...</span>' : ''}
    ${[currentPage - 1, currentPage, currentPage + 1].filter(p => p > 1 && p < totalPages).map(p =>
      `<button class="btn btn-ghost btn-sm pag-num${currentPage === p ? ' active' : ''}" data-page="${p}">${p}</button>`
    ).join('')}
    ${currentPage < totalPages - 2 ? '<span class="pag-dots">...</span>' : ''}
    ${totalPages > 1 ? `<button class="btn btn-ghost btn-sm pag-num${currentPage === totalPages ? ' active' : ''}" data-page="${totalPages}">${totalPages}</button>` : ''}
    <button class="btn btn-ghost btn-sm" data-page="next" ${currentPage === totalPages ? 'disabled' : ''}>&rarr;</button>
  `;
}

function resultBadge(lastResult) {
  if (lastResult === true)  return `<span class="result found">${t('found')}</span>`;
  if (lastResult === false) return `<span class="result not-found">${t('notFound')}</span>`;
  return `<span class="result pending">${t('pending')}</span>`;
}

function tagBadge(tag) {
  const label = tagLabel(tag || 'article');
  const c = tagColor(tag || 'article');
  return `<span class="tag-badge" style="background:${c.bg};color:${c.fg}">${escapeHtml(label)}</span>`;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function renderStatus() {
  const queue = cache.queue || { running: false };
  if (queue.running) {
    $statusBadge.className = 'status-badge running';
    $statusText.textContent = t('running');
    $btnRunCheck.disabled = true;
    $btnStopQueue.style.display = '';
  } else {
    $statusBadge.className = 'status-badge idle';
    $statusText.textContent = t('idle');
    $btnRunCheck.disabled = false;
    $btnStopQueue.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// Logs panel
// ---------------------------------------------------------------------------

function renderLogs() {
  const logs = cache.logs || [];
  if (logs.length === 0) {
    $logsPanel.innerHTML = `<div style="color:#64748b;padding:16px;text-align:center">${t('noLogs')}</div>`;
    return;
  }
  $logsPanel.innerHTML = logs.map(l => {
    const time = new Date(l.timestamp).toLocaleTimeString();
    return `<div class="log-entry"><span class="log-time">${time}</span><span>${escapeHtml(l.message)}</span></div>`;
  }).join('');
  $logsPanel.scrollTop = $logsPanel.scrollHeight;
}

// ---------------------------------------------------------------------------
// Tags management
// ---------------------------------------------------------------------------

function renderTagsList() {
  const tags = cache.tags || [];
  if (!tags.length) { $tagsList.innerHTML = ''; return; }
  $tagsList.innerHTML = tags.map(tag => {
    const c = tagColor(tag);
    return `<span class="tag-chip" style="background:${c.bg};color:${c.fg}">
      ${escapeHtml(tagLabel(tag))}
      <button class="tag-chip-remove" data-remove-tag="${escapeHtml(tag)}">&times;</button>
    </span>`;
  }).join('');
}

function renderTagSelects() {
  const tags = cache.tags || [];
  [$inputTag, $editTag, $bulkTag].forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = tags.map(tag =>
      `<option value="${escapeHtml(tag)}">${escapeHtml(tagLabel(tag))}</option>`
    ).join('');
    if (tags.includes(cur)) sel.value = cur;
  });
}

// ---------------------------------------------------------------------------
// Folders management
// ---------------------------------------------------------------------------

function renderFoldersList() {
  const folders = cache.folders || [];
  if (!folders.length) { $foldersList.innerHTML = ''; return; }
  $foldersList.innerHTML = folders.map(f => {
    return `<span class="tag-chip" style="background:#e0f2fe;color:#075985">
      ${escapeHtml(f.name)}
      <button class="tag-chip-remove" data-remove-folder="${f.id}">&times;</button>
    </span>`;
  }).join('');
}

function renderFolderSelects() {
  const folders = cache.folders || [];
  const options = `<option value="">${escapeHtml(t('noFolder'))}</option>` +
    folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  [$inputFolder, $editFolder, $bulkFolder].forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = options;
    if (cur) sel.value = cur;
  });
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

async function openEditModal(id) {
  const { targets } = await getStorage(StorageKeys.TARGETS);
  const tgt = targets.find(x => x.id === id);
  if (!tgt) return;
  $editId.value     = tgt.id;
  $editUrl.value    = tgt.url;
  $editQuery.value  = tgt.query;
  $editTag.value    = tgt.tag || 'article';
  $editFolder.value = tgt.folderId || '';
  $editModal.style.display = '';
}

function closeEditModal() { $editModal.style.display = 'none'; }

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Add target */
$addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url      = $inputUrl.value.trim();
  const query    = $inputQuery.value.trim();
  const tag      = $inputTag.value;
  const folderId = $inputFolder.value || null;
  if (!url || !query) return;
  await addTarget({ url, query, tag, folderId });
  $addForm.reset();
  $inputUrl.focus();
  await refreshAll();
});

/** Table row actions — delegated */
$targetsBody.addEventListener('click', async (e) => {
  const playBtn = e.target.closest('[data-play]');
  const editBtn = e.target.closest('[data-edit]');
  const delBtn  = e.target.closest('[data-delete]');

  if (playBtn) {
    playBtn.disabled = true;
    chrome.runtime.sendMessage({ action: 'checkSingle', targetId: playBtn.dataset.play }, () => {
      playBtn.disabled = false;
    });
    return;
  }
  if (editBtn) { openEditModal(editBtn.dataset.edit); return; }
  if (delBtn) { await deleteTarget(delBtn.dataset.delete); await refreshAll(); }
});

/** Pagination click — delegated */
$pagination.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn || btn.disabled) return;
  const val = btn.dataset.page;
  if (val === 'prev') currentPage--;
  else if (val === 'next') currentPage++;
  else currentPage = parseInt(val, 10);
  renderTargets();
  // Scroll table into view
  $targetsTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/** Save edit */
$editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id       = $editId.value;
  const url      = $editUrl.value.trim();
  const query    = $editQuery.value.trim();
  const tag      = $editTag.value;
  const folderId = $editFolder.value || null;
  if (!id || !url || !query) return;
  await updateTarget(id, { url, query, tag, folderId });
  closeEditModal();
  await refreshAll();
});

$btnCancelEdit.addEventListener('click', closeEditModal);
$editModal.addEventListener('click', (e) => { if (e.target === $editModal) closeEditModal(); });

// ----- Bulk import modal -----

$btnOpenBulk.addEventListener('click', () => {
  $bulkUrls.value = '';
  $bulkQuery.value = '';
  $bulkResult.style.display = 'none';
  $bulkResult.className = 'bulk-result';
  renderTagSelects();
  renderFolderSelects();
  $bulkModal.style.display = '';
});

$btnCancelBulk.addEventListener('click', () => { $bulkModal.style.display = 'none'; });
$bulkModal.addEventListener('click', (e) => { if (e.target === $bulkModal) $bulkModal.style.display = 'none'; });

$bulkForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw      = $bulkUrls.value;
  const query    = $bulkQuery.value.trim();
  const tag      = $bulkTag.value;
  const folderId = $bulkFolder.value || null;

  if (!query) return;

  // Parse URLs — one per line, trim, skip blanks, normalize
  const lines = raw.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  const urls  = [];
  for (const line of lines) {
    try {
      // Accept URLs with or without protocol
      const url = /^https?:\/\//i.test(line) ? line : 'https://' + line;
      new URL(url); // validate
      urls.push(url);
    } catch { /* skip invalid */ }
  }

  if (urls.length === 0) {
    $bulkResult.style.display = '';
    $bulkResult.className = 'bulk-result error';
    $bulkResult.textContent = t('bulkResultEmpty');
    return;
  }

  // Deduplicate against existing targets
  const { targets: existing } = await getStorage(StorageKeys.TARGETS);
  const existingSet = new Set(existing.map(t => t.url));
  let added = 0;
  let dupes = 0;
  for (const url of urls) {
    if (existingSet.has(url)) { dupes++; continue; }
    await addTarget({ url, query, tag, folderId });
    existingSet.add(url);
    added++;
  }

  // Show result
  let msg = t('bulkResultOk').replace('{n}', added);
  if (dupes > 0) msg += t('bulkResultDup').replace('{d}', dupes);
  $bulkResult.style.display = '';
  $bulkResult.className = 'bulk-result success';
  $bulkResult.textContent = msg;

  await refreshAll();
});

/** Folder tab click — delegated */
$folderTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-folder]');
  if (!btn) return;
  const val = btn.dataset.folder;
  activeFilters.folderId = val === '' ? null : val;
  currentPage = 1;
  renderFolderTabs();
  renderTargets();
});

/** Filter bar click — delegated */
$filterBar.addEventListener('click', (e) => {
  const chip  = e.target.closest('.filter-chip');
  const clear = e.target.closest('[data-clear-filters]');

  if (clear) {
    activeFilters = { folderId: null, domain: null, tag: null, status: null };
    currentPage = 1;
    renderFilterBar();
    renderFolderTabs();
    renderTargets();
    return;
  }

  if (!chip) return;

  if (chip.dataset.filterDomain !== undefined) {
    activeFilters.domain = activeFilters.domain === chip.dataset.filterDomain ? null : chip.dataset.filterDomain;
  } else if (chip.dataset.filterTag !== undefined) {
    activeFilters.tag = activeFilters.tag === chip.dataset.filterTag ? null : chip.dataset.filterTag;
  } else if (chip.dataset.filterStatus !== undefined) {
    activeFilters.status = activeFilters.status === chip.dataset.filterStatus ? null : chip.dataset.filterStatus;
  }
  renderFilterBar();
  renderTargets();
});

/** Column sort — delegated */
document.querySelector('#targetsTable thead').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-sort]');
  if (!th) return;
  const field = th.dataset.sort;
  if (currentSort.field === field) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort = { field, direction: 'asc' };
  }
  currentPage = 1;
  renderTargets();
});

/** Run / stop queue */
$btnRunCheck.addEventListener('click', async () => {
  await updateSettings({ checkDelay: parseInt($inputDelay.value, 10) || 60 });
  chrome.runtime.sendMessage({ action: 'startQueue' });
});
$btnStopQueue.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'stopQueue' }));

/** Save settings */
$btnSaveSettings.addEventListener('click', async () => {
  await updateSettings({
    apiBaseUrl: 'https://dash.looklinks.mom',
    apiKey: $inputApiKey.value.trim(),
    schedule: $inputSchedule.value
  });
  chrome.runtime.sendMessage({ action: 'updateSchedule' });
  const orig = $btnSaveSettings.textContent;
  $btnSaveSettings.textContent = t('saved');
  $btnSaveSettings.disabled = true;
  setTimeout(() => { $btnSaveSettings.textContent = t('save'); $btnSaveSettings.disabled = false; }, 1000);
});

/** Clear logs */
$btnClearLogs.addEventListener('click', async () => { await setStorage({ logs: [] }); renderLogs(); });

// ---------------------------------------------------------------------------
// Warning banner
// ---------------------------------------------------------------------------

function renderWarning() {
  const settings = cache.settings || {};
  const targets  = cache.targets || [];

  // No warning if no targets yet
  if (targets.length === 0) { $warningBanner.style.display = 'none'; return; }

  let msg = '';
  if (!settings.apiKey && !settings.lastExportAt) {
    msg = t('warningNoExport');
  } else if (!settings.apiKey) {
    msg = t('warningNoApi');
  }

  if (!msg) { $warningBanner.style.display = 'none'; return; }

  $warningText.textContent = msg;
  $warningBanner.style.display = '';
}

$warningDismiss.addEventListener('click', () => { $warningBanner.style.display = 'none'; });

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

function renderLastExport() {
  const last = cache.settings?.lastExportAt;
  if (!last) {
    $lastSavedInfo.textContent = t('neverExported');
    $lastSavedInfo.className = 'last-saved-info warn';
  } else {
    $lastSavedInfo.textContent = t('lastExported').replace('{d}', formatDate(last));
    $lastSavedInfo.className = 'last-saved-info';
  }
}

$btnExport.addEventListener('click', async () => {
  const data = await getStorage([
    StorageKeys.TARGETS, StorageKeys.SETTINGS, StorageKeys.TAGS, StorageKeys.FOLDERS
  ]);
  // Save export timestamp
  await updateSettings({ lastExportAt: Date.now() });

  const payload = {
    _exportedAt: new Date().toISOString(),
    _app: 'looklinks.mom',
    _version: '1.0',
    targets: data.targets,
    tags: data.tags,
    folders: data.folders,
    settings: {
      apiBaseUrl: 'https://dash.looklinks.mom',
      apiKey: data.settings.apiKey,
      schedule: data.settings.schedule,
      language: data.settings.language,
      checkDelay: data.settings.checkDelay
    }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const ts   = new Date().toISOString().slice(0, 10);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `looklinks-backup-${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);

  await refreshAll();
});

$btnImport.addEventListener('click', () => $importFile.click());

$importFile.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Basic validation
    if (!data._app || !Array.isArray(data.targets)) {
      alert(t('importFail'));
      return;
    }

    await setStorage({
      targets: data.targets || [],
      tags:    data.tags || ['article', 'comment', 'profile'],
      folders: data.folders || [],
      settings: {
        apiBaseUrl: 'https://dash.looklinks.mom',
        apiKey: data.settings?.apiKey || '',
        schedule: data.settings?.schedule || 'daily',
        language: data.settings?.language || 'en',
        checkDelay: data.settings?.checkDelay || 60,
        lastExportAt: Date.now()
      }
    });

    const msg = t('importOk').replace('{n}', (data.targets || []).length);
    alert(msg);
    await refreshAll();
  } catch {
    alert(t('importFail'));
  }

  // Reset file input so the same file can be re-imported
  $importFile.value = '';
});

// ----- Sync with dashboard -----

$btnSyncTo.addEventListener('click', async () => {
  $btnSyncTo.disabled = true;
  $syncStatus.textContent = 'Syncing...';
  try {
    const result = await chrome.runtime.sendMessage({ action: 'syncToDashboard' });
    if (result.success) {
      $syncStatus.textContent = `Synced! ${result.data.imported} new, ${result.data.updated} updated`;
      $syncStatus.className = 'last-saved-info';
    } else {
      $syncStatus.textContent = 'Failed: ' + (result.error || 'Unknown error');
      $syncStatus.className = 'last-saved-info warn';
    }
  } catch (err) {
    $syncStatus.textContent = 'Error: ' + err.message;
    $syncStatus.className = 'last-saved-info warn';
  }
  $btnSyncTo.disabled = false;
  setTimeout(() => { $syncStatus.textContent = ''; }, 5000);
});

$btnSyncFrom.addEventListener('click', async () => {
  $btnSyncFrom.disabled = true;
  $syncStatus.textContent = 'Syncing...';
  try {
    const result = await chrome.runtime.sendMessage({ action: 'syncFromDashboard' });
    if (result.success) {
      $syncStatus.textContent = `Synced! ${(result.data.targets || []).length} targets loaded`;
      $syncStatus.className = 'last-saved-info';
      await refreshAll();
    } else {
      $syncStatus.textContent = 'Failed: ' + (result.error || 'Unknown error');
      $syncStatus.className = 'last-saved-info warn';
    }
  } catch (err) {
    $syncStatus.textContent = 'Error: ' + err.message;
    $syncStatus.className = 'last-saved-info warn';
  }
  $btnSyncFrom.disabled = false;
  setTimeout(() => { $syncStatus.textContent = ''; }, 5000);
});

/** Add tag */
$addTagForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $newTagName.value.trim();
  if (!name) return;
  await addCustomTag(name);
  $addTagForm.reset();
  await refreshAll();
});

/** Remove tag */
$tagsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-remove-tag]');
  if (!btn) return;
  await removeCustomTag(btn.dataset.removeTag);
  await refreshAll();
});

/** Add folder */
$addFolderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $newFolderName.value.trim();
  if (!name) return;
  await addFolder(name);
  $addFolderForm.reset();
  await refreshAll();
});

/** Remove folder */
$foldersList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-remove-folder]');
  if (!btn) return;
  await removeFolder(btn.dataset.removeFolder);
  await refreshAll();
});
