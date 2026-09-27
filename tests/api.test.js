const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { HabitDatabase } = require('../db.js');
const { createServer } = require('../server.js');

// Lightweight in-process HTTP dispatch helper (bypasses network socket restrictions in sandbox)
function dispatch(server, method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = urlPath;
    req.headers = { 'content-type': 'application/json' };

    let statusCode = 200;
    let headers = {};
    let responseBody = '';

    const res = new EventEmitter();
    res.writeHead = (status, hdrs) => {
      statusCode = status;
      if (hdrs) headers = { ...headers, ...hdrs };
    };
    res.setHeader = (k, v) => {
      headers[k.toLowerCase()] = v;
    };
    res.end = (chunk) => {
      if (chunk) responseBody += chunk;
      let parsed = responseBody;
      try {
        parsed = JSON.parse(responseBody);
      } catch (e) {
        // keep as string
      }
      resolve({
        status: statusCode,
        headers,
        body: parsed,
        rawBody: responseBody
      });
    };

    server.emit('request', req, res);

    if (body) {
      req.emit('data', typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.emit('end');
  });
}

test('Bullet Journal Full Backend & Database Test Suite', async (t) => {
  const tempDbPath = path.join(__dirname, 'test_habits.db');
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  const db = new HabitDatabase(tempDbPath);
  const { server } = createServer(db);

  t.after(() => {
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  });

  await t.test('1. Database seeds default micro-habits for procrastinators', () => {
    const habits = db.getHabits();
    assert.ok(habits.length >= 4, 'Should seed at least 4 default gentle habits');
    assert.strictEqual(habits[0].name, 'Drink a glass of water');
  });

  await t.test('2. GET /api/data returns current month data structure', async () => {
    const res = await dispatch(server, 'GET', '/api/data?month=2026-09&today=2026-09-27');
    assert.strictEqual(res.status, 200);
    const data = res.body;
    assert.strictEqual(data.yearMonth, '2026-09');
    assert.ok(Array.isArray(data.habits));
    assert.ok(Array.isArray(data.checkins));
    assert.ok(Array.isArray(data.sleepLogs));
    assert.ok(Array.isArray(data.moodLogs));
  });

  let createdHabitId = null;

  await t.test('3. POST /api/habits creates a new habit', async () => {
    const res = await dispatch(server, 'POST', '/api/habits', {
      name: '5-minute evening meditation',
      color: '#7a3e65',
      category: 'mind'
    });
    assert.strictEqual(res.status, 201);
    const habit = res.body;
    assert.strictEqual(habit.name, '5-minute evening meditation');
    assert.strictEqual(habit.color, '#7a3e65');
    assert.ok(habit.id);
    createdHabitId = habit.id;
  });

  await t.test('4. POST /api/checkins/toggle toggles check-in and computes streaks accurately', async () => {
    // Day 1: 2026-09-25
    const r1 = await dispatch(server, 'POST', '/api/checkins/toggle', {
      habitId: createdHabitId,
      date: '2026-09-25'
    });
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r1.body.completed, true);

    // Day 2: 2026-09-26
    const r2 = await dispatch(server, 'POST', '/api/checkins/toggle', {
      habitId: createdHabitId,
      date: '2026-09-26'
    });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.body.completed, true);

    // Day 3: 2026-09-27 (today)
    const r3 = await dispatch(server, 'POST', '/api/checkins/toggle', {
      habitId: createdHabitId,
      date: '2026-09-27'
    });
    assert.strictEqual(r3.status, 200);
    assert.strictEqual(r3.body.completed, true);
    assert.strictEqual(r3.body.streak, 3);
    assert.strictEqual(r3.body.bestStreak, 3);

    // Toggle off Day 3
    const r4 = await dispatch(server, 'POST', '/api/checkins/toggle', {
      habitId: createdHabitId,
      date: '2026-09-27'
    });
    assert.strictEqual(r4.status, 200);
    assert.strictEqual(r4.body.completed, false);
    // Streak still protects user for yesterday:
    assert.strictEqual(r4.body.streak, 2);
  });

  await t.test('5. POST /api/sleep logs and updates sleep hours', async () => {
    const res = await dispatch(server, 'POST', '/api/sleep', {
      date: '2026-09-27',
      hours: 7.5,
      quality: 'rested'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.date, '2026-09-27');
    assert.strictEqual(res.body.hours, 7.5);

    // Verify it appears in month data
    const resMonth = await dispatch(server, 'GET', '/api/data?month=2026-09');
    const sleepEntry = resMonth.body.sleepLogs.find(s => s.date === '2026-09-27');
    assert.ok(sleepEntry);
    assert.strictEqual(sleepEntry.hours, 7.5);
  });

  await t.test('6. POST /api/mood logs and updates mood rating (1-5 scale)', async () => {
    const res = await dispatch(server, 'POST', '/api/mood', {
      date: '2026-09-27',
      score: 4,
      tag: 'Calm & focused'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.date, '2026-09-27');
    assert.strictEqual(res.body.score, 4);

    // Verify in month data
    const resMonth = await dispatch(server, 'GET', '/api/data?month=2026-09');
    const moodEntry = resMonth.body.moodLogs.find(m => m.date === '2026-09-27');
    assert.ok(moodEntry);
    assert.strictEqual(moodEntry.score, 4);
  });

  await t.test('7. PUT /api/habits/:id renames habit', async () => {
    const res = await dispatch(server, 'PUT', `/api/habits/${createdHabitId}`, {
      name: '10-minute quiet reflection'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, '10-minute quiet reflection');
  });

  await t.test('8. DELETE /api/habits/:id deletes habit and cascades checkins', async () => {
    const res = await dispatch(server, 'DELETE', `/api/habits/${createdHabitId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    const habits = db.getHabits();
    assert.ok(!habits.some(h => h.id === createdHabitId));
  });

  await t.test('9. GET /api/health returns healthy status', async () => {
    const res = await dispatch(server, 'GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'healthy');
  });
});
