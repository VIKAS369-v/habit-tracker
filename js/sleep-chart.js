// Interactive Hand-Drawn SVG Sleep Tracker spanning 31 days
class SleepTracker {
  constructor(containerElement, tooltipElement, onSleepUpdated) {
    this.container = containerElement;
    this.tooltip = tooltipElement;
    this.onSleepUpdated = onSleepUpdated;
    this.sleepMap = new Map(); // date -> hours
    this.currentYearMonth = '';
    this.todayStr = '';
    this.daysInMonth = 31;
    this.year = 2026;
    this.monthIndex = 8;
  }

  setData({ sleepLogs, yearMonth, todayStr }) {
    this.currentYearMonth = yearMonth;
    this.todayStr = todayStr;

    const [y, m] = yearMonth.split('-').map(Number);
    this.year = y;
    this.monthIndex = m - 1;
    this.daysInMonth = new Date(y, m, 0).getDate();

    this.sleepMap.clear();
    (sleepLogs || []).forEach(log => {
      this.sleepMap.set(log.date, Number(log.hours));
    });

    this.render();
  }

  render() {
    if (!this.container) return;

    // SVG Layout Dimensions
    const svgWidth = 1000;
    const svgHeight = 220;
    const padLeft = 45;
    const padRight = 30;
    const padTop = 25;
    const padBottom = 35;

    const plotWidth = svgWidth - padLeft - padRight;
    const plotHeight = svgHeight - padTop - padBottom;

    const minHours = 0;
    const maxHours = 12;

    const getY = (hours) => {
      const clamped = Math.max(minHours, Math.min(maxHours, hours));
      return padTop + plotHeight - ((clamped - minHours) / (maxHours - minHours)) * plotHeight;
    };

    const getX = (day) => {
      if (this.daysInMonth <= 1) return padLeft + plotWidth / 2;
      return padLeft + ((day - 1) / (this.daysInMonth - 1)) * plotWidth;
    };

    // Calculate month stats
    let totalHours = 0;
    let loggedCount = 0;
    for (let day = 1; day <= this.daysInMonth; day++) {
      const dateStr = `${this.currentYearMonth}-${String(day).padStart(2, '0')}`;
      if (this.sleepMap.has(dateStr)) {
        totalHours += this.sleepMap.get(dateStr);
        loggedCount++;
      }
    }
    const avgSleep = loggedCount > 0 ? (totalHours / loggedCount).toFixed(1) : '—';

    // Horizontal Guideline values
    const guideHours = [4, 6, 8, 10, 12];
    let gridLinesSvg = '';
    guideHours.forEach(h => {
      const y = getY(h);
      const isTarget = h === 8;
      gridLinesSvg += `
        <line x1="${padLeft}" y1="${y}" x2="${svgWidth - padRight}" y2="${y}" 
              class="${isTarget ? 'sleep-target-line' : 'sleep-grid-line'}" />
        <text x="${padLeft - 8}" y="${y + 4}" class="sleep-axis-text" text-anchor="end">${h}h</text>
      `;
    });

    // 8h Target note
    const targetY = getY(8);
    gridLinesSvg += `
      <text x="${svgWidth - padRight + 6}" y="${targetY + 4}" class="sleep-axis-text" fill="#10b981" font-weight="600" text-anchor="start">8h goal</text>
    `;

    // Data points & Path construction
    const points = [];
    for (let day = 1; day <= this.daysInMonth; day++) {
      const dateStr = `${this.currentYearMonth}-${String(day).padStart(2, '0')}`;
      if (this.sleepMap.has(dateStr)) {
        const h = this.sleepMap.get(dateStr);
        points.push({ day, dateStr, hours: h, x: getX(day), y: getY(h) });
      }
    }

    let linePathSvg = '';
    let areaPathSvg = '';
    let pointsSvg = '';

    if (points.length >= 2) {
      // Build smooth Catmull-Rom or Bezier spline for authentic notebook ink feel
      let dLine = `M ${points[0].x} ${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i === 0 ? 0 : i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        dLine += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      }

      linePathSvg = `<path d="${dLine}" class="sleep-path" />`;

      // Area fill
      const firstPt = points[0];
      const lastPt = points[points.length - 1];
      const baselineY = getY(0);
      const dArea = `${dLine} L ${lastPt.x} ${baselineY} L ${firstPt.x} ${baselineY} Z`;
      areaPathSvg = `<path d="${dArea}" class="sleep-area" />`;
    } else if (points.length === 1) {
      // Single point
      const p = points[0];
      linePathSvg = `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#2b5c8f" />`;
    }

    // Render interactive dots on existing points
    points.forEach(p => {
      pointsSvg += `
        <circle cx="${p.x}" cy="${p.y}" r="5" class="sleep-point" 
                data-date="${p.dateStr}" data-hours="${p.hours}" data-day="${p.day}" />
      `;
    });

    // Render Day column ticks and interactive clickable bands
    let dayAxisSvg = '';
    let interactiveBandsSvg = '';
    const colWidth = plotWidth / (this.daysInMonth - 1 || 1);

    for (let day = 1; day <= this.daysInMonth; day++) {
      const x = getX(day);
      const dateStr = `${this.currentYearMonth}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === this.todayStr;

      // Day numbers at bottom
      dayAxisSvg += `
        <text x="${x}" y="${svgHeight - 10}" 
              class="sleep-axis-text ${isToday ? 'today-text' : ''}" 
              font-weight="${isToday ? '700' : '400'}"
              fill="${isToday ? '#854d0e' : 'var(--ink-secondary)'}"
              text-anchor="middle">${day}</text>
      `;

      // Interactive vertical column band
      const bandX = x - colWidth / 2;
      interactiveBandsSvg += `
        <rect x="${bandX}" y="${padTop}" width="${colWidth}" height="${plotHeight}" 
              class="sleep-col-interactive" 
              data-day="${day}" 
              data-date="${dateStr}" />
      `;
    }

    this.container.innerHTML = `
      <div class="tracker-card-header">
        <h2 class="tracker-title">
          <span>🌙 Sleep Tracker</span>
        </h2>
        <div class="tracker-meta">
          <span class="tracker-stat-badge">Monthly Avg: <strong>${avgSleep} hrs</strong></span>
          <span class="tracker-stat-badge">Logged: <strong>${loggedCount}/${this.daysInMonth} days</strong></span>
          <span style="font-size: 0.85rem; color: var(--ink-muted);">Click day column to plot sleep</span>
        </div>
      </div>
      <div class="sleep-chart-container">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="sleep-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sleepGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2b5c8f" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#2b5c8f" stop-opacity="0.01"/>
            </linearGradient>
          </defs>
          ${gridLinesSvg}
          ${areaPathSvg}
          ${linePathSvg}
          ${dayAxisSvg}
          ${interactiveBandsSvg}
          ${pointsSvg}
        </svg>
      </div>
    `;

    this.bindEvents(padTop, plotHeight, minHours, maxHours);
  }

  bindEvents(padTop, plotHeight, minHours, maxHours) {
    const svg = this.container.querySelector('.sleep-svg');
    if (!svg) return;

    // Helper to calculate hours from client Y
    const calcHoursFromY = (clientY) => {
      const rect = svg.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const normalizedY = (relativeY / rect.height) * 220; // 220 is svgHeight
      const clampedY = Math.max(padTop, Math.min(padTop + plotHeight, normalizedY));
      const hours = minHours + ((padTop + plotHeight - clampedY) / plotHeight) * (maxHours - minHours);
      // Snap to nearest 0.5 hours
      return Math.round(hours * 2) / 2;
    };

    // Click on interactive column band
    svg.querySelectorAll('.sleep-col-interactive').forEach(band => {
      band.addEventListener('click', (e) => {
        const dateStr = band.getAttribute('data-date');
        const day = band.getAttribute('data-day');
        const hours = calcHoursFromY(e.clientY);
        this.saveSleepEntry(dateStr, hours);
      });

      band.addEventListener('mousemove', (e) => {
        const dateStr = band.getAttribute('data-date');
        const day = band.getAttribute('data-day');
        const currentLogged = this.sleepMap.get(dateStr);
        const hoverHours = calcHoursFromY(e.clientY);

        if (this.tooltip) {
          const text = currentLogged !== undefined
            ? `Day ${day}: <strong>${currentLogged} hrs</strong> (click to change to ${hoverHours}h)`
            : `Day ${day}: click to log <strong>${hoverHours} hrs</strong>`;
          this.tooltip.innerHTML = text;
          this.tooltip.style.left = `${e.clientX}px`;
          this.tooltip.style.top = `${e.clientY}px`;
          this.tooltip.style.opacity = '1';
        }
      });

      band.addEventListener('mouseleave', () => {
        if (this.tooltip) this.tooltip.style.opacity = '0';
      });
    });

    // Hover on data points
    svg.querySelectorAll('.sleep-point').forEach(pt => {
      pt.addEventListener('mouseenter', (e) => {
        const day = pt.getAttribute('data-day');
        const hours = pt.getAttribute('data-hours');
        if (this.tooltip) {
          this.tooltip.innerHTML = `Day ${day}: <strong>${hours} hrs</strong>`;
          this.tooltip.style.left = `${e.clientX}px`;
          this.tooltip.style.top = `${e.clientY}px`;
          this.tooltip.style.opacity = '1';
        }
      });
    });
  }

  async saveSleepEntry(dateStr, hours) {
    // Optimistic update
    this.sleepMap.set(dateStr, hours);
    if (window.soundFx) window.soundFx.playPencilTick();
    this.render();

    try {
      await window.API.saveSleep(dateStr, hours);
      if (this.onSleepUpdated) {
        this.onSleepUpdated({ date: dateStr, hours });
      }
    } catch (err) {
      console.error('Failed to save sleep log:', err);
      alert('Failed to save sleep hours: ' + err.message);
    }
  }
}

window.SleepTracker = SleepTracker;
