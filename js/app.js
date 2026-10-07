// Main Application Coordinator for Bullet Journal Habit Tracker
(function () {
  'use strict';

  // State
  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonthIndex = now.getMonth(); // 0-based
  const todayStr = now.toISOString().slice(0, 10);

  let selectedColor = '#2b5c8f'; // default ink color
  let activeData = null;

  // Components
  let habitMatrix = null;
  let sleepTracker = null;
  let moodTracker = null;
  const tooltipEl = document.getElementById('chart-tooltip');

  // Anti-procrastination quotes tailored for gentle motivation
  const PROCRASTINATOR_QUOTES = [
    { quote: "You don't have to be great to start, but you have to start to be a tiny bit better.", tag: "Gentle Start" },
    { quote: "Make it so small you can't talk yourself out of it. 2 minutes is enough.", tag: "Micro Habits" },
    { quote: "A missed day is just data, not defeat. The best day to restart is always today.", tag: "Zero Guilt" },
    { quote: "Action produces momentum, not the other way around. Just make one dot.", tag: "Low Friction" },
    { quote: "Never miss twice. A 1-day pause is rest; a 2nd day is a new habit.", tag: "Resilience" },
    { quote: "No pressure to be perfect. Simply show up and leave your mark.", tag: "Bujo Mindset" }
  ];

  function getYearMonthString(year, monthIdx) {
    const mStr = String(monthIdx + 1).padStart(2, '0');
    return `${year}-${mStr}`;
  }

  function getMonthName(year, monthIdx) {
    const d = new Date(year, monthIdx, 1);
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  async function loadData() {
    const ym = getYearMonthString(currentYear, currentMonthIndex);
    try {
      document.getElementById('current-month-label').textContent = getMonthName(currentYear, currentMonthIndex);
      activeData = await window.API.getMonthData(ym, todayStr);

      habitMatrix.setData({
        habits: activeData.habits,
        checkins: activeData.checkins,
        yearMonth: ym,
        todayStr: todayStr
      });

      sleepTracker.setData({
        sleepLogs: activeData.sleepLogs,
        yearMonth: ym,
        todayStr: todayStr
      });

      moodTracker.setData({
        moodLogs: activeData.moodLogs,
        yearMonth: ym,
        todayStr: todayStr
      });
    } catch (err) {
      console.error('Failed to load month data:', err);
    }
  }

  function initQuotes() {
    const randomIdx = Math.floor(Math.random() * PROCRASTINATOR_QUOTES.length);
    const item = PROCRASTINATOR_QUOTES[randomIdx];
    const quoteEl = document.getElementById('banner-quote');
    const badgeEl = document.getElementById('banner-badge');
    if (quoteEl) quoteEl.textContent = `“${item.quote}”`;
    if (badgeEl) badgeEl.textContent = item.tag;
  }

  function initColorPicker() {
    const dots = document.querySelectorAll('.color-dot');
    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        dots.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        selectedColor = dot.getAttribute('data-color');
      });
    });
  }

  async function handleAddHabit(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;

    try {
      const newHabit = await window.API.addHabit(trimmed, selectedColor);
      if (window.soundFx) window.soundFx.playPop();

      // Clear input
      const input = document.getElementById('habit-input');
      if (input) input.value = '';

      // Reload data to reflect in matrix with initial 0 streaks
      await loadData();
    } catch (err) {
      alert('Error adding habit: ' + err.message);
    }
  }

  function initQuickAdd() {
    const form = document.getElementById('quick-add-form');
    const input = document.getElementById('habit-input');

    if (form && input) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleAddHabit(input.value);
      });
    }

    // Procrastinator micro-habit chips (1-click add)
    document.querySelectorAll('.micro-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const habitName = chip.getAttribute('data-habit');
        const color = chip.getAttribute('data-color') || selectedColor;
        selectedColor = color;

        // Highlight matching color dot
        document.querySelectorAll('.color-dot').forEach(d => {
          if (d.getAttribute('data-color') === color) d.classList.add('active');
          else d.classList.remove('active');
        });

        handleAddHabit(habitName);
      });
    });
  }

  function initMonthNavigation() {
    const prevBtn = document.getElementById('prev-month-btn');
    const nextBtn = document.getElementById('next-month-btn');
    const todayBtn = document.getElementById('today-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentMonthIndex--;
        if (currentMonthIndex < 0) {
          currentMonthIndex = 11;
          currentYear--;
        }
        loadData();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentMonthIndex++;
        if (currentMonthIndex > 11) {
          currentMonthIndex = 0;
          currentYear++;
        }
        loadData();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const todayDate = new Date();
        currentYear = todayDate.getFullYear();
        currentMonthIndex = todayDate.getMonth();
        loadData();
      });
    }
  }

  function initSoundToggle() {
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (!soundBtn) return;

    soundBtn.addEventListener('click', () => {
      const isEnabled = window.soundFx.toggle();
      soundBtn.textContent = isEnabled ? '🔊 Sound: On' : '🔇 Sound: Off';
      soundBtn.title = isEnabled ? 'Click to mute tactile sounds' : 'Click to enable tactile sounds';
    });
  }

  // Document ready initialization
  document.addEventListener('DOMContentLoaded', () => {
    initQuotes();
    initColorPicker();
    initQuickAdd();
    initMonthNavigation();
    initSoundToggle();

    // Initialize core components
    const matrixContainer = document.getElementById('matrix-container');
    const sleepContainer = document.getElementById('sleep-container');
    const moodContainer = document.getElementById('mood-container');

    habitMatrix = new window.HabitMatrix(matrixContainer, (event) => {
      // Callback when a habit is modified/toggled
    });

    sleepTracker = new window.SleepTracker(sleepContainer, tooltipEl, (event) => {
      // Callback when sleep is updated
    });

    moodTracker = new window.MoodTracker(moodContainer, tooltipEl, (event) => {
      // Callback when mood is updated
    });

    loadData();
  });
})();
