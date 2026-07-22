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

  _drawGrid(ctx, w, h, padding) {
    ctx.strokeStyle = '#2e2e38';
    ctx.lineWidth = 1;
    const chartH = h - padding.top - padding.bottom;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }
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

  _weekStartKey(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return dayKeyFromDate(d);
  },

  _buildTimeBuckets(sessions, period = 'weeks') {
    const totals = new Map();
    sessions.forEach((s) => {
      const started = new Date(s.startedAt);
      if (Number.isNaN(started.getTime())) return;
      let key;
      if (period === 'days') key = dayKeyFromDate(started);
      else if (period === 'months') key = monthKeyFromDate(started);
      else key = this._weekStartKey(started);
      if (!key) return;
      totals.set(key, (totals.get(key) || 0) + s.durationSeconds / 60);
    });

    if (period === 'days') {
      const now = new Date();
      const weekStart = startOfLocalDay(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const buckets = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        const key = dayKeyFromDate(day);
        buckets.push({
          key,
          minutes: totals.get(key) || 0,
          label: day.toLocaleDateString(undefined, { weekday: 'short' })
        });
      }
      return buckets;
    }

    if (period === 'months') {
      return [...totals.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
        .map(([key, minutes]) => {
          const [year, month] = key.split('-').map(Number);
          const d = new Date(year, month - 1, 1);
          return {
            key,
            minutes,
            label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
          };
        });
    }

    // weeks — last 8 weeks that have practice (Sunday starts)
    return [...totals.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([key, minutes]) => ({
        key,
        minutes,
        label: new Date(key + 'T12:00:00').toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        })
      }));
  },

  drawTimeChart(canvas, sessions, period = 'weeks') {
    const { ctx, w, h } = this._setupCanvas(canvas);
    const padding = { top: 16, right: 16, bottom: 32, left: 44 };
    ctx.clearRect(0, 0, w, h);

    if (!sessions.length) return false;

    const buckets = this._buildTimeBuckets(sessions, period);
    if (!buckets.length) return false;

    // Hide empty-state only when there is something to show in this period
    const hasData = buckets.some((b) => b.minutes > 0);
    if (!hasData) return false;

    const maxMin = Math.max(...buckets.map((b) => b.minutes), 1);
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = Math.min(40, chartW / buckets.length - 8);

    this._drawGrid(ctx, w, h, padding);

    ctx.fillStyle = '#888894';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(maxMin - (maxMin / 4) * i);
      const y = padding.top + (chartH / 4) * i;
      ctx.fillText(val + 'm', padding.left - 4, y + 4);
    }

    buckets.forEach((bucket, i) => {
      const barH = (bucket.minutes / maxMin) * chartH;
      const x = padding.left + i * (chartW / buckets.length) + (chartW / buckets.length - barW) / 2;
      const y = padding.top + chartH - barH;

      if (bucket.minutes > 0) {
        ctx.fillStyle = '#e8a838';
        ctx.beginPath();
        ctx.roundRect(x, y, barW, Math.max(barH, 2), 4);
        ctx.fill();
      }

      ctx.fillStyle = '#888894';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bucket.label, x + barW / 2, h - 8);
    });

    return true;
  }
};
