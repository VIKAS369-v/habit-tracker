// Interactive Minimalist 31-Day Mood Bar Chart
class MoodTracker {
  constructor(containerElement, tooltipElement, onMoodUpdated) {
    this.container = containerElement;
    this.tooltip = tooltipElement;
    this.onMoodUpdated = onMoodUpdated;
    this.moodMap = new Map(); // date -> { score, tag }
    this.currentYearMonth = '';
    this.todayStr = '';
    this.daysInMonth = 31;
    this.year = 2026;
    this.monthIndex = 8;

    this.moodDefinitions = [
      { score: 5, label: 'Rad / Energized', color: '#eab308', icon: '☀️' },
      { score: 4, label: 'Good / Calm', color: '#22c55e', icon: '🌿' },
      { score: 3, label: 'Okay / Neutral', color: '#38bdf8', icon: '☁️' },
      { score: 2, label: 'Low / Tired', color: '#a855f7', icon: '🌧️' },
      { score: 1, label: 'Overwhelmed / Foggy', color: '#f43f5e', icon: '⚡' }
    ];
  }

  setData({ moodLogs, yearMonth, todayStr }) {
    this.currentYearMonth = yearMonth;
    this.todayStr = todayStr;

    const [y, m] = yearMonth.split('-').map(Number);
    this.year = y;
    this.monthIndex = m - 1;
    this.daysInMonth = new Date(y, m, 0).getDate();

    this.moodMap.clear();
    (moodLogs || []).forEach(log => {
      this.moodMap.set(log.date, { score: Number(log.score), tag: log.tag || '' });
    });

    this.render();
  }

  render() {
    if (!this.container) return;

    // Calculate month stats
    let totalScore = 0;
    let loggedDays = 0;
    for (let day = 1; day <= this.daysInMonth; day++) {
      const dateStr = `${this.currentYearMonth}-${String(day).padStart(2, '0')}`;
      if (this.moodMap.has(dateStr)) {
        totalScore += this.moodMap.get(dateStr).score;
        loggedDays++;
      }
    }
    const avgMood = loggedDays > 0 ? (totalScore / loggedDays).toFixed(1) : '—';

    // Mood Legend HTML
    const legendHtml = this.moodDefinitions.map(def => `
      <div class="mood-legend-item" title="Score ${def.score}/5: ${def.label}">
        <span class="mood-color-sample" style="background-color: ${def.color};"></span>
        <span>${def.icon} ${def.label}</span>
      </div>
    `).join('');

    // Mood 31-day columns HTML
    let columnsHtml = '';
    for (let day = 1; day <= this.daysInMonth; day++) {
      const dateStr = `${this.currentYearMonth}-${String(day).padStart(2, '0')}`;
      const entry = this.moodMap.get(dateStr);
      const isToday = dateStr === this.todayStr;

      let barStyle = '';
      let barClass = 'mood-bar';
      let iconHtml = '';

      if (entry && entry.score > 0) {
        const def = this.moodDefinitions.find(d => d.score === entry.score);
        const heightPct = (entry.score / 5) * 100;
        barStyle = `height: ${heightPct}%; background-color: ${def.color};`;
      } else {
        barClass += ' empty';
        barStyle = 'height: 4px;';
      }

      columnsHtml += `
        <div class="mood-column ${isToday ? 'today' : ''}" 
             data-day="${day}" 
             data-date="${dateStr}"
             tabindex="0"
             role="button"
             aria-label="Mood for day ${day}">
          <div class="${barClass}" style="${barStyle}"></div>
          <span class="day-label">${day}</span>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="tracker-card-header">
        <h2 class="tracker-title">
          <span>🎨 Mood Tracker</span>
        </h2>
        <div class="tracker-meta">
          <span class="tracker-stat-badge">Average Mood: <strong>${avgMood} / 5</strong></span>
          <span class="tracker-stat-badge">Tracked: <strong>${loggedDays}/${this.daysInMonth} days</strong></span>
          <span style="font-size: 0.85rem; color: var(--ink-muted);">Click day bar to rate (1–5)</span>
        </div>
      </div>
      <div class="mood-chart-container">
        <div class="mood-legend">
          ${legendHtml}
        </div>
        <div class="mood-grid">
          ${columnsHtml}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.mood-column').forEach(col => {
      const dateStr = col.getAttribute('data-date');
      const day = col.getAttribute('data-day');

      // Click to rate mood (cycles 1->2->3->4->5 or calculates from click height)
      col.addEventListener('click', (e) => {
        const rect = col.getBoundingClientRect();
        const clickRatio = 1 - ((e.clientY - rect.top) / rect.height);
        // Map 0..1 to 1..5 score
        let score = Math.max(1, Math.min(5, Math.ceil(clickRatio * 5)));

        // If clicking same score, cycle forward
        const current = this.moodMap.get(dateStr);
        if (current && current.score === score) {
          score = (score % 5) + 1;
        }

        this.saveMoodEntry(dateStr, score);
      });

      col.addEventListener('mousemove', (e) => {
        const current = this.moodMap.get(dateStr);
        const rect = col.getBoundingClientRect();
        const clickRatio = 1 - ((e.clientY - rect.top) / rect.height);
        const hoverScore = Math.max(1, Math.min(5, Math.ceil(clickRatio * 5)));
        const hoverDef = this.moodDefinitions.find(d => d.score === hoverScore);

        if (this.tooltip) {
          let text = '';
          if (current) {
            const curDef = this.moodDefinitions.find(d => d.score === current.score);
            text = `Day ${day}: <strong>${curDef.icon} ${curDef.label} (${current.score}/5)</strong><br><small style="color:#d1d5db">Click to set ${hoverDef.icon} ${hoverDef.label}</small>`;
          } else {
            text = `Day ${day}: Click to log <strong>${hoverDef.icon} ${hoverDef.label}</strong>`;
          }
          this.tooltip.innerHTML = text;
          this.tooltip.style.left = `${e.clientX}px`;
          this.tooltip.style.top = `${e.clientY}px`;
          this.tooltip.style.opacity = '1';
        }
      });

      col.addEventListener('mouseleave', () => {
        if (this.tooltip) this.tooltip.style.opacity = '0';
      });

      // Keyboard support
      col.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          const current = this.moodMap.get(dateStr);
          const nextScore = current ? (current.score % 5) + 1 : 4;
          this.saveMoodEntry(dateStr, nextScore);
        }
      });
    });
  }

  async saveMoodEntry(dateStr, score) {
    // Optimistic UI update
    this.moodMap.set(dateStr, { score, tag: '' });
    if (window.soundFx) window.soundFx.playPencilTick();
    this.render();

    try {
      await window.API.saveMood(dateStr, score);
      if (this.onMoodUpdated) {
        this.onMoodUpdated({ date: dateStr, score });
      }
    } catch (err) {
      console.error('Failed to save mood entry:', err);
      alert('Failed to save mood rating: ' + err.message);
    }
  }
}

window.MoodTracker = MoodTracker;
