const Charts = {
  _setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.clientWidth || 300;
    const h = parseInt(canvas.getAttribute('height'), 10) || 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
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

  drawTimeChart(canvas, sessions) {
    const { ctx, w, h } = this._setupCanvas(canvas);
    const padding = { top: 16, right: 16, bottom: 32, left: 44 };
    ctx.clearRect(0, 0, w, h);

    if (!sessions.length) return false;

    const weekMap = new Map();
    sessions.forEach((s) => {
      const d = new Date(s.startedAt);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const key = weekStart.toISOString().slice(0, 10);
      weekMap.set(key, (weekMap.get(key) || 0) + s.durationSeconds / 60);
    });

    const weeks = [...weekMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8);

    if (!weeks.length) return false;

    const maxMin = Math.max(...weeks.map((w) => w[1]), 1);
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = Math.min(40, chartW / weeks.length - 8);

    this._drawGrid(ctx, w, h, padding);

    ctx.fillStyle = '#888894';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(maxMin - (maxMin / 4) * i);
      const y = padding.top + (chartH / 4) * i;
      ctx.fillText(val + 'm', padding.left - 4, y + 4);
    }

    weeks.forEach(([key, minutes], i) => {
      const barH = (minutes / maxMin) * chartH;
      const x = padding.left + i * (chartW / weeks.length) + (chartW / weeks.length - barW) / 2;
      const y = padding.top + chartH - barH;

      ctx.fillStyle = '#e8a838';
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 4);
      ctx.fill();

      ctx.fillStyle = '#888894';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const label = new Date(key + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      ctx.fillText(label, x + barW / 2, h - 8);
    });

    return true;
  }
};
