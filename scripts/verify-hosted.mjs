import assert from "node:assert/strict";
// Credentials are supplied over stdin by the authoring session; never logged.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
console.log("Ready for verification JSON on stdin (input is hidden).");
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.includes("\n")) break;
}
if (process.stdin.isTTY) process.stdin.setRawMode(false);
process.stdin.pause();
const { url, password, setupToken, readerToken, serviceToken } =
  JSON.parse(input);
const origin = new URL(url).origin;
const service = { "OAI-Sites-Authorization": `Bearer ${serviceToken}` };
let passed = [];
const check = (v, s) => {
  assert(v, s);
  passed.push(s);
};
async function request(
  path,
  { method = "GET", cookie, token, body, withoutService = false } = {},
) {
  const r = await fetch(`${url}/api/${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(!withoutService ? service : {}),
      ...(cookie ? { cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method !== "GET" ? { Origin: origin } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(path === "setup" ? { "x-setup-token": setupToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await r.json();
  } catch {}
  return { r, data, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
check(
  (await request("state", { withoutService: true })).r.status !== 200,
  "Sites private boundary rejects unauthenticated service access",
);
check(
  (await request("setup", { method: "POST" })).r.status === 200,
  "Hosted migrations and protected bootstrap work",
);
check(
  (await request("state")).r.status === 401,
  "Service access does not grant an application account",
);
async function login(email) {
  const result = await request("login", {
    method: "POST",
    body: { email, password },
  });
  check(result.r.status === 200 && result.cookie, `${email} login`);
  return result.cookie;
}
const admin = await login("admin@demo.sovt.test"),
  faculty = await login("faculty1@demo.sovt.test"),
  student = await login("student01@demo.sovt.test");
const a = await request("state", { cookie: admin });
check(
  a.data.students.length === 10 && a.data.faculty.length === 2,
  "Hosted synthetic dataset is complete",
);
const s = await request("state", { cookie: student });
check(
  s.data.students.length === 1 && s.data.readers.length === 0,
  "Hosted student access scoped to own records",
);
check(
  (await request("students", { cookie: faculty, method: "POST", body: {} })).r
    .status === 403,
  "Hosted faculty cannot administer students",
);
check(
  (
    await request("device/heartbeat", {
      method: "POST",
      token: readerToken,
      body: {},
    })
  ).r.status === 200,
  "Reader service and device authentication work together",
);
const opened = await request("sessions", {
  method: "POST",
  cookie: faculty,
  body: {
    courseId: "course-1",
    readerId: "reader-demo",
    title: "HTTP acceptance check · synthetic cards",
  },
});
check(opened.r.status === 201, "Hosted faculty session opens");
const sid = opened.data.session.id;
const first = await request("device/scan", {
  method: "POST",
  token: readerToken,
  body: { uid: "04AABB00000001", eventId: crypto.randomUUID() },
});
check(
  first.data.outcome === "present",
  "Hosted reader HTTP scan marks present",
);
check(
  (
    await request("device/scan", {
      method: "POST",
      token: readerToken,
      body: { uid: "04AABB00000001", eventId: crypto.randomUUID() },
    })
  ).data.outcome === "duplicate",
  "Hosted duplicate tap preserves original",
);
check(
  (await request(`sessions/${sid}/close`, { method: "POST", cookie: faculty }))
    .r.status === 200,
  "Hosted session closes",
);
const roster = (await request(`sessions/${sid}/roster`, { cookie: faculty }))
  .data.rows;
check(
  roster.length === 10 &&
    roster.filter((x) => x.status === "absent").length === 9,
  "Hosted closure marks nine missing synthetic students absent",
);
check(
  (await request("state", { cookie: student })).data.students[0].percentage ===
    100,
  "Hosted student attendance percentage reflects own mark",
);
console.log(JSON.stringify({ passed, physicalRFVerified: false }, null, 2));
