const STORAGE_KEY = 'watchvault_v2_data';
const PREFS_KEY = 'watchvault_v2_prefs';

let state = {
    items: [],
    deletedCache: null
};

let prefs = {
    activeTab: 'home', // 'home', 'anime', 'series', 'stats', 'settings'
    folder: 'anime', // sub-folder of anime view ('anime' or 'anime-film')
    searchAnime: '',
    searchSeries: '',
    sortAnime: 'recent',
    sortSeries: 'recent',
    filterAnime: 'all',
    filterSeries: 'all',
    langFilter: 'all',
    addTabAnime: 'single',
    addTabSeries: 'single'
};

const EP_CATS = new Set(['anime', 'series']);
let editingId = null;
let deleteTargetId = null;
let changeCounter = 0;
let deferredPrompt = null;

// --- INITIALIZATION ---
function init() {
    loadState();
    bindEvents();
    applyPrefs();
    switchTab(prefs.activeTab);
    registerPWA();
}

function loadState() {
    try {
        state.items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        state.items = [];
    }
    try {
        prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
    } catch {
        // use defaults
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    changeCounter++;
    if (changeCounter % 30 === 0) showToast("Consider exporting a data backup under Settings!");
}

// --- BIND EVENTS ---
function bindEvents() {
    // Top & Bottom Navigation clicks
    document.querySelectorAll('.nav-item-desktop, .bottom-nav .nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Folder sub-tabs under Anime
    document.querySelectorAll('.folder-tab').forEach(tab => {
        tab.addEventListener('click', () => switchFolder(tab.dataset.folder));
    });

    // Add Desktop Single/Bulk Tab Toggles
    document.querySelectorAll('#add-tabs-anime .add-tab').forEach(t => {
        t.addEventListener('click', () => switchAddTab('anime', t.dataset.tab));
    });
    document.querySelectorAll('#add-tabs-series .add-tab').forEach(t => {
        t.addEventListener('click', () => switchAddTab('series', t.dataset.tab));
    });

    // Search and Sort
    document.getElementById('inp-search-anime').addEventListener('input', (e) => {
        prefs.searchAnime = e.target.value;
        renderActiveTab();
        saveState();
    });
    document.getElementById('inp-search-series').addEventListener('input', (e) => {
        prefs.searchSeries = e.target.value;
        renderActiveTab();
        saveState();
    });
    document.getElementById('inp-sort-anime').addEventListener('change', (e) => {
        prefs.sortAnime = e.target.value;
        renderActiveTab();
        saveState();
    });
    document.getElementById('inp-sort-series').addEventListener('change', (e) => {
        prefs.sortSeries = e.target.value;
        renderActiveTab();
        saveState();
    });
    document.getElementById('inp-lang-filter-series').addEventListener('change', (e) => {
        prefs.langFilter = e.target.value;
        renderActiveTab();
        saveState();
    });

    // Status Pills Filtering
    document.querySelectorAll('#status-filters-anime .pill').forEach(pill => {
        pill.addEventListener('click', () => {
            prefs.filterAnime = pill.dataset.status;
            document.querySelectorAll('#status-filters-anime .pill').forEach(p => p.classList.toggle('active', p.dataset.status === prefs.filterAnime));
            renderActiveTab();
            saveState();
        });
    });
    document.querySelectorAll('#status-filters-series .pill').forEach(pill => {
        pill.addEventListener('click', () => {
            prefs.filterSeries = pill.dataset.status;
            document.querySelectorAll('#status-filters-series .pill').forEach(p => p.classList.toggle('active', p.dataset.status === prefs.filterSeries));
            renderActiveTab();
            saveState();
        });
    });

    // Add Form executions (Desktop)
    document.getElementById('btn-add-single-anime').addEventListener('click', () => addSingle('anime'));
    document.getElementById('inp-title-anime').addEventListener('keydown', e => { if (e.key === 'Enter') addSingle('anime'); });
    document.getElementById('btn-add-bulk-anime').addEventListener('click', () => addBulk('anime'));

    document.getElementById('btn-add-single-series').addEventListener('click', () => addSingle('series'));
    document.getElementById('inp-title-series').addEventListener('keydown', e => { if (e.key === 'Enter') addSingle('series'); });
    document.getElementById('btn-add-bulk-series').addEventListener('click', () => addBulk('series'));

    // Floating Button (Mobile FAB)
    const fabBtn = document.getElementById('fab-add-btn');
    fabBtn.addEventListener('click', () => {
        document.getElementById('add-modal').classList.add('active');
        document.getElementById('add-title').focus();
    });

    // Add Title Modal (Mobile FAB execution)
    document.getElementById('btn-add-cancel').addEventListener('click', closeAddModal);
    document.getElementById('btn-add-save').addEventListener('click', executeAddModal);
    document.getElementById('add-cat').addEventListener('change', (e) => {
        const langField = document.getElementById('add-lang-field');
        if (e.target.value === 'series') {
            langField.classList.remove('hidden');
        } else {
            langField.classList.add('hidden');
            document.getElementById('add-lang').value = '';
        }
    });

    // Add Mobile Single/Bulk Tab Toggles
    document.querySelectorAll('#modal-add-tabs .add-tab').forEach(t => {
        t.addEventListener('click', () => switchMobileAddTab(t.dataset.tab));
    });

    // Mobile Add Bulk Category Change
    document.getElementById('add-bulk-cat').addEventListener('change', (e) => {
        const langField = document.getElementById('add-bulk-lang-field');
        if (e.target.value === 'series') {
            langField.classList.remove('hidden');
        } else {
            langField.classList.add('hidden');
            document.getElementById('add-bulk-lang').value = '';
        }
    });

    // Mobile Add Bulk Execute
    document.getElementById('btn-add-bulk-save').addEventListener('click', executeMobileBulkAdd);

    // Edit Modal Actions
    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('btn-modal-save').addEventListener('click', saveModal);
    document.getElementById('edit-modal').addEventListener('click', e => {
        if (e.target.id === 'edit-modal') closeModal();
    });

    // Confirm Modal Actions
    document.getElementById('btn-confirm-cancel').addEventListener('click', closeConfirmModal);
    document.getElementById('btn-confirm-delete').addEventListener('click', () => {
        if (deleteTargetId !== null) {
            deleteItem(deleteTargetId);
            closeConfirmModal();
        }
    });
    document.getElementById('confirm-modal').addEventListener('click', e => {
        if (e.target.id === 'confirm-modal') closeConfirmModal();
    });

    // Global Key Bindings
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            if (prefs.activeTab === 'anime') {
                document.getElementById('inp-search-anime').focus();
            } else if (prefs.activeTab === 'series') {
                document.getElementById('inp-search-series').focus();
            }
        }
        if (e.key === 'Escape') {
            closeModal();
            closeAddModal();
            closeConfirmModal();
        }
    });

    // Settings view Actions
    document.getElementById('btn-export-settings').addEventListener('click', exportData);
    document.getElementById('inp-import-settings').addEventListener('change', importData);
    
    // Header actions
    document.getElementById('btn-export-header').addEventListener('click', exportData);
    document.getElementById('inp-import-header').addEventListener('change', importData);
}

// --- TAB SWITCHER LOGIC ---
function switchTab(tabName) {
    prefs.activeTab = tabName;

    // Desktop nav highlight
    document.querySelectorAll('.nav-item-desktop').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Mobile bottom nav highlight
    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Tab Views display toggle
    document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.toggle('active', view.id === `view-${tabName}`);
    });

    // Render active view
    renderActiveTab();
    saveState();
}

function applyPrefs() {
    document.getElementById('inp-search-anime').value = prefs.searchAnime;
    document.getElementById('inp-search-series').value = prefs.searchSeries;
    document.getElementById('inp-sort-anime').value = prefs.sortAnime;
    document.getElementById('inp-sort-series').value = prefs.sortSeries;

    document.querySelectorAll('#status-filters-anime .pill').forEach(p => p.classList.toggle('active', p.dataset.status === prefs.filterAnime));
    document.querySelectorAll('#status-filters-series .pill').forEach(p => p.classList.toggle('active', p.dataset.status === prefs.filterSeries));

    switchAddTab('anime', prefs.addTabAnime, true);
    switchAddTab('series', prefs.addTabSeries, true);
    
    // Standalone PWA detection and header buttons update
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    document.getElementById('desktop-actions').classList.toggle('hidden', isStandalone);
}

function switchFolder(folder) {
    prefs.folder = folder;
    document.querySelectorAll('.folder-tab').forEach(t => t.classList.toggle('active', t.dataset.folder === folder));
    renderActiveTab();
    saveState();
}

function switchAddTab(category, tab, bypassRender = false) {
    if (category === 'anime') {
        prefs.addTabAnime = tab;
        document.querySelectorAll('#add-tabs-anime .add-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        document.getElementById('tab-single-anime').classList.toggle('active', tab === 'single');
        document.getElementById('tab-bulk-anime').classList.toggle('active', tab === 'bulk');
    } else {
        prefs.addTabSeries = tab;
        document.querySelectorAll('#add-tabs-series .add-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        document.getElementById('tab-single-series').classList.toggle('active', tab === 'single');
        document.getElementById('tab-bulk-series').classList.toggle('active', tab === 'bulk');
    }
    if (!bypassRender) saveState();
}

// --- ADD ITEM FUNCTIONS ---
function addSingle(category) {
    const titleInp = document.getElementById(category === 'anime' ? 'inp-title-anime' : 'inp-title-series');
    const title = titleInp.value.trim();
    if (!title) return titleInp.focus();

    // In 'anime', single additions go to whichever folder is active ('anime' or 'anime-film')
    const cat = category === 'anime' ? prefs.folder : 'series';

    if (state.items.some(i => i.title.toLowerCase() === title.toLowerCase() && i.cat === cat)) {
        return showToast('Title already exists in this folder!');
    }

    let lang = null;
    if (cat === 'series') {
        lang = document.getElementById('inp-lang-series').value.trim() || null;
    }

    createItem(title, cat, lang);
    titleInp.value = '';
    if (cat === 'series') {
        document.getElementById('inp-lang-series').value = '';
    }
    
    renderActiveTab();
    showToast('Added: ' + title);
}

function addBulk(category) {
    const bulkInp = document.getElementById(category === 'anime' ? 'bulk-input-anime' : 'bulk-input-series');
    const lines = bulkInp.value.split('\n').map(l => l.trim()).filter(l => l);
    if (!lines.length) return bulkInp.focus();

    const cat = category === 'anime' ? prefs.folder : 'series';
    const existing = new Set(state.items.filter(i => i.cat === cat).map(i => i.title.toLowerCase()));

    let added = 0;
    lines.forEach(title => {
        if (!existing.has(title.toLowerCase())) {
            existing.add(title.toLowerCase());
            createItem(title, cat, null, false);
            added++;
        }
    });

    if (added > 0) {
        bulkInp.value = '';
        saveState();
        renderActiveTab();
        showToast(`Added ${added} titles!`);
    } else {
        showToast('No new titles added (all duplicates).');
    }
}

function executeAddModal() {
    const titleInp = document.getElementById('add-title');
    const title = titleInp.value.trim();
    const cat = document.getElementById('add-cat').value;
    if (!title) return titleInp.focus();

    if (state.items.some(i => i.title.toLowerCase() === title.toLowerCase() && i.cat === cat)) {
        return showToast('Title already exists in this folder!');
    }

    let lang = null;
    if (cat === 'series') {
        lang = document.getElementById('add-lang').value.trim() || null;
    }

    createItem(title, cat, lang);
    
    titleInp.value = '';
    document.getElementById('add-lang').value = '';
    closeAddModal();

    // Route view to the new item
    if (cat === 'series') {
        switchTab('series');
    } else {
        switchTab('anime');
        switchFolder(cat);
    }
    showToast('Added: ' + title);
}

function switchMobileAddTab(tab) {
    document.querySelectorAll('#modal-add-tabs .add-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.getElementById('modal-tab-single').classList.toggle('active', tab === 'single');
    document.getElementById('modal-tab-bulk').classList.toggle('active', tab === 'bulk');
    
    const btnSaveSingle = document.getElementById('btn-add-save');
    const btnSaveBulk = document.getElementById('btn-add-bulk-save');
    
    if (tab === 'single') {
        btnSaveSingle.classList.remove('hidden');
        btnSaveBulk.classList.add('hidden');
        document.getElementById('add-title').focus();
    } else {
        btnSaveSingle.classList.add('hidden');
        btnSaveBulk.classList.remove('hidden');
        document.getElementById('add-bulk-textarea').focus();
    }
}

function executeMobileBulkAdd() {
    const bulkInp = document.getElementById('add-bulk-textarea');
    const lines = bulkInp.value.split('\n').map(l => l.trim()).filter(l => l);
    if (!lines.length) return bulkInp.focus();

    const cat = document.getElementById('add-bulk-cat').value;
    const existing = new Set(state.items.filter(i => i.cat === cat).map(i => i.title.toLowerCase()));

    let lang = null;
    if (cat === 'series') {
        lang = document.getElementById('add-bulk-lang').value.trim() || null;
    }

    let added = 0;
    lines.forEach(title => {
        if (!existing.has(title.toLowerCase())) {
            existing.add(title.toLowerCase());
            createItem(title, cat, lang, false);
            added++;
        }
    });

    if (added > 0) {
        bulkInp.value = '';
        if (cat === 'series') {
            document.getElementById('add-bulk-lang').value = '';
        }
        saveState();
        closeAddModal();
        
        // Route view to the new items
        if (cat === 'series') {
            switchTab('series');
        } else {
            switchTab('anime');
            switchFolder(cat);
        }
        showToast(`Added ${added} titles!`);
    } else {
        showToast('No new titles added (all duplicates).');
    }
}

function closeAddModal() {
    document.getElementById('add-modal').classList.remove('active');
    document.getElementById('add-title').value = '';
    document.getElementById('add-lang').value = '';
    document.getElementById('add-bulk-textarea').value = '';
    document.getElementById('add-bulk-lang').value = '';
    
    // Reset category dropdowns to default ('anime') and hide language fields
    document.getElementById('add-cat').value = 'anime';
    document.getElementById('add-lang-field').classList.add('hidden');
    document.getElementById('add-bulk-cat').value = 'anime';
    document.getElementById('add-bulk-lang-field').classList.add('hidden');
    
    // Revert tab back to single tab view
    switchMobileAddTab('single');
}

function createItem(title, cat, lang = null, autoSave = true) {
    state.items.unshift({
        id: Date.now() + Math.random(),
        title, cat, lang,
        done: false,
        airing: false,
        added: new Date().toISOString(),
        updated: new Date().toISOString(),
        sCur: 1, sTot: null,
        epCur: 0, epTot: null
    });
    if (autoSave) saveState();
}

// --- EDIT MODAL FUNCTIONS ---
window.openEdit = function (id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    editingId = id;

    document.getElementById('edit-title').value = item.title;
    const epFields = document.getElementById('edit-ep-fields');
    const editLangField = document.getElementById('edit-lang-field');
    const editLangInput = document.getElementById('edit-lang');

    if (item.cat === 'series') {
        editLangField.classList.remove('hidden');
        editLangInput.value = item.lang || '';
    } else {
        editLangField.classList.add('hidden');
        editLangInput.value = '';
    }

    if (EP_CATS.has(item.cat)) {
        epFields.classList.remove('hidden');
        document.getElementById('edit-s-cur').value = item.sCur || 1;
        document.getElementById('edit-s-tot').value = item.sTot || '';
        document.getElementById('edit-ep-cur').value = item.epCur || 0;
        document.getElementById('edit-ep-tot').value = item.epTot || '';
    } else {
        epFields.classList.add('hidden');
    }
    document.getElementById('edit-modal').classList.add('active');
};

function closeModal() {
    document.getElementById('edit-modal').classList.remove('active');
    editingId = null;
}

function saveModal() {
    const item = state.items.find(i => i.id === editingId);
    if (!item) return closeModal();

    const newTitle = document.getElementById('edit-title').value.trim();
    if (!newTitle) return;

    item.title = newTitle;

    if (item.cat === 'series') {
        item.lang = document.getElementById('edit-lang').value.trim() || null;
    } else {
        item.lang = null;
    }

    if (EP_CATS.has(item.cat)) {
        item.sCur = parseInt(document.getElementById('edit-s-cur').value) || 1;
        item.sTot = parseInt(document.getElementById('edit-s-tot').value) || null;
        const oldEp = item.epCur;
        item.epCur = parseInt(document.getElementById('edit-ep-cur').value) || 0;
        item.epTot = parseInt(document.getElementById('edit-ep-tot').value) || null;

        // Validations
        if (item.sTot && item.sCur > item.sTot) item.sCur = item.sTot;
        if (item.epTot && item.epCur > item.epTot) item.epCur = item.epTot;

        // Status Resolution (PTW -> Watching if ep > 0)
        if (oldEp === 0 && item.epCur > 0) {
            item.done = false;
        }
        item.updated = new Date().toISOString();
    }

    saveState();
    renderActiveTab();
    closeModal();
    showToast('Changes saved.');
}

// --- EPISODE AND STATE QUICK ACTIONS ---
window.changeEp = function (id, delta) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    
    const oldEp = item.epCur || 0;
    item.epCur = Math.max(0, oldEp + delta);
    if (item.epTot && item.epCur > item.epTot) item.epCur = item.epTot;
    
    // Automatically promotion to "Watching" if ep goes from 0 -> >0 and not watched
    if (oldEp === 0 && item.epCur > 0 && !item.done) {
        // promoted
    }

    item.updated = new Date().toISOString();
    saveState();
    renderActiveTab();
};

window.toggleWatched = function (id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    item.done = !item.done;
    if (item.done) {
        item.airing = false;
        if (item.epTot && item.epCur < item.epTot) {
            item.epCur = item.epTot; // Auto complete
        }
    }
    item.updated = new Date().toISOString();
    saveState();
    renderActiveTab();
};

window.toggleAiring = function (id) {
    const item = state.items.find(i => i.id === id);
    if (!item || item.done) return;
    item.airing = !item.airing;
    item.updated = new Date().toISOString();
    saveState();
    renderActiveTab();
};

// --- DELETE CONFIRMATION MODAL FUNCTIONS ---
window.confirmDelete = function (id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    deleteTargetId = id;
    document.getElementById('confirm-item-title').textContent = item.title;
    document.getElementById('confirm-modal').classList.add('active');
};

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('active');
    deleteTargetId = null;
}

window.deleteItem = function (id) {
    const idx = state.items.findIndex(i => i.id === id);
    if (idx === -1) return;
    state.deletedCache = { item: state.items[idx], index: idx };
    state.items.splice(idx, 1);
    saveState();
    renderActiveTab();

    const toast = document.getElementById('toast');
    toast.innerHTML = `Item deleted. <button class="toast-undo" onclick="undoDelete()">Undo</button>`;
    toast.classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => { toast.classList.remove('show'); state.deletedCache = null; }, 5000);
};

window.undoDelete = function () {
    if (state.deletedCache) {
        state.items.splice(state.deletedCache.index, 0, state.deletedCache.item);
        state.deletedCache = null;
        saveState();
        renderActiveTab();
        document.getElementById('toast').classList.remove('show');
    }
};

// --- RENDERING TABS FLOW ---
function renderActiveTab() {
    updateCategoryCountBadges();

    if (prefs.activeTab === 'home') {
        renderHomeDashboard();
    } else if (prefs.activeTab === 'anime') {
        renderAnimeView();
    } else if (prefs.activeTab === 'series') {
        renderSeriesView();
    } else if (prefs.activeTab === 'stats') {
        renderStatsDashboard();
    }
}

// --- 1. RENDER HOME DASHBOARD ---
function renderHomeDashboard() {
    // Continue Watching rendering (Watching: not done & ep > 0)
    const watchingList = state.items.filter(i => !i.done && i.epCur > 0).sort((a, b) => new Date(b.updated) - new Date(a.updated));
    const secCW = document.getElementById('sec-continue-watching');
    const containerCW = document.getElementById('continue-watching-container');

    if (watchingList.length > 0) {
        secCW.classList.remove('hidden');
        containerCW.innerHTML = watchingList.map(generateCWCard).join('');
    } else {
        secCW.classList.add('hidden');
        containerCW.innerHTML = '';
    }

    // Recently Added (limit 5)
    const addedList = [...state.items].sort((a, b) => new Date(b.added) - new Date(a.added)).slice(0, 5);
    const containerAdded = document.getElementById('recent-added-container');
    if (addedList.length > 0) {
        containerAdded.innerHTML = addedList.map(generateCompactCard).join('');
    } else {
        containerAdded.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🍿</div><p>🎉 Nothing added yet. Go to Anime or Series to start your watchlist!</p></div>`;
    }

    // Recently Updated (limit 5)
    const updatedList = [...state.items].sort((a, b) => new Date(b.updated) - new Date(a.updated)).slice(0, 5);
    const containerUpdated = document.getElementById('recent-updated-container');
    if (updatedList.length > 0) {
        containerUpdated.innerHTML = updatedList.map(generateCompactCard).join('');
    } else {
        containerUpdated.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🍿</div><p>No recent activity detected.</p></div>`;
    }
}

// --- 2. RENDER ANIME VIEW ---
function renderAnimeView() {
    let list = state.items.filter(i => i.cat === prefs.folder);

    // Search query filter
    const q = prefs.searchAnime.toLowerCase();
    if (q) list = list.filter(i => i.title.toLowerCase().includes(q));

    // Status filter
    if (prefs.filterAnime === 'watching') list = list.filter(i => !i.done && i.epCur > 0);
    else if (prefs.filterAnime === 'ptw') list = list.filter(i => !i.done && (!i.epCur || i.epCur === 0));
    else if (prefs.filterAnime === 'watched') list = list.filter(i => i.done);
    else if (prefs.filterAnime === 'airing') list = list.filter(i => i.airing && !i.done);

    // Sorting
    sortItemsList(list, prefs.sortAnime);

    const container = document.getElementById('list-container-anime');
    if (!list.length) {
        const emptyEmoji = prefs.folder === 'anime' ? '⛩️' : '🎌';
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${emptyEmoji}</div><p>🎉 Nothing here yet. Start building your watchlist.</p></div>`;
        return;
    }
    container.innerHTML = `<div class="list">${list.map(generateCard).join('')}</div>`;
}

// --- 3. RENDER SERIES VIEW ---
function renderSeriesView() {
    let list = state.items.filter(i => i.cat === 'series');

    // Language filter dropdown dynamic options population
    populateLanguageFilterDropdown();

    // Apply language filter
    if (prefs.langFilter !== 'all') {
        list = list.filter(i => i.lang && i.lang.trim().toLowerCase() === prefs.langFilter.toLowerCase());
    }

    // Search query filter
    const q = prefs.searchSeries.toLowerCase();
    if (q) list = list.filter(i => i.title.toLowerCase().includes(q));

    // Status filter
    if (prefs.filterSeries === 'watching') list = list.filter(i => !i.done && i.epCur > 0);
    else if (prefs.filterSeries === 'ptw') list = list.filter(i => !i.done && (!i.epCur || i.epCur === 0));
    else if (prefs.filterSeries === 'watched') list = list.filter(i => i.done);
    else if (prefs.filterSeries === 'airing') list = list.filter(i => i.airing && !i.done);

    // Sorting
    sortItemsList(list, prefs.sortSeries);

    const container = document.getElementById('list-container-series');
    if (!list.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📺</div><p>🎉 Nothing here yet. Start building your watchlist.</p></div>`;
        return;
    }
    container.innerHTML = `<div class="list">${list.map(generateCard).join('')}</div>`;
}

// --- 4. RENDER STATS DASHBOARD ---
function renderStatsDashboard() {
    const container = document.getElementById('stats-dashboard-grid');
    if (!container) return;

    const total = state.items.length;
    const watching = state.items.filter(i => !i.done && i.epCur > 0).length;
    const watched = state.items.filter(i => i.done).length;
    const ptw = state.items.filter(i => !i.done && (!i.epCur || i.epCur === 0)).length;
    const airing = state.items.filter(i => i.airing && !i.done).length;
    const compPct = total ? Math.round((watched / total) * 100) : 0;

    container.innerHTML = `
        <div class="stat-card" style="animation-delay: 0s;">
            <div class="stat-val" style="color: var(--fuchsia);">${total}</div>
            <div class="stat-lbl">Total Titles</div>
        </div>
        <div class="stat-card" style="animation-delay: 0.05s;">
            <div class="stat-val" style="color: #3B82F6;">${watching}</div>
            <div class="stat-lbl">Watching</div>
        </div>
        <div class="stat-card" style="animation-delay: 0.1s;">
            <div class="stat-val" style="color: #16A34A;">${watched}</div>
            <div class="stat-lbl">Watched</div>
        </div>
        <div class="stat-card" style="animation-delay: 0.15s;">
            <div class="stat-val" style="color: var(--gold);">${ptw}</div>
            <div class="stat-lbl">Plan to Watch</div>
        </div>
        <div class="stat-card" style="animation-delay: 0.2s;">
            <div class="stat-val" style="color: var(--teal);">${airing}</div>
            <div class="stat-lbl">Airing</div>
        </div>
        <div class="stat-card" style="animation-delay: 0.25s;">
            <div class="stat-val" style="color: var(--fuchsia);">${compPct}%</div>
            <div class="stat-lbl">Completion %</div>
        </div>
    `;
}

// --- HELPER COMPILING UTILITIES ---
function sortItemsList(list, sortPref) {
    list.sort((a, b) => {
        switch (sortPref) {
            case 'oldest': return new Date(a.added) - new Date(b.added);
            case 'updated': return new Date(b.updated) - new Date(a.updated);
            case 'az': return a.title.localeCompare(b.title);
            case 'za': return b.title.localeCompare(a.title);
            case 'prog-high':
                return ((b.epCur || 0) / (b.epTot || 1)) - ((a.epCur || 0) / (a.epTot || 1));
            case 'prog-low':
                return ((a.epCur || 0) / (a.epTot || 1)) - ((b.epCur || 0) / (b.epTot || 1));
            default: // recent
                return new Date(b.added) - new Date(a.added);
        }
    });
}

function populateLanguageFilterDropdown() {
    const filter = document.getElementById('inp-lang-filter-series');
    if (!filter) return;
    
    // Save current selection
    const currentSel = prefs.langFilter;

    // Extract unique languages
    const uniqueLangs = Array.from(new Set(
        state.items
            .filter(i => i.cat === 'series' && i.lang)
            .map(i => i.lang.trim())
    )).sort();

    let options = '<option value="all">All Languages</option>';
    uniqueLangs.forEach(lang => {
        options += `<option value="${escapeHTML(lang)}">${escapeHTML(lang)}</option>`;
    });
    
    filter.innerHTML = options;
    filter.value = uniqueLangs.some(l => l.toLowerCase() === currentSel.toLowerCase()) ? currentSel : 'all';
}

function updateCategoryCountBadges() {
    const cats = ['anime', 'anime-film', 'series'];
    cats.forEach(c => {
        const el = document.getElementById(`tc-${c}`);
        if (el) el.textContent = state.items.filter(i => i.cat === c).length;
    });
}

// --- CARD TEMPLATE GENERATORS ---

// 1. Regular Title List Card
function generateCard(i) {
    const isWatched = i.done;
    const isWatching = !i.done && (i.epCur > 0);
    const isPTW = !i.done && (!i.epCur || i.epCur === 0);

    let badges = '';
    if (isWatching) badges += `<span class="badge watching">Watching</span>`;
    if (isPTW) badges += `<span class="badge ptw">Plan to Watch</span>`;
    if (i.airing && !isWatched) badges += `<span class="badge airing">Airing</span>`;
    if (isWatched) badges += `<span class="badge watched">Watched</span>`;
    if (i.cat === 'series' && i.lang) {
        badges += `<span class="badge language">${escapeHTML(i.lang)}</span>`;
    }

    let epHtml = '';
    if (EP_CATS.has(i.cat)) {
        const cur = i.epCur || 0;
        const tot = i.epTot || '?';
        const sCur = i.sCur || 1;
        const progress = i.epTot ? Math.min(100, Math.round((cur / i.epTot) * 100)) : (isWatched ? 100 : 0);

        epHtml = `
      <div class="ep-tracker">
        <div class="ep-header">
            <span class="ep-text">S${sCur} • Ep ${cur} / ${tot}</span>
            <span class="ep-percentage">${progress}%</span>
        </div>
        <div class="ep-controls-bar">
            <div class="ep-progress-wrap">
                <div class="ep-progress-bar" style="width: ${progress}%"></div>
            </div>
            <div class="ep-controls">
                <button class="btn-ep" onclick="changeEp(${i.id}, -1)">−</button>
                <button class="btn-ep" onclick="changeEp(${i.id}, 1)">+</button>
            </div>
        </div>
      </div>`;
    }

    const airingBtnHtml = EP_CATS.has(i.cat) ? `
      <button class="btn-action" onclick="toggleAiring(${i.id})" title="Toggle Airing" ${isWatched ? 'disabled' : ''}>
        <i class="fa-solid fa-satellite-dish"></i>
      </button>` : '';

    return `
    <div class="card ${isWatched ? 'watched' : ''} ${i.airing && !isWatched ? 'airing' : ''}">
      <label class="card-checkbox-label" title="${isWatched ? 'Mark Unwatched' : 'Mark Watched'}">
        <input type="checkbox" class="card-checkbox" ${isWatched ? 'checked' : ''} onchange="toggleWatched(${i.id})">
        <span class="custom-checkbox"></span>
      </label>
      <div class="card-body">
        <div class="card-title-row">
          <span class="card-title">${escapeHTML(i.title)}</span>
        </div>
        <div class="card-meta">
            ${badges}
            <span>Added ${new Date(i.added).toLocaleDateString()}</span>
        </div>
        ${epHtml}
      </div>
      <div class="card-actions">
        ${airingBtnHtml}
        <button class="btn-action" onclick="openEdit(${i.id})" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="btn-action del" onclick="confirmDelete(${i.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
}

// 2. Dashboard Continue Watching Card (Home tab)
function generateCWCard(i) {
    const cur = i.epCur || 0;
    const tot = i.epTot || '?';
    const sCur = i.sCur || 1;
    const progress = i.epTot ? Math.min(100, Math.round((cur / i.epTot) * 100)) : 0;
    const catLabel = i.cat === 'anime' ? 'Anime' : 'Series';

    return `
    <div class="card continue-card">
      <div class="card-body">
        <div class="card-title-row">
          <span class="card-title">${escapeHTML(i.title)}</span>
          <span class="badge ${i.cat}">${catLabel}</span>
          ${i.lang ? `<span class="badge language">${escapeHTML(i.lang)}</span>` : ''}
        </div>
        
        <div class="ep-tracker">
            <div class="ep-header">
                <span class="ep-text">S${sCur} • Ep ${cur} / ${tot}</span>
                <span class="ep-percentage">${progress}%</span>
            </div>
            <div class="ep-controls-bar">
                <div class="ep-progress-wrap">
                    <div class="ep-progress-bar" style="width: ${progress}%"></div>
                </div>
                <div class="ep-controls">
                    <button class="btn-ep" onclick="changeEp(${i.id}, -1)">−</button>
                    <span style="font-size: 11px; font-weight: 700; font-family: 'Space Grotesk', sans-serif; color: var(--muted); min-width: 26px; text-align: center;">${cur}</span>
                    <button class="btn-ep" onclick="changeEp(${i.id}, 1)">+</button>
                </div>
            </div>
        </div>
      </div>
    </div>`;
}

// 3. Compact dashboard card (Home tab list)
function generateCompactCard(i) {
    const catLabel = i.cat === 'anime' ? 'Anime Series' : i.cat === 'anime-film' ? 'Anime Film' : 'Series';
    const relativeTime = new Date(i.updated || i.added).toLocaleDateString();
    
    return `
    <div class="card compact-card" onclick="switchTab('${i.cat === 'series' ? 'series' : 'anime'}'); selectCardFolder('${i.cat}');" style="cursor: pointer; padding: 10px 14px;">
      <div class="card-body">
        <div class="card-title-row" style="justify-content: space-between;">
          <span class="card-title" style="font-size: 14px;">${escapeHTML(i.title)}</span>
          <span style="font-size: 9px; color: var(--muted);">${relativeTime}</span>
        </div>
        <div class="card-meta" style="margin-top: 2px;">
          <span class="badge ${i.cat}" style="font-size: 7px; padding: 0px 3px;">${catLabel}</span>
          ${i.lang ? `<span class="badge language" style="font-size: 7px; padding: 0px 3px;">${escapeHTML(i.lang)}</span>` : ''}
          ${EP_CATS.has(i.cat) ? `<span style="font-size: 9px;">S${i.sCur || 1} • Ep ${i.epCur || 0}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// Focus on correct folder filter
window.selectCardFolder = function (folder) {
    if (folder === 'anime' || folder === 'anime-film') {
        switchFolder(folder);
    }
};

// --- SETTINGS VIEW IMPORT / EXPORT LOGIC ---
function exportData() {
    const blob = new Blob([JSON.stringify({ version: 2.0, prefs, items: state.items }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WatchVault_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup JSON file downloaded!');
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const parsed = JSON.parse(evt.target.result);
            const incoming = Array.isArray(parsed) ? parsed : parsed.items;

            let added = 0;
            const existingSignatures = new Set(state.items.map(i => `${i.title.toLowerCase()}|${i.cat}`));

            incoming.forEach(item => {
                if (!existingSignatures.has(`${item.title.toLowerCase()}|${item.cat}`)) {
                    state.items.push(item);
                    added++;
                }
            });

            if (parsed.prefs) {
                // merge preferences, reset to home tab to load correctly
                prefs = { ...prefs, ...parsed.prefs };
                prefs.activeTab = 'home';
            }

            saveState();
            applyPrefs();
            switchTab(prefs.activeTab);
            showToast(`Import complete. Merged ${added} new titles.`);
        } catch (err) {
            alert("Invalid JSON backup file.");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// --- UTILITIES ---
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}

function showToast(msg, duration = 2800) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerHTML = msg;
    t.classList.add('show');
    clearTimeout(window.toastTimer);
    if (duration > 0) {
        window.toastTimer = setTimeout(() => t.classList.remove('show'), duration);
    }
}

// --- PWA LOGIC ---
function registerPWA() {
    // Check if running in standalone display mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    if (installingWorker) {
                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Show update toast that stays open (duration = 0) with a Refresh button
                                showToast('New version available. <button class="toast-undo" onclick="window.location.reload()">Refresh</button>', 0);
                            }
                        };
                    }
                };
            }).catch(console.error);
    }

    if (isStandalone) {
        console.log('[PWA] Running in standalone mode. Hiding install options.');
        const btnHeader = document.getElementById('btn-install-header');
        if (btnHeader) btnHeader.classList.add('hidden');
        const installCard = document.getElementById('settings-pwa-install-card');
        if (installCard) installCard.classList.add('hidden');
        return;
    }

    // Capture install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install button in header (on desktop) and in settings card (always)
        const btnHeader = document.getElementById('btn-install-header');
        if (btnHeader) {
            btnHeader.classList.remove('hidden');
            btnHeader.onclick = executeInstallPrompt;
        }
        
        const installCard = document.getElementById('settings-pwa-install-card');
        const btnSettings = document.getElementById('btn-install-settings');
        if (installCard && btnSettings) {
            installCard.classList.remove('hidden');
            btnSettings.onclick = executeInstallPrompt;
        }
    });

    // Handle standard app installed event (e.g. installed from browser menu)
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed successfully');
        const btnHeader = document.getElementById('btn-install-header');
        if (btnHeader) btnHeader.classList.add('hidden');
        const installCard = document.getElementById('settings-pwa-install-card');
        if (installCard) installCard.classList.add('hidden');
        deferredPrompt = null;
        showToast('WatchVault installed successfully!');
    });
}

async function executeInstallPrompt() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Install choice outcome: ${outcome}`);
    if (outcome === 'accepted') {
        const btnHeader = document.getElementById('btn-install-header');
        if (btnHeader) btnHeader.classList.add('hidden');
        const installCard = document.getElementById('settings-pwa-install-card');
        if (installCard) installCard.classList.add('hidden');
    }
    deferredPrompt = null;
}

init();