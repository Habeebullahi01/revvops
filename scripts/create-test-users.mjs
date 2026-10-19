// Creates one test account per role + their profile rows.
// Run: node --env-file=.env.local scripts/create-test-users.mjs
// Idempotent: re-running updates profiles, skips existing users.

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PASSWORD = "WmsTest!2026#";
const USERS = [
  { email: "admin.test@wms.local", full_name: "Test Admin", role: "admin" },
  { email: "manager.test@wms.local", full_name: "Test Manager", role: "manager" },
  { email: "reception.test@wms.local", full_name: "Test Reception", role: "reception" },
  { email: "tech.test@wms.local", full_name: "Test Technician", role: "technician" },
];

const hdr = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
};

let failures = 0;
const log = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
};

for (const u of USERS) {
  // 1. Ensure the auth user exists
  let userId;
  const existing = await fetch(
    `${URL_}/auth/v1/admin/users?email=eq.${encodeURIComponent(u.email)}`,
    { headers: hdr },
  ).then((r) => r.json());

  if (Array.isArray(existing) && existing.length > 0) {
    userId = existing[0].id;
    log(true, `auth user exists: ${u.email}`);
  } else {
    const res = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
      }),
    });
    const body = await res.json();
    userId = body?.id;
    log(res.ok && userId, `created auth user: ${u.email}${res.ok ? "" : ` — ${JSON.stringify(body).slice(0, 120)}`}`);
  }

  if (!userId) continue;

  // 2. Upsert the profile row (what carries the role)
  const pRes = await fetch(`${URL_}/rest/v1/profiles`, {
    method: "POST",
    headers: { ...hdr, Prefer: "resolution=merge-duplicates,duplicates=merge" },
    body: JSON.stringify({
      id: userId,
      full_name: u.full_name,
      role: u.role,
      is_active: true,
    }),
  });
  log(pRes.ok, `profile upserted: ${u.role}${pRes.ok ? "" : ` — HTTP ${pRes.status}`}`);
}

const file = `/tmp/wms-test-credentials.txt`;
await (await import("fs/promises")).writeFile(
  file,
  `WMS test accounts (password for all: ${PASSWORD})\n` +
    USERS.map((u) => `  ${u.role.padEnd(10)} ${u.email}`).join("\n") +
    "\n",
);
console.log(`\nCredentials written to ${file}`);
console.log(`Shared password: ${PASSWORD}`);
process.exit(failures === 0 ? 0 : 1);
