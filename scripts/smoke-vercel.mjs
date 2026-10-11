import assert from 'node:assert/strict';

// Read-only release smoke test. Credentials come from an ignored env file.
const base = process.env.ATTENDANCE_URL;
assert(base && new URL(base).protocol === 'https:', 'ATTENDANCE_URL must be the deployed HTTPS origin');
assert(process.env.DEMO_PASSWORD, 'Configure DEMO_PASSWORD in the environment');
const origin = new URL(base).origin;
let checks = 0;
function check(condition, message) { assert(condition, message); checks++; }
async function api(path, cookie, body) {
  return fetch(`${origin}/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin, 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
}
check((await api('state')).status === 401, 'Anonymous records must be private');
for (const [email, role] of [['admin@demo.sovt.test', 'admin'], ['faculty1@demo.sovt.test', 'faculty'], ['student01@demo.sovt.test', 'student']]) {
  const login = await api('login', null, { email, password: process.env.DEMO_PASSWORD });
  check(login.status === 200, `${role} login`);
  const header = login.headers.get('set-cookie');
  check(header?.includes('HttpOnly') && header.includes('Secure'), `${role} cookie security`);
  const cookie = header.split(';')[0];
  const response = await api('state', cookie);
  check(response.status === 200 && response.headers.get('cache-control') === 'no-store', `${role} private state`);
  const state = await response.json();
  if (role === 'student') check(state.students.length === 1 && state.events.length === 0 && state.audits.length === 0, 'Student privacy');
  if (role === 'admin' && process.env.EXPECTED_SESSION_TITLE) {
    const session = state.sessions.find(s => s.title === process.env.EXPECTED_SESSION_TITLE);
    check(session?.status === 'closed', 'Browser session survives deployment');
    const marks = state.attendance.filter(a => a.sessionId === session.id);
    check(marks.filter(a => a.status === 'present').length === 1 && marks.filter(a => a.status === 'absent').length === 9, 'Committed marks survive deployment');
  }
  check((await api('logout', cookie, {})).status === 200, `${role} logout`);
}
check((await api('setup', null, {})).status === 401, 'Unauthenticated bootstrap blocked');
console.log(`Passed ${checks} hosted smoke checks without changing attendance records.`);
