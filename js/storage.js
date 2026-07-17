const STORAGE_KEY = 'guitar-practice-tracker';

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { items: [], sessions: [] };
      const data = JSON.parse(raw);
      return {
        items: (Array.isArray(data.items) ? data.items : []).map((item) => ({
          ...item,
          name: item.name || item.code || 'Untitled',
          description: item.description || ''
        })),
        sessions: Array.isArray(data.sessions) ? data.sessions : []
      };
    } catch {
      return { items: [], sessions: [] };
    }
  },

  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
