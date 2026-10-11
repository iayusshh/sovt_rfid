import { database } from "./database";
import type { InValue } from "@libsql/client";

// SQL projections and validated request bodies have endpoint-specific shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  studentId: string | null;
};
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const bytesHex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
const random = () => bytesHex(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (value: string) =>
  bytesHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
const db = database;
const stmt = (s: string, ...p: InValue[]) =>
  db()
    .prepare(s)
    .bind(...p);
async function all(s: string, ...p: InValue[]): Promise<Row[]> {
  return (await stmt(s, ...p).all()).results as Row[];
}
async function one(s: string, ...p: InValue[]): Promise<Row | null> {
  return await stmt(s, ...p).first<Row>();
}
function error(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
function out(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
function text(v: unknown, label: string, max = 150): string {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    error(`${label} is required (maximum ${max} characters)`);
  return v.trim();
}
function email(v: unknown): string {
  const s = text(v, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) error("Enter a valid email");
  return s;
}
function uid(v: unknown): string {
  const s = text(v, "Card UID", 40)
    .replace(/[\s:-]/g, "")
    .toUpperCase();
  if (!/^(?:[A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$/.test(s))
    error("UID must contain 8, 14, or 20 hexadecimal characters");
  return s;
}
function password(v: unknown): string {
  if (typeof v !== "string" || v.length < 10 || v.length > 128)
    error("Password must be 10–128 characters");
  return v;
}
async function passwordHash(p: string, salt = random()) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(p),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const b = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  return `${salt}:${bytesHex(b)}`;
}
async function passwordMatch(p: string, h: string) {
  return (await passwordHash(p, h.split(":")[0])) === h;
}
function userJSON(u: Row): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    studentId: u.student_id,
  };
}
async function user(req: Request): Promise<User> {
  const cookie = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)sovt_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!cookie) error("Sign in to continue", 401);
  const u = await one(
    "SELECT u.* FROM logins l JOIN users u ON u.id=l.user_id WHERE l.token_hash=? AND l.expires_at>? AND u.active=1",
    await hash(cookie),
    now(),
  );
  if (!u) error("Your session expired. Sign in again", 401);
  return userJSON(u);
}
function admin(u: User) {
  if (u.role !== "admin") error("Administrator access required", 403);
}
async function canCourse(u: User, cid: string) {
  if (u.role === "admin") {
    if (!(await one("SELECT id FROM courses WHERE id=?", cid)))
      error("Course not found", 404);
    return;
  }
  if (
    u.role !== "faculty" ||
    !(await one(
      "SELECT id FROM courses WHERE id=? AND faculty_id=?",
      cid,
      u.id,
    ))
  )
    error("This course is not assigned to you", 403);
}
async function canSession(u: User, sid: string) {
  const s = await one("SELECT * FROM sessions WHERE id=?", sid);
  if (!s) error("Session not found", 404);
  await canCourse(u, s.course_id);
  return s;
}
function audit(u: User, action: string, detail: string) {
  return stmt(
    "INSERT INTO audits (id,actor,action,detail,created_at) VALUES (?,?,?,?,?)",
    id(),
    u.name,
    action,
    detail,
    now(),
  );
}
async function body(req: Request): Promise<Row> {
  if (Number(req.headers.get("content-length") || 0) > 16384)
    error("Request too large", 413);
  const raw = await req.text();
  if (raw.length > 16384) error("Request too large", 413);
  try {
    const b = raw ? JSON.parse(raw) : {};
    if (!b || Array.isArray(b) || typeof b !== "object")
      error("Expected a JSON object");
    return b;
  } catch {
    error("Invalid JSON request");
  }
}
async function reader(req: Request) {
  const token = req.headers
    .get("authorization")
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) error("Reader credential required", 401);
  const r = await one(
    "SELECT * FROM readers WHERE token_hash=?",
    await hash(token),
  );
  if (!r) error("Invalid reader credential", 401);
  return r;
}

// Attendance insert and event calculation execute in one libSQL transaction. Both
// the roster and open-session predicates are checked inside the insert.
async function scan(r: Row, card: string, eventId: string, source: string) {
  const existing = await one(
    "SELECT uid FROM events WHERE reader_id=? AND event_id=?",
    r.id,
    eventId,
  );
  if (existing && existing.uid !== card)
    error("Event identifier already used for a different card", 409);
  const time = now();
  await db().batch([
    stmt(
      `INSERT INTO attendance (session_id,student_id,status,marked_at,source,event_id)
 SELECT s.id,st.id,CASE WHEN julianday(?) >= julianday(s.opened_at, '+10 minutes') THEN 'late' ELSE 'present' END,?,?,?
 FROM sessions s JOIN readers rd ON rd.id=s.reader_id JOIN students st ON st.card_uid=? JOIN roster ro ON ro.session_id=s.id AND ro.student_id=st.id
 WHERE s.reader_id=? AND s.status='open' AND rd.active=1 AND st.active=1
 AND NOT EXISTS (SELECT 1 FROM events WHERE reader_id=? AND event_id=?)
 ON CONFLICT(session_id,student_id) DO NOTHING`,
      time,
      time,
      source,
      eventId,
      card,
      r.id,
      r.id,
      eventId,
    ),
    stmt(
      `INSERT INTO events(id,reader_id,event_id,uid,outcome,message,student_name,session_id,created_at)
 SELECT ?,?,?,?,?,COALESCE((SELECT name FROM students WHERE card_uid=?),'Unregistered card'),(SELECT name FROM students WHERE card_uid=?),(SELECT id FROM sessions WHERE reader_id=? AND status='open'),?
 ON CONFLICT(reader_id,event_id) DO NOTHING`,
      id(),
      r.id,
      eventId,
      card,
      "pending",
      card,
      card,
      r.id,
      time,
    ),
    stmt(
      `UPDATE events SET outcome=CASE
 WHEN (SELECT active FROM readers WHERE id=reader_id)=0 THEN 'disabled'
 WHEN session_id IS NULL THEN 'no_session'
 WHEN NOT EXISTS(SELECT 1 FROM students WHERE card_uid=uid AND active=1) THEN 'unknown_card'
 WHEN NOT EXISTS(SELECT 1 FROM roster ro JOIN students st ON st.id=ro.student_id WHERE ro.session_id=events.session_id AND st.card_uid=events.uid) THEN 'not_enrolled'
 WHEN EXISTS(SELECT 1 FROM attendance a JOIN students st ON st.id=a.student_id WHERE a.session_id=events.session_id AND st.card_uid=events.uid AND a.event_id=events.event_id) THEN (SELECT a.status FROM attendance a JOIN students st ON st.id=a.student_id WHERE a.session_id=events.session_id AND st.card_uid=events.uid)
 ELSE 'duplicate' END WHERE reader_id=? AND event_id=? AND outcome='pending'`,
      r.id,
      eventId,
    ),
    stmt(
      `UPDATE events SET message=CASE outcome WHEN 'present' THEN 'Attendance recorded' WHEN 'late' THEN 'Attendance recorded as late' WHEN 'duplicate' THEN 'Already recorded; original mark preserved' WHEN 'disabled' THEN 'Reader disabled by administrator' WHEN 'no_session' THEN 'No class session is open on this reader' WHEN 'unknown_card' THEN 'Card is not registered to an active student' WHEN 'not_enrolled' THEN 'Student is not on this session roster' ELSE 'Scan rejected' END WHERE reader_id=? AND event_id=?`,
      r.id,
      eventId,
    ),
    stmt("UPDATE readers SET last_seen=? WHERE id=?", time, r.id),
  ]);
  const e = (await one(
    "SELECT * FROM events WHERE reader_id=? AND event_id=?",
    r.id,
    eventId,
  ))!;
  return {
    outcome: e.outcome,
    message: e.message,
    studentName: e.student_name,
    sessionId: e.session_id,
    serverTime: e.created_at,
  };
}
async function state(u: User) {
  const cs = await all(
    `SELECT c.id,c.code,c.name,c.faculty_id AS facultyId,c.room,(SELECT COUNT(*) FROM enrollments e JOIN students st ON st.id=e.student_id WHERE e.course_id=c.id AND st.active=1) AS enrolled FROM courses c ${u.role === "faculty" ? "WHERE c.faculty_id=?" : u.role === "student" ? "WHERE c.id IN(SELECT course_id FROM enrollments WHERE student_id=?) OR c.id IN(SELECT s.course_id FROM sessions s JOIN roster r ON r.session_id=s.id WHERE r.student_id=?)" : ""}`,
    ...(u.role === "faculty"
      ? [u.id]
      : u.role === "student"
        ? [u.studentId, u.studentId]
        : []),
  );
  const ids = cs.map((c) => c.id);
  const cwhere = ids.length
    ? `IN (${ids.map(() => "?").join(",")})`
    : "IN (NULL)";
  const st = await all(
    `SELECT id,name,roll,email,card_uid AS cardUid,active FROM students ${u.role === "student" ? "WHERE id=?" : u.role === "faculty" ? `WHERE id IN(SELECT student_id FROM enrollments WHERE course_id ${cwhere}) OR id IN(SELECT r.student_id FROM roster r JOIN sessions s ON s.id=r.session_id WHERE s.course_id ${cwhere})` : ""}`,
    ...(u.role === "student"
      ? [u.studentId]
      : u.role === "faculty"
        ? [...ids, ...ids]
        : []),
  );
  const ss = await all(
    `SELECT id,course_id AS courseId,reader_id AS readerId,title,opened_at AS openedAt,closed_at AS closedAt,status FROM sessions WHERE course_id ${cwhere} ${u.role === "student" ? "AND id IN (SELECT session_id FROM roster WHERE student_id=?)" : ""} ORDER BY opened_at DESC`,
    ...ids,
    ...(u.role === "student" ? [u.studentId] : []),
  );
  const ats = await all(
    `SELECT a.session_id AS sessionId,a.student_id AS studentId,a.status,a.marked_at AS markedAt,a.source FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE s.course_id ${cwhere} ${u.role === "student" ? "AND a.student_id=?" : ""}`,
    ...ids,
    ...(u.role === "student" ? [u.studentId] : []),
  );
  const counts = await all(
    `SELECT r.student_id AS studentId,COUNT(*) AS total,SUM(CASE WHEN a.status IN('present','late') THEN 1 ELSE 0 END) AS attended FROM roster r JOIN sessions s ON s.id=r.session_id LEFT JOIN attendance a ON a.session_id=r.session_id AND a.student_id=r.student_id WHERE s.status='closed' AND s.course_id ${cwhere} ${u.role === "student" ? "AND r.student_id=?" : ""} GROUP BY r.student_id`,
    ...ids,
    ...(u.role === "student" ? [u.studentId] : []),
  );
  for (const student of st) {
    const c = counts.find((x) => x.studentId === student.id);
    student.total = c?.total || 0;
    student.attended = c?.attended || 0;
    student.percentage = student.total
      ? Math.round((1000 * student.attended) / student.total) / 10
      : null;
    student.active = !!student.active;
  }
  const faculty = await all(
    `SELECT id,name,email,role FROM users WHERE role='faculty' ${u.role === "faculty" ? "AND id=?" : u.role === "student" ? `AND id IN(SELECT faculty_id FROM courses WHERE id ${cwhere})` : ""}`,
    ...(u.role === "faculty" ? [u.id] : u.role === "student" ? ids : []),
  );
  const en = await all(
    `SELECT course_id AS courseId,student_id AS studentId FROM enrollments WHERE course_id ${cwhere} ${u.role === "student" ? "AND student_id=?" : ""}`,
    ...ids,
    ...(u.role === "student" ? [u.studentId] : []),
  );
  const rd =
    u.role === "student"
      ? []
      : await all(
          `SELECT id,name,last_seen AS lastSeen,active,(SELECT id FROM sessions s WHERE s.reader_id=readers.id AND s.status='open') AS sessionId FROM readers ${u.role === "faculty" ? `WHERE active=1 OR id IN(SELECT reader_id FROM sessions WHERE course_id ${cwhere})` : ""}`,
          ...(u.role === "faculty" ? ids : []),
        );
  rd.forEach((r) => (r.active = !!r.active));
  const ev =
    u.role === "student"
      ? []
      : await all(
          `SELECT id,reader_id AS readerId,uid,outcome,message,created_at AS createdAt FROM events ${u.role === "faculty" ? `WHERE session_id IN (SELECT id FROM sessions WHERE course_id ${cwhere})` : ""} ORDER BY created_at DESC LIMIT 100`,
          ...(u.role === "faculty" ? ids : []),
        );
  const au =
    u.role === "admin"
      ? await all(
          "SELECT id,actor,action,detail,created_at AS createdAt FROM audits ORDER BY created_at DESC LIMIT 100",
        )
      : [];
  const total = counts.reduce((n, c) => n + c.total, 0),
    att = counts.reduce((n, c) => n + c.attended, 0);
  return {
    user: u,
    students: st,
    faculty,
    courses: cs,
    enrollments: en,
    sessions: ss,
    attendance: ats,
    readers: rd,
    events: ev,
    audits: au,
    stats: {
      closedSessions: ss.filter((s) => s.status === "closed").length,
      attendanceRate: total ? Math.round((1000 * att) / total) / 10 : null,
      atRisk: st.filter(
        (s) => s.active && s.total && s.attended / s.total < 0.75,
      ).length,
      openSessions: ss.filter((s) => s.status === "open").length,
    },
  };
}
async function setup(req: Request) {
  const cfg = process.env;
  if (!cfg.SETUP_TOKEN || req.headers.get("x-setup-token") !== cfg.SETUP_TOKEN)
    error("Setup credential required", 401);
  if (!cfg.DEMO_PASSWORD || !cfg.DEMO_READER_TOKEN)
    error("Demo runtime secrets are not configured", 503);
  if (await one("SELECT id FROM users WHERE id='admin-demo'"))
    return out({ ok: true, alreadyInitialized: true });
  const ph = await passwordHash(password(cfg.DEMO_PASSWORD));
  const queries = [
    stmt(
      "INSERT OR IGNORE INTO users(id,name,email,role,password_hash,active) VALUES (?,?,?,?,?,1)",
      "admin-demo",
      "SOVT Administrator",
      "admin@demo.sovt.test",
      "admin",
      ph,
    ),
  ];
  for (let i = 1; i <= 2; i++)
    queries.push(
      stmt(
        "INSERT OR IGNORE INTO users(id,name,email,role,password_hash,active) VALUES (?,?,?,?,?,1)",
        `faculty-${i}`,
        ["Dr. Meera Sharma", "Prof. Arjun Rao"][i - 1],
        `faculty${i}@demo.sovt.test`,
        "faculty",
        ph,
      ),
    );
  const names = [
    "Aanya Shah",
    "Vivaan Patel",
    "Diya Nair",
    "Arnav Singh",
    "Ishaan Gupta",
    "Sara Khan",
    "Rohan Das",
    "Anika Iyer",
    "Kabir Jain",
    "Mira Sen",
  ];
  for (let i = 1; i <= 10; i++) {
    const sid = `student-${String(i).padStart(2, "0")}`,
      em = `student${String(i).padStart(2, "0")}@demo.sovt.test`;
    queries.push(
      stmt(
        "INSERT OR IGNORE INTO students(id,name,roll,email,card_uid,active) VALUES (?,?,?,?,?,1)",
        sid,
        names[i - 1],
        `CSE2027${String(i).padStart(3, "0")}`,
        em,
        `04AABB000000${i.toString(16).padStart(2, "0").toUpperCase()}`,
      ),
    );
    queries.push(
      stmt(
        "INSERT OR IGNORE INTO users(id,name,email,role,password_hash,student_id,active) VALUES (?,?,?,?,?,?,1)",
        `user-${sid}`,
        names[i - 1],
        em,
        "student",
        ph,
        sid,
      ),
    );
  }
  for (let i = 1; i <= 2; i++) {
    queries.push(
      stmt(
        "INSERT OR IGNORE INTO courses(id,code,name,faculty_id,room) VALUES (?,?,?,?,?)",
        `course-${i}`,
        `CS30${i}`,
        ["Database Systems", "Computer Networks"][i - 1],
        `faculty-${i}`,
        `Room ${200 + i}`,
      ),
    );
    for (let j = 1; j <= 10; j++)
      queries.push(
        stmt(
          "INSERT OR IGNORE INTO enrollments(course_id,student_id) VALUES (?,?)",
          `course-${i}`,
          `student-${String(j).padStart(2, "0")}`,
        ),
      );
  }
  queries.push(
    stmt(
      "INSERT OR IGNORE INTO readers(id,name,token_hash,active) VALUES (?,?,?,1)",
      "reader-demo",
      "Portable reader · Lab 1",
      await hash(cfg.DEMO_READER_TOKEN),
    ),
  );
  await db().batch(queries);
  return out({ ok: true });
}
export async function handleApi(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url),
      path = url.pathname.replace(/^\/api\//, "").replace(/\/$/, ""),
      method = req.method;
    if (method !== "GET" && !path.startsWith("device/") && path !== "setup") {
      if (req.headers.get("origin") !== url.origin)
        error("Request origin is not allowed", 403);
    }
    if (path === "setup" && method === "POST") return await setup(req);
    if (path === "login" && method === "POST") {
      const b = await body(req),
        em = email(b.email),
        p = typeof b.password === "string" ? b.password : "";
      if (p.length > 128) error("Invalid email or password", 401);
      const key = await hash(
          `${em}:${req.headers.get("x-vercel-forwarded-for") || "local"}`,
        ),
        time = now();
      await stmt(
        "INSERT INTO login_attempts(key,count,started_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN started_at < ? THEN 1 ELSE count+1 END, started_at=CASE WHEN started_at < ? THEN excluded.started_at ELSE started_at END",
        key,
        time,
        new Date(Date.now() - 900000).toISOString(),
        new Date(Date.now() - 900000).toISOString(),
      ).run();
      const attempts = await one(
        "SELECT count FROM login_attempts WHERE key=?",
        key,
      );
      if (attempts!.count > 12)
        error("Too many attempts; retry in 15 minutes", 429);
      const u = await one("SELECT * FROM users WHERE email=? AND active=1", em);
      const valid = await passwordMatch(
        p,
        u?.password_hash || `${"0".repeat(64)}:${"0".repeat(64)}`,
      );
      if (!u || !valid) error("Invalid email or password", 401);
      const token = random(),
        expiry = new Date(Date.now() + 12 * 3600000).toISOString();
      await db().batch([
        stmt("DELETE FROM login_attempts WHERE key=?", key),
        stmt("DELETE FROM logins WHERE expires_at<?", time),
        stmt(
          "INSERT INTO logins(token_hash,user_id,expires_at) VALUES (?,?,?)",
          await hash(token),
          u.id,
          expiry,
        ),
      ]);
      return out({ user: userJSON(u) }, 200, {
        "Set-Cookie": `sovt_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${url.protocol === "https:" ? "; Secure" : ""}`,
      });
    }
    if (path === "logout" && method === "POST") {
      const c = req.headers
        .get("cookie")
        ?.match(/sovt_session=([a-f0-9]{64})/)?.[1];
      if (c)
        await stmt(
          "DELETE FROM logins WHERE token_hash=?",
          await hash(c),
        ).run();
      return out({ ok: true }, 200, {
        "Set-Cookie":
          "sovt_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      });
    }
    if (path === "device/heartbeat" && method === "POST") {
      const r = await reader(req);
      if (!r.active) error("Reader disabled", 403);
      await stmt(
        "UPDATE readers SET last_seen=? WHERE id=?",
        now(),
        r.id,
      ).run();
      const s = await one(
        "SELECT id FROM sessions WHERE reader_id=? AND status='open'",
        r.id,
      );
      return out({
        readerId: r.id,
        sessionId: s?.id || null,
        serverTime: now(),
      });
    }
    if (path === "device/scan" && method === "POST") {
      const r = await reader(req),
        b = await body(req);
      return out(
        await scan(
          r,
          uid(b.uid),
          text(b.eventId, "Event identifier", 100),
          "rfid",
        ),
      );
    }
    const u = await user(req);
    if (path === "me" && method === "GET") return out({ user: u });
    if (path === "state" && method === "GET") return out(await state(u));
    if (path === "students" && method === "POST") {
      admin(u);
      const b = await body(req),
        sid = id(),
        name = text(b.name, "Name"),
        em = email(b.email),
        roll = text(b.roll, "Roll number", 50),
        card = uid(b.cardUid),
        ph = await passwordHash(password(b.password));
      await db().batch([
        stmt(
          "INSERT INTO students(id,name,roll,email,card_uid,active) VALUES (?,?,?,?,?,1)",
          sid,
          name,
          roll,
          em,
          card,
        ),
        stmt(
          "INSERT INTO users(id,name,email,role,password_hash,student_id,active) VALUES (?,?,?,?,?,?,1)",
          id(),
          name,
          em,
          "student",
          ph,
          sid,
        ),
        audit(u, "student.created", `${roll} · ${name}`),
      ]);
      return out({ studentId: sid }, 201);
    }
    if (/^students\/[^/]+$/.test(path) && method === "PATCH") {
      admin(u);
      const sid = path.split("/")[1],
        b = await body(req),
        old = await one("SELECT * FROM students WHERE id=?", sid);
      if (!old) error("Student not found", 404);
      const name = b.name === undefined ? old.name : text(b.name, "Name"),
        em = b.email === undefined ? old.email : email(b.email),
        roll =
          b.roll === undefined ? old.roll : text(b.roll, "Roll number", 50),
        card = b.cardUid === undefined ? old.card_uid : uid(b.cardUid);
      if (b.active !== undefined && typeof b.active !== "boolean")
        error("Active must be true or false");
      const active = b.active === undefined ? old.active : Number(b.active);
      await db().batch([
        stmt(
          "UPDATE students SET name=?,email=?,roll=?,card_uid=?,active=? WHERE id=?",
          name,
          em,
          roll,
          card,
          active,
          sid,
        ),
        stmt(
          "UPDATE users SET name=?,email=?,active=? WHERE student_id=?",
          name,
          em,
          active,
          sid,
        ),
        audit(
          u,
          "student.updated",
          `${roll}: ${JSON.stringify({ before: { name: old.name, email: old.email, roll: old.roll, cardUid: old.card_uid, active: !!old.active }, after: { name, em, roll, card, active: !!active } })}`,
        ),
      ]);
      return out({ ok: true });
    }
    if (path === "faculty" && method === "POST") {
      admin(u);
      const b = await body(req);
      await db().batch([
        stmt(
          "INSERT INTO users(id,name,email,role,password_hash,active) VALUES (?,?,?,?,?,1)",
          id(),
          text(b.name, "Name"),
          email(b.email),
          "faculty",
          await passwordHash(password(b.password)),
        ),
        audit(u, "faculty.created", email(b.email)),
      ]);
      return out({ ok: true }, 201);
    }
    if (path === "courses" && method === "POST") {
      admin(u);
      const b = await body(req),
        fid = text(b.facultyId, "Faculty");
      if (
        !(await one(
          "SELECT id FROM users WHERE id=? AND role='faculty' AND active=1",
          fid,
        ))
      )
        error("Select an active faculty member");
      const cid = id();
      await db().batch([
        stmt(
          "INSERT INTO courses(id,code,name,faculty_id,room) VALUES (?,?,?,?,?)",
          cid,
          text(b.code, "Code", 30),
          text(b.name, "Course name"),
          fid,
          text(b.room, "Room", 60),
        ),
        audit(u, "course.created", text(b.code, "Code", 30)),
      ]);
      return out({ courseId: cid }, 201);
    }
    if (/^courses\/[^/]+$/.test(path) && method === "PATCH") {
      admin(u);
      const cid = path.split("/")[1],
        old = await one("SELECT * FROM courses WHERE id=?", cid);
      if (!old) error("Course not found", 404);
      const b = await body(req),
        fid = b.facultyId ?? old.faculty_id;
      if (
        !(await one(
          "SELECT id FROM users WHERE id=? AND role='faculty' AND active=1",
          fid,
        ))
      )
        error("Select an active faculty member");
      if (
        fid !== old.faculty_id &&
        (await one(
          "SELECT id FROM sessions WHERE course_id=? AND status='open'",
          cid,
        ))
      )
        error("Close the active session before reassigning faculty", 409);
      await db().batch([
        stmt(
          "UPDATE courses SET name=?,room=?,faculty_id=? WHERE id=?",
          b.name === undefined ? old.name : text(b.name, "Name"),
          b.room === undefined ? old.room : text(b.room, "Room", 60),
          fid,
          cid,
        ),
        audit(u, "course.updated", old.code),
      ]);
      return out({ ok: true });
    }
    if (path === "enrollments" && (method === "POST" || method === "DELETE")) {
      admin(u);
      const b = await body(req),
        cid = text(b.courseId, "Course"),
        sid = text(b.studentId, "Student");
      if (
        !(await one("SELECT id FROM courses WHERE id=?", cid)) ||
        !(await one("SELECT id FROM students WHERE id=? AND active=1", sid))
      )
        error("Select an existing course and active student");
      await db().batch([
        method === "POST"
          ? stmt(
              "INSERT OR IGNORE INTO enrollments(course_id,student_id) VALUES (?,?)",
              cid,
              sid,
            )
          : stmt(
              "DELETE FROM enrollments WHERE course_id=? AND student_id=?",
              cid,
              sid,
            ),
        audit(
          u,
          method === "POST" ? "enrollment.added" : "enrollment.removed",
          `${cid} · ${sid}`,
        ),
      ]);
      return out({ ok: true });
    }
    if (path === "readers" && method === "POST") {
      admin(u);
      const b = await body(req),
        rid = id(),
        token = random(),
        name = text(b.name, "Reader name");
      await db().batch([
        stmt(
          "INSERT INTO readers(id,name,token_hash,active) VALUES (?,?,?,1)",
          rid,
          name,
          await hash(token),
        ),
        audit(u, "reader.created", name),
      ]);
      return out(
        { reader: { id: rid, name, active: true, lastSeen: null }, token },
        201,
      );
    }
    if (/^readers\/[^/]+\/rotate$/.test(path) && method === "POST") {
      admin(u);
      const rid = path.split("/")[1];
      if (!(await one("SELECT id FROM readers WHERE id=?", rid)))
        error("Reader not found", 404);
      const token = random();
      await db().batch([
        stmt(
          "UPDATE readers SET token_hash=? WHERE id=?",
          await hash(token),
          rid,
        ),
        audit(u, "reader.rotated", rid),
      ]);
      return out({ token });
    }
    if (/^readers\/[^/]+$/.test(path) && method === "PATCH") {
      admin(u);
      const rid = path.split("/")[1],
        old = await one("SELECT * FROM readers WHERE id=?", rid);
      if (!old) error("Reader not found", 404);
      const b = await body(req);
      if (b.active !== undefined && typeof b.active !== "boolean")
        error("Active must be true or false");
      await db().batch([
        stmt(
          "UPDATE readers SET name=?,active=? WHERE id=?",
          b.name === undefined ? old.name : text(b.name, "Name"),
          b.active === undefined ? old.active : Number(b.active),
          rid,
        ),
        audit(u, "reader.updated", rid),
      ]);
      return out({ ok: true });
    }
    if (path === "sessions" && method === "POST") {
      const b = await body(req),
        cid = text(b.courseId, "Course"),
        rid = text(b.readerId, "Reader");
      await canCourse(u, cid);
      if (!(await one("SELECT id FROM readers WHERE id=? AND active=1", rid)))
        error("Choose an enabled reader");
      if (
        !(await one(
          "SELECT e.student_id FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.course_id=? AND s.active=1",
          cid,
        ))
      )
        error("Enroll at least one active student first");
      const sid = id(),
        time = now(),
        title = text(b.title || "Class attendance", "Session title");
      await db().batch([
        stmt(
          "INSERT INTO sessions(id,course_id,reader_id,title,opened_at,status) VALUES (?,?,?,?,?,'open')",
          sid,
          cid,
          rid,
          title,
          time,
        ),
        stmt(
          "INSERT INTO roster(session_id,student_id) SELECT ?,e.student_id FROM enrollments e JOIN students st ON st.id=e.student_id WHERE e.course_id=? AND st.active=1",
          sid,
          cid,
        ),
        audit(u, "session.opened", `${cid} · ${title}`),
      ]);
      return out(
        {
          session: {
            id: sid,
            courseId: cid,
            readerId: rid,
            title,
            openedAt: time,
            closedAt: null,
            status: "open",
          },
        },
        201,
      );
    }
    if (/^sessions\/[^/]+\/close$/.test(path) && method === "POST") {
      const sid = path.split("/")[1],
        s = await canSession(u, sid);
      if (s.status === "closed") return out({ ok: true, alreadyClosed: true });
      const time = now();
      await db().batch([
        stmt(
          "UPDATE sessions SET status='closed',closed_at=? WHERE id=? AND status='open'",
          time,
          sid,
        ),
        stmt(
          "INSERT INTO attendance(session_id,student_id,status,marked_at,source) SELECT session_id,student_id,'absent',?,'closure' FROM roster WHERE session_id=? ON CONFLICT(session_id,student_id) DO NOTHING",
          time,
          sid,
        ),
        audit(u, "session.closed", `${sid} · ${s.title}`),
      ]);
      return out({ ok: true });
    }
    if (/^sessions\/[^/]+\/roster$/.test(path) && method === "GET") {
      const sid = path.split("/")[1],
        s = await canSession(u, sid);
      const rows = await all(
        "SELECT st.id AS studentId,st.name,st.roll,COALESCE(a.status,'pending') AS status,a.marked_at AS markedAt FROM roster r JOIN students st ON st.id=r.student_id LEFT JOIN attendance a ON a.session_id=r.session_id AND a.student_id=r.student_id WHERE r.session_id=? ORDER BY st.roll",
        sid,
      );
      return out({
        session: {
          id: s.id,
          courseId: s.course_id,
          readerId: s.reader_id,
          title: s.title,
          status: s.status,
          openedAt: s.opened_at,
          closedAt: s.closed_at,
        },
        rows,
      });
    }
    if (path === "attendance" && method === "PATCH") {
      const b = await body(req),
        sid = text(b.sessionId, "Session"),
        stid = text(b.studentId, "Student"),
        status = text(b.status, "Status"),
        reason = text(b.reason, "Correction reason", 500);
      if (!["present", "late", "absent"].includes(status))
        error("Invalid attendance status");
      await canSession(u, sid);
      if (
        !(await one(
          "SELECT student_id FROM roster WHERE session_id=? AND student_id=?",
          sid,
          stid,
        ))
      )
        error("Student not on this session roster");
      const old = await one(
        "SELECT status FROM attendance WHERE session_id=? AND student_id=?",
        sid,
        stid,
      );
      await db().batch([
        stmt(
          "INSERT INTO attendance(session_id,student_id,status,marked_at,source) VALUES (?,?,?,?,'manual') ON CONFLICT(session_id,student_id) DO UPDATE SET status=excluded.status,marked_at=excluded.marked_at,source='manual',event_id=NULL",
          sid,
          stid,
          status,
          now(),
        ),
        audit(
          u,
          "attendance.corrected",
          JSON.stringify({
            sessionId: sid,
            studentId: stid,
            before: old?.status || "pending",
            after: status,
            reason,
          }),
        ),
      ]);
      return out({ ok: true });
    }
    if (path === "simulate" && method === "POST") {
      const b = await body(req),
        rid = text(b.readerId, "Reader"),
        r = await one("SELECT * FROM readers WHERE id=?", rid);
      if (!r) error("Reader not found", 404);
      const s = await one(
        "SELECT * FROM sessions WHERE reader_id=? AND status='open'",
        rid,
      );
      if (u.role !== "admin") {
        if (!s) error("Open an assigned session first", 403);
        await canCourse(u, s.course_id);
      }
      return out(await scan(r, uid(b.uid), `sim-${id()}`, "simulated"));
    }
    if (path === "reports.csv" && method === "GET") {
      const data = await state(u),
        cid = url.searchParams.get("courseId"),
        sid = url.searchParams.get("sessionId");
      if (cid && !data.courses.some((c) => c.id === cid))
        error("Course access denied", 403);
      if (sid && !data.sessions.some((s) => s.id === sid))
        error("Session access denied", 403);
      const scopedSessions = data.sessions.filter(
        (s) =>
          (!!sid || s.status === "closed") &&
          (!cid || s.courseId === cid) &&
          (!sid || s.id === sid),
      );
      const sids = scopedSessions.map((s) => s.id);
      const marks = data.attendance.filter((a) => sids.includes(a.sessionId));
      const escape = (v: unknown) => {
        let s = String(v ?? "");
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const rows = [
        [
          "Roll",
          "Name",
          "Email",
          "Course",
          "Session",
          "Status",
          "Marked at",
          "Source",
        ],
      ];
      for (const a of marks) {
        const st = data.students.find((st) => st.id === a.studentId),
          session = data.sessions.find((s) => s.id === a.sessionId),
          course = data.courses.find((c) => c.id === session?.courseId);
        if (st)
          rows.push([
            st.roll,
            st.name,
            st.email,
            course?.code || "",
            session?.title || "",
            a.status,
            a.markedAt,
            a.source,
          ]);
      }
      return new Response(
        "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="sovt-attendance.csv"',
            "Cache-Control": "no-store",
          },
        },
      );
    }
    error("Endpoint not found", 404);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && "status" in e && typeof e.status === "number")
      return out({ error: message }, e.status);
    if (/UNIQUE constraint|unique constraint/i.test(message))
      return out(
        {
          error:
            "This email, roll number, card, course code, or open reader/course session already exists",
        },
        409,
      );
    if (/FOREIGN KEY constraint/i.test(message))
      return out({ error: "A referenced record does not exist" }, 400);
    console.error("Attendance API failure:", message);
    return out(
      { error: "The request could not be completed. Please retry." },
      500,
    );
  }
}
