// WMS Supabase health check — verifies migrations ran correctly.
// Run: node --env-file=.env.local scripts/db-health-check.mjs
// Prints PASS/FAIL lines only; never prints key material.

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !ANON || !SERVICE) {
  console.log("FAIL env vars missing");
  process.exit(1);
}

const hdr = (key, extra = {}) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  ...extra,
});

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

// 1. OpenAPI schema: all migrations' tables + RPC present
const openapi = await fetch(`${URL_}/rest/v1/`, {
  headers: hdr(SERVICE, { Accept: "application/openapi+json" }),
}).then((r) => r.json());

const expectedTables = [
  "profiles", "customers", "vehicles", "job_orders", "job_order_items",
  "job_logs", "service_history", "payments", "receipts", "audit_logs",
  "document_sequences",
];
const paths = Object.keys(openapi.paths ?? {});
for (const t of expectedTables) {
  check(`table exposed: ${t}`, paths.includes(`/` + t));
}
check(
  "rpc exposed: get_next_document_number",
  paths.some((p) => p.includes("get_next_document_number"))
);

// 2. Numbering function actually works (service role can execute it)
const next = async (type) => {
  const res = await fetch(`${URL_}/rest/v1/rpc/get_next_document_number`, {
    method: "POST",
    headers: hdr(SERVICE),
    body: JSON.stringify({ p_document_type: type }),
  });
  return res.ok ? (await res.text()).replace(/"/g, "") : `HTTP ${res.status}`;
};

const jo = await next("job_order");
check("rpc returns JO-2026-0001", jo === "JO-2026-0001", `got: ${jo}`);
const rcp = await next("receipt");
check("rpc returns RCP-2026-0001", rcp === "RCP-2026-0001", `got: ${rcp}`);

// 3. Reset counters so testing didn't consume real numbers
const reset = await fetch(`${URL_}/rest/v1/document_sequences?document_type=in.(job_order,receipt)&year=eq.2026`, {
  method: "PATCH",
  headers: hdr(SERVICE, { Prefer: "return=representation" }),
  body: JSON.stringify({ last_number: 0 }),
});
const rows = reset.ok ? await reset.json() : [];
check("counters reset to 0", reset.ok && rows.length === 2 && rows.every((r) => r.last_number === 0));

// 4. RLS probe: document_sequences has seed rows, but anon (no policies) must see NONE
const rls = await fetch(`${URL_}/rest/v1/document_sequences?select=document_type,year,last_number`, {
  headers: hdr(ANON),
});
const anonRows = rls.ok ? await rls.json() : null;
check(
  "RLS blocks anon from document_sequences",
  rls.ok && Array.isArray(anonRows) && anonRows.length === 0,
  `got: ${rls.status} ${JSON.stringify(anonRows)?.slice(0, 80)}`
);

// 5. Anon must be denied the numbering RPC (revoked in 0002)
const rpcDenied = await fetch(`${URL_}/rest/v1/rpc/get_next_document_number`, {
  method: "POST",
  headers: hdr(ANON),
  body: JSON.stringify({ p_document_type: "job_order" }),
});
check("anon denied numbering RPC", rpcDenied.status >= 400, `status: ${rpcDenied.status}`);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
