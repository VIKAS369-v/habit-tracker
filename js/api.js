// API Client for Bullet Journal Habit Tracker
const API = {
  async getMonthData(month, today) {
    const res = await fetch(`/habit-tracker/api/data?month=${encodeURIComponent(month)}&today=${encodeURIComponent(today)}`);
    if (!res.ok) throw new Error(`Failed to load data: ${res.statusText}`);
    return res.json();
  },

  async addHabit(name, color = '#2c2c2c', category = 'general') {
    const res = await fetch('/habit-tracker/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, category })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add habit' }));
      throw new Error(err.error || 'Failed to add habit');
    }
    return res.json();
  },

  async deleteHabit(habitId) {
    const res = await fetch(`/habit-tracker/api/habits/${habitId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete habit');
    return res.json();
  },

  async renameHabit(habitId, name) {
    const res = await fetch(`/habit-tracker/api/habits/${habitId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Failed to rename habit');
    return res.json();
  },

  async toggleCheckin(habitId, date) {
    const res = await fetch('/habit-tracker/api/checkins/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habitId, date })
    });
    if (!res.ok) throw new Error('Failed to toggle check-in');
    return res.json();
  },

  async saveSleep(date, hours, quality = 'good') {
    const res = await fetch('/habit-tracker/api/sleep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, hours, quality })
    });
    if (!res.ok) throw new Error('Failed to save sleep log');
    return res.json();
  },

  async saveMood(date, score, tag = '') {
    const res = await fetch('/habit-tracker/api/mood', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, score, tag })
    });
    if (!res.ok) throw new Error('Failed to save mood log');
    return res.json();
  }
};

window.API = API;
