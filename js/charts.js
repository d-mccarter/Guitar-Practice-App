const Charts = {
  _setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    // Read layout size from CSS box. Do not use canvas.width/height attributes —
    // writing the bitmap size updates those attrs, and with height:auto the
    // element grows on every redraw (especially on retina displays).
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width || canvas.clientWidth || 300);
    const h = Math.max(1, rect.height || canvas.clientHeight || 200);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  },

  _drawGrid(ctx, w, h, padding, intervals = 4) {
    ctx.strokeStyle = '#2e2e38';
    ctx.lineWidth = 1;
    const chartH = h - padding.top - padding.bottom;
    const steps = Math.max(1, intervals);
    for (let i = 0; i <= steps; i++) {
      const y = padding.top + (chartH / steps) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }
  },

  /** Y-axis ceiling and tick step (minutes) for the practice-time chart. */
  _timeChartYScale(maxMinutes, period) {
    const rawMax = Math.max(maxMinutes || 0, 1);
    if (period === 'week') {
      const step = 15;
      const yMax = Math.max(step, Math.ceil(rawMax / step) * step);
      return { yMax, step, intervals: yMax / step };
    }
    // Month / year: keep four equal bands sized to the data max.
    return { yMax: rawMax, step: rawMax / 4, intervals: 4 };
  },

  drawTempoChart(canvas, sessions) {
    const { ctx, w, h } = this._setupCanvas(canvas);
    const padding = { top: 16, right: 16, bottom: 32, left: 44 };
    ctx.clearRect(0, 0, w, h);

    if (!sessions.length) return false;

    const sorted = [...sessions].sort(
      (a, b) => new Date(a.startedAt) - new Date(b.startedAt)
    );

    const tempos = sorted.map((s) => s.tempo);
    const minT = Math.max(40, Math.min(...tempos) - 10);
    const maxT = Math.min(300, Math.max(...tempos) + 10);
    const range = maxT - minT || 1;

    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    this._drawGrid(ctx, w, h, padding);

    ctx.fillStyle = '#888894';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(maxT - (range / 4) * i);
      const y = padding.top + (chartH / 4) * i;
      ctx.fillText(val, padding.left - 8, y + 4);
    }

    const points = sorted.map((s, i) => ({
      x: padding.left + (sorted.length === 1 ? chartW / 2 : (i / (sorted.length - 1)) * chartW),
      y: padding.top + chartH - ((s.tempo - minT) / range) * chartH,
      session: s
    }));

    if (points.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#e8a838';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    points.forEach((p) => {
      ctx.beginPath();
      ctx.fillStyle = '#e8a838';
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#888894';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const labelCount = Math.min(sorted.length, 5);
    const step = Math.max(1, Math.floor((sorted.length - 1) / (labelCount - 1)));
    for (let i = 0; i < sorted.length; i += step) {
      const x = padding.left + (sorted.length === 1 ? chartW / 2 : (i / (sorted.length - 1)) * chartW);
      ctx.fillText(formatShortDate(sorted[i].startedAt), x, h - 8);
    }

    return true;
  },

  _formatDayRange(start, end) {
    const sameYear = start.getFullYear() === end.getFullYear();
    const startLabel = start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' })
    });
    const endLabel = end.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return `${startLabel} – ${endLabel}`;
  },

  /**
   * Resolve the calendar window for a period + offset.
   * offset 0 = current week/month/year; negative = previous periods.
   */
  getTimeChartWindow(period = 'week', offset = 0) {
    const now = startOfLocalDay(new Date());
    const safeOffset = Number.isFinite(offset) ? Math.trunc(offset) : 0;

    if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth() + safeOffset, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      return {
        period: 'month',
        offset: safeOffset,
        start,
        end,
        label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        canGoNext: safeOffset < 0
      };
    }

    if (period === 'year') {
      const year = now.getFullYear() + safeOffset;
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      return {
        period: 'year',
        offset: safeOffset,
        start,
        end,
        label: String(year),
        canGoNext: safeOffset < 0
      };
    }

    // week — past 7 days ending today when offset is 0; earlier windows when navigating back
    const end = new Date(now);
    end.setDate(now.getDate() + safeOffset * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return {
      period: 'week',
      offset: safeOffset,
      start,
      end,
      label: this._formatDayRange(start, end),
      canGoNext: safeOffset < 0
    };
  },

  _buildTimeBuckets(sessions, period = 'week', offset = 0) {
    const window = this.getTimeChartWindow(period, offset);
    const dayTotals = new Map();
    const monthTotals = new Map();

    sessions.forEach((s) => {
      const started = new Date(s.startedAt);
      if (Number.isNaN(started.getTime())) return;
      const dayKey = dayKeyFromDate(started);
      const monthKey = monthKeyFromDate(started);
      if (!dayKey) return;
      const minutes = s.durationSeconds / 60;
      dayTotals.set(dayKey, (dayTotals.get(dayKey) || 0) + minutes);
      if (monthKey) monthTotals.set(monthKey, (monthTotals.get(monthKey) || 0) + minutes);
    });

    const buckets = [];

    if (period === 'year') {
      for (let month = 0; month < 12; month++) {
        const day = new Date(window.start.getFullYear(), month, 1);
        const key = monthKeyFromDate(day);
        buckets.push({
          key,
          minutes: monthTotals.get(key) || 0,
          label: day.toLocaleDateString(undefined, { month: 'short' })
        });
      }
      return { buckets, window };
    }

    // week / month — one bar per day in the window
    const cursor = new Date(window.start);
    while (cursor <= window.end) {
      const key = dayKeyFromDate(cursor);
      let label;
      if (period === 'month') {
        label = String(cursor.getDate());
      } else {
        label = cursor.toLocaleDateString(undefined, { weekday: 'short' });
      }
      buckets.push({
        key,
        minutes: dayTotals.get(key) || 0,
        label
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return { buckets, window };
  },

  drawTimeChart(canvas, sessions, period = 'week', offset = 0) {
    const { ctx, w, h } = this._setupCanvas(canvas);
    const padding = { top: 16, right: 16, bottom: 32, left: 44 };
    ctx.clearRect(0, 0, w, h);

    const { buckets, window } = this._buildTimeBuckets(sessions, period, offset);
    if (!buckets.length) {
      return { drew: false, window, hasData: false };
    }

    const hasData = buckets.some((b) => b.minutes > 0);
    if (!hasData) {
      return { drew: false, window, hasData: false };
    }

    const maxMin = Math.max(...buckets.map((b) => b.minutes), 1);
    const { yMax, step, intervals } = this._timeChartYScale(maxMin, period);
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = Math.min(40, chartW / buckets.length - 8);

    this._drawGrid(ctx, w, h, padding, intervals);

    ctx.fillStyle = '#888894';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= intervals; i++) {
      const val = Math.round(yMax - step * i);
      const y = padding.top + (chartH / intervals) * i;
      ctx.fillText(val + 'm', padding.left - 4, y + 4);
    }

    // Sparse x labels when many bars (month view)
    const labelEvery = buckets.length > 16 ? 2 : 1;

    buckets.forEach((bucket, i) => {
      const barH = (bucket.minutes / yMax) * chartH;
      const x = padding.left + i * (chartW / buckets.length) + (chartW / buckets.length - barW) / 2;
      const y = padding.top + chartH - barH;

      if (bucket.minutes > 0) {
        ctx.fillStyle = '#e8a838';
        ctx.beginPath();
        ctx.roundRect(x, y, barW, Math.max(barH, 2), 4);
        ctx.fill();
      }

      if (i % labelEvery === 0 || i === buckets.length - 1) {
        ctx.fillStyle = '#888894';
        ctx.font = buckets.length > 20 ? '8px system-ui, sans-serif' : '9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bucket.label, x + barW / 2, h - 8);
      }
    });

    return { drew: true, window, hasData: true };
  }
};
