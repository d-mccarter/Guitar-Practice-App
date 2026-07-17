const STORAGE_KEY = 'guitar-practice-tracker';

const Storage = {
  _fileSha: null,
  _pushTimer: null,
  onSyncStatus: null,

  normalize(data) {
    return {
      items: (Array.isArray(data.items) ? data.items : []).map((item) => ({
        ...item,
        name: item.name || item.code || 'Untitled',
        description: item.description || ''
      })),
      sessions: Array.isArray(data.sessions) ? data.sessions : []
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { items: [], sessions: [] };
      return this.normalize(JSON.parse(raw));
    } catch {
      return { items: [], sessions: [] };
    }
  },

  save(data, options = {}) {
    const normalized = this.normalize(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    if (options.sync !== false) {
      this.schedulePush();
    }
    return normalized;
  },

  getSyncSettings() {
    return GitHubSync.getSettings();
  },

  saveSyncSettings(settings) {
    GitHubSync.saveSettings(settings);
  },

  setSyncStatus(message, type = 'info') {
    if (this.onSyncStatus) this.onSyncStatus(message, type);
  },

  async init() {
    if (!GitHubSync.isAutoSyncEnabled()) return;

    try {
      const settings = this.getSyncSettings();
      const { data: remote, sha } = await GitHubSync.fetchRemote(settings);
      const local = this.load();
      const remoteEmpty = !remote.items?.length && !remote.sessions?.length;
      const localHasData = local.items.length || local.sessions.length;

      this._fileSha = sha;

      if (remoteEmpty && localHasData) {
        await this.pushToGitHub({ silent: true });
        this.setSyncStatus('Synced to GitHub', 'success');
      } else {
        this.save(remote, { sync: false });
        this.setSyncStatus('Synced from GitHub', 'success');
      }
    } catch (error) {
      this.setSyncStatus(error.message, 'error');
    }
  },

  async pullFromGitHub({ silent = false, settings = null } = {}) {
    settings = GitHubSync.normalizeSettings(settings || this.getSyncSettings());
    if (!GitHubSync.isConfigured(settings)) {
      throw new Error('Paste your GitHub token first');
    }

    if (!silent) this.setSyncStatus('Pulling from GitHub…', 'info');

    const { data, sha } = await GitHubSync.fetchRemote(settings);
    this._fileSha = sha;
    this.save(data, { sync: false });
    if (!silent) this.setSyncStatus('Loaded from GitHub', 'success');
    return data;
  },

  async ensureFileSha(settings) {
    if (this._fileSha) return;
    try {
      const { sha } = await GitHubSync.fetchRemote(settings);
      this._fileSha = sha;
    } catch {
      this._fileSha = null;
    }
  },

  async pushToGitHub({ silent = false, retry = true, settings = null } = {}) {
    settings = GitHubSync.normalizeSettings(settings || this.getSyncSettings());
    if (!GitHubSync.isConfigured(settings)) {
      throw new Error('Paste your GitHub token first');
    }

    if (!silent) this.setSyncStatus('Saving to GitHub…', 'info');

    try {
      await this.ensureFileSha(settings);
      const data = this.load();
      this._fileSha = await GitHubSync.pushRemote(settings, data, this._fileSha);
      if (!silent) this.setSyncStatus('Saved to GitHub', 'success');
    } catch (error) {
      if (retry && /409|422/.test(String(error.message))) {
        const { data, sha } = await GitHubSync.fetchRemote(settings);
        this._fileSha = sha;
        this.save(this.mergeData(data, this.load()), { sync: false });
        return this.pushToGitHub({ silent, retry: false });
      }
      this.setSyncStatus(error.message, 'error');
      throw error;
    }
  },

  mergeData(remote, local) {
    const itemsById = new Map();
    [...remote.items, ...local.items].forEach((item) => itemsById.set(item.id, item));

    const sessionsById = new Map();
    [...remote.sessions, ...local.sessions].forEach((session) => sessionsById.set(session.id, session));

    return {
      items: [...itemsById.values()],
      sessions: [...sessionsById.values()].sort(
        (a, b) => new Date(b.startedAt) - new Date(a.startedAt)
      )
    };
  },

  schedulePush() {
    if (!GitHubSync.isAutoSyncEnabled()) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => {
      this.pushToGitHub({ silent: true }).catch(() => {});
    }, 1500);
  },

  getItems() {
    return this.load().items;
  },

  getSessions() {
    return this.load().sessions;
  },

  addItem(item) {
    const data = this.load();
    data.items.push(item);
    this.save(data);
    return item;
  },

  deleteItem(id) {
    const data = this.load();
    data.items = data.items.filter((i) => i.id !== id);
    this.save(data);
  },

  updateItem(id, updates) {
    const data = this.load();
    const index = data.items.findIndex((i) => i.id === id);
    if (index === -1) return null;
    data.items[index] = { ...data.items[index], ...updates };
    this.save(data);
    return data.items[index];
  },

  addSession(session) {
    const data = this.load();
    data.sessions.unshift(session);
    this.save(data);
    return session;
  },

  getSessionsForItem(itemId) {
    return this.getSessions().filter((s) => s.itemId === itemId);
  },

  getItemById(id) {
    return this.getItems().find((i) => i.id === id);
  }
};

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function itemDisplayName(item) {
  return item.name || item.code || 'Untitled';
}

function itemSelectLabel(item) {
  const name = itemDisplayName(item);
  const desc = (item.description || '').trim();
  return desc && desc !== name ? `${name} — ${desc}` : name;
}

function sessionDisplayName(session) {
  return session.itemName || session.itemCode || 'Untitled';
}

function formatShortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
