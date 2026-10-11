import assert from "node:assert/strict";
import fs from "node:fs";

// Run only against an isolated synthetic demo. Never use this on real college data.
const base = process.env.AUDIT_URL || "http://127.0.0.1:8787";
const secret = process.env.DEMO_PASSWORD;
assert(secret, "DEMO_PASSWORD must come from runtime environment");
const origin = new URL(base).origin;
const passed = [];
const expect = (condition, label) => {
  assert(condition, label);
  passed.push(label);
};
async function api(
  path,
  { cookie, token, method = "GET", body, originOverride, headers = {} } = {},
) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(method !== "GET" ? { origin: originOverride ?? origin } : {}),
      ...(cookie ? { cookie } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(process.env.SITES_SERVICE_TOKEN
        ? {
            "OAI-Sites-Authorization": `Bearer ${process.env.SITES_SERVICE_TOKEN}`,
          }
        : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return {
    status: response.status,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function login(email) {
  const r = await api("/login", {
    method: "POST",
    body: { email, password: secret },
  });
  assert.equal(r.status, 200, `Login ${email}: ${JSON.stringify(r.data)}`);
  assert(r.cookie, "login sets session cookie");
  return r.cookie;
}
const admin = await login("admin@demo.sovt.test");
if (
  process.env.AUDIT_PROBE_FILE &&
  process.env.AUDIT_MODE === "verify-persistence"
) {
  const saved = JSON.parse(
    fs.readFileSync(process.env.AUDIT_PROBE_FILE, "utf8"),
  );
  const state = await api("/state", { cookie: admin });
  expect(
    state.data.sessions.some(
      (s) => s.id === saved.sessionId && s.status === "closed",
    ),
    "closed session survives server restart",
  );
  expect(
    state.data.attendance.some(
      (a) =>
        a.sessionId === saved.sessionId &&
        a.studentId === saved.studentId &&
        a.status === "late",
    ),
    "audited correction survives server restart",
  );
  console.log(JSON.stringify({ passed }, null, 2));
  process.exit(0);
}
const faculty = await login("faculty1@demo.sovt.test");
const faculty2 = await login("faculty2@demo.sovt.test");
const studentCookie = await login("student01@demo.sovt.test");
expect((await api("/state")).status === 401, "anonymous state rejected");
expect((await api("/reports.csv")).status === 401, "anonymous report rejected");
expect(
  (
    await api("/students", {
      cookie: admin,
      method: "POST",
      originOverride: "https://attacker.invalid",
      body: {},
    })
  ).status === 403,
  "cross-origin mutation rejected",
);
expect(
  (await api("/students", { cookie: faculty, method: "POST", body: {} }))
    .status === 403,
  "faculty cannot administer students",
);
expect(
  (await api("/courses", { cookie: studentCookie, method: "POST", body: {} }))
    .status === 403,
  "student cannot administer courses",
);
const astate = (await api("/state", { cookie: admin })).data;
const fstate = (await api("/state", { cookie: faculty })).data;
const sstate = (await api("/state", { cookie: studentCookie })).data;
expect(
  fstate.courses.every((c) => c.facultyId === fstate.user.id),
  "faculty state courses assigned only",
);
expect(
  sstate.students.length === 1 &&
    sstate.students[0].id === sstate.user.studentId,
  "student state only own profile",
);
expect(
  !sstate.events?.length && !sstate.audits?.length && !sstate.readers?.length,
  "student cannot see reader activity or audits",
);
const stamp = `${Date.now()}`;
const original = astate.students.find((s) => s.id === sstate.user.studentId);
assert(original);
const created = await api("/students", {
  cookie: admin,
  method: "POST",
  body: {
    name: "=AUDIT()",
    roll: `AUD-${stamp}`,
    email: `audit-${stamp}@demo.sovt.test`,
    cardUid: `04${BigInt(stamp).toString(16).padStart(12, "0").slice(-12)}`,
    password: secret,
  },
});
assert([200, 201].includes(created.status), JSON.stringify(created.data));
const fresh = (await api("/state", { cookie: admin })).data;
const extra = fresh.students.find((s) => s.roll === `AUD-${stamp}`);
assert(extra);
expect(
  extra.total === 0 && extra.percentage === null,
  "student without closed roster denominator has null percentage",
);
const courseR = await api("/courses", {
  cookie: admin,
  method: "POST",
  body: {
    code: `AUD${stamp}`,
    name: "Audit course",
    facultyId: fstate.user.id,
    room: "Audit",
  },
});
assert([200, 201].includes(courseR.status), JSON.stringify(courseR.data));
const courses = (await api("/state", { cookie: admin })).data.courses;
const course = courses.find((c) => c.code === `AUD${stamp}`);
assert(course);
for (const studentId of [original.id, extra.id])
  assert.equal(
    (
      await api("/enrollments", {
        cookie: admin,
        method: "POST",
        body: { courseId: course.id, studentId },
      })
    ).status,
    200,
  );
const readerR = await api("/readers", {
  cookie: admin,
  method: "POST",
  body: { name: `Audit ${stamp}` },
});
assert([200, 201].includes(readerR.status), JSON.stringify(readerR.data));
const { reader, token } = readerR.data;
assert(reader?.id && token);
expect(
  (await api("/device/heartbeat", { method: "POST", body: {} })).status === 401,
  "reader heartbeat requires credential",
);
expect(
  (
    await api("/device/scan", {
      method: "POST",
      token,
      body: { uid: original.cardUid, eventId: `no-session-${stamp}` },
    })
  ).data.outcome === "no_session",
  "scan without open session rejected",
);
expect(
  (
    await api("/device/scan", {
      method: "POST",
      token: "invalid",
      body: { uid: original.cardUid, eventId: `bad-${stamp}` },
    })
  ).status === 401,
  "invalid reader credential rejected",
);
const opened = await api("/sessions", {
  cookie: faculty,
  method: "POST",
  body: { courseId: course.id, readerId: reader.id, title: `Audit ${stamp}` },
});
assert([200, 201].includes(opened.status), JSON.stringify(opened.data));
const session = opened.data.session;
assert(session?.id);
expect(
  (await api(`/sessions/${session.id}/roster`, { cookie: faculty2 })).status ===
    403,
  "other faculty cannot inspect session roster",
);
expect(
  (
    await api(`/sessions/${session.id}/close`, {
      cookie: faculty2,
      method: "POST",
    })
  ).status === 403,
  "other faculty cannot close session",
);
expect(
  (
    await api("/sessions", {
      cookie: faculty,
      method: "POST",
      body: { courseId: course.id, readerId: reader.id, title: "Conflict" },
    })
  ).status === 409,
  "concurrent course or reader session rejected",
);
assert.equal(
  (
    await api("/enrollments", {
      cookie: admin,
      method: "DELETE",
      body: { courseId: course.id, studentId: extra.id },
    })
  ).status,
  200,
);
const roster = (
  await api(`/sessions/${session.id}/roster`, { cookie: faculty })
).data.rows;
expect(
  roster.some((r) => r.studentId === extra.id),
  "session roster persists after enrollment removal",
);
const scan = await api("/device/scan", {
  method: "POST",
  token,
  body: { uid: original.cardUid, eventId: `first-${stamp}` },
});
expect(
  scan.data.outcome === "present",
  "first enrolled card scan present before ten minutes",
);
const replay = await api("/device/scan", {
  method: "POST",
  token,
  body: { uid: original.cardUid, eventId: `first-${stamp}` },
});
expect(
  JSON.stringify(replay.data) === JSON.stringify(scan.data),
  "same event replay returns exact original result",
);
expect(
  (
    await api("/device/scan", {
      method: "POST",
      token,
      body: { uid: extra.cardUid, eventId: `first-${stamp}` },
    })
  ).status === 409,
  "event identifier cannot be reused for a different card",
);
expect(
  (
    await api("/device/scan", {
      method: "POST",
      token,
      body: { uid: original.cardUid, eventId: `duplicate-${stamp}` },
    })
  ).data.outcome === "duplicate",
  "fresh repeated tap is duplicate",
);
expect(
  (
    await api("/device/scan", {
      method: "POST",
      token,
      body: { uid: "04ABCDEF010203", eventId: `unknown-${stamp}` },
    })
  ).data.outcome === "unknown_card",
  "unknown card rejected",
);
const outside = astate.students.find((s) => s.id !== original.id);
expect(
  (
    await api("/device/scan", {
      method: "POST",
      token,
      body: { uid: outside.cardUid, eventId: `outside-${stamp}` },
    })
  ).data.outcome === "not_enrolled",
  "known student outside roster rejected",
);
const rotated = await api(`/readers/${reader.id}/rotate`, {
  cookie: admin,
  method: "POST",
});
assert.equal(rotated.status, 200);
const nextToken = rotated.data.token;
expect(
  (await api("/device/heartbeat", { method: "POST", token, body: {} }))
    .status === 401,
  "rotated old reader credential revoked",
);
assert.equal(
  (
    await api(`/readers/${reader.id}`, {
      cookie: admin,
      method: "PATCH",
      body: { active: false },
    })
  ).status,
  200,
);
const disabled = await api("/device/scan", {
  method: "POST",
  token: nextToken,
  body: { uid: original.cardUid, eventId: `disabled-${stamp}` },
});
expect(
  disabled.status === 403 || disabled.data.outcome === "disabled",
  "disabled reader cannot mark attendance",
);
assert.equal(
  (
    await api(`/sessions/${session.id}/close`, {
      cookie: faculty,
      method: "POST",
    })
  ).status,
  200,
);
assert.equal(
  (
    await api(`/readers/${reader.id}`, {
      cookie: admin,
      method: "PATCH",
      body: { active: true },
    })
  ).status,
  200,
);
expect(
  (
    await api("/device/scan", {
      method: "POST",
      token: nextToken,
      body: { uid: extra.cardUid, eventId: `closed-${stamp}` },
    })
  ).data.outcome === "no_session",
  "scan after close cannot overwrite closure",
);
const closed = (
  await api(`/sessions/${session.id}/roster`, { cookie: faculty })
).data.rows;
expect(
  closed.find((r) => r.studentId === extra.id)?.status === "absent",
  "closing marks unswiped snapshot student absent",
);
expect(
  closed.find((r) => r.studentId === original.id)?.status === "present",
  "closing preserves present attendance",
);
expect(
  (
    await api("/attendance", {
      cookie: faculty,
      method: "PATCH",
      body: {
        sessionId: session.id,
        studentId: extra.id,
        status: "late",
        reason: "",
      },
    })
  ).status === 400,
  "correction requires reason",
);
assert.equal(
  (
    await api("/attendance", {
      cookie: faculty,
      method: "PATCH",
      body: {
        sessionId: session.id,
        studentId: extra.id,
        status: "late",
        reason: "Independent audit correction",
      },
    })
  ).status,
  200,
);
const audited = (await api("/state", { cookie: admin })).data;
expect(
  audited.audits.some((a) =>
    JSON.stringify(a).includes("Independent audit correction"),
  ),
  "correction retains audit reason",
);
const csv = await api(`/reports.csv?courseId=${course.id}`, { cookie: admin });
expect(
  csv.status === 200 &&
    typeof csv.data === "string" &&
    csv.data.includes("'=AUDIT()"),
  "CSV guards spreadsheet formula injection",
);
const otherReport = await api(`/reports.csv?courseId=${course.id}`, {
  cookie: faculty2,
});
expect(otherReport.status === 403, "other faculty cannot export course");
const selfReport = await api("/reports.csv", { cookie: studentCookie });
expect(
  selfReport.status === 200 && !selfReport.data.includes(extra.roll),
  "student CSV excludes other students",
);
if (process.env.AUDIT_PROBE_FILE)
  fs.writeFileSync(
    process.env.AUDIT_PROBE_FILE,
    JSON.stringify({ sessionId: session.id, studentId: extra.id }),
  );
console.log(
  JSON.stringify(
    {
      passed,
      unverified: [
        "ten minute late boundary requires time fixture or real elapsed wait",
        "server restart persistence requires second verify-persistence run",
      ],
    },
    null,
    2,
  ),
);
