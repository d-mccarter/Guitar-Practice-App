const SYNC_SETTINGS_KEY = 'guitar-practice-tracker-sync';

const DEFAULT_SYNC_SETTINGS = {
  enabled: false,
  owner: 'd-mccarter',
  repo: 'Guitar-Practice-App',
  branch: 'main',
  path: 'data/practice-data.json',
  token: ''
};

const GitHubSync = {
  getSettings() {
    try {
      const raw = localStorage.getItem(SYNC_SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SYNC_SETTINGS };
      return { ...DEFAULT_SYNC_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SYNC_SETTINGS };
    }
  },

  saveSettings(settings) {
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings));
  },

  isConfigured(settings = this.getSettings()) {
    return settings.enabled && settings.owner && settings.repo && settings.token;
  },

  rawUrl(settings) {
    return `https://raw.githubusercontent.com/${settings.owner}/${settings.repo}/${settings.branch}/${settings.path}`;
  },

  apiUrl(settings) {
    return `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${settings.path}?ref=${settings.branch}`;
  },

  headers(settings) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${settings.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    };
  },

  utf8ToBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  },

  base64ToUtf8(base64) {
    return decodeURIComponent(escape(atob(base64.replace(/\n/g, ''))));
  },

  async fetchRemote(settings) {
    const response = await fetch(this.apiUrl(settings), {
      headers: this.headers(settings)
    });

    if (response.status === 404) {
      return { data: { items: [], sessions: [] }, sha: null };
    }

    if (!response.ok) {
      throw new Error(`GitHub read failed (${response.status})`);
    }

    const payload = await response.json();
    const data = JSON.parse(this.base64ToUtf8(payload.content));
    return { data, sha: payload.sha };
  },

  async pushRemote(settings, data, sha) {
    const body = {
      message: 'Update practice data',
      content: this.utf8ToBase64(JSON.stringify(data, null, 2))
    };
    if (sha) body.sha = sha;

    const response = await fetch(this.apiUrl(settings), {
      method: 'PUT',
      headers: {
        ...this.headers(settings),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`GitHub write failed (${response.status})`);
    }

    const payload = await response.json();
    return payload.content.sha;
  }
};
