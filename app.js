const STORAGE_KEY = 'watchvault_v2_data';
const PREFS_KEY = 'watchvault_v2_prefs';

let state = {
    items: [],
    deletedCache: null
};

let prefs = {
    folder: 'anime',
    search: '',
    filter: 'all',
    sort: 'recent',
    addTab: 'single'
};

const EP_CATS = new Set(['anime', 'series']);
let editingId = null;
let changeCounter = 0;
let deferredPrompt = null;

// --- INITIALIZATION ---
function init() {
    loadState();
    bindEvents();
    applyPrefs();
    render();
    registerPWA();
}

function loadState() {
    try { state.items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { state.items = []; }
    try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY)) }; } catch { /* default */ }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    changeCounter++;
    if (changeCounter % 30 === 0) showToast("Friendly reminder: Consider exporting a backup!");
}

// --- BIND EVENTS ---
function bindEvents() {
    // Tabs
    document.querySelectorAll('.folder-tab').forEach(t =>
        t.addEventListener('click', () => switchFolder(t.dataset.folder)));
    document.querySelectorAll('.add-tab').forEach(t =>
        t.addEventListener('click', () => switchAddTab(t.dataset.tab)));
    document.querySelectorAll('.pill').forEach(p =>
        p.addEventListener('click', () => setFilter(p.dataset.status)));

    // Inputs
    document.getElementById('inp-search').addEventListener('input', (e) => {
        prefs.search = e.target.value; render(); saveState();
    });
    document.getElementById('inp-sort').addEventListener('change', (e) => {
        prefs.sort = e.target.value; render(); saveState();
    });
    document.getElementById('bulk-input').addEventListener('input', updateBulkPreview);

    // Add Actions
    document.getElementById('btn-add-single').addEventListener('click', addSingle);
    document.getElementById('inp-title').addEventListener('keydown', e => { if (e.key === 'Enter') addSingle(); });
    document.getElementById('btn-add-bulk').addEventListener('click', addBulk);

    // Modal Actions
    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('btn-modal-save').addEventListener('click', saveModal);
    document.getElementById('edit-modal').addEventListener('click', e => {
        if (e.target.id === 'edit-modal') closeModal(); // Close on outside tap
    });

    // Global Keys
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('inp-search').focus();
        }
        if (e.key === 'Escape' && document.getElementById('edit-modal').classList.contains('active')) {
            closeModal();
        }
    });

    // Import / Export
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('inp-import').addEventListener('change', importData);
}

// --- PREFERENCES & NAVIGATION ---
function applyPrefs() {
    document.getElementById('inp-search').value = prefs.search;
    document.getElementById('inp-sort').value = prefs.sort;
    document.getElementById('inp-cat').value = prefs.folder;
    document.getElementById('bulk-cat').value = prefs.folder;

    document.querySelectorAll('.folder-tab').forEach(t => t.classList.toggle('active', t.dataset.folder === prefs.folder));
    document.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.status === prefs.filter));
    switchAddTab(prefs.addTab, true);
}

function switchFolder(folder) {
    prefs.folder = folder;
    prefs.filter = 'all';
    prefs.search = '';
    applyPrefs();
    render();
    saveState();
}

function switchAddTab(tab, bypassRender = false) {
    prefs.addTab = tab;
    document.querySelectorAll('.add-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('tab-single').classList.toggle('active', tab === 'single');
    document.getElementById('tab-bulk').classList.toggle('active', tab === 'bulk');
    if (tab === 'bulk') updateBulkPreview();
    if (!bypassRender) saveState();
}

function setFilter(status) {
    prefs.filter = status;
    document.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.status === status));
    render();
    saveState();
}

// --- ADDING LOGIC ---
function addSingle() {
    const titleInp = document.getElementById('inp-title');
    const title = titleInp.value.trim();
    const cat = document.getElementById('inp-cat').value;
    if (!title) return titleInp.focus();

    if (state.items.some(i => i.title.toLowerCase() === title.toLowerCase() && i.cat === cat)) {
        return showToast('Title already exists in this folder!');
    }

    createItem(title, cat);
    titleInp.value = '';
    switchFolder(cat); // auto-nav
    showToast('Added: ' + title);
}

function addBulk() {
    const bulkInp = document.getElementById('bulk-input');
    const lines = bulkInp.value.split('\n').map(l => l.trim()).filter(l => l);
    if (!lines.length) return bulkInp.focus();

    const cat = document.getElementById('bulk-cat').value;
    const existing = new Set(state.items.filter(i => i.cat === cat).map(i => i.title.toLowerCase()));

    let added = 0;
    lines.forEach(title => {
        if (!existing.has(title.toLowerCase())) {
            existing.add(title.toLowerCase());
            createItem(title, cat, false);
            added++;
        }
    });

    if (added > 0) {
        bulkInp.value = '';
        updateBulkPreview();
        switchFolder(cat);
        saveState();
        showToast(`Added ${added} titles!`);
        switchAddTab('single');
    } else {
        showToast('No new titles added (all duplicates).');
    }
}

function updateBulkPreview() {
    const lines = document.getElementById('bulk-input').value.split('\n').map(l => l.trim()).filter(l => l);
    const el = document.getElementById('bulk-preview');
    if (!lines.length) return el.innerHTML = '';

    const cat = document.getElementById('bulk-cat').value;
    const existing = new Set(state.items.filter(i => i.cat === cat).map(i => i.title.toLowerCase()));
    const dupes = lines.filter(l => existing.has(l.toLowerCase())).length;
    const willAdd = lines.length - dupes;

    el.innerHTML = `Detected: ${lines.length} | Already Exists: <span style="color:#F87171">${dupes}</span> | Will Add: <strong>${willAdd}</strong>`;
}

function createItem(title, cat, autoSave = true) {
    state.items.unshift({
        id: Date.now() + Math.random(),
        title, cat,
        done: false,
        airing: false,
        added: new Date().toISOString(),
        updated: new Date().toISOString(),
        sCur: 1, sTot: null,
        epCur: 0, epTot: null
    });
    if (autoSave) saveState();
}

// --- EDIT MODAL LOGIC ---
window.openEdit = function (id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    editingId = id;

    document.getElementById('edit-title').value = item.title;
    const epFields = document.getElementById('edit-ep-fields');

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
    if (EP_CATS.has(item.cat)) {
        item.sCur = parseInt(document.getElementById('edit-s-cur').value) || 1;
        item.sTot = parseInt(document.getElementById('edit-s-tot').value) || null;
        item.epCur = parseInt(document.getElementById('edit-ep-cur').value) || 0;
        item.epTot = parseInt(document.getElementById('edit-ep-tot').value) || null;

        // Validations
        if (item.sTot && item.sCur > item.sTot) item.sCur = item.sTot;
        if (item.epTot && item.epCur > item.epTot) item.epCur = item.epTot;

        // Status Resolution
        if (item.epCur > 0 && !item.done) item.updated = new Date().toISOString();
    }

    saveState();
    render();
    closeModal();
    showToast('Changes saved.');
}

// --- QUICK ACTIONS ---
window.changeEp = function (id, delta) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    item.epCur = Math.max(0, (item.epCur || 0) + delta);
    if (item.epTot && item.epCur > item.epTot) item.epCur = item.epTot;
    item.updated = new Date().toISOString();
    saveState(); render();
};

window.toggleWatched = function (id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    item.done = !item.done;
    if (item.done && item.epTot && item.epCur < item.epTot) {
        item.epCur = item.epTot; // Auto complete
    }
    item.updated = new Date().toISOString();
    saveState(); render();
};

window.toggleAiring = function (id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    item.airing = !item.airing;
    saveState(); render();
};

window.deleteItem = function (id) {
    const idx = state.items.findIndex(i => i.id === id);
    if (idx === -1) return;
    state.deletedCache = { item: state.items[idx], index: idx };
    state.items.splice(idx, 1);
    saveState();
    render();

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
        saveState(); render();
        document.getElementById('toast').classList.remove('show');
    }
};

// --- RENDER LOGIC ---
function render() {
    updateCounts();

    let list = state.items.filter(i => i.cat === prefs.folder);

    // Apply Search
    const q = prefs.search.toLowerCase();
    if (q) list = list.filter(i => i.title.toLowerCase().includes(q));

    // Apply Filters
    if (prefs.filter === 'watching') list = list.filter(i => !i.done && i.epCur > 0);
    else if (prefs.filter === 'ptw') list = list.filter(i => !i.done && (!i.epCur || i.epCur === 0));
    else if (prefs.filter === 'watched') list = list.filter(i => i.done);
    else if (prefs.filter === 'airing') list = list.filter(i => i.airing);

    // Apply Sort
    list.sort((a, b) => {
        switch (prefs.sort) {
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

    const container = document.getElementById('list-container');
    if (!list.length) {
        container.innerHTML = `<div class="empty"><div class="empty-icon">📁</div><p>No items found here.</p></div>`;
        return;
    }
    container.innerHTML = `<div class="list">${list.map(generateCard).join('')}</div>`;
}

function generateCard(i) {
    const isWatched = i.done;
    const isWatching = !i.done && (i.epCur > 0);
    const isPTW = !i.done && (!i.epCur || i.epCur === 0);

    let badges = '';
    if (isWatching) badges += `<span class="badge watching">Watching</span>`;
    if (isPTW) badges += `<span class="badge ptw">Plan to Watch</span>`;
    if (i.airing) badges += `<span class="badge airing">Airing</span>`;

    let epHtml = '';
    if (EP_CATS.has(i.cat)) {
        const cur = i.epCur || 0;
        const tot = i.epTot || '?';
        const sCur = i.sCur || 1;
        const progress = i.epTot ? Math.min(100, (cur / i.epTot) * 100) : (isWatched ? 100 : 0);

        epHtml = `
      <div class="ep-tracker">
        <span class="ep-text">S${sCur} • Ep ${cur} / ${tot}</span>
        <div class="ep-controls">
          <button class="btn-ep" onclick="changeEp(${i.id}, -1)">−</button>
          <button class="btn-ep" onclick="changeEp(${i.id}, 1)">+</button>
        </div>
        <div class="ep-progress-wrap">
          <div class="ep-progress-bar" style="width: ${progress}%"></div>
        </div>
      </div>`;
    }

    return `
    <div class="card ${isWatched ? 'watched' : ''} ${i.airing ? 'airing' : ''}">
      <div class="card-body">
        <div class="card-title-row">
          <span class="card-title">${escapeHTML(i.title)}</span>
        </div>
        <div class="card-meta">${badges} <span>Added ${new Date(i.added).toLocaleDateString()}</span></div>
        ${epHtml}
      </div>
      <div class="card-actions">
        <button class="btn-action" onclick="toggleWatched(${i.id})" title="Mark Watched">${isWatched ? '↩️' : '✅'}</button>
        <button class="btn-action" onclick="toggleAiring(${i.id})" title="Toggle Airing">📡</button>
        <button class="btn-action" onclick="openEdit(${i.id})" title="Edit">✏️</button>
        <button class="btn-action del" onclick="deleteItem(${i.id})" title="Delete">🗑️</button>
      </div>
    </div>`;
}

function updateCounts() {
    const cats = ['anime', 'anime-film', 'film', 'series'];
    cats.forEach(c => {
        document.getElementById(`tc-${c}`).textContent = state.items.filter(i => i.cat === c).length;
    });

    const total = state.items.length;
    const watched = state.items.filter(i => i.done).length;
    const watching = state.items.filter(i => !i.done && i.epCur > 0).length;
    const compPct = total ? Math.round((watched / total) * 100) : 0;

    document.getElementById('global-stats').innerHTML = `
    <div class="stat"><div class="stat-num" style="color:var(--fuchsia)">${total}</div><div class="stat-label">Total</div></div>
    <div class="stat"><div class="stat-num" style="color:#3B82F6">${watching}</div><div class="stat-label">Watching</div></div>
    <div class="stat"><div class="stat-num" style="color:#16A34A">${watched}</div><div class="stat-label">Watched</div></div>
    <div class="stat"><div class="stat-num" style="color:var(--gold)">${compPct}%</div><div class="stat-label">Completion</div></div>
  `;
}

// --- UTILITIES ---
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerHTML = msg;
    t.classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// --- IMPORT / EXPORT ---
function exportData() {
    const blob = new Blob([JSON.stringify({ version: 2, prefs, items: state.items }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WatchVault_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

            if (parsed.prefs) prefs = { ...prefs, ...parsed.prefs };

            saveState(); applyPrefs(); render();
            showToast(`Import complete. Merged ${added} new titles.`);
        } catch (err) {
            alert("Invalid JSON backup file.");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// --- PWA LOGIC ---
function registerPWA() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showToast('A new version is available! <button class="toast-undo" onclick="window.location.reload()">Refresh</button>');
                        }
                    };
                };
            }).catch(console.error);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const btn = document.getElementById('btn-install');
        btn.classList.remove('hidden');
        btn.addEventListener('click', async () => {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') btn.classList.add('hidden');
            deferredPrompt = null;
        });
    });
}

init();