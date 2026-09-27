const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = process.env.HABITS_DB_PATH || path.join(__dirname, 'habits.db');

class HabitDatabase {
  constructor(dbPath = DB_PATH) {
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  init() {
    // Enable foreign keys and WAL mode for reliability
    this.db.exec('PRAGMA foreign_keys = ON;');

    // Schema setup
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#2c2c2c',
        category TEXT DEFAULT 'general',
        position INTEGER DEFAULT 0,
        is_archived INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
        UNIQUE(habit_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date);
      CREATE INDEX IF NOT EXISTS idx_checkins_habit ON checkins(habit_id);

      CREATE TABLE IF NOT EXISTS sleep_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        hours REAL NOT NULL,
        quality TEXT DEFAULT 'good',
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS mood_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        score INTEGER NOT NULL,
        tag TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.seedDefaultsIfEmpty();
  }

  seedDefaultsIfEmpty() {
    const countRow = this.db.prepare('SELECT COUNT(*) AS count FROM habits').get();
    if (countRow.count === 0) {
      const defaults = [
        { name: 'Drink a glass of water', color: '#2b5c8f', category: 'vitality' },
        { name: 'Read 1 page of a book', color: '#825a2c', category: 'mind' },
        { name: 'Step outside for fresh air', color: '#3d6b4f', category: 'reset' },
        { name: '2-minute desk tidy', color: '#7a3e65', category: 'focus' },
        { name: 'Write 1 thought in notebook', color: '#333333', category: 'mind' }
      ];

      const insertStmt = this.db.prepare(
        'INSERT INTO habits (name, color, category, position) VALUES (?, ?, ?, ?)'
      );

      defaults.forEach((habit, idx) => {
        insertStmt.run(habit.name, habit.color, habit.category, idx);
      });
    }
  }

  // Habits CRUD
  getHabits() {
    return this.db.prepare(
      'SELECT * FROM habits WHERE is_archived = 0 ORDER BY position ASC, id ASC'
    ).all();
  }

  addHabit(name, color = '#2c2c2c', category = 'general') {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Habit name cannot be empty');
    }

    // Get max position
    const maxPosRow = this.db.prepare(
      'SELECT COALESCE(MAX(position), -1) AS maxPos FROM habits WHERE is_archived = 0'
    ).get();
    const nextPos = (maxPosRow.maxPos || 0) + 1;

    const stmt = this.db.prepare(
      'INSERT INTO habits (name, color, category, position) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(trimmed, color, category, nextPos);

    return this.db.prepare('SELECT * FROM habits WHERE id = ?').get(info.lastInsertRowid);
  }

  deleteHabit(id) {
    const stmt = this.db.prepare('DELETE FROM habits WHERE id = ?');
    const info = stmt.run(Number(id));
    return info.changes > 0;
  }

  renameHabit(id, name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Habit name cannot be empty');
    }
    const stmt = this.db.prepare(
      'UPDATE habits SET name = ? WHERE id = ?'
    );
    stmt.run(trimmed, Number(id));
    return this.db.prepare('SELECT * FROM habits WHERE id = ?').get(Number(id));
  }

  // Checkins
  toggleCheckin(habitId, date) {
    if (!habitId || !date) {
      throw new Error('habitId and date are required');
    }

    const numericHabitId = Number(habitId);

    // Check if exists
    const existing = this.db.prepare(
      'SELECT id, completed FROM checkins WHERE habit_id = ? AND date = ?'
    ).get(numericHabitId, date);

    let isCompleted = false;

    if (existing) {
      if (existing.completed === 1) {
        // Toggle off: delete row or set to 0
        this.db.prepare('DELETE FROM checkins WHERE id = ?').run(existing.id);
        isCompleted = false;
      } else {
        this.db.prepare(
          'UPDATE checkins SET completed = 1, updated_at = datetime("now") WHERE id = ?'
        ).run(existing.id);
        isCompleted = true;
      }
    } else {
      this.db.prepare(
        'INSERT INTO checkins (habit_id, date, completed) VALUES (?, ?, 1)'
      ).run(numericHabitId, date);
      isCompleted = true;
    }

    // Compute updated streaks for this habit
    const streakInfo = this.calculateHabitStreak(numericHabitId, date);

    return {
      habitId: numericHabitId,
      date,
      completed: isCompleted,
      streak: streakInfo.currentStreak,
      bestStreak: streakInfo.bestStreak
    };
  }

  getCheckinsForMonth(yearMonth) {
    // yearMonth format: 'YYYY-MM'
    const pattern = `${yearMonth}-%`;
    return this.db.prepare(
      'SELECT habit_id, date, completed FROM checkins WHERE date LIKE ? AND completed = 1'
    ).all(pattern);
  }

  // Calculate habit streak with procrastinator-friendly logic
  calculateHabitStreak(habitId, referenceDateStr) {
    const checkins = this.db.prepare(
      'SELECT date FROM checkins WHERE habit_id = ? AND completed = 1 ORDER BY date ASC'
    ).all(Number(habitId));

    if (!checkins || checkins.length === 0) {
      return { currentStreak: 0, bestStreak: 0 };
    }

    const dateSet = new Set(checkins.map(c => c.date));

    // Calculate best streak across all history
    let bestStreak = 0;
    let tempStreak = 0;
    let prevDate = null;

    for (const checkin of checkins) {
      const cur = new Date(checkin.date + 'T00:00:00Z');
      if (!prevDate) {
        tempStreak = 1;
      } else {
        const diffMs = cur - prevDate;
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak += 1;
        } else if (diffDays > 1) {
          tempStreak = 1;
        }
      }
      if (tempStreak > bestStreak) {
        bestStreak = tempStreak;
      }
      prevDate = cur;
    }

    // Calculate current streak leading up to today / reference date
    // Procrastinator-friendly: if reference date is today and not yet checked,
    // don't penalize! Check starting from yesterday.
    const refDate = referenceDateStr ? new Date(referenceDateStr + 'T00:00:00Z') : new Date();
    const curDateStr = refDate.toISOString().slice(0, 10);

    let streakCounter = 0;
    let testDate = new Date(refDate);

    // If today is checked, count today and walk backward
    if (dateSet.has(curDateStr)) {
      streakCounter += 1;
      testDate.setUTCDate(testDate.getUTCDate() - 1);
    } else {
      // If today is NOT checked, test yesterday so user doesn't feel like they "lost" their streak at 9 AM
      testDate.setUTCDate(testDate.getUTCDate() - 1);
    }

    while (true) {
      const dStr = testDate.toISOString().slice(0, 10);
      if (dateSet.has(dStr)) {
        streakCounter += 1;
        testDate.setUTCDate(testDate.getUTCDate() - 1);
      } else {
        break;
      }
    }

    return {
      currentStreak: streakCounter,
      bestStreak: Math.max(bestStreak, streakCounter)
    };
  }

  // Sleep Tracker
  setSleep(date, hours, quality = 'good') {
    if (!date) throw new Error('Date is required for sleep log');
    const numericHours = Math.max(0, Math.min(24, Number(hours)));

    const existing = this.db.prepare('SELECT id FROM sleep_logs WHERE date = ?').get(date);
    if (existing) {
      this.db.prepare(
        'UPDATE sleep_logs SET hours = ?, quality = ?, updated_at = datetime("now") WHERE id = ?'
      ).run(numericHours, quality, existing.id);
    } else {
      this.db.prepare(
        'INSERT INTO sleep_logs (date, hours, quality) VALUES (?, ?, ?)'
      ).run(date, numericHours, quality);
    }

    return this.db.prepare('SELECT * FROM sleep_logs WHERE date = ?').get(date);
  }

  getSleepForMonth(yearMonth) {
    const pattern = `${yearMonth}-%`;
    return this.db.prepare(
      'SELECT date, hours, quality FROM sleep_logs WHERE date LIKE ? ORDER BY date ASC'
    ).all(pattern);
  }

  // Mood Tracker
  setMood(date, score, tag = '') {
    if (!date) throw new Error('Date is required for mood log');
    const numericScore = Math.max(1, Math.min(5, Math.round(Number(score))));

    const existing = this.db.prepare('SELECT id FROM mood_logs WHERE date = ?').get(date);
    if (existing) {
      this.db.prepare(
        'UPDATE mood_logs SET score = ?, tag = ?, updated_at = datetime("now") WHERE id = ?'
      ).run(numericScore, tag, existing.id);
    } else {
      this.db.prepare(
        'INSERT INTO mood_logs (date, score, tag) VALUES (?, ?, ?)'
      ).run(date, numericScore, tag);
    }

    return this.db.prepare('SELECT * FROM mood_logs WHERE date = ?').get(date);
  }

  getMoodForMonth(yearMonth) {
    const pattern = `${yearMonth}-%`;
    return this.db.prepare(
      'SELECT date, score, tag FROM mood_logs WHERE date LIKE ? ORDER BY date ASC'
    ).all(pattern);
  }

  // Aggregated Month Data for the App
  getMonthData(yearMonth, todayStr) {
    const habits = this.getHabits();
    const checkins = this.getCheckinsForMonth(yearMonth);
    const sleepLogs = this.getSleepForMonth(yearMonth);
    const moodLogs = this.getMoodForMonth(yearMonth);

    // Compute streaks for each habit
    const habitsWithStreaks = habits.map(h => {
      const streak = this.calculateHabitStreak(h.id, todayStr);
      return {
        ...h,
        currentStreak: streak.currentStreak,
        bestStreak: streak.bestStreak
      };
    });

    return {
      yearMonth,
      habits: habitsWithStreaks,
      checkins,
      sleepLogs,
      moodLogs
    };
  }
}

module.exports = { HabitDatabase };
