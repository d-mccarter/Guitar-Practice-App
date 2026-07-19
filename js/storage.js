const PROFILE_KEY = 'guitar-practice-tracker-profile';

const DATA_PROFILES = {
  real: {
    id: 'real',
    label: 'Real',
    storageKey: 'guitar-practice-tracker',
    path: 'data/practice-data.json'
  },
  test: {
    id: 'test',
    label: 'Test',
    storageKey: 'guitar-practice-tracker-test',
    path: 'data/practice-data-test.json'
  }
};

const Storage = {
  _fileSha: null,
  _pushTimer: null,
  _pushInFlight: null,
  onSyncStatus: null,

  getProfiles() {
    return DATA_PROFILES;
  },

  getProfileId() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw && DATA_PROFILES[raw]) return raw;
    } catch {
      /* ignore */
    }
    return 'real';
  },

  getProfile() {
    return DATA_PROFILES[this.getProfileId()] || DATA_PROFILES.real;
  },

  storageKey() {
    return this.getProfile().storageKey;
  },

  setProfile(profileId) {
    const profile = DATA_PROFILES[profileId];
    if (!profile || profile.id === this.getProfileId()) return this.getProfile();

    clearTimeout(this._pushTimer);
    this._pushTimer = null;
    this._pushInFlight = null;
    this._fileSha = null;

    localStorage.setItem(PROFILE_KEY, profile.id);

    const settings = this.getSyncSettings();
    settings.path = profile.path;
    this.saveSyncSettings(settings);

    return profile;
  },

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
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return { items: [], sessions: [] };
      return this.normalize(JSON.parse(raw));
    } catch {
      return { items: [], sessions: [] };
    }
  },

  save(data, options = {}) {
    const normalized = this.normalize(data);
    localStorage.setItem(this.storageKey(), JSON.stringify(normalized));
    if (options.sync !== false) {
      this.schedulePush();
    }
    return normalized;
  },

  getSyncSettings() {
    const settings = GitHubSync.getSettings();
    settings.path = this.getProfile().path;
    return settings;
  },

  saveSyncSettings(settings) {
    const normalized = GitHubSync.normalizeSettings(settings);
    normalized.path = this.getProfile().path;
    GitHubSync.saveSettings(normalized);
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

  async pushToGitHub({ silent = false, settings = null } = {}) {
    settings = GitHubSync.normalizeSettings(settings || this.getSyncSettings());
    if (!GitHubSync.isConfigured(settings)) {
      throw new Error('Paste your GitHub token first');
    }

    clearTimeout(this._pushTimer);
    this._pushTimer = null;

    if (this._pushInFlight) {
      return this._pushInFlight;
    }

    this._pushInFlight = this._pushWithRetry(settings, silent).finally(() => {
      this._pushInFlight = null;
    });

    return this._pushInFlight;
  },

  async _pushWithRetry(settings, silent) {
    if (!silent) this.setSyncStatus('Saving to GitHub…', 'info');

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const local = this.load();
        const remote = await GitHubSync.fetchRemote(settings);
        const data = attempt === 0 ? local : this.mergeData(remote.data, local);
        if (attempt > 0) {
          this.save(data, { sync: false });
        }
        this._fileSha = await GitHubSync.pushRemote(settings, data, remote.sha);
        if (!silent) {
          const note = attempt > 0 ? ' (resolved sync conflict)' : '';
          this.setSyncStatus(`Saved to GitHub${note}`, 'success');
        }
        return;
      } catch (error) {
        lastError = error;
        if (!/409|422/.test(String(error.message)) || attempt === 2) {
          break;
        }
      }
    }

    this.setSyncStatus(lastError.message, 'error');
    throw lastError;
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

  updateSession(id, updates) {
    const data = this.load();
    const index = data.sessions.findIndex((s) => s.id === id);
    if (index === -1) return null;
    data.sessions[index] = { ...data.sessions[index], ...updates };
    this.save(data);
    return data.sessions[index];
  },

  deleteSession(id) {
    const data = this.load();
    data.sessions = data.sessions.filter((s) => s.id !== id);
    this.save(data);
  },

  getSessionById(id) {
    return this.getSessions().find((s) => s.id === id) || null;
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
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Parse timer minutes, rounding to the nearest quarter-minute (0.25). */
function parseTimerMinutes(raw, fallback = 3) {
  const n = parseFloat(String(raw ?? '').trim());
  if (Number.isNaN(n)) return fallback;
  const rounded = Math.round(n * 4) / 4;
  return Math.max(0.25, Math.min(120, rounded));
}

function formatTimerMinutes(minutes) {
  return String(Math.round(parseTimerMinutes(minutes) * 4) / 4);
}

function timerMinutesToSeconds(minutes) {
  return Math.round(parseTimerMinutes(minutes) * 60);
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

/** Format a Date for <input type="datetime-local"> in local time. */
function toDatetimeLocalValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a datetime-local value as local time (avoids UTC parsing quirks). */
function fromDatetimeLocalValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value || '').trim());
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] || 0),
    0
  );
  return Number.isNaN(d.getTime()) ? null : d;
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
  const workedOn = (session.workedOn || '').trim();
  if (workedOn) return workedOn;
  return session.itemName || session.itemCode || 'Untitled';
}

/** Normalize rating: 0 (or missing) means unrated. */
function normalizeSessionRating(rating) {
  const n = parseInt(rating, 10);
  if (Number.isNaN(n) || n <= 0) return 0;
  return Math.min(5, n);
}

function formatStarRating(rating) {
  const r = normalizeSessionRating(rating);
  if (r === 0) return '';
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatShortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
