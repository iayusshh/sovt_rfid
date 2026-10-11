import fs from "node:fs";
const base = process.env.ATTENDANCE_URL || "http://localhost:3000";
const local = fs.existsSync(".dev.vars")
  ? Object.fromEntries(
      fs
        .readFileSync(".dev.vars", "utf8")
        .trim()
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), JSON.parse(l.slice(i + 1))];
        }),
    )
  : {};
const token = process.env.SETUP_TOKEN || local.SETUP_TOKEN;
if (!token)
  throw new Error("Configure SETUP_TOKEN in .dev.vars or the environment");
const headers = {
  "x-setup-token": token,
  ...(process.env.SITES_SERVICE_TOKEN
    ? { "OAI-Sites-Authorization": `Bearer ${process.env.SITES_SERVICE_TOKEN}` }
    : {}),
};
const r = await fetch(`${base}/api/setup`, {
  method: "POST",
  headers,
  redirect: "manual",
});
if (!r.ok) throw new Error(`Bootstrap failed HTTP ${r.status}`);
const result = await r.json();
console.log(
  result.alreadyInitialized
    ? "Demo already initialized. Existing records preserved."
    : "Created 10 synthetic students, 2 faculty, 2 courses, and one reader.",
);
