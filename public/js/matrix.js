// Habit Matrix Component: Low-friction bujo grid with instant check-ins & streak highlights
class HabitMatrix {
  constructor(containerElement, onHabitUpdated) {
    this.container = containerElement;
    this.onHabitUpdated = onHabitUpdated;
    this.habits = [];
    this.checkinMap = new Map(); // key: `${habitId}:${date}` -> true
    this.currentYearMonth = '';
    this.todayStr = '';
    this.daysInMonth = 31;
    this.year = 2026;
    this.monthIndex = 8; // 0-based
  }

  setData({ habits, checkins, yearMonth, todayStr }) {
    this.habits = habits || [];
    this.currentYearMonth = yearMonth;
    this.todayStr = todayStr;

    const [y, m] = yearMonth.split('-').map(Number);
    this.year = y;
    this.monthIndex = m - 1;
    // Calculate actual days in this month
    this.daysInMonth = new Date(y, m, 0).getDate();

    // Rebuild checkin map
    this.checkinMap.clear();
    (checkins || []).forEach(c => {
      this.checkinMap.set(`${c.habit_id}:${c.date}`, true);
    });

    this.render();
  }

  render() {
    if (!this.container) return;

    if (this.habits.length === 0) {
      this.container.innerHTML = `
        <div class="no-habits-placeholder">
          <p>✨ No habits recorded yet. Add your first gentle micro-habit above to begin!</p>
        </div>
      `;
      return;
    }

    const todayDateObj = new Date(this.todayStr + 'T00:00:00Z');
    const isCurrentMonth = this.todayStr.startsWith(this.currentYearMonth);
    const todayDayNum = isCurrentMonth ? todayDateObj.getUTCDate() : -1;

    let html = `
      <table class="habit-matrix-table" role="grid" aria-label="Monthly Habit Tracker Matrix">
        <thead>
          <tr>
            <th class="habit-col-header" scope="col">Habit / Routine</th>
    `;

    // Render 1 to daysInMonth column headers
    const dowNames = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];
    for (let day = 1; day <= this.daysInMonth; day++) {
      const dateObj = new Date(Date.UTC(this.year, this.monthIndex, day));
      const dow = dowNames[dateObj.getUTCDay()];
      const isToday = day === todayDayNum;

      html += `
        <th class="day-header ${isToday ? 'today' : ''}" scope="col" title="${this.currentYearMonth}-${String(day).padStart(2, '0')}">
          <span class="dow">${dow}</span>
          <span class="day-num">${day}</span>
        </th>
      `;
    }

    html += `
          </tr>
        </thead>
        <tbody>
    `;

    // Render each habit row
    this.habits.forEach(habit => {
      const currentStreak = habit.currentStreak || 0;
      const streakBadge = currentStreak > 0
        ? `<span class="streak-pill" title="${currentStreak} consecutive completed days">⚡ ${currentStreak}d</span>`
        : '';

      html += `
        <tr data-habit-id="${habit.id}">
          <td class="habit-name-cell">
            <div class="habit-info-left">
              <span class="habit-color-indicator" style="background-color: ${habit.color || '#2c2c2c'};"></span>
              <span class="habit-title" title="Click to rename" data-action="rename" data-id="${habit.id}">${this.escapeHtml(habit.name)}</span>
              ${streakBadge}
            </div>
            <div class="habit-actions">
              <button class="habit-action-btn" data-action="delete" data-id="${habit.id}" title="Remove habit" aria-label="Delete ${this.escapeHtml(habit.name)}">✕</button>
            </div>
          </td>
      `;

      // Pre-compute consecutive streak sequences in this month for streak highlighter wash
      const streakChains = this.computeMonthStreakChains(habit.id);

      for (let day = 1; day <= this.daysInMonth; day++) {
        const dateStr = `${this.currentYearMonth}-${String(day).padStart(2, '0')}`;
        const isChecked = this.checkinMap.has(`${habit.id}:${dateStr}`);
        const isToday = day === todayDayNum;
        const chainInfo = streakChains[day]; // null or { isStart, isEnd, isSingle }

        let washHtml = '';
        if (chainInfo) {
          let washClass = 'streak-wash';
          if (chainInfo.isSingle) washClass += ' streak-single';
          else {
            if (chainInfo.isStart) washClass += ' streak-start';
            if (chainInfo.isEnd) washClass += ' streak-end';
          }
          washHtml = `<div class="${washClass}"></div>`;
        }

        const markHtml = isChecked
          ? `<span class="ink-mark"><span class="ink-dot" style="background-color: ${habit.color || '#2c2c2c'}"></span></span>`
          : '';

        html += `
          <td class="matrix-cell ${isToday ? 'today-col' : ''}" 
              data-habit-id="${habit.id}" 
              data-date="${dateStr}" 
              data-day="${day}"
              role="gridcell"
              tabindex="0"
              aria-checked="${isChecked ? 'true' : 'false'}"
              title="${habit.name} - ${dateStr}">
            ${washHtml}
            ${markHtml}
          </td>
        `;
      }

      html += `
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    this.container.innerHTML = html;
    this.bindEvents();
  }

  // Identify consecutive sequences of checked days for drawing highlighter washes
  computeMonthStreakChains(habitId) {
    const chains = {};
    let streakLen = 0;
    let streakStart = 0;

    for (let day = 1; day <= this.daysInMonth; day++) {
      const dateStr = `${this.currentYearMonth}-${String(day).padStart(2, '0')}`;
      const checked = this.checkinMap.has(`${habitId}:${dateStr}`);

      if (checked) {
        if (streakLen === 0) streakStart = day;
        streakLen++;
      } else {
        if (streakLen > 0) {
          // finalize chain from streakStart to day - 1
          const streakEnd = day - 1;
          for (let d = streakStart; d <= streakEnd; d++) {
            chains[d] = {
              isStart: d === streakStart,
              isEnd: d === streakEnd,
              isSingle: streakLen === 1
            };
          }
          streakLen = 0;
        }
      }
    }

    if (streakLen > 0) {
      const streakEnd = this.daysInMonth;
      for (let d = streakStart; d <= streakEnd; d++) {
        chains[d] = {
          isStart: d === streakStart,
          isEnd: d === streakEnd,
          isSingle: streakLen === 1
        };
      }
    }

    return chains;
  }

  bindEvents() {
    // Delegated click handler on the matrix table for zero-friction instant response
    this.container.querySelectorAll('.matrix-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleCellToggle(cell);
      });

      // Keyboard support: Space or Enter to toggle
      cell.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          this.handleCellToggle(cell);
        }
      });
    });

    // Rename & Delete actions
    this.container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        this.handleDeleteHabit(id);
      });
    });

    this.container.querySelectorAll('[data-action="rename"]').forEach(titleSpan => {
      titleSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = titleSpan.getAttribute('data-id');
        this.handleRenameHabit(id, titleSpan.textContent.trim());
      });
    });
  }

  async handleCellToggle(cell) {
    const habitId = Number(cell.getAttribute('data-habit-id'));
    const date = cell.getAttribute('data-date');
    const day = Number(cell.getAttribute('data-day'));
    const key = `${habitId}:${date}`;

    const habit = this.habits.find(h => h.id === habitId);
    const wasChecked = this.checkinMap.has(key);
    const willBeChecked = !wasChecked;

    // 1. OPTIMISTIC INSTANT UI UPDATE (0ms lag)
    if (willBeChecked) {
      this.checkinMap.set(key, true);
      if (window.soundFx) window.soundFx.playPencilTick();
    } else {
      this.checkinMap.delete(key);
      if (window.soundFx) window.soundFx.playPop();
    }

    // Re-render the specific row instantly to update streak highlighter wash and pills
    this.updateRowDOM(habitId);

    // 2. BACKGROUND PERSISTENCE TO SQLITE DB
    try {
      const result = await window.API.toggleCheckin(habitId, date);
      // Update habit streak in local memory
      if (habit) {
        habit.currentStreak = result.streak;
        habit.bestStreak = result.bestStreak;
      }
      this.updateStreakBadgeInRow(habitId, result.streak);

      if (this.onHabitUpdated) {
        this.onHabitUpdated({ habitId, date, completed: result.completed, streak: result.streak });
      }
    } catch (err) {
      console.error('Failed to save checkin:', err);
      // Revert optimistic change on failure
      if (wasChecked) {
        this.checkinMap.set(key, true);
      } else {
        this.checkinMap.delete(key);
      }
      this.updateRowDOM(habitId);
      alert('Could not save check-in. Please verify your connection.');
    }
  }

  updateRowDOM(habitId) {
    const habit = this.habits.find(h => h.id === habitId);
    if (!habit) return;

    const row = this.container.querySelector(`tr[data-habit-id="${habitId}"]`);
    if (!row) return;

    const streakChains = this.computeMonthStreakChains(habitId);

    for (let day = 1; day <= this.daysInMonth; day++) {
      const dateStr = `${this.currentYearMonth}-${String(day).padStart(2, '0')}`;
      const isChecked = this.checkinMap.has(`${habitId}:${dateStr}`);
      const cell = row.querySelector(`.matrix-cell[data-day="${day}"]`);
      if (!cell) continue;

      cell.setAttribute('aria-checked', isChecked ? 'true' : 'false');

      const chainInfo = streakChains[day];
      let washHtml = '';
      if (chainInfo) {
        let washClass = 'streak-wash';
        if (chainInfo.isSingle) washClass += ' streak-single';
        else {
          if (chainInfo.isStart) washClass += ' streak-start';
          if (chainInfo.isEnd) washClass += ' streak-end';
        }
        washHtml = `<div class="${washClass}"></div>`;
      }

      const markHtml = isChecked
        ? `<span class="ink-mark"><span class="ink-dot" style="background-color: ${habit.color || '#2c2c2c'}"></span></span>`
        : '';

      cell.innerHTML = `${washHtml}${markHtml}`;
    }
  }

  updateStreakBadgeInRow(habitId, streak) {
    const row = this.container.querySelector(`tr[data-habit-id="${habitId}"]`);
    if (!row) return;

    const leftContainer = row.querySelector('.habit-info-left');
    if (!leftContainer) return;

    let badge = leftContainer.querySelector('.streak-pill');
    if (streak > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'streak-pill';
        leftContainer.appendChild(badge);
      }
      badge.textContent = `⚡ ${streak}d`;
      badge.title = `${streak} consecutive completed days`;
    } else if (badge) {
      badge.remove();
    }
  }

  async handleDeleteHabit(id) {
    if (!confirm('Remove this habit from your notebook?')) return;
    try {
      await window.API.deleteHabit(id);
      this.habits = this.habits.filter(h => h.id !== Number(id));
      this.render();
      if (this.onHabitUpdated) this.onHabitUpdated({ deletedId: Number(id) });
    } catch (err) {
      alert('Failed to delete habit: ' + err.message);
    }
  }

  async handleRenameHabit(id, currentName) {
    const newName = prompt('Rename habit:', currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;
    try {
      const updated = await window.API.renameHabit(id, newName.trim());
      const habit = this.habits.find(h => h.id === Number(id));
      if (habit) habit.name = updated.name;
      this.render();
    } catch (err) {
      alert('Failed to rename habit: ' + err.message);
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.HabitMatrix = HabitMatrix;
