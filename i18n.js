/**
 * i18n.js — Internationalization module for looklinks.mom
 * Supports English (primary) and Russian.
 */

const TRANSLATIONS = {
  en: {
    appName:            'looklinks.mom',
    idle:               'Idle',
    running:            'Running',
    runCheck:           'Run Check Now',
    delayLabel:         'Delay',
    stop:               'Stop',
    addTarget:          'Add Target',
    urlLabel:           'URL',
    urlPlaceholder:     'https://example.com/page',
    queryLabel:         'Query (text or regex)',
    queryPlaceholder:   'keyword or /regex/',
    add:                'Add',
    targets:            'Targets',
    thUrl:              'URL',
    thTag:              'Tag',
    thQuery:            'Query',
    thStatus:           'Status',
    thLastChecked:      'Last Checked',
    thAdded:            'Added',
    found:              'Found',
    notFound:           'Not Found',
    pending:            'Pending',
    emptyState:         'No targets yet. Add one above to get started.',
    noMatches:          'No targets match the current filters.',
    settings:           'Settings',
    apiBaseUrlLabel:    'API base URL',
    apiBaseUrlPlaceholder: 'https://your-dashboard host (no trailing slash)',
    apiKeyLabel:        'API Key',
    apiKeyPlaceholder:  'Leave empty to skip API calls',
    scheduleLabel:      'Check schedule',
    scheduleDaily:      'Once a day',
    scheduleWeekly:     'Once a week',
    scheduleMonthly:    'Once a month',
    save:               'Save',
    saved:              'Saved',
    export:             'Export',
    import:             'Import',
    exportOk:           'Data exported successfully.',
    importOk:           'Data imported: {n} targets restored.',
    importFail:         'Invalid file format.',
    lastExported:       'Last export: {d}',
    neverExported:      'Never exported',
    warningNoApi:       'Chrome may clear extension storage. Export your data or connect an API key to avoid data loss.',
    warningNoExport:    'You haven\'t exported your data yet. Chrome storage is not permanent — click Export to create a backup.',
    logs:               'Logs',
    clear:              'Clear',
    noLogs:             'No logs yet.',
    never:              'Never',
    tagLabel:           'Tag',
    tagArticle:         'Article',
    tagComment:         'Comment',
    tagProfile:         'Profile',
    tag_article:        'Article',
    tag_comment:        'Comment',
    tag_profile:        'Profile',
    editTarget:         'Edit Target',
    edit:               'Edit',
    cancel:             'Cancel',
    manageTags:         'Manage Tags',
    newTagLabel:        'New Tag',
    newTagPlaceholder:  'Tag name',
    addTag:             'Add Tag',
    checkOne:           'Check this link',
    // Folders
    folderLabel:        'Folder',
    noFolder:           'No folder',
    allTargets:         'All',
    uncategorized:      'Uncategorized',
    manageFolders:      'Manage Folders',
    newFolderLabel:     'New Folder',
    newFolderPlaceholder: 'Folder name',
    addFolder:          'Create',
    // Filters
    filterDomain:       'Domain',
    filterTag:          'Tag',
    filterStatus:       'Status',
    clearFilters:       'Clear filters',
    // Bulk import
    bulkAdd:            'Bulk Add',
    bulkTitle:          'Bulk Import',
    bulkUrlsLabel:      'URLs (one per line)',
    bulkUrlsPlaceholder: 'https://example.com/page1\nhttps://example.com/page2\nhttps://example.com/page3',
    bulkImport:         'Import',
    bulkResultOk:       'Added {n} targets.',
    bulkResultEmpty:    'No valid URLs found.',
    bulkResultDup:      ' ({d} duplicates skipped)',
    // Pagination
    pagRange:           '{s}\u2013{e} of {t}'
  },
  ru: {
    appName:            'looklinks.mom',
    idle:               'Ожидание',
    running:            'Выполнение',
    runCheck:           'Проверить сейчас',
    delayLabel:         'Задержка',
    stop:               'Остановить',
    addTarget:          'Добавить цель',
    urlLabel:           'URL',
    urlPlaceholder:     'https://example.com/page',
    queryLabel:         'Запрос (текст или regex)',
    queryPlaceholder:   'ключевое слово или /regex/',
    add:                'Добавить',
    targets:            'Цели',
    thUrl:              'URL',
    thTag:              'Метка',
    thQuery:            'Запрос',
    thStatus:           'Статус',
    thLastChecked:      'Последняя проверка',
    thAdded:            'Добавлено',
    found:              'Найдено',
    notFound:           'Не найдено',
    pending:            'Ожидает',
    emptyState:         'Нет целей. Добавьте первую выше.',
    noMatches:          'Нет целей, соответствующих текущим фильтрам.',
    settings:           'Настройки',
    apiBaseUrlLabel:    'Базовый URL API',
    apiBaseUrlPlaceholder: 'хост дашборда (без слэша в конце)',
    apiKeyLabel:        'API ключ',
    apiKeyPlaceholder:  'Оставьте пустым для пропуска API-запросов',
    scheduleLabel:      'Расписание проверок',
    scheduleDaily:      'Раз в день',
    scheduleWeekly:     'Раз в неделю',
    scheduleMonthly:    'Раз в месяц',
    save:               'Сохранить',
    saved:              'Сохранено',
    export:             'Экспорт',
    import:             'Импорт',
    exportOk:           'Данные успешно экспортированы.',
    importOk:           'Импортировано: {n} целей восстановлено.',
    importFail:         'Неверный формат файла.',
    lastExported:       'Последний экспорт: {d}',
    neverExported:      'Экспорт ещё не выполнялся',
    warningNoApi:       'Chrome может очистить хранилище расширений. Экспортируйте данные или подключите API ключ, чтобы не потерять их.',
    warningNoExport:    'Вы ещё не экспортировали данные. Хранилище Chrome непостоянно — нажмите Экспорт для создания резервной копии.',
    logs:               'Логи',
    clear:              'Очистить',
    noLogs:             'Логов пока нет.',
    never:              'Никогда',
    tagLabel:           'Метка',
    tagArticle:         'Статья',
    tagComment:         'Комментарий',
    tagProfile:         'Профиль',
    tag_article:        'Статья',
    tag_comment:        'Комментарий',
    tag_profile:        'Профиль',
    editTarget:         'Редактировать цель',
    edit:               'Изменить',
    cancel:             'Отмена',
    manageTags:         'Управление метками',
    newTagLabel:        'Новая метка',
    newTagPlaceholder:  'Название метки',
    addTag:             'Добавить метку',
    checkOne:           'Проверить ссылку',
    // Folders
    folderLabel:        'Папка',
    noFolder:           'Без папки',
    allTargets:         'Все',
    uncategorized:      'Без папки',
    manageFolders:      'Управление папками',
    newFolderLabel:     'Новая папка',
    newFolderPlaceholder: 'Название папки',
    addFolder:          'Создать',
    // Filters
    filterDomain:       'Домен',
    filterTag:          'Метка',
    filterStatus:       'Статус',
    clearFilters:       'Сбросить фильтры',
    // Bulk import
    bulkAdd:            'Массовое добавление',
    bulkTitle:          'Массовый импорт',
    bulkUrlsLabel:      'Ссылки (по одной на строку)',
    bulkUrlsPlaceholder: 'https://example.com/page1\nhttps://example.com/page2\nhttps://example.com/page3',
    bulkImport:         'Импортировать',
    bulkResultOk:       'Добавлено {n} целей.',
    bulkResultEmpty:    'Валидных ссылок не найдено.',
    bulkResultDup:      ' ({d} дубликатов пропущено)',
    // Pagination
    pagRange:           '{s}\u2013{e} из {t}'
  }
};

let currentLang = 'en';

/** Get a translated string by key. Falls back to English, then to the raw key. */
function t(key) {
  return TRANSLATIONS[currentLang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}

/** Load saved language, apply translations, then call onReady. */
async function initI18n(onReady) {
  const data = await chrome.storage.local.get('settings');
  const settings = data.settings || {};
  currentLang = settings.language || 'en';

  const sel = document.getElementById('langSelect');
  if (sel) sel.value = currentLang;

  applyTranslations();
  if (onReady) onReady();
}

/** Apply translations to all [data-i18n] and [data-i18n-placeholder] elements. */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.documentElement.lang = currentLang;
}

/** Switch to a new language, persist, and re-apply. */
async function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  const data = await chrome.storage.local.get('settings');
  const settings = data.settings || {};
  settings.language = lang;
  await chrome.storage.local.set({ settings });
  applyTranslations();
}
