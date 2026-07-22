const App = {
  metronome: new Metronome(),
  session: null,
  timerInterval: null,
  editingItemId: null,
  editingCycleId: null,
  cycleDraftSteps: [],
  cycleRun: null,
  practiceMode: 'practice',
  feedbackSessionId: null,
  feedbackPendingSession: null,
  feedbackRating: 0,
  feedbackEditing: false,
  manualLogRating: 0,
  logCalendarMonth: null,
  logDateFilterBeforeCalendar: '',
  pendingLogDayFilter: null,

  init() {
    this.loadBuildLabel();
    this.loadMetronomeOptions();
    this.bindNavigation();
    this.bindPractice();
    this.bindMetronomeOptions();
    this.bindItems();
    this.bindCycles();
    this.bindSync();
    this.bindLog();
    this.bindManualLog();
    this.bindSessionFeedback();
    this.bindProgress();
    this.refreshAll();
  },

  bindNavigation() {
    const titles = {
      practice: 'Practice',
      metronome: 'Metronome',
      items: 'Items',
      cycles: 'Cycles',
      log: 'Log',
      progress: 'Progress'
    };

    const menuToggle = document.getElementById('menu-toggle');
    const navMenu = document.getElementById('nav-menu');

    const closeMenu = () => {
      navMenu.hidden = true;
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open menu');
    };

    const openMenu = () => {
      navMenu.hidden = false;
      menuToggle.setAttribute('aria-expanded', 'true');
      menuToggle.setAttribute('aria-label', 'Close menu');
    };

    const toggleMenu = () => {
      if (navMenu.hidden) openMenu();
      else closeMenu();
    };

    menuToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleMenu();
    });

    document.addEventListener('click', (event) => {
      if (navMenu.hidden) return;
      if (navMenu.contains(event.target) || menuToggle.contains(event.target)) return;
      closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !navMenu.hidden) {
        closeMenu();
        menuToggle.focus();
      }
    });

    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`view-${view}`).classList.add('active');
        document.getElementById('page-title').textContent = titles[view];
        closeMenu();

        if (view === 'progress') this.renderProgress();
        if (view === 'log') this.renderLog();
        if (view === 'cycles') this.renderCycles();
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
    const clickSoundSelect = document.getElementById('metronome-click-sound');
    const countInSoundSelect = document.getElementById('metronome-count-in-sound');
    const bellSoundSelect = document.getElementById('metronome-bell-sound');

    if (subdivisionSelect) {
      this.metronome.setSubdivision(subdivisionSelect.value);
    }
    if (accentBtn) {
      this.metronome.setAccentDownbeat(accentBtn.classList.contains('on'));
    }
    if (quarterAccentBtn) {
      // Applied by the metronome only when a subdivision (> quarter) is active.
      this.metronome.setAccentQuarterBeats(quarterAccentBtn.classList.contains('on'));
    }
    if (clickSoundSelect) {
      this.metronome.setClickSound(clickSoundSelect.value);
    }
    if (countInSoundSelect) {
      this.metronome.setCountInSound(countInSoundSelect.value);
    }
    if (bellSoundSelect) {
      this.metronome.setBellSound(bellSoundSelect.value);
    }
  },

  getMetronomeOptionsFromDom() {
    return {
      accentDownbeat: document.getElementById('metronome-accent-btn')?.classList.contains('on') ?? true,
      accentQuarterBeats: document.getElementById('metronome-quarter-accent-btn')?.classList.contains('on') ?? true,
      countIn: document.getElementById('metronome-count-in-btn')?.classList.contains('on') ?? false,
      timerBell: document.getElementById('metronome-timer-bell-btn')?.classList.contains('on') ?? true,
      clickSound: document.getElementById('metronome-click-sound')?.value || 'beep',
      countInSound: document.getElementById('metronome-count-in-sound')?.value || 'same',
      bellSound: document.getElementById('metronome-bell-sound')?.value || 'bell'
    };
  },

  loadMetronomeOptions() {
    let options = null;
    try {
      const raw = localStorage.getItem('guitar-practice-tracker-metronome-options');
      if (raw) options = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    const setToggle = (id, enabled) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.textContent = enabled ? 'On' : 'Off';
      btn.classList.toggle('on', enabled);
      btn.classList.toggle('off', !enabled);
      btn.setAttribute('aria-pressed', String(enabled));
    };

    if (options) {
      setToggle('metronome-accent-btn', options.accentDownbeat !== false);
      setToggle('metronome-quarter-accent-btn', options.accentQuarterBeats !== false);
      setToggle('metronome-count-in-btn', !!options.countIn);
      setToggle('metronome-timer-bell-btn', options.timerBell !== false);
      const clickSelect = document.getElementById('metronome-click-sound');
      const countInSelect = document.getElementById('metronome-count-in-sound');
      const bellSelect = document.getElementById('metronome-bell-sound');
      if (clickSelect && options.clickSound) clickSelect.value = options.clickSound;
      if (countInSelect && options.countInSound) countInSelect.value = options.countInSound;
      if (bellSelect && options.bellSound) bellSelect.value = options.bellSound;
    }

    this.applyMetronomeOptions();
  },

  saveMetronomeOptions() {
    try {
      localStorage.setItem(
        'guitar-practice-tracker-metronome-options',
        JSON.stringify(this.getMetronomeOptionsFromDom())
      );
    } catch {
      /* ignore */
    }
  },

  updateToggleButton(btn, enabled) {
    btn.textContent = enabled ? 'On' : 'Off';
    btn.classList.toggle('on', enabled);
    btn.classList.toggle('off', !enabled);
    btn.setAttribute('aria-pressed', String(enabled));
  },

  bindMetronomeOptions() {
    const accentBtn = document.getElementById('metronome-accent-btn');
    const quarterAccentBtn = document.getElementById('metronome-quarter-accent-btn');
    const countInBtn = document.getElementById('metronome-count-in-btn');
    const timerBellBtn = document.getElementById('metronome-timer-bell-btn');
    const clickSoundSelect = document.getElementById('metronome-click-sound');
    const countInSoundSelect = document.getElementById('metronome-count-in-sound');
    const bellSoundSelect = document.getElementById('metronome-bell-sound');
    const previewBellBtn = document.getElementById('metronome-preview-bell-btn');

    const onChange = () => {
      this.applyMetronomeOptions();
      this.saveMetronomeOptions();
    };

    accentBtn?.addEventListener('click', () => {
      this.updateToggleButton(accentBtn, !accentBtn.classList.contains('on'));
      onChange();
    });

    quarterAccentBtn?.addEventListener('click', () => {
      this.updateToggleButton(quarterAccentBtn, !quarterAccentBtn.classList.contains('on'));
      onChange();
    });

    countInBtn?.addEventListener('click', () => {
      this.updateToggleButton(countInBtn, !countInBtn.classList.contains('on'));
      onChange();
    });

    timerBellBtn?.addEventListener('click', () => {
      this.updateToggleButton(timerBellBtn, !timerBellBtn.classList.contains('on'));
      onChange();
    });

    clickSoundSelect?.addEventListener('change', onChange);
    countInSoundSelect?.addEventListener('change', onChange);
    bellSoundSelect?.addEventListener('change', onChange);

    previewBellBtn?.addEventListener('click', async () => {
      this.applyMetronomeOptions();
      await this.metronome.init();
      this.metronome.playBell();
    });
  },

  isCountInEnabled() {
    return document.getElementById('metronome-count-in-btn')?.classList.contains('on') ?? false;
  },

  isTimerBellEnabled() {
    return document.getElementById('metronome-timer-bell-btn')?.classList.contains('on') ?? true;
  },

  async runCountInIfEnabled() {
    if (!this.isCountInEnabled()) return null;

    const statusEl = document.getElementById('session-status');
    statusEl.textContent = 'Count in…';
    statusEl.classList.remove('running', 'paused');

    return this.metronome.playCountIn(4, (beat, accent) => {
      this.updateBeatPie(beat, { accent, pulse: true });
    });
  },

  playTimerBellIfEnabled() {
    if (!this.isTimerBellEnabled()) return;
    this.metronome.playBell();
  },

  bindPractice() {
    const tempoInput = document.getElementById('tempo-bpm');
    const tempoDisplay = document.getElementById('tempo-display');
    const timerInput = document.getElementById('timer-minutes');
    const timerDisplay = document.getElementById('session-timer');
    const startBtn = document.getElementById('start-stop-btn');
    const statusEl = document.getElementById('session-status');

    const updateTempoDisplay = (bpm) => {
      tempoDisplay.textContent = `${bpm} BPM`;
    };

    const clampBpm = (raw, fallback = 120) => {
      const n = parseInt(String(raw).trim(), 10);
      if (Number.isNaN(n)) return fallback;
      return Math.max(40, Math.min(300, n));
    };

    const commitTempo = () => {
      const bpm = clampBpm(tempoInput.value, 120);
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
        const minutes = parseTimerMinutes(document.getElementById('ramp-minutes').value, 5);
        timerDisplay.textContent = formatDuration(timerMinutesToSeconds(minutes));
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
      tempoInput.value = Math.min(300, clampBpm(tempoInput.value, 120) + 1);
      commitTempo();
    });
    document.getElementById('tempo-down').addEventListener('click', () => {
      tempoInput.value = Math.max(40, clampBpm(tempoInput.value, 120) - 1);
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

    const rampStartInput = document.getElementById('ramp-start-bpm');
    const rampEndInput = document.getElementById('ramp-end-bpm');
    const rampMinutesInput = document.getElementById('ramp-minutes');

    const commitRampBpm = (input, fallback) => {
      const bpm = clampBpm(input.value, fallback);
      input.value = bpm;
      if (!this.session && this.practiceMode === 'ramp') this.updatePracticeModeUI();
    };

    const commitRampMinutes = () => {
      const minutes = parseTimerMinutes(rampMinutesInput.value, 5);
      rampMinutesInput.value = formatTimerMinutes(minutes);
      if (!this.session && this.practiceMode === 'ramp') resetTimerDisplay();
    };

    rampStartInput.addEventListener('blur', () => commitRampBpm(rampStartInput, 60));
    rampEndInput.addEventListener('blur', () => commitRampBpm(rampEndInput, 120));
    rampStartInput.addEventListener('input', () => {
      if (!this.session && this.practiceMode === 'ramp') this.updatePracticeModeUI();
    });
    rampEndInput.addEventListener('input', () => {
      if (!this.session && this.practiceMode === 'ramp') this.updatePracticeModeUI();
    });

    document.getElementById('ramp-start-up').addEventListener('click', () => {
      rampStartInput.value = Math.min(300, clampBpm(rampStartInput.value, 60) + 1);
      commitRampBpm(rampStartInput, 60);
    });
    document.getElementById('ramp-start-down').addEventListener('click', () => {
      rampStartInput.value = Math.max(40, clampBpm(rampStartInput.value, 60) - 1);
      commitRampBpm(rampStartInput, 60);
    });
    document.getElementById('ramp-end-up').addEventListener('click', () => {
      rampEndInput.value = Math.min(300, clampBpm(rampEndInput.value, 120) + 1);
      commitRampBpm(rampEndInput, 120);
    });
    document.getElementById('ramp-end-down').addEventListener('click', () => {
      rampEndInput.value = Math.max(40, clampBpm(rampEndInput.value, 120) - 1);
      commitRampBpm(rampEndInput, 120);
    });

    rampMinutesInput.addEventListener('input', () => {
      if (!this.session && this.practiceMode === 'ramp') {
        const raw = rampMinutesInput.value.trim();
        if (raw === '') return;
        const n = parseFloat(raw);
        if (Number.isNaN(n)) return;
        timerDisplay.textContent = formatDuration(timerMinutesToSeconds(n));
      }
    });
    rampMinutesInput.addEventListener('blur', commitRampMinutes);
    document.getElementById('ramp-minutes-up').addEventListener('click', () => {
      rampMinutesInput.value = formatTimerMinutes(parseTimerMinutes(rampMinutesInput.value, 5) + 0.25);
      commitRampMinutes();
    });
    document.getElementById('ramp-minutes-down').addEventListener('click', () => {
      rampMinutesInput.value = formatTimerMinutes(parseTimerMinutes(rampMinutesInput.value, 5) - 0.25);
      commitRampMinutes();
    });

    const subdivisionSelect = document.getElementById('metronome-subdivision');

    subdivisionSelect.addEventListener('change', () => {
      this.applyMetronomeOptions();
    });
    subdivisionSelect.addEventListener('input', () => {
      this.applyMetronomeOptions();
    });

    this.applyMetronomeOptions();

    this.metronome.onBeat = (_beat, accent, info) => {
      // Advance measure/beat pie on quarter onsets only (ignore subdivision ticks).
      if (info?.isBeatStart) {
        this.updateMeasureBeatDisplay(info.measure, info.beat);
        this.updateBeatPie(info.beat, { accent, pulse: true });
      } else {
        this.pulseBeatPie(accent);
      }
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

    document.getElementById('practice-item-select').addEventListener('change', () => {
      this.applyPracticeSelection();
    });

    this.bindPracticeItemRichSelect();

    this.updatePracticeModeUI();
    commitTempo();
    resetTimerDisplay();
  },

  bindPracticeItemRichSelect() {
    const trigger = document.getElementById('practice-item-trigger');
    const menu = document.getElementById('practice-item-menu');
    const select = document.getElementById('practice-item-select');
    const rich = document.getElementById('practice-item-rich');
    if (!trigger || !menu || !select || !rich || trigger.dataset.bound === '1') return;
    trigger.dataset.bound = '1';

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      if (trigger.disabled) return;
      if (trigger.getAttribute('aria-expanded') === 'true') {
        this.closePracticeItemRichSelect();
      } else {
        this.openPracticeItemRichSelect();
      }
    });

    menu.addEventListener('click', (event) => {
      const option = event.target.closest('[data-value]');
      if (!option || !menu.contains(option)) return;
      const value = option.getAttribute('data-value') ?? '';
      if (select.value !== value) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        this.syncPracticeItemRichSelect();
      }
      this.closePracticeItemRichSelect();
    });

    document.addEventListener('click', (event) => {
      if (!rich.contains(event.target)) this.closePracticeItemRichSelect();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closePracticeItemRichSelect();
    });
  },

  openPracticeItemRichSelect() {
    const trigger = document.getElementById('practice-item-trigger');
    const menu = document.getElementById('practice-item-menu');
    if (!trigger || !menu || trigger.disabled) return;
    this.renderPracticeItemRichMenu();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  },

  closePracticeItemRichSelect() {
    const trigger = document.getElementById('practice-item-trigger');
    const menu = document.getElementById('practice-item-menu');
    if (!trigger || !menu) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  },

  renderPracticeItemRichMenu() {
    const menu = document.getElementById('practice-item-menu');
    const select = document.getElementById('practice-item-select');
    if (!menu || !select) return;

    const current = select.value;
    const items = Storage.getItems();
    const cycles = Storage.getCycles();
    const parts = [];

    const optionHtml = (value, title, metaHtml, isPlaceholder = false) => {
      const selected = current === value;
      return `<button type="button" class="rich-select-option${selected ? ' is-selected' : ''}" role="option" data-value="${escapeHtml(value)}" aria-selected="${selected ? 'true' : 'false'}">
        <span class="rich-select-option-title">${escapeHtml(title)}</span>
        ${isPlaceholder ? '' : `<span class="rich-select-option-meta">${metaHtml}</span>`}
      </button>`;
    };

    parts.push(optionHtml('', 'Select an item or cycle…', '', true));

    const validCycles = cycles.filter((cycle) => this.resolveCycleSteps(cycle).length);
    if (validCycles.length) {
      parts.push('<div class="rich-select-group-label">Cycles</div>');
      validCycles.forEach((cycle) => {
        const value = `cycle:${cycle.id}`;
        const session = getLatestSessionForCycle(cycle.id);
        parts.push(optionHtml(value, cycleSelectLabel(cycle), formatLastSessionMetaHtml(session)));
      });
    }

    if (items.length) {
      parts.push('<div class="rich-select-group-label">Items</div>');
      items.forEach((item) => {
        const session = getLatestSessionForItem(item.id);
        parts.push(optionHtml(item.id, itemSelectLabel(item), formatLastSessionMetaHtml(session)));
      });
    }

    menu.innerHTML = parts.join('');
  },

  syncPracticeItemRichSelect() {
    const select = document.getElementById('practice-item-select');
    const titleEl = document.getElementById('practice-item-trigger-title');
    const metaEl = document.getElementById('practice-item-trigger-meta');
    if (!select || !titleEl || !metaEl) return;

    const value = select.value;
    if (!value) {
      titleEl.textContent = 'Select an item or cycle…';
      metaEl.innerHTML = '';
      metaEl.hidden = true;
      return;
    }

    const selection = parsePracticeSelection(value);
    if (selection.type === 'cycle') {
      const cycle = Storage.getCycleById(selection.cycleId);
      titleEl.textContent = cycle ? cycleSelectLabel(cycle) : 'Cycle';
      metaEl.innerHTML = formatLastSessionMetaHtml(getLatestSessionForCycle(selection.cycleId));
      metaEl.hidden = false;
      return;
    }

    if (selection.type === 'item') {
      const item = Storage.getItemById(selection.itemId);
      titleEl.textContent = item ? itemSelectLabel(item) : 'Item';
      metaEl.innerHTML = formatLastSessionMetaHtml(getLatestSessionForItem(selection.itemId));
      metaEl.hidden = false;
    }
  },

  applyPracticeSelection() {
    if (this.session) return;

    const tempoInput = document.getElementById('tempo-bpm');
    const timerInput = document.getElementById('timer-minutes');
    const timerDisplay = document.getElementById('session-timer');
    const tempoDisplay = document.getElementById('tempo-display');
    const hint = document.getElementById('cycle-preview-hint');
    const statusEl = document.getElementById('session-status');
    const selection = parsePracticeSelection(document.getElementById('practice-item-select').value);

    if (selection.type === 'cycle') {
      const cycle = Storage.getCycleById(selection.cycleId);
      const steps = this.resolveCycleSteps(cycle);
      if (!cycle || !steps.length) {
        if (hint) {
          hint.hidden = true;
          hint.textContent = '';
        }
        this.syncPracticeItemRichSelect();
        return;
      }

      const first = steps[0];
      if (this.practiceMode !== 'ramp') {
        tempoInput.value = first.tempo;
        tempoDisplay.textContent = `${first.tempo} BPM`;
        this.metronome.setBpm(first.tempo);
      }
      if (this.practiceMode === 'practice') {
        timerInput.value = formatTimerMinutes(first.durationMinutes);
        timerDisplay.textContent = formatDuration(timerMinutesToSeconds(first.durationMinutes));
      }

      const totalSeconds = steps.reduce((sum, step) => sum + timerMinutesToSeconds(step.durationMinutes), 0) * (cycle.rounds || 1);
      const totalLabel = totalSeconds >= 60
        ? `${Math.round(totalSeconds / 60)} min`
        : formatDuration(totalSeconds);
      if (hint) {
        hint.hidden = false;
        hint.textContent = `${steps.length} steps · ${cycle.rounds} rounds · ~${totalLabel} total`;
      }
      if (statusEl && !statusEl.classList.contains('running') && !statusEl.classList.contains('paused')) {
        statusEl.textContent = 'Ready';
      }
      this.syncPracticeItemRichSelect();
      return;
    }

    if (hint) {
      hint.hidden = true;
      hint.textContent = '';
    }

    if (selection.type === 'item' && this.practiceMode !== 'ramp') {
      const item = Storage.getItemById(selection.itemId);
      const lastSession = getLatestSessionForItem(selection.itemId);
      const rawBpm = lastSession?.tempo ?? item?.targetTempo;
      const bpm = parseInt(rawBpm, 10);
      if (!Number.isNaN(bpm)) {
        const clamped = Math.max(40, Math.min(300, bpm));
        tempoInput.value = clamped;
        tempoDisplay.textContent = `${clamped} BPM`;
        this.metronome.setBpm(clamped);
      }
    }

    this.syncPracticeItemRichSelect();
  },

  resolveCycleSteps(cycle) {
    if (!cycle || !Array.isArray(cycle.steps)) return [];
    return cycle.steps.map((step) => {
      const item = Storage.getItemById(step.itemId);
      if (!item) return null;
      const durationMinutes = step.durationMinutes != null
        ? parseTimerMinutes(step.durationMinutes, 1)
        : 1;
      const tempo = step.tempoBpm
        || item.targetTempo
        || parseInt(document.getElementById('tempo-bpm')?.value, 10)
        || 120;
      return {
        itemId: item.id,
        itemName: itemDisplayName(item),
        durationMinutes,
        tempo: Math.max(40, Math.min(300, tempo))
      };
    }).filter(Boolean);
  },

  cycleStatusText() {
    if (!this.cycleRun) return 'Practicing…';
    const { roundIndex, rounds, stepIndex, steps, cycleName } = this.cycleRun;
    const step = steps[stepIndex];
    const name = step?.itemName || 'Step';
    return `${cycleName}: R${roundIndex + 1}/${rounds} · ${stepIndex + 1}/${steps.length} · ${name}`;
  },

  updatePracticeModeUI() {
    const itemField = document.getElementById('practice-item-field');
    const itemLabel = document.getElementById('practice-item-label');
    const fixedPanel = document.getElementById('fixed-tempo-panel');
    const rampPanel = document.getElementById('ramp-tempo-panel');
    const timerField = document.getElementById('timer-field');
    const tempoDisplay = document.getElementById('tempo-display');
    const hint = document.getElementById('cycle-preview-hint');

    if (this.practiceMode === 'free') {
      itemField.hidden = true;
      fixedPanel.hidden = false;
      rampPanel.hidden = true;
      timerField.hidden = true;
      if (hint) hint.hidden = true;
      const bpm = parseInt(document.getElementById('tempo-bpm').value, 10) || 120;
      tempoDisplay.textContent = `${bpm} BPM`;
      return;
    }

    itemField.hidden = false;
    if (this.practiceMode === 'ramp') {
      itemLabel.textContent = 'Practice item (optional)';
      fixedPanel.hidden = true;
      rampPanel.hidden = false;
      if (hint) hint.hidden = true;
      const start = Math.max(40, Math.min(300, parseInt(document.getElementById('ramp-start-bpm').value, 10) || 60));
      const end = Math.max(40, Math.min(300, parseInt(document.getElementById('ramp-end-bpm').value, 10) || 120));
      tempoDisplay.textContent = `${start} → ${end} BPM`;
    } else {
      itemLabel.textContent = 'Practice item or cycle';
      fixedPanel.hidden = false;
      rampPanel.hidden = true;
      timerField.hidden = false;
      const bpm = parseInt(document.getElementById('tempo-bpm').value, 10) || 120;
      tempoDisplay.textContent = `${bpm} BPM`;
      this.applyPracticeSelection();
    }
  },

  setPracticeFormDisabled(disabled) {
    // Lock session setup fields while running; metronome settings stay editable
    // so tempo/subdivision/accents can change and take effect immediately.
    document.querySelectorAll('#view-practice .mode-btn').forEach((b) => { b.disabled = disabled; });
    document.getElementById('practice-item-select').disabled = disabled;
    const practiceTrigger = document.getElementById('practice-item-trigger');
    if (practiceTrigger) practiceTrigger.disabled = disabled;
    if (disabled) this.closePracticeItemRichSelect();
    document.getElementById('timer-minutes').disabled = disabled;
    document.getElementById('timer-up').disabled = disabled;
    document.getElementById('timer-down').disabled = disabled;
    document.getElementById('ramp-start-bpm').disabled = disabled;
    document.getElementById('ramp-end-bpm').disabled = disabled;
    document.getElementById('ramp-minutes').disabled = disabled;
    document.getElementById('ramp-start-up').disabled = disabled;
    document.getElementById('ramp-start-down').disabled = disabled;
    document.getElementById('ramp-end-up').disabled = disabled;
    document.getElementById('ramp-end-down').disabled = disabled;
    document.getElementById('ramp-minutes-up').disabled = disabled;
    document.getElementById('ramp-minutes-down').disabled = disabled;
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

    const selection = parsePracticeSelection(document.getElementById('practice-item-select').value);

    if (this.practiceMode === 'practice' && selection.type === 'cycle') {
      await this.startCycle(selection.cycleId);
      return;
    }

    if (this.practiceMode === 'practice' && selection.type === 'none') {
      alert('Please select a practice item or cycle first.');
      return;
    }

    if (selection.type === 'cycle' && this.practiceMode !== 'practice') {
      alert('Cycles only run in Practice mode. Switch to Practice, or pick a single item.');
      return;
    }

    const statusEl = document.getElementById('session-status');
    const timerDisplay = document.getElementById('session-timer');
    const tempoInput = document.getElementById('tempo-bpm');
    const itemId = selection.type === 'item' ? selection.itemId : null;

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
      const clampRampBpm = (raw, fallback) => {
        const n = parseInt(String(raw).trim(), 10);
        if (Number.isNaN(n)) return fallback;
        return Math.max(40, Math.min(300, n));
      };
      startTempo = clampRampBpm(document.getElementById('ramp-start-bpm').value, 60);
      endTempo = clampRampBpm(document.getElementById('ramp-end-bpm').value, 120);
      document.getElementById('ramp-start-bpm').value = startTempo;
      document.getElementById('ramp-end-bpm').value = endTempo;
      const minutes = parseTimerMinutes(document.getElementById('ramp-minutes').value, 5);
      document.getElementById('ramp-minutes').value = formatTimerMinutes(minutes);
      totalSeconds = timerMinutesToSeconds(minutes);
      tempo = endTempo;
      this.metronome.setRamp(startTempo, endTempo, totalSeconds);
      document.getElementById('tempo-display').textContent = `${startTempo} BPM`;
    } else if (this.practiceMode === 'free') {
      totalSeconds = null;
      tempo = parseInt(tempoInput.value, 10) || 120;
      this.metronome.setBpm(tempo);
    } else {
      const minutes = parseTimerMinutes(document.getElementById('timer-minutes').value, 3);
      document.getElementById('timer-minutes').value = formatTimerMinutes(minutes);
      totalSeconds = timerMinutesToSeconds(minutes);
      tempo = parseInt(tempoInput.value, 10) || 120;
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

    this.resetMeasureBeatDisplay();
    const nextBeatTime = await this.runCountInIfEnabled();
    await this.metronome.start(nextBeatTime != null ? { nextBeatTime } : undefined);
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

  async startCycle(cycleId) {
    const cycle = Storage.getCycleById(cycleId);
    const steps = this.resolveCycleSteps(cycle);
    if (!cycle) {
      alert('That cycle no longer exists.');
      return;
    }
    if (steps.length < 1) {
      alert('This cycle has no valid practice items. Edit it in the Cycles tab.');
      return;
    }

    this.cycleRun = {
      cycleId: cycle.id,
      cycleName: cycle.name || 'Cycle',
      rounds: cycle.rounds || 1,
      steps,
      roundIndex: 0,
      stepIndex: 0,
      lastLoggedSession: null
    };

    await this.beginCycleStep();
  },

  async beginCycleStep() {
    if (!this.cycleRun) return;

    const step = this.cycleRun.steps[this.cycleRun.stepIndex];
    if (!step) {
      this.finishCycleRun(true);
      return;
    }

    const statusEl = document.getElementById('session-status');
    const timerDisplay = document.getElementById('session-timer');
    const tempoInput = document.getElementById('tempo-bpm');
    const tempoDisplay = document.getElementById('tempo-display');
    const totalSeconds = timerMinutesToSeconds(step.durationMinutes);

    this.metronome.clearRamp();
    this.applyMetronomeOptions();
    tempoInput.value = step.tempo;
    tempoDisplay.textContent = `${step.tempo} BPM`;
    this.metronome.setBpm(step.tempo);
    document.getElementById('timer-minutes').value = formatTimerMinutes(step.durationMinutes);
    timerDisplay.textContent = formatDuration(totalSeconds);

    this.session = {
      mode: 'practice',
      itemId: step.itemId,
      itemName: step.itemName,
      tempo: step.tempo,
      startTempo: null,
      endTempo: null,
      plannedDurationSeconds: totalSeconds,
      remainingSeconds: totalSeconds,
      elapsedSeconds: 0,
      paused: false,
      startedAt: new Date().toISOString(),
      cycleId: this.cycleRun.cycleId,
      cycleName: this.cycleRun.cycleName,
      cycleRound: this.cycleRun.roundIndex + 1,
      cycleStepIndex: this.cycleRun.stepIndex
    };

    this.resetMeasureBeatDisplay();
    const nextBeatTime = await this.runCountInIfEnabled();
    await this.metronome.start(nextBeatTime != null ? { nextBeatTime } : undefined);
    this.setSessionControlsVisible(true);
    statusEl.textContent = this.cycleStatusText();
    statusEl.classList.remove('paused');
    statusEl.classList.add('running');
    this.setPracticeFormDisabled(true);
    this.startSessionTimer();
  },

  async advanceCycle() {
    if (!this.cycleRun) return;

    let { stepIndex, roundIndex, steps, rounds } = this.cycleRun;
    stepIndex += 1;
    if (stepIndex >= steps.length) {
      stepIndex = 0;
      roundIndex += 1;
    }

    if (roundIndex >= rounds) {
      this.finishCycleRun(true);
      return;
    }

    this.cycleRun.stepIndex = stepIndex;
    this.cycleRun.roundIndex = roundIndex;
    await this.beginCycleStep();
  },

  finishCycleRun(completed) {
    const feedbackSession = this.cycleRun?.lastLoggedSession || null;
    this.cycleRun = null;
    this.setSessionControlsVisible(false);
    this.setPracticeFormDisabled(false);

    const statusEl = document.getElementById('session-status');
    statusEl.classList.remove('running', 'paused');
    statusEl.textContent = completed ? 'Cycle complete!' : 'Cycle stopped';

    const timerDisplay = document.getElementById('session-timer');
    const tempoInput = document.getElementById('tempo-bpm');
    timerDisplay.textContent = formatDuration(timerMinutesToSeconds(document.getElementById('timer-minutes').value));
    document.getElementById('tempo-display').textContent = `${parseInt(tempoInput.value, 10) || 120} BPM`;
    this.applyPracticeSelection();
    this.renderLog();

    // Prompt once when the cycle ends — not after each step.
    if (feedbackSession) {
      this.openSessionFeedback(feedbackSession, { editing: false, cycleComplete: true });
    }
  },

  logCycleStepSession(session, completed) {
    if (!session?.itemId || session.elapsedSeconds < 5) return null;

    const recorded = Storage.addSession({
      id: generateId(),
      itemId: session.itemId,
      itemName: session.itemName,
      workedOn: '',
      tempo: session.tempo,
      startTempo: null,
      endTempo: null,
      mode: 'practice',
      durationSeconds: session.elapsedSeconds,
      plannedDurationSeconds: session.plannedDurationSeconds,
      startedAt: session.startedAt,
      completedAt: new Date().toISOString(),
      completed,
      rating: 0,
      notes: '',
      cycleId: session.cycleId || null,
      cycleName: session.cycleName || null,
      cycleRound: session.cycleRound || null,
      cycleStepIndex: session.cycleStepIndex != null ? session.cycleStepIndex : null
    });

    if (this.cycleRun) {
      this.cycleRun.lastLoggedSession = recorded;
    }
    this.showLastSession(recorded);
    return recorded;
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
    statusEl.textContent = this.cycleRun
      ? this.cycleStatusText()
      : (this.session.mode === 'free' ? 'Playing…' : 'Practicing…');
    statusEl.classList.remove('paused');
    statusEl.classList.add('running');
    pauseBtn.textContent = 'Pause';

    this.startSessionTimer();
  },

  updateMeasureBeatDisplay(measure, beat) {
    const measureEl = document.getElementById('measure-count');
    const beatEl = document.getElementById('beat-count');
    const m = Math.max(1, measure || 1);
    const b = Math.max(1, beat || 1);
    if (measureEl) measureEl.textContent = `Bar ${m}`;
    if (beatEl) beatEl.textContent = `Beat ${b}`;
  },

  updateBeatPie(beat, { accent = false, pulse = false } = {}) {
    const pie = document.getElementById('beat-pie');
    if (!pie) return;
    const beats = Math.max(0, Math.min(4, Number(beat) || 0));
    pie.style.setProperty('--beat-progress', String(beats * 25));
    if (pulse) this.pulseBeatPie(accent);
    else this.setBeatPieAccent(accent);
  },

  setBeatPieAccent(accent) {
    const beatIndicator = document.getElementById('beat-indicator');
    if (!beatIndicator) return;
    beatIndicator.classList.toggle('accent', !!accent);
  },

  pulseBeatPie(accent) {
    const beatIndicator = document.getElementById('beat-indicator');
    if (!beatIndicator) return;
    this.setBeatPieAccent(accent);
    beatIndicator.classList.add('active');
    setTimeout(() => beatIndicator.classList.remove('active'), 80);
  },

  resetBeatPie() {
    this.updateBeatPie(0, { accent: false, pulse: false });
    const beatIndicator = document.getElementById('beat-indicator');
    beatIndicator?.classList.remove('active', 'accent');
  },

  resetMeasureBeatDisplay() {
    this.updateMeasureBeatDisplay(1, 1);
    this.resetBeatPie();
  },

  stopSession(completed) {
    if (completed) {
      this.playTimerBellIfEnabled();
    }

    this.metronome.stop();
    this.metronome.clearRamp();
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.resetMeasureBeatDisplay();

    const statusEl = document.getElementById('session-status');
    const timerDisplay = document.getElementById('session-timer');
    const tempoInput = document.getElementById('tempo-bpm');
    const session = this.session;
    const inCycle = !!this.cycleRun;

    this.session = null;

    if (inCycle) {
      this.logCycleStepSession(session, completed);
      if (completed) {
        // Keep controls locked while auto-advancing; notes prompt waits until cycle end.
        statusEl.classList.remove('paused');
        statusEl.classList.add('running');
        this.setPracticeFormDisabled(true);
        this.advanceCycle();
      } else {
        this.finishCycleRun(false);
      }
      return;
    }

    this.setSessionControlsVisible(false);
    statusEl.classList.remove('running', 'paused');
    this.setPracticeFormDisabled(false);

    // durationSeconds is active practice time only (paused gaps never incremented elapsedSeconds).
    const shouldLogItem = session?.itemId && session.elapsedSeconds >= 5 && session.mode !== 'free';
    const canLogFree = session?.mode === 'free' && session.elapsedSeconds >= 5;

    if (shouldLogItem) {
      const loggedTempo = session.mode === 'ramp'
        ? this.metronome.getRoundedBpm()
        : session.tempo;

      const recorded = Storage.addSession({
        id: generateId(),
        itemId: session.itemId,
        itemName: session.itemName,
        workedOn: '',
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
      this.refreshItemSelects();
      this.renderLog();
    } else if (canLogFree) {
      const draft = {
        id: generateId(),
        itemId: null,
        itemName: null,
        workedOn: '',
        tempo: session.tempo,
        startTempo: null,
        endTempo: null,
        mode: 'free',
        durationSeconds: session.elapsedSeconds,
        plannedDurationSeconds: null,
        startedAt: session.startedAt,
        completedAt: new Date().toISOString(),
        completed: true,
        rating: 0,
        notes: ''
      };
      statusEl.textContent = 'Session ended';
      this.openSessionFeedback(draft, { editing: false, pending: true });
    } else {
      statusEl.textContent = 'Ready';
    }

    if (this.practiceMode === 'free') {
      timerDisplay.textContent = '0:00';
    } else if (this.practiceMode === 'ramp') {
      const minutes = parseTimerMinutes(document.getElementById('ramp-minutes').value, 5);
      document.getElementById('ramp-minutes').value = formatTimerMinutes(minutes);
      timerDisplay.textContent = formatDuration(timerMinutesToSeconds(minutes));
      this.updatePracticeModeUI();
    } else {
      timerDisplay.textContent = formatDuration(timerMinutesToSeconds(document.getElementById('timer-minutes').value));
      document.getElementById('tempo-display').textContent = `${parseInt(tempoInput.value, 10) || 120} BPM`;
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

    this.bindStarRatingControl({
      container: stars,
      getRating: () => this.feedbackRating,
      setRating: (value) => { this.feedbackRating = value; },
      render: () => this.renderFeedbackStars()
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

    const saveOnModEnter = (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.saveSessionFeedback();
      }
    };
    notes.addEventListener('keydown', saveOnModEnter);
    document.getElementById('session-feedback-worked-on').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.saveSessionFeedback();
      }
    });
  },

  renderFeedbackStars() {
    this.renderStarButtons('#session-feedback-stars', this.feedbackRating);
  },

  bindStarRatingControl({ container, getRating, setRating, render }) {
    if (!container) return;

    let dragging = false;
    let ratingBefore = 0;
    let startX = 0;
    let startY = 0;
    let moved = false;

    const applyFromEvent = (event) => {
      const point = event.changedTouches?.[0] || event;
      if (point?.clientX == null) return;
      const value = ratingFromStarClientX(container, point.clientX);
      setRating(value);
      render();
    };

    container.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      dragging = true;
      moved = false;
      ratingBefore = getRating();
      startX = event.clientX;
      startY = event.clientY;
      container.classList.add('is-dragging');
      try {
        container.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      applyFromEvent(event);
      event.preventDefault();
    });

    container.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 6) {
        moved = true;
      }
      applyFromEvent(event);
      event.preventDefault();
    });

    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      container.classList.remove('is-dragging');
      applyFromEvent(event);

      // Tap the same value again (without sliding) to clear.
      if (!moved && getRating() === ratingBefore && ratingBefore > 0) {
        setRating(0);
        render();
      }

      try {
        container.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    container.addEventListener('pointerup', endDrag);
    container.addEventListener('pointercancel', endDrag);

    // Keyboard: left/right adjust by half steps when a star button is focused.
    container.querySelectorAll('.star-btn').forEach((btn) => {
      btn.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const current = getRating() || 0;
        const next = event.key === 'ArrowRight'
          ? Math.min(5, current + 0.5 || 0.5)
          : Math.max(0, current - 0.5);
        setRating(normalizeSessionRating(next));
        render();
      });
    });
  },

  renderStarButtons(selector, rating) {
    const r = normalizeSessionRating(rating);
    document.querySelectorAll(`${selector} .star-btn`).forEach((btn) => {
      const value = parseFloat(btn.dataset.rating);
      const full = r >= value;
      const half = !full && r > 0 && r >= value - 0.5;
      btn.classList.toggle('active', full);
      btn.classList.toggle('half', half);
      if (full) btn.classList.remove('half');
      const selected = r > 0 && (r === value || r === value - 0.5);
      btn.setAttribute('aria-checked', String(selected));
    });
  },

  openSessionFeedback(session, { editing = false, pending = false, cycleComplete = false } = {}) {
    if (!session?.id) return;

    this.feedbackPendingSession = pending ? session : null;
    this.feedbackSessionId = pending ? null : session.id;
    this.feedbackEditing = editing;
    this.feedbackRating = normalizeSessionRating(session.rating);

    const modal = document.getElementById('session-feedback-modal');
    const title = document.getElementById('session-feedback-title');
    const summary = document.getElementById('session-feedback-summary');
    const notes = document.getElementById('session-feedback-notes');
    const skipBtn = document.getElementById('session-feedback-skip-btn');
    const workedOnField = document.getElementById('session-feedback-worked-on-field');
    const workedOnInput = document.getElementById('session-feedback-worked-on');
    const isFree = session.mode === 'free';

    if (pending && isFree) {
      title.textContent = 'Log free session';
      skipBtn.textContent = "Don't log";
    } else if (editing) {
      title.textContent = 'Edit session notes';
      skipBtn.textContent = 'Cancel';
    } else if (cycleComplete && session.cycleName) {
      title.textContent = 'Cycle notes';
      skipBtn.textContent = 'Skip';
    } else {
      title.textContent = 'Session notes';
      skipBtn.textContent = 'Skip';
    }

    const tempoText = session.mode === 'ramp' && session.startTempo != null
      ? `${session.startTempo}→${session.tempo} BPM`
      : `${session.tempo} BPM`;
    const name = sessionDisplayName(session);
    let summaryText;
    if (cycleComplete && session.cycleName) {
      summaryText = `${session.cycleName} complete`;
      if (name && name !== 'Untitled') {
        summaryText += ` · last step ${name} — ${formatDuration(session.durationSeconds)} at ${tempoText}`;
      }
    } else if (isFree && (!name || name === 'Untitled')) {
      summaryText = `${formatDuration(session.durationSeconds)} at ${tempoText}`;
    } else {
      summaryText = `${name} — ${formatDuration(session.durationSeconds)} at ${tempoText}`;
      if (session.cycleName) {
        summaryText += ` · ${session.cycleName}`;
        if (session.cycleRound) summaryText += ` round ${session.cycleRound}`;
      }
    }
    summary.textContent = summaryText;

    workedOnField.hidden = !isFree;
    workedOnInput.value = session.workedOn || '';
    notes.value = session.notes || '';
    this.renderFeedbackStars();
    modal.hidden = false;
    if (isFree) workedOnInput.focus();
    else notes.focus();
  },

  closeSessionFeedback() {
    const modal = document.getElementById('session-feedback-modal');
    modal.hidden = true;
    this.feedbackSessionId = null;
    this.feedbackPendingSession = null;
    this.feedbackRating = 0;
    this.feedbackEditing = false;
    document.getElementById('session-feedback-worked-on').value = '';
    document.getElementById('session-feedback-notes').value = '';
  },

  saveSessionFeedback() {
    const notes = document.getElementById('session-feedback-notes').value.trim();
    const rating = normalizeSessionRating(this.feedbackRating);
    const workedOn = document.getElementById('session-feedback-worked-on').value.trim();

    if (this.feedbackPendingSession) {
      const draft = this.feedbackPendingSession;
      if (draft.mode === 'free' && !workedOn) {
        alert("Enter what you worked on, or tap Don't log.");
        document.getElementById('session-feedback-worked-on').focus();
        return;
      }

      const recorded = Storage.addSession({
        ...draft,
        workedOn,
        itemName: workedOn || draft.itemName,
        rating,
        notes,
        completedAt: new Date().toISOString()
      });

      this.closeSessionFeedback();
      this.showLastSession(recorded);
      document.getElementById('session-status').textContent = 'Session saved';
      this.renderLog();
      return;
    }

    if (!this.feedbackSessionId) return;

    const existing = Storage.getSessionById(this.feedbackSessionId);
    const updates = { rating, notes };
    if (existing?.mode === 'free') {
      if (!workedOn) {
        alert('Enter what you worked on.');
        document.getElementById('session-feedback-worked-on').focus();
        return;
      }
      updates.workedOn = workedOn;
      updates.itemName = workedOn;
    }

    const updated = Storage.updateSession(this.feedbackSessionId, updates);
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

  bindCycles() {
    const durationInput = document.getElementById('cycle-step-duration');

    const commitDuration = () => {
      durationInput.value = formatTimerMinutes(parseTimerMinutes(durationInput.value, 1));
    };

    durationInput.addEventListener('blur', commitDuration);
    document.getElementById('cycle-step-duration-up').addEventListener('click', () => {
      durationInput.value = formatTimerMinutes(parseTimerMinutes(durationInput.value, 1) + 0.25);
    });
    document.getElementById('cycle-step-duration-down').addEventListener('click', () => {
      durationInput.value = formatTimerMinutes(parseTimerMinutes(durationInput.value, 1) - 0.25);
    });

    document.getElementById('cycle-add-step-btn').addEventListener('click', () => {
      const itemId = document.getElementById('cycle-step-item').value;
      if (!itemId) {
        alert('Select a practice item to add.');
        return;
      }
      const item = Storage.getItemById(itemId);
      if (!item) {
        alert('That practice item no longer exists.');
        return;
      }
      this.cycleDraftSteps.push({
        itemId,
        durationMinutes: parseTimerMinutes(durationInput.value, 1),
        tempoBpm: item.targetTempo || null
      });
      document.getElementById('cycle-step-item').value = '';
      this.renderCycleDraftSteps();
    });

    document.getElementById('cycle-draft-steps').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cycle-step-action]');
      if (!btn) return;
      const index = parseInt(btn.dataset.cycleStepIndex, 10);
      if (Number.isNaN(index) || index < 0 || index >= this.cycleDraftSteps.length) return;

      const action = btn.dataset.cycleStepAction;
      if (action === 'remove') {
        this.cycleDraftSteps.splice(index, 1);
      } else if (action === 'up' && index > 0) {
        const [step] = this.cycleDraftSteps.splice(index, 1);
        this.cycleDraftSteps.splice(index - 1, 0, step);
      } else if (action === 'down' && index < this.cycleDraftSteps.length - 1) {
        const [step] = this.cycleDraftSteps.splice(index, 1);
        this.cycleDraftSteps.splice(index + 1, 0, step);
      }
      this.renderCycleDraftSteps();
    });

    document.getElementById('cycle-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('cycle-name').value.trim();
      const rounds = Math.max(1, Math.min(10, parseInt(document.getElementById('cycle-rounds').value, 10) || 3));
      if (!name) return;
      if (this.cycleDraftSteps.length < 2) {
        alert('Add at least two steps to make a cycle.');
        return;
      }

      const cycleData = {
        name,
        rounds,
        steps: this.cycleDraftSteps.map((step) => ({
          itemId: step.itemId,
          durationMinutes: step.durationMinutes,
          tempoBpm: step.tempoBpm
        }))
      };

      if (this.editingCycleId) {
        Storage.updateCycle(this.editingCycleId, cycleData);
      } else {
        Storage.addCycle({
          id: generateId(),
          ...cycleData,
          createdAt: new Date().toISOString()
        });
      }

      this.cancelEditCycle();
      this.refreshAll();
    });

    document.getElementById('cycle-cancel-btn').addEventListener('click', () => {
      this.cancelEditCycle();
      this.renderCycles();
    });
  },

  renderCycleDraftSteps() {
    const list = document.getElementById('cycle-draft-steps');
    const empty = document.getElementById('cycle-draft-empty');
    if (!this.cycleDraftSteps.length) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.innerHTML = this.cycleDraftSteps.map((step, index) => {
      const item = Storage.getItemById(step.itemId);
      const title = item ? itemDisplayName(item) : 'Missing item';
      const tempo = step.tempoBpm || item?.targetTempo;
      const tempoText = tempo ? ` · ${tempo} BPM` : '';
      return `<li class="cycle-draft-step">
        <div class="cycle-draft-step-info">
          <div class="cycle-draft-step-title">${index + 1}. ${escapeHtml(title)}</div>
          <div class="cycle-draft-step-meta">${formatTimerMinutes(step.durationMinutes)} min${tempoText}</div>
        </div>
        <div class="cycle-draft-step-actions">
          <button type="button" class="btn btn-secondary btn-small" data-cycle-step-action="up" data-cycle-step-index="${index}" ${index === 0 ? 'disabled' : ''}>Up</button>
          <button type="button" class="btn btn-secondary btn-small" data-cycle-step-action="down" data-cycle-step-index="${index}" ${index === this.cycleDraftSteps.length - 1 ? 'disabled' : ''}>Down</button>
          <button type="button" class="btn btn-danger btn-small" data-cycle-step-action="remove" data-cycle-step-index="${index}">Remove</button>
        </div>
      </li>`;
    }).join('');
  },

  refreshCycleStepSelect() {
    const select = document.getElementById('cycle-step-item');
    if (!select) return;
    const current = select.value;
    const items = Storage.getItems();
    select.innerHTML = '<option value="">Add an item…</option>' +
      items.map((item) => `<option value="${item.id}">${escapeHtml(itemSelectLabel(item))}</option>`).join('');
    if (current && [...select.options].some((o) => o.value === current)) {
      select.value = current;
    }
  },

  startEditCycle(id) {
    const cycle = Storage.getCycleById(id);
    if (!cycle) return;

    this.editingCycleId = id;
    this.cycleDraftSteps = (cycle.steps || []).map((step) => ({
      itemId: step.itemId,
      durationMinutes: step.durationMinutes != null ? parseTimerMinutes(step.durationMinutes, 1) : 1,
      tempoBpm: step.tempoBpm || null
    }));

    document.getElementById('cycle-form-title').textContent = 'Edit practice cycle';
    document.getElementById('cycle-name').value = cycle.name || '';
    document.getElementById('cycle-rounds').value = cycle.rounds || 3;
    document.getElementById('cycle-submit-btn').textContent = 'Save changes';
    document.getElementById('cycle-cancel-btn').hidden = false;
    this.renderCycleDraftSteps();
    this.renderCycles();
    document.getElementById('cycle-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  cancelEditCycle() {
    this.editingCycleId = null;
    this.cycleDraftSteps = [];
    document.getElementById('cycle-form').reset();
    document.getElementById('cycle-rounds').value = 3;
    document.getElementById('cycle-step-duration').value = 1;
    document.getElementById('cycle-form-title').textContent = 'Add practice cycle';
    document.getElementById('cycle-submit-btn').textContent = 'Add cycle';
    document.getElementById('cycle-cancel-btn').hidden = true;
    this.renderCycleDraftSteps();
  },

  renderCycles() {
    this.refreshCycleStepSelect();
    this.renderCycleDraftSteps();

    const cycles = Storage.getCycles();
    const list = document.getElementById('cycles-list');
    const empty = document.getElementById('cycles-empty');

    if (!cycles.length) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.innerHTML = cycles.map((cycle) => {
      const steps = this.resolveCycleSteps(cycle);
      const stepNames = steps.map((s) => s.itemName).join(' → ') || 'No valid items';
      const perRound = steps.reduce((sum, step) => sum + step.durationMinutes, 0);
      const total = Math.round(perRound * (cycle.rounds || 1) * 4) / 4;
      return `<li class="item-row${this.editingCycleId === cycle.id ? ' editing' : ''}">
        <div class="item-info">
          <div class="item-title">${escapeHtml(cycle.name || 'Untitled cycle')}</div>
          <div class="item-description">${escapeHtml(stepNames)}</div>
          <div class="item-meta">${steps.length} steps · ${cycle.rounds} rounds · ~${total} min</div>
        </div>
        <div class="item-actions">
          <button type="button" class="btn btn-secondary btn-small" data-edit-cycle="${cycle.id}">Edit</button>
          <button type="button" class="btn btn-danger btn-small" data-delete-cycle="${cycle.id}">Delete</button>
        </div>
      </li>`;
    }).join('');

    list.querySelectorAll('[data-edit-cycle]').forEach((btn) => {
      btn.addEventListener('click', () => this.startEditCycle(btn.dataset.editCycle));
    });

    list.querySelectorAll('[data-delete-cycle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.editingCycleId === btn.dataset.deleteCycle) this.cancelEditCycle();
        if (confirm('Delete this cycle? Practice history for its items will remain.')) {
          Storage.deleteCycle(btn.dataset.deleteCycle);
          this.refreshAll();
        }
      });
    });
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
      const remoteEmpty = !remote.items?.length && !remote.sessions?.length && !remote.cycles?.length;
      const localHasData = local.items.length || local.sessions.length || local.cycles.length;

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
    const dateSelect = document.getElementById('log-filter-date');
    document.getElementById('log-filter-item').addEventListener('change', () => this.renderLog());
    document.getElementById('log-group-by-tod').addEventListener('change', () => this.renderLog());
    dateSelect.addEventListener('change', () => {
      if (dateSelect.value === 'calendar') {
        dateSelect.value = this.logDateFilterBeforeCalendar || '';
        this.openLogCalendar();
        return;
      }
      this.logDateFilterBeforeCalendar = dateSelect.value;
      this.renderLog();
    });

    const calendarModal = document.getElementById('log-calendar-modal');
    document.getElementById('log-calendar-prev').addEventListener('click', () => {
      if (!this.logCalendarMonth) return;
      this.logCalendarMonth.setMonth(this.logCalendarMonth.getMonth() - 1);
      this.renderLogCalendar();
    });
    document.getElementById('log-calendar-next').addEventListener('click', () => {
      if (!this.logCalendarMonth) return;
      this.logCalendarMonth.setMonth(this.logCalendarMonth.getMonth() + 1);
      this.renderLogCalendar();
    });
    document.getElementById('log-calendar-cancel-btn').addEventListener('click', () => this.closeLogCalendar());
    document.getElementById('log-calendar-clear-btn').addEventListener('click', () => {
      this.pendingLogDayFilter = '';
      this.logDateFilterBeforeCalendar = '';
      this.closeLogCalendar();
      this.renderLog();
    });
    calendarModal.addEventListener('click', (e) => {
      if (e.target === calendarModal) this.closeLogCalendar();
    });
    document.getElementById('log-calendar-grid').addEventListener('click', (e) => {
      const dayBtn = e.target.closest('[data-day-key]');
      if (!dayBtn) return;
      this.pendingLogDayFilter = `day:${dayBtn.dataset.dayKey}`;
      this.logDateFilterBeforeCalendar = this.pendingLogDayFilter;
      this.closeLogCalendar();
      this.renderLog();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !calendarModal.hidden) {
        this.closeLogCalendar();
      }
    });

    document.getElementById('log-list').addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-session]');
      if (editBtn) {
        const session = Storage.getSessionById(editBtn.dataset.editSession);
        if (session) this.openSessionFeedback(session, { editing: true });
        return;
      }

      const deleteBtn = e.target.closest('[data-delete-session]');
      if (!deleteBtn) return;
      if (!confirm('Delete this log entry? This cannot be undone.')) return;
      Storage.deleteSession(deleteBtn.dataset.deleteSession);
      this.refreshAll();
    });
  },

  getSessionDayKeys() {
    const keys = new Set();
    Storage.getSessions().forEach((session) => {
      const started = new Date(session.startedAt);
      if (Number.isNaN(started.getTime())) return;
      const key = dayKeyFromDate(started);
      if (key) keys.add(key);
    });
    return keys;
  },

  openLogCalendar() {
    const select = document.getElementById('log-filter-date');
    const current = select?.value || '';
    this.logDateFilterBeforeCalendar = current === 'calendar' ? '' : current;

    let cursor = startOfLocalDay(new Date());
    cursor.setDate(1);
    if (current.startsWith('day:')) {
      const selected = parseDayKey(current.slice(4));
      if (selected) {
        cursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
      }
    } else if (/^\d{4}-\d{2}$/.test(current)) {
      const [y, m] = current.split('-').map(Number);
      cursor = new Date(y, m - 1, 1);
    } else {
      const days = [...this.getSessionDayKeys()].sort();
      if (days.length) {
        const latest = parseDayKey(days[days.length - 1]);
        if (latest) cursor = new Date(latest.getFullYear(), latest.getMonth(), 1);
      }
    }

    this.logCalendarMonth = cursor;
    this.renderLogCalendar();
    const modal = document.getElementById('log-calendar-modal');
    modal.hidden = false;
  },

  closeLogCalendar() {
    const modal = document.getElementById('log-calendar-modal');
    if (modal) modal.hidden = true;
  },

  renderLogCalendar() {
    const label = document.getElementById('log-calendar-month-label');
    const grid = document.getElementById('log-calendar-grid');
    if (!label || !grid || !this.logCalendarMonth) return;

    const year = this.logCalendarMonth.getFullYear();
    const month = this.logCalendarMonth.getMonth();
    label.textContent = this.logCalendarMonth.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric'
    });

    const dayKeys = this.getSessionDayKeys();
    const selectedKey = (document.getElementById('log-filter-date')?.value || '').startsWith('day:')
      ? document.getElementById('log-filter-date').value.slice(4)
      : (this.pendingLogDayFilter?.startsWith('day:') ? this.pendingLogDayFilter.slice(4) : '');
    const todayKey = dayKeyFromDate(new Date());

    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstDow; i++) {
      cells.push('<span class="log-calendar-day is-empty"></span>');
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const key = dayKeyFromDate(new Date(year, month, day));
      const classes = ['log-calendar-day'];
      if (dayKeys.has(key)) classes.push('has-logs');
      if (key === todayKey) classes.push('is-today');
      if (key === selectedKey) classes.push('is-selected');
      cells.push(
        `<button type="button" class="${classes.join(' ')}" data-day-key="${key}" aria-label="${escapeHtml(formatDayFilterLabel(key))}${dayKeys.has(key) ? ', has sessions' : ''}">${day}</button>`
      );
    }

    grid.innerHTML = cells.join('');
  },

  bindManualLog() {
    const modal = document.getElementById('manual-log-modal');
    const durationInput = document.getElementById('manual-log-duration');
    const tempoInput = document.getElementById('manual-log-tempo');
    const itemSelect = document.getElementById('manual-log-item');

    const clampBpm = (raw, fallback = 120) => {
      const n = parseInt(String(raw).trim(), 10);
      if (Number.isNaN(n)) return fallback;
      return Math.max(40, Math.min(300, n));
    };

    const commitDuration = () => {
      durationInput.value = formatTimerMinutes(parseTimerMinutes(durationInput.value, 3));
    };

    const commitTempo = () => {
      tempoInput.value = clampBpm(tempoInput.value, 120);
    };

    document.getElementById('manual-log-btn').addEventListener('click', () => this.openManualLog());
    document.getElementById('manual-log-save-btn').addEventListener('click', () => this.saveManualLog());
    document.getElementById('manual-log-cancel-btn').addEventListener('click', () => this.closeManualLog());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeManualLog();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) {
        this.closeManualLog();
      }
    });

    document.getElementById('manual-log-duration-up').addEventListener('click', () => {
      durationInput.value = formatTimerMinutes(parseTimerMinutes(durationInput.value, 3) + 0.25);
      commitDuration();
    });
    document.getElementById('manual-log-duration-down').addEventListener('click', () => {
      durationInput.value = formatTimerMinutes(parseTimerMinutes(durationInput.value, 3) - 0.25);
      commitDuration();
    });
    durationInput.addEventListener('blur', commitDuration);

    document.getElementById('manual-log-tempo-up').addEventListener('click', () => {
      tempoInput.value = Math.min(300, clampBpm(tempoInput.value, 120) + 1);
      commitTempo();
    });
    document.getElementById('manual-log-tempo-down').addEventListener('click', () => {
      tempoInput.value = Math.max(40, clampBpm(tempoInput.value, 120) - 1);
      commitTempo();
    });
    tempoInput.addEventListener('blur', commitTempo);

    itemSelect.addEventListener('change', () => {
      this.updateManualLogItemUI();
      if (itemSelect.value && itemSelect.value !== '__other__') {
        const item = Storage.getItemById(itemSelect.value);
        if (item?.targetTempo) {
          tempoInput.value = item.targetTempo;
          commitTempo();
        }
      }
    });

    this.bindStarRatingControl({
      container: document.getElementById('manual-log-stars'),
      getRating: () => this.manualLogRating,
      setRating: (value) => { this.manualLogRating = value; },
      render: () => this.renderManualLogStars()
    });
  },

  updateManualLogItemUI() {
    const itemSelect = document.getElementById('manual-log-item');
    const workedOnField = document.getElementById('manual-log-worked-on-field');
    const isOther = itemSelect.value === '__other__';
    workedOnField.hidden = !isOther;
  },

  renderManualLogStars() {
    this.renderStarButtons('#manual-log-stars', this.manualLogRating);
  },

  openManualLog() {
    this.refreshItemSelects();
    this.manualLogRating = 0;
    this.renderManualLogStars();

    const itemSelect = document.getElementById('manual-log-item');
    const durationInput = document.getElementById('manual-log-duration');
    const tempoInput = document.getElementById('manual-log-tempo');
    const whenInput = document.getElementById('manual-log-when');
    const notes = document.getElementById('manual-log-notes');
    const workedOn = document.getElementById('manual-log-worked-on');
    const practiceItem = document.getElementById('practice-item-select').value;

    itemSelect.value = practiceItem && [...itemSelect.options].some((o) => o.value === practiceItem)
      ? practiceItem
      : '';
    durationInput.value = formatTimerMinutes(document.getElementById('timer-minutes').value || 3);
    tempoInput.value = parseInt(document.getElementById('tempo-bpm').value, 10) || 120;
    whenInput.value = toDatetimeLocalValue(new Date());
    notes.value = '';
    workedOn.value = '';
    this.updateManualLogItemUI();

    document.getElementById('manual-log-modal').hidden = false;
    itemSelect.focus();
  },

  closeManualLog() {
    document.getElementById('manual-log-modal').hidden = true;
    this.manualLogRating = 0;
    document.getElementById('manual-log-worked-on').value = '';
    document.getElementById('manual-log-notes').value = '';
  },

  saveManualLog() {
    const itemSelect = document.getElementById('manual-log-item');
    const itemId = itemSelect.value;
    const isOther = itemId === '__other__';
    const workedOn = document.getElementById('manual-log-worked-on').value.trim();
    const durationMinutes = parseTimerMinutes(document.getElementById('manual-log-duration').value, 3);
    const durationSeconds = timerMinutesToSeconds(durationMinutes);
    const tempoRaw = parseInt(document.getElementById('manual-log-tempo').value, 10);
    const tempo = Number.isNaN(tempoRaw) ? 120 : Math.max(40, Math.min(300, tempoRaw));
    const whenValue = document.getElementById('manual-log-when').value;
    const notes = document.getElementById('manual-log-notes').value.trim();
    const rating = normalizeSessionRating(this.manualLogRating);

    if (!itemId) {
      alert('Select a practice item, or choose Other…');
      itemSelect.focus();
      return;
    }

    if (isOther && !workedOn) {
      alert('Enter what you worked on.');
      document.getElementById('manual-log-worked-on').focus();
      return;
    }

    if (!whenValue) {
      alert('Choose when you practiced.');
      document.getElementById('manual-log-when').focus();
      return;
    }

    const startedAt = fromDatetimeLocalValue(whenValue);
    if (!startedAt) {
      alert('Enter a valid date and time.');
      document.getElementById('manual-log-when').focus();
      return;
    }

    const item = isOther ? null : Storage.getItemById(itemId);
    if (!isOther && !item) {
      alert('Select a practice item, or choose Other…');
      itemSelect.focus();
      return;
    }

    const completedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    const recorded = {
      id: generateId(),
      itemId: isOther ? null : item.id,
      itemName: isOther ? workedOn : itemDisplayName(item),
      workedOn: isOther ? workedOn : '',
      tempo,
      startTempo: null,
      endTempo: null,
      mode: 'manual',
      durationSeconds,
      plannedDurationSeconds: durationSeconds,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      completed: true,
      rating,
      notes
    };

    // Insert + sort so past sessions land in chronological order.
    const data = Storage.load();
    data.sessions.push(recorded);
    data.sessions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    Storage.save(data);

    this.closeManualLog();
    this.showLastSession(recorded);
    this.refreshItemSelects();
    this.renderLog();
  },

  bindProgress() {
    document.getElementById('progress-item-select').addEventListener('change', () => this.renderProgress());
    document.getElementById('time-chart-period').addEventListener('change', () => this.renderProgress());
  },

  refreshAll() {
    this.refreshItemSelects();
    this.refreshLogDateFilter();
    this.renderItems();
    this.renderCycles();
    this.renderLog();
  },

  refreshLogDateFilter() {
    const select = document.getElementById('log-filter-date');
    if (!select) return;

    if (this.pendingLogDayFilter != null) {
      select.value = this.pendingLogDayFilter;
      this.logDateFilterBeforeCalendar = this.pendingLogDayFilter;
      this.pendingLogDayFilter = null;
    }

    const current = select.value === 'calendar' ? (this.logDateFilterBeforeCalendar || '') : select.value;
    const months = new Map();
    Storage.getSessions().forEach((session) => {
      const started = new Date(session.startedAt);
      if (Number.isNaN(started.getTime())) return;
      const key = monthKeyFromDate(started);
      if (!key || months.has(key)) return;
      months.set(key, started.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric'
      }));
    });

    const monthOptions = [...months.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`)
      .join('');

    let selectedDayOption = '';
    if (current.startsWith('day:')) {
      const dayKey = current.slice(4);
      selectedDayOption = `<option value="${escapeHtml(current)}">${escapeHtml(formatDayFilterLabel(dayKey))}</option>`;
    }

    select.innerHTML = `
      <option value="">All dates</option>
      <option value="today">Today</option>
      <option value="week">This week</option>
      <option value="month">This month</option>
      <option value="30">Last 30 days</option>
      <option value="calendar">Pick a date…</option>
      ${selectedDayOption ? `<optgroup label="Selected day">${selectedDayOption}</optgroup>` : ''}
      ${monthOptions ? `<optgroup label="By month">${monthOptions}</optgroup>` : ''}
    `;

    if ([...select.options].some((option) => option.value === current)) {
      select.value = current;
    } else {
      select.value = '';
    }
    this.logDateFilterBeforeCalendar = select.value;
  },

  refreshItemSelects() {
    const items = Storage.getItems();
    const cycles = Storage.getCycles();
    const configs = [
      {
        el: document.getElementById('practice-item-select'),
        placeholder: '<option value="">Select an item or cycle…</option>',
        includeCycles: true
      },
      {
        el: document.getElementById('log-filter-item'),
        placeholder: '<option value="">All items</option>'
      },
      {
        el: document.getElementById('progress-item-select'),
        placeholder: '<option value="">Select an item…</option>'
      },
      {
        el: document.getElementById('manual-log-item'),
        placeholder: '<option value="">Select an item…</option>',
        extra: '<option value="__other__">Other…</option>'
      }
    ];

    configs.forEach(({ el, placeholder, extra = '', includeCycles = false }) => {
      if (!el) return;
      const current = el.value;
      let html = placeholder + extra;

      if (includeCycles && cycles.length) {
        html += '<optgroup label="Cycles">' +
          cycles.map((cycle) => {
            const steps = this.resolveCycleSteps(cycle).length;
            if (!steps) return '';
            return `<option value="cycle:${cycle.id}">${escapeHtml(cycleSelectLabel(cycle))}</option>`;
          }).join('') +
          '</optgroup>';
      }

      if (includeCycles && items.length) {
        html += '<optgroup label="Items">' +
          items.map((i) => `<option value="${i.id}">${escapeHtml(itemSelectLabel(i))}</option>`).join('') +
          '</optgroup>';
      } else {
        html += items.map((i) => `<option value="${i.id}">${escapeHtml(itemSelectLabel(i))}</option>`).join('');
      }

      el.innerHTML = html;
      if (current && [...el.options].some((o) => o.value === current)) {
        el.value = current;
      }
    });

    this.refreshCycleStepSelect();
    if (!this.session) this.applyPracticeSelection();
    else this.syncPracticeItemRichSelect();
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

  renderLogSessionRow(s) {
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
    const hasFeedback = stars || notes || (s.workedOn || '').trim();
    const editLabel = hasFeedback ? 'Edit notes' : 'Add notes';
    const modeLabel = s.mode === 'free'
      ? ' <span class="log-mode">Free</span>'
      : s.mode === 'manual'
        ? ' <span class="log-mode">Manual</span>'
        : s.cycleName
          ? ` <span class="log-mode">Cycle</span>`
          : '';
    const cycleMeta = s.cycleName
      ? `<div class="cycle-meta-line">${escapeHtml(s.cycleName)}${s.cycleRound ? ` · round ${s.cycleRound}` : ''}</div>`
      : '';
    return `
      <li class="log-row">
        <div class="log-info">
          <div class="log-date">${formatDate(s.startedAt)}</div>
          <div class="log-detail">
            <strong>${escapeHtml(sessionDisplayName(s))}</strong> — ${formatDuration(s.durationSeconds)} at
            <span class="log-tempo">${tempoText}</span>${modeLabel}
            ${s.completed || s.mode === 'free' || s.mode === 'manual' ? '' : ' (stopped early)'}
          </div>
          ${cycleMeta}
          ${feedbackBits.join('')}
        </div>
        <div class="item-actions">
          <button type="button" class="btn btn-secondary btn-small" data-edit-session="${s.id}">${editLabel}</button>
          <button type="button" class="btn btn-danger btn-small" data-delete-session="${s.id}">Delete</button>
        </div>
      </li>
    `;
  },

  renderLog() {
    this.refreshLogDateFilter();
    const filterId = document.getElementById('log-filter-item').value;
    const dateFilter = document.getElementById('log-filter-date')?.value || '';
    const groupByTod = document.getElementById('log-group-by-tod')?.checked;
    let sessions = Storage.getSessions()
      .slice()
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    if (filterId) sessions = sessions.filter((s) => s.itemId === filterId);
    if (dateFilter) sessions = sessions.filter((s) => sessionMatchesDateFilter(s, dateFilter));

    const list = document.getElementById('log-list');
    const empty = document.getElementById('log-empty');

    if (!sessions.length) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.textContent = (filterId || dateFilter)
        ? 'No sessions match these filters.'
        : 'No sessions logged yet. Tap Log practice to add one.';
      return;
    }

    empty.hidden = true;

    if (groupByTod) {
      const groups = groupSessionsByProximity(sessions);
      let remaining = 50;
      const parts = [];
      for (const group of groups) {
        if (remaining <= 0) break;
        const entries = group.entries.slice(0, remaining);
        remaining -= entries.length;
        const countLabel = entries.length === 1 ? '1 entry' : `${entries.length} entries`;
        parts.push(`
          <li class="log-session-group" data-period="${escapeHtml(group.period)}">
            <div class="log-session-heading">
              <span class="log-session-name">${escapeHtml(group.label)}</span>
              <span class="log-session-meta">${escapeHtml(group.dateLabel)} · ${countLabel}</span>
            </div>
            <ul class="log-session-entries">
              ${entries.map((s) => this.renderLogSessionRow(s)).join('')}
            </ul>
          </li>
        `);
      }
      list.innerHTML = parts.join('');
      return;
    }

    list.innerHTML = sessions.slice(0, 50).map((s) => this.renderLogSessionRow(s)).join('');
  },

  renderProgress() {
    const itemId = document.getElementById('progress-item-select').value;
    const period = document.getElementById('time-chart-period')?.value || 'weeks';
    const tempoCanvas = document.getElementById('tempo-chart');
    const timeCanvas = document.getElementById('time-chart');
    const tempoEmpty = document.getElementById('tempo-chart-empty');
    const timeEmpty = document.getElementById('time-chart-empty');
    const timeSubtitle = document.getElementById('time-chart-subtitle');
    const statsGrid = document.getElementById('stats-grid');

    const periodSubtitles = {
      days: 'Minutes practiced each day this week',
      weeks: 'Minutes practiced per week',
      months: 'Minutes practiced per month'
    };
    if (timeSubtitle) timeSubtitle.textContent = periodSubtitles[period] || periodSubtitles.weeks;

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
    statsGrid.hidden = false;
    tempoEmpty.hidden = Charts.drawTempoChart(tempoCanvas, sessions);
    const drewTime = Charts.drawTimeChart(timeCanvas, sessions, period);
    timeEmpty.hidden = drewTime;
    timeCanvas.hidden = !drewTime;

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
