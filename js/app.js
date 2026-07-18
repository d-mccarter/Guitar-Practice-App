const App = {
  metronome: new Metronome(),
  session: null,
  timerInterval: null,
  editingItemId: null,
  practiceMode: 'practice',
  feedbackSessionId: null,
  feedbackRating: 0,
  feedbackEditing: false,

  init() {
    this.loadBuildLabel();
    this.bindNavigation();
    this.bindPractice();
    this.bindItems();
    this.bindSync();
    this.bindLog();
    this.bindSessionFeedback();
    this.bindProgress();
    this.refreshAll();
  },

  bindNavigation() {
    const titles = {
      practice: 'Practice',
      items: 'Items',
      log: 'Log',
      progress: 'Progress'
    };

    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`view-${view}`).classList.add('active');
        document.getElementById('page-title').textContent = titles[view];

        if (view === 'progress') this.renderProgress();
        if (view === 'log') this.renderLog();
      });
    });
  },

  async loadBuildLabel() {
    const label = document.getElementById('build-label');
    try {
      const response = await fetch(`build.json?${Date.now()}`);
      if (!response.ok) throw new Error('missing');
      const info = await response.json();
      label.textContent = `Build ${info.build}`;
      label.title = info.updated ? `Updated ${info.updated}` : '';
    } catch {
      label.textContent = 'Build ?';
    }
  },

  applyMetronomeOptions() {
    const subdivisionSelect = document.getElementById('metronome-subdivision');
    const accentBtn = document.getElementById('metronome-accent-btn');
    const quarterAccentBtn = document.getElementById('metronome-quarter-accent-btn');
    const quarterAccentRow = document.getElementById('metronome-quarter-accent-row');
    const usesSubdivision = subdivisionSelect
      ? parseInt(subdivisionSelect.value, 10) > 1
      : false;

    if (subdivisionSelect) {
      this.metronome.setSubdivision(subdivisionSelect.value);
    }
    if (quarterAccentRow) {
      quarterAccentRow.classList.toggle('is-disabled', !usesSubdivision);
      quarterAccentRow.setAttribute('aria-disabled', String(!usesSubdivision));
    }
    if (quarterAccentBtn) {
      quarterAccentBtn.disabled = !usesSubdivision;
    }
    if (accentBtn) {
      this.metronome.setAccentDownbeat(accentBtn.classList.contains('on'));
    }
    if (quarterAccentBtn) {
      this.metronome.setAccentQuarterBeats(
        usesSubdivision && quarterAccentBtn.classList.contains('on')
      );
    }
  },

  bindPractice() {
    const tempoInput = document.getElementById('tempo-bpm');
    const tempoDisplay = document.getElementById('tempo-display');
    const timerInput = document.getElementById('timer-minutes');
    const timerDisplay = document.getElementById('session-timer');
    const startBtn = document.getElementById('start-stop-btn');
    const beatIndicator = document.getElementById('beat-indicator');
    const statusEl = document.getElementById('session-status');

    const updateTempoDisplay = (bpm) => {
      tempoDisplay.textContent = `${bpm} BPM`;
    };

    const clampBpm = (raw, fallback = 80) => {
      const n = parseInt(String(raw).trim(), 10);
      if (Number.isNaN(n)) return fallback;
      return Math.max(40, Math.min(300, n));
    };

    const commitTempo = () => {
      const bpm = clampBpm(tempoInput.value, 80);
      tempoInput.value = bpm;
      updateTempoDisplay(bpm);
      this.metronome.setBpm(bpm);
      if (this.session && this.session.mode !== 'ramp') {
        this.session.tempo = bpm;
      }
    };

    const onTempoInput = () => {
      const raw = tempoInput.value.trim();
      if (raw === '') return;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return;
      const bpm = Math.max(40, Math.min(300, n));
      updateTempoDisplay(bpm);
      this.metronome.setBpm(bpm);
      if (this.session && this.session.mode !== 'ramp') {
        this.session.tempo = bpm;
      }
    };

    const commitTimerMinutes = () => {
      const minutes = parseTimerMinutes(timerInput.value, 3);
      timerInput.value = formatTimerMinutes(minutes);
      if (!this.session && this.practiceMode === 'practice') {
        timerDisplay.textContent = formatDuration(timerMinutesToSeconds(minutes));
      }
    };

    const resetTimerDisplay = () => {
      if (this.practiceMode === 'free') {
        timerDisplay.textContent = '0:00';
        return;
      }
      if (this.practiceMode === 'ramp') {
        const minutes = parseInt(document.getElementById('ramp-minutes').value, 10) || 5;
        timerDisplay.textContent = formatDuration(minutes * 60);
        return;
      }
      timerDisplay.textContent = formatDuration(timerMinutesToSeconds(timerInput.value));
    };

    document.querySelectorAll('#view-practice .mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.session) return;
        this.practiceMode = btn.dataset.mode;
        document.querySelectorAll('#view-practice .mode-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.updatePracticeModeUI();
        resetTimerDisplay();
      });
    });

    tempoInput.addEventListener('input', onTempoInput);
    tempoInput.addEventListener('blur', commitTempo);
    document.getElementById('tempo-up').addEventListener('click', () => {
      tempoInput.value = Math.min(300, clampBpm(tempoInput.value, 80) + 1);
      commitTempo();
    });
    document.getElementById('tempo-down').addEventListener('click', () => {
      tempoInput.value = Math.max(40, clampBpm(tempoInput.value, 80) - 1);
      commitTempo();
    });

    timerInput.addEventListener('input', () => {
      if (!this.session && this.practiceMode === 'practice') {
        const raw = timerInput.value.trim();
        if (raw === '') return;
        const n = parseFloat(raw);
        if (Number.isNaN(n)) return;
        timerDisplay.textContent = formatDuration(timerMinutesToSeconds(n));
      }
    });
    timerInput.addEventListener('blur', commitTimerMinutes);
    document.getElementById('timer-up').addEventListener('click', () => {
      timerInput.value = formatTimerMinutes(parseTimerMinutes(timerInput.value, 3) + 0.25);
      commitTimerMinutes();
    });
    document.getElementById('timer-down').addEventListener('click', () => {
      timerInput.value = formatTimerMinutes(parseTimerMinutes(timerInput.value, 3) - 0.25);
      commitTimerMinutes();
    });

    document.getElementById('ramp-minutes').addEventListener('input', () => {
      if (!this.session && this.practiceMode === 'ramp') resetTimerDisplay();
    });

    ['ramp-start-bpm', 'ramp-end-bpm'].forEach((id) => {
      document.getElementById(id).addEventListener('input', () => {
        if (!this.session && this.practiceMode === 'ramp') this.updatePracticeModeUI();
      });
    });

    const subdivisionSelect = document.getElementById('metronome-subdivision');
    const accentBtn = document.getElementById('metronome-accent-btn');
    const quarterAccentBtn = document.getElementById('metronome-quarter-accent-btn');

    const updateToggleButton = (btn, enabled) => {
      btn.textContent = enabled ? 'On' : 'Off';
      btn.classList.toggle('on', enabled);
      btn.classList.toggle('off', !enabled);
      btn.setAttribute('aria-pressed', String(enabled));
    };

    subdivisionSelect.addEventListener('change', () => {
      this.applyMetronomeOptions();
    });
    subdivisionSelect.addEventListener('input', () => {
      this.applyMetronomeOptions();
    });

    accentBtn.addEventListener('click', () => {
      updateToggleButton(accentBtn, !accentBtn.classList.contains('on'));
      this.applyMetronomeOptions();
    });

    quarterAccentBtn.addEventListener('click', () => {
      updateToggleButton(quarterAccentBtn, !quarterAccentBtn.classList.contains('on'));
      this.applyMetronomeOptions();
    });

    this.applyMetronomeOptions();

    this.metronome.onBeat = (_beat, accent) => {
      beatIndicator.classList.add('active');
      if (accent) beatIndicator.classList.add('accent');
      else beatIndicator.classList.remove('accent');
      setTimeout(() => beatIndicator.classList.remove('active'), 80);
    };

    this.metronome.onBpmChange = (bpm) => {
      if (this.session?.mode === 'ramp') {
        updateTempoDisplay(bpm);
      }
    };

    startBtn.addEventListener('click', async () => {
      await this.startSession();
    });

    document.getElementById('pause-resume-btn').addEventListener('click', async () => {
      if (!this.session) return;
      if (this.session.paused) {
        await this.resumeSession();
      } else {
        this.pauseSession();
      }
    });

    document.getElementById('end-session-btn').addEventListener('click', () => {
      if (!this.session) return;
      this.stopSession(this.session.remainingSeconds != null && this.session.remainingSeconds <= 0);
    });

    document.getElementById('practice-item-select').addEventListener('change', (e) => {
      const item = Storage.getItemById(e.target.value);
      if (item?.targetTempo && this.practiceMode !== 'ramp') {
        tempoInput.value = item.targetTempo;
        commitTempo();
      }
    });

    this.updatePracticeModeUI();
    commitTempo();
    resetTimerDisplay();
  },

  updatePracticeModeUI() {
    const itemField = document.getElementById('practice-item-field');
    const itemLabel = document.getElementById('practice-item-label');
    const fixedPanel = document.getElementById('fixed-tempo-panel');
    const rampPanel = document.getElementById('ramp-tempo-panel');
    const timerField = document.getElementById('timer-field');
    const tempoDisplay = document.getElementById('tempo-display');

    if (this.practiceMode === 'free') {
      itemField.hidden = true;
      fixedPanel.hidden = false;
      rampPanel.hidden = true;
      timerField.hidden = true;
      const bpm = parseInt(document.getElementById('tempo-bpm').value, 10) || 80;
      tempoDisplay.textContent = `${bpm} BPM`;
      return;
    }

    itemField.hidden = false;
    if (this.practiceMode === 'ramp') {
      itemLabel.textContent = 'Practice item (optional)';
      fixedPanel.hidden = true;
      rampPanel.hidden = false;
      const start = parseInt(document.getElementById('ramp-start-bpm').value, 10) || 60;
      const end = parseInt(document.getElementById('ramp-end-bpm').value, 10) || 120;
      tempoDisplay.textContent = `${start} → ${end} BPM`;
    } else {
      itemLabel.textContent = 'Practice item';
      fixedPanel.hidden = false;
      rampPanel.hidden = true;
      timerField.hidden = false;
      const bpm = parseInt(document.getElementById('tempo-bpm').value, 10) || 80;
      tempoDisplay.textContent = `${bpm} BPM`;
    }
  },

  setPracticeFormDisabled(disabled) {
    // Lock session setup fields while running; metronome settings stay editable
    // so tempo/subdivision/accents can change and take effect immediately.
    document.querySelectorAll('#view-practice .mode-btn').forEach((b) => { b.disabled = disabled; });
    document.getElementById('practice-item-select').disabled = disabled;
    document.getElementById('timer-minutes').disabled = disabled;
    document.getElementById('timer-up').disabled = disabled;
    document.getElementById('timer-down').disabled = disabled;
    document.getElementById('ramp-start-bpm').disabled = disabled;
    document.getElementById('ramp-end-bpm').disabled = disabled;
    document.getElementById('ramp-minutes').disabled = disabled;
  },

  setSessionControlsVisible(active) {
    const startBtn = document.getElementById('start-stop-btn');
    const controls = document.getElementById('session-controls');
    const pauseBtn = document.getElementById('pause-resume-btn');
    startBtn.hidden = active;
    controls.hidden = !active;
    if (active) {
      pauseBtn.textContent = 'Pause';
    }
  },

  startSessionTimer() {
    const timerDisplay = document.getElementById('session-timer');
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.session || this.session.paused) return;

      // Only active (unpaused) metronome time counts toward elapsed/logging.
      this.session.elapsedSeconds++;

      if (this.session.mode === 'free') {
        timerDisplay.textContent = formatDuration(this.session.elapsedSeconds);
        return;
      }

      this.session.remainingSeconds--;
      timerDisplay.textContent = formatDuration(Math.max(0, this.session.remainingSeconds));

      if (this.session.remainingSeconds <= 0) {
        this.stopSession(true);
      }
    }, 1000);
  },

  async startSession() {
    if (this.session) return;

    const statusEl = document.getElementById('session-status');
    const timerDisplay = document.getElementById('session-timer');
    const tempoInput = document.getElementById('tempo-bpm');
    const itemId = document.getElementById('practice-item-select').value || null;

    if (this.practiceMode === 'practice' && !itemId) {
      alert('Please select a practice item first.');
      return;
    }

    let totalSeconds;
    let tempo;
    let startTempo = null;
    let endTempo = null;

    this.metronome.clearRamp();
    this.applyMetronomeOptions();

    if (this.practiceMode !== 'ramp') {
      tempoInput.blur();
    }

    if (this.practiceMode === 'ramp') {
      startTempo = parseInt(document.getElementById('ramp-start-bpm').value, 10) || 60;
      endTempo = parseInt(document.getElementById('ramp-end-bpm').value, 10) || 120;
      const minutes = parseInt(document.getElementById('ramp-minutes').value, 10) || 5;
      totalSeconds = minutes * 60;
      tempo = endTempo;
      this.metronome.setRamp(startTempo, endTempo, totalSeconds);
      document.getElementById('tempo-display').textContent = `${startTempo} BPM`;
    } else if (this.practiceMode === 'free') {
      totalSeconds = null;
      tempo = parseInt(tempoInput.value, 10) || 80;
      this.metronome.setBpm(tempo);
    } else {
      const minutes = parseTimerMinutes(document.getElementById('timer-minutes').value, 3);
      document.getElementById('timer-minutes').value = formatTimerMinutes(minutes);
      totalSeconds = timerMinutesToSeconds(minutes);
      tempo = parseInt(tempoInput.value, 10) || 80;
      this.metronome.setBpm(tempo);
    }

    const item = itemId ? Storage.getItemById(itemId) : null;

    this.session = {
      mode: this.practiceMode,
      itemId,
      itemName: item ? itemDisplayName(item) : null,
      tempo,
      startTempo,
      endTempo,
      plannedDurationSeconds: totalSeconds,
      remainingSeconds: totalSeconds,
      elapsedSeconds: 0,
      paused: false,
      startedAt: new Date().toISOString()
    };

    await this.metronome.start();
    this.setSessionControlsVisible(true);
    statusEl.textContent = this.practiceMode === 'free' ? 'Playing…' : 'Practicing…';
    statusEl.classList.remove('paused');
    statusEl.classList.add('running');
    this.setPracticeFormDisabled(true);

    if (this.practiceMode === 'free') {
      timerDisplay.textContent = '0:00';
    }

    this.startSessionTimer();
  },

  pauseSession() {
    if (!this.session || this.session.paused) return;

    this.session.paused = true;
    this.metronome.pause();
    clearInterval(this.timerInterval);
    this.timerInterval = null;

    const statusEl = document.getElementById('session-status');
    const pauseBtn = document.getElementById('pause-resume-btn');
    statusEl.textContent = 'Paused';
    statusEl.classList.remove('running');
    statusEl.classList.add('paused');
    pauseBtn.textContent = 'Resume';
  },

  async resumeSession() {
    if (!this.session || !this.session.paused) return;

    this.session.paused = false;
    await this.metronome.resume();

    const statusEl = document.getElementById('session-status');
    const pauseBtn = document.getElementById('pause-resume-btn');
    statusEl.textContent = this.session.mode === 'free' ? 'Playing…' : 'Practicing…';
    statusEl.classList.remove('paused');
    statusEl.classList.add('running');
    pauseBtn.textContent = 'Pause';

    this.startSessionTimer();
  },

  stopSession(completed) {
    this.metronome.stop();
    this.metronome.clearRamp();
    clearInterval(this.timerInterval);
    this.timerInterval = null;

    const statusEl = document.getElementById('session-status');
    const timerDisplay = document.getElementById('session-timer');
    const tempoInput = document.getElementById('tempo-bpm');
    const session = this.session;

    this.setSessionControlsVisible(false);
    statusEl.classList.remove('running', 'paused');
    this.setPracticeFormDisabled(false);

    // durationSeconds is active practice time only (paused gaps never incremented elapsedSeconds).
    const shouldLog = session?.itemId && session.elapsedSeconds >= 5 && session.mode !== 'free';

    if (shouldLog) {
      const loggedTempo = session.mode === 'ramp'
        ? this.metronome.getRoundedBpm()
        : session.tempo;

      const recorded = Storage.addSession({
        id: generateId(),
        itemId: session.itemId,
        itemName: session.itemName,
        tempo: loggedTempo,
        startTempo: session.startTempo,
        endTempo: session.endTempo,
        mode: session.mode,
        durationSeconds: session.elapsedSeconds,
        plannedDurationSeconds: session.plannedDurationSeconds,
        startedAt: session.startedAt,
        completedAt: new Date().toISOString(),
        completed: completed,
        rating: 0,
        notes: ''
      });

      this.showLastSession(recorded);
      statusEl.textContent = completed ? 'Session complete!' : 'Session saved';
      this.openSessionFeedback(recorded, { editing: false });
    } else {
      statusEl.textContent = 'Ready';
    }

    this.session = null;

    if (this.practiceMode === 'free') {
      timerDisplay.textContent = '0:00';
    } else if (this.practiceMode === 'ramp') {
      const minutes = parseInt(document.getElementById('ramp-minutes').value, 10) || 5;
      timerDisplay.textContent = formatDuration(minutes * 60);
      this.updatePracticeModeUI();
    } else {
      timerDisplay.textContent = formatDuration(timerMinutesToSeconds(document.getElementById('timer-minutes').value));
      document.getElementById('tempo-display').textContent = `${parseInt(tempoInput.value, 10) || 80} BPM`;
    }

    if (shouldLog) {
      this.refreshItemSelects();
      this.renderLog();
    }
  },

  showLastSession(session) {
    const card = document.getElementById('last-session-card');
    const summary = document.getElementById('last-session-summary');
    card.hidden = false;
    const tempoLabel = session.mode === 'ramp' && session.startTempo != null
      ? `<strong>${session.startTempo}→${session.tempo} BPM</strong>`
      : `<strong>${session.tempo} BPM</strong>`;
    const rating = normalizeSessionRating(session.rating);
    const stars = formatStarRating(rating);
    const notes = (session.notes || '').trim();
    let feedbackHtml = '';
    if (stars) {
      feedbackHtml += `<div class="log-feedback"><span class="log-stars">${stars}</span></div>`;
    }
    if (notes) {
      feedbackHtml += `<div class="log-feedback"><div class="log-notes">${escapeHtml(notes)}</div></div>`;
    }
    summary.innerHTML = `<strong>${escapeHtml(sessionDisplayName(session))}</strong> — ${formatDuration(session.durationSeconds)} at ${tempoLabel}${feedbackHtml}`;
  },

  bindSessionFeedback() {
    const modal = document.getElementById('session-feedback-modal');
    const stars = document.getElementById('session-feedback-stars');
    const notes = document.getElementById('session-feedback-notes');
    const saveBtn = document.getElementById('session-feedback-save-btn');
    const skipBtn = document.getElementById('session-feedback-skip-btn');

    stars.querySelectorAll('.star-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = parseInt(btn.dataset.rating, 10);
        // Tap the current rating again to clear (0 = unrated).
        this.feedbackRating = this.feedbackRating === value ? 0 : value;
        this.renderFeedbackStars();
      });
    });

    saveBtn.addEventListener('click', () => this.saveSessionFeedback());
    skipBtn.addEventListener('click', () => this.closeSessionFeedback());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeSessionFeedback();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) {
        this.closeSessionFeedback();
      }
    });

    notes.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.saveSessionFeedback();
      }
    });
  },

  renderFeedbackStars() {
    const rating = normalizeSessionRating(this.feedbackRating);
    document.querySelectorAll('#session-feedback-stars .star-btn').forEach((btn) => {
      const value = parseInt(btn.dataset.rating, 10);
      btn.classList.toggle('active', value <= rating && rating > 0);
      btn.setAttribute('aria-checked', String(value === rating && rating > 0));
    });
  },

  openSessionFeedback(session, { editing = false } = {}) {
    if (!session?.id) return;

    this.feedbackSessionId = session.id;
    this.feedbackEditing = editing;
    this.feedbackRating = normalizeSessionRating(session.rating);

    const modal = document.getElementById('session-feedback-modal');
    const title = document.getElementById('session-feedback-title');
    const summary = document.getElementById('session-feedback-summary');
    const notes = document.getElementById('session-feedback-notes');
    const skipBtn = document.getElementById('session-feedback-skip-btn');

    title.textContent = editing ? 'Edit session notes' : 'Session notes';
    skipBtn.textContent = editing ? 'Cancel' : 'Skip';

    const tempoText = session.mode === 'ramp' && session.startTempo != null
      ? `${session.startTempo}→${session.tempo} BPM`
      : `${session.tempo} BPM`;
    summary.textContent = `${sessionDisplayName(session)} — ${formatDuration(session.durationSeconds)} at ${tempoText}`;

    notes.value = session.notes || '';
    this.renderFeedbackStars();
    modal.hidden = false;
    notes.focus();
  },

  closeSessionFeedback() {
    const modal = document.getElementById('session-feedback-modal');
    modal.hidden = true;
    this.feedbackSessionId = null;
    this.feedbackRating = 0;
    this.feedbackEditing = false;
  },

  saveSessionFeedback() {
    if (!this.feedbackSessionId) return;

    const notes = document.getElementById('session-feedback-notes').value.trim();
    const rating = normalizeSessionRating(this.feedbackRating);
    const updated = Storage.updateSession(this.feedbackSessionId, { rating, notes });

    this.closeSessionFeedback();

    if (updated) {
      const newest = Storage.getSessions()[0];
      if (newest?.id === updated.id) {
        this.showLastSession(updated);
      }
      this.renderLog();
    }
  },

  bindItems() {
    document.getElementById('item-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('item-name').value.trim();
      const description = document.getElementById('item-description').value.trim();
      const targetTempo = document.getElementById('item-target-tempo').value;

      if (!name) return;

      const itemData = {
        name,
        description,
        targetTempo: targetTempo ? parseInt(targetTempo, 10) : null
      };

      if (this.editingItemId) {
        Storage.updateItem(this.editingItemId, itemData);
      } else {
        Storage.addItem({
          id: generateId(),
          ...itemData,
          createdAt: new Date().toISOString()
        });
      }

      this.cancelEditItem();
      this.refreshAll();
    });

    document.getElementById('item-cancel-btn').addEventListener('click', () => {
      this.cancelEditItem();
      this.renderItems();
    });
  },

  startEditItem(id) {
    const item = Storage.getItemById(id);
    if (!item) return;

    this.editingItemId = id;
    document.getElementById('item-form-title').textContent = 'Edit practice item';
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-description').value = item.description || '';
    document.getElementById('item-target-tempo').value = item.targetTempo ?? '';
    document.getElementById('item-submit-btn').textContent = 'Save changes';
    document.getElementById('item-cancel-btn').hidden = false;
    document.getElementById('item-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    this.renderItems();
  },

  cancelEditItem() {
    this.editingItemId = null;
    document.getElementById('item-form').reset();
    document.getElementById('item-form-title').textContent = 'Add practice item';
    document.getElementById('item-submit-btn').textContent = 'Add item';
    document.getElementById('item-cancel-btn').hidden = true;
  },

  updateDataProfileUI() {
    const profile = Storage.getProfile();
    document.querySelectorAll('[data-profile]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.profile === profile.id);
    });

    const pathEl = document.getElementById('sync-data-path');
    if (pathEl) pathEl.textContent = `File: ${profile.path}`;

    const badge = document.getElementById('profile-badge');
    if (badge) {
      const isTest = profile.id === 'test';
      badge.hidden = !isTest;
      badge.textContent = 'Test data';
    }
  },

  bindSync() {
    const enabledBtn = document.getElementById('sync-enabled-btn');
    const statusEl = document.getElementById('sync-status');
    const fields = {
      owner: document.getElementById('sync-owner'),
      repo: document.getElementById('sync-repo'),
      token: document.getElementById('sync-token')
    };

    const setStatus = (message, type = 'info') => {
      statusEl.textContent = message;
      statusEl.dataset.type = type;
    };

    const isAutoSyncEnabled = () => enabledBtn.classList.contains('on');

    const updateAutoSyncButton = (enabled) => {
      enabledBtn.classList.toggle('on', enabled);
      enabledBtn.classList.toggle('off', !enabled);
      enabledBtn.textContent = enabled ? 'On' : 'Off';
      enabledBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    };

    const readSettings = () => GitHubSync.normalizeSettings({
      enabled: isAutoSyncEnabled(),
      owner: fields.owner.value,
      repo: fields.repo.value,
      branch: 'main',
      path: Storage.getProfile().path,
      token: fields.token.value
    });

    const saveSettingsFromForm = () => {
      const settings = readSettings();
      Storage.saveSyncSettings(settings);
      return settings;
    };

    const applySettings = (settings) => {
      updateAutoSyncButton(!!settings.enabled);
      fields.owner.value = settings.owner;
      fields.repo.value = settings.repo;
      fields.token.value = settings.token;
    };

    const refreshAfterSync = () => {
      this.refreshAll();
      if (document.getElementById('view-progress').classList.contains('active')) {
        this.renderProgress();
      }
    };

    const runInitialSync = async (settings) => {
      const { data: remote, sha } = await GitHubSync.fetchRemote(settings);
      const local = Storage.load();
      const remoteEmpty = !remote.items?.length && !remote.sessions?.length;
      const localHasData = local.items.length || local.sessions.length;

      Storage._fileSha = sha;

      if (remoteEmpty && localHasData) {
        await Storage.pushToGitHub({ settings });
      } else {
        await Storage.pullFromGitHub({ settings });
        refreshAfterSync();
      }
    };

    const switchDataProfile = async (profileId) => {
      if (profileId === Storage.getProfileId()) return;
      if (this.metronome.isRunning() || this.session) {
        setStatus('Stop the metronome before switching data profiles.', 'error');
        this.updateDataProfileUI();
        return;
      }

      const profile = Storage.setProfile(profileId);
      this.updateDataProfileUI();
      refreshAfterSync();

      const settings = saveSettingsFromForm();
      setStatus(`Switched to ${profile.label} data (${profile.path}).`, 'info');

      if (GitHubSync.isAutoSyncEnabled(settings)) {
        setStatus(`Loading ${profile.label} data…`, 'info');
        try {
          await runInitialSync(settings);
          setStatus(`Using ${profile.label} data.`, 'success');
        } catch (error) {
          setStatus(error.message, 'error');
        }
      }
    };

    Storage.onSyncStatus = (message, type) => setStatus(message, type);

    applySettings(Storage.getSyncSettings());
    this.updateDataProfileUI();

    document.querySelectorAll('[data-profile]').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchDataProfile(btn.dataset.profile);
      });
    });

    enabledBtn.addEventListener('click', async () => {
      updateAutoSyncButton(!isAutoSyncEnabled());
      const settings = saveSettingsFromForm();

      if (!settings.enabled) {
        setStatus('Auto-sync off. You can still use Test, Pull, and Push.', 'info');
        return;
      }

      if (!settings.token) {
        setStatus('Paste your token first, then turn auto-sync on.', 'error');
        updateAutoSyncButton(false);
        saveSettingsFromForm();
        return;
      }

      setStatus('Connecting…', 'info');
      try {
        await runInitialSync(settings);
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });

    Object.values(fields).forEach((field) => {
      field.addEventListener('input', () => saveSettingsFromForm());
      field.addEventListener('change', () => saveSettingsFromForm());
      field.addEventListener('paste', () => {
        setTimeout(() => saveSettingsFromForm(), 0);
      });
    });

    document.getElementById('sync-test-btn').addEventListener('click', async (event) => {
      event.preventDefault();
      const btn = event.currentTarget;
      const settings = readSettings();
      saveSettingsFromForm();

      setStatus('Testing token…', 'info');
      btn.disabled = true;

      try {
        const user = await GitHubSync.testToken(settings);
        setStatus(`Token OK — signed in as ${user.login}`, 'success');
      } catch (error) {
        setStatus(error.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('sync-pull-btn').addEventListener('click', async () => {
      const settings = saveSettingsFromForm();
      try {
        await Storage.pullFromGitHub({ settings });
        refreshAfterSync();
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });

    document.getElementById('sync-push-btn').addEventListener('click', async () => {
      const settings = saveSettingsFromForm();
      try {
        await Storage.pushToGitHub({ settings });
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
  },

  bindLog() {
    document.getElementById('log-filter-item').addEventListener('change', () => this.renderLog());
    document.getElementById('log-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-edit-session]');
      if (!btn) return;
      const session = Storage.getSessionById(btn.dataset.editSession);
      if (session) this.openSessionFeedback(session, { editing: true });
    });
  },

  bindProgress() {
    document.getElementById('progress-item-select').addEventListener('change', () => this.renderProgress());
  },

  refreshAll() {
    this.refreshItemSelects();
    this.renderItems();
    this.renderLog();
  },

  refreshItemSelects() {
    const items = Storage.getItems();
    const selects = [
      document.getElementById('practice-item-select'),
      document.getElementById('log-filter-item'),
      document.getElementById('progress-item-select')
    ];

    selects.forEach((select, idx) => {
      const current = select.value;
      const placeholder = idx === 0 || idx === 2
        ? '<option value="">Select an item…</option>'
        : '<option value="">All items</option>';
      select.innerHTML = placeholder +
        items.map((i) => `<option value="${i.id}">${itemSelectLabel(i)}</option>`).join('');
      if (current && items.some((i) => i.id === current)) select.value = current;
    });
  },

  renderItems() {
    const items = Storage.getItems();
    const list = document.getElementById('items-list');
    const empty = document.getElementById('items-empty');

    if (!items.length) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.innerHTML = items.map((item) => {
      const sessions = Storage.getSessionsForItem(item.id);
      const totalMin = Math.round(sessions.reduce((s, x) => s + x.durationSeconds, 0) / 60);
      const peakTempo = sessions.length ? Math.max(...sessions.map((s) => s.tempo)) : null;

      return `<li class="item-row${this.editingItemId === item.id ? ' editing' : ''}">
        <div class="item-info">
          <div class="item-title">${itemDisplayName(item)}</div>
          ${item.description ? `<div class="item-description">${item.description}</div>` : ''}
          <div class="item-meta">${sessions.length} sessions · ${totalMin} min${peakTempo ? ' · peak ' + peakTempo + ' BPM' : ''}${item.targetTempo ? ' · target ' + item.targetTempo + ' BPM' : ''}</div>
        </div>
        <div class="item-actions">
          <button type="button" class="btn btn-secondary btn-small" data-edit="${item.id}">Edit</button>
          <button type="button" class="btn btn-danger btn-small" data-delete="${item.id}">Delete</button>
        </div>
      </li>`;
    }).join('');

    list.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => this.startEditItem(btn.dataset.edit));
    });

    list.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.editingItemId === btn.dataset.delete) this.cancelEditItem();
        if (confirm('Delete this practice item? Session history will remain.')) {
          Storage.deleteItem(btn.dataset.delete);
          this.refreshAll();
        }
      });
    });
  },

  renderLog() {
    const filterId = document.getElementById('log-filter-item').value;
    let sessions = Storage.getSessions();
    if (filterId) sessions = sessions.filter((s) => s.itemId === filterId);

    const list = document.getElementById('log-list');
    const empty = document.getElementById('log-empty');

    if (!sessions.length) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.innerHTML = sessions.slice(0, 50).map((s) => {
      const tempoText = s.mode === 'ramp' && s.startTempo != null
        ? `${s.startTempo}→${s.tempo} BPM`
        : `${s.tempo} BPM`;
      const rating = normalizeSessionRating(s.rating);
      const stars = formatStarRating(rating);
      const notes = (s.notes || '').trim();
      const feedbackBits = [];
      if (stars) {
        feedbackBits.push(`<div class="log-feedback"><span class="log-stars" aria-label="${rating} of 5 stars">${stars}</span></div>`);
      }
      if (notes) {
        feedbackBits.push(`<div class="log-feedback"><div class="log-notes">${escapeHtml(notes)}</div></div>`);
      }
      const editLabel = stars || notes ? 'Edit notes' : 'Add notes';
      return `
      <li class="log-row">
        <div class="log-info">
          <div class="log-date">${formatDate(s.startedAt)}</div>
          <div class="log-detail">
            <strong>${escapeHtml(sessionDisplayName(s))}</strong> — ${formatDuration(s.durationSeconds)} at
            <span class="log-tempo">${tempoText}</span>
            ${s.completed ? '' : ' (stopped early)'}
          </div>
          ${feedbackBits.join('')}
        </div>
        <button type="button" class="btn btn-secondary btn-small" data-edit-session="${s.id}">${editLabel}</button>
      </li>
    `;
    }).join('');
  },

  renderProgress() {
    const itemId = document.getElementById('progress-item-select').value;
    const tempoCanvas = document.getElementById('tempo-chart');
    const timeCanvas = document.getElementById('time-chart');
    const tempoEmpty = document.getElementById('tempo-chart-empty');
    const timeEmpty = document.getElementById('time-chart-empty');
    const statsGrid = document.getElementById('stats-grid');

    let sessions = Storage.getSessions();
    if (itemId) sessions = sessions.filter((s) => s.itemId === itemId);

    if (!sessions.length) {
      tempoEmpty.hidden = false;
      timeEmpty.hidden = false;
      tempoCanvas.hidden = true;
      timeCanvas.hidden = true;
      statsGrid.hidden = true;
      return;
    }

    tempoCanvas.hidden = false;
    timeCanvas.hidden = false;
    statsGrid.hidden = false;
    tempoEmpty.hidden = Charts.drawTempoChart(tempoCanvas, sessions);
    timeEmpty.hidden = Charts.drawTimeChart(timeCanvas, sessions);

    const totalMin = Math.round(sessions.reduce((s, x) => s + x.durationSeconds, 0) / 60);
    const tempos = sessions.map((s) => s.tempo);
    document.getElementById('stat-sessions').textContent = sessions.length;
    document.getElementById('stat-minutes').textContent = totalMin;
    document.getElementById('stat-peak-tempo').textContent = Math.max(...tempos);
    document.getElementById('stat-avg-tempo').textContent = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length);
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await Storage.init();
  App.init();
});
