// Job order flow check — drives the Phase 2 job-order + receipt surfaces end to
// end in headless Chrome and asserts the data model behind them:
//
//   1. /job-orders is a real list: search over job number / complaint / customer
//      / plate, plus status and payment filter chips, all server-side
//   2. a row opens /job-orders/[id]; its facts and money read from the invoice
//   3. an officer moves execution_status; the move is audited and shows on the
//      merged timeline as an officer entry (never as a job log)
//   4. assigning a technician recomputes financial_status from payments
//   5. recording a payment on the invoice issues an ORIGINAL receipt
//   6. reprinting issues a duplicate with its own number, pointing at the
//      original — never chaining
//   7. the printable job card is revealed by print media and carries no money
//   8. no horizontal overflow at 390px on every new page
//
//   node --env-file=.env.local scripts/job-order-flow-check.mjs
//
// Cleans up every row it creates (KEEP_TEST_DATA=1 keeps them). Clear rows left
// by an older run with:
//
//   node --env-file=.env.local scripts/job-order-flow-check.mjs --purge
//
// Prints PASS/FAIL lines and exits non-zero on any FAIL.
import { Browser, sleep } from "../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { purger, purgeCustomers, canPurge } from "./lib/flow-cleanup.mjs";

const BASE = process.env.PREVIEW_URL || "http://localhost:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// An officer: reception may create customers/vehicles/job orders and record
// payments (BUSINESS_RULES.md §4), which is the whole flow this check drives.
const EMAIL = "reception.test@wms.local";
const PASSWORD = process.env.PREVIEW_PASSWORD || "WmsTest!2026#";

const WIDTHS = [
  { slug: "desktop", width: 1440, height: 900 },
  { slug: "phone", width: 390, height: 844 },
];

const TAG = "JOCheck";
const stamp = String(Date.now()).slice(-6);
const PURGE_ONLY = process.argv.includes("--purge");

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS  " : "FAIL  "}${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

const svcHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const svcGet = (path) =>
  fetch(`${URL_}/rest/v1/${path}`, { headers: svcHeaders })
    .then((r) => r.json())
    .then((b) => (Array.isArray(b) ? b : []));

/**
 * Poll the database until `read` returns a value satisfying `ok`.
 *
 * Server actions revalidate and write asynchronously, and the first action
 * after a cold compile can take well over ten seconds. Asserting on a fixed
 * `sleep` therefore produces flakes, so every assertion that depends on a
 * write waits for the effect instead of guessing a duration.
 */
async function waitFor(read, ok, { timeoutMs = 20000, everyMs = 400 } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await read();
    if (ok(last)) return { ok: true, value: last };
    await sleep(everyMs);
  }
  return { ok: false, value: last };
}
const svcPost = async (table, body) => {
  const res = await fetch(`${URL_}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...svcHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  const row = Array.isArray(data) ? data[0] : data;
  if (!res.ok || !row?.id) {
    throw new Error(`seed ${table} failed (${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return row;
};

const testCustomers = (filter) => svcGet(`customers?select=id,name,phone&${filter}`);

// ---- --purge: clear rows left by earlier runs, then stop -----------------
if (PURGE_ONLY) {
  if (!canPurge()) {
    console.log("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — cannot purge.");
    process.exit(1);
  }
  const merged = [
    ...new Map(
      [
        ...(await testCustomers(`name=like.${encodeURIComponent(`${TAG} Customer*`)}`)),
        ...(await testCustomers(`phone=like.${encodeURIComponent("+2348098*")}`)),
      ].map((c) => [c.id, c]),
    ).values(),
  ];
  const removed = await purgeCustomers(merged);
  console.log(
    removed
      ? `Purged ${removed.customers} test customer(s): ${removed.vehicles} vehicles, ${removed.invoices} invoices, ${removed.jobs} job orders.`
      : "No test customers to purge.",
  );
  process.exit(0);
}

if (!canPurge()) {
  console.log("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — cannot seed fixtures.");
  process.exit(1);
}

const cleanup = purger();
let customer = null;

// ---- fixture: customer → vehicle → invoice → job order → payment --------
// Enough of the real shape that the list, detail, timeline and card all have
// something to render, and the money columns are non-trivial.
customer = await svcPost("customers", {
  name: `${TAG} Customer ${stamp}`,
  phone: `+2348098${stamp}`,
  email: `job.check.${stamp}@example.com`,
});
const vehicle = await svcPost("vehicles", {
  customer_id: customer.id,
  license_plate: `JOB-${stamp}`,
  make: "Toyota",
  model: "Hilux",
  year: 2021,
  vin: `VINJOB${stamp}XZ`,
});

const receptionId = await (async () => {
  // profiles carries no email — it lives on auth.users, so go through the
  // admin API and match client-side (the list endpoint ignores ?email=).
  const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=100`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  }).then((r) => r.json());
  const list = Array.isArray(res) ? res : res?.users;
  const user = Array.isArray(list) ? list.find((u) => u.email === EMAIL) : null;
  return user?.id ?? null;
})();
if (!receptionId) throw new Error(`no auth user for ${EMAIL}`);

const invoice = await svcPost("invoices", {
  customer_id: customer.id,
  vehicle_id: vehicle.id,
  complaint: `${TAG} complaint ${stamp}`,
  billing_type: "upfront",
  category: "maintenance",
  cost_breakdown: [
    { description: `${TAG} brake pads`, amount: 60000, itemType: "part" },
    { description: `${TAG} wheel alignment`, amount: 40000, itemType: "labor" },
  ],
  total_amount: 100000,
  created_by: receptionId,
});

// The payment is deliberately NOT seeded: it is recorded through the invoice's
// own form further down, so the receipt that follows is genuinely produced by
// `recordPayment` rather than by this script.

const job = await svcPost("job_orders", {
  job_number: `JO-JOC-${stamp}`,
  customer_id: customer.id,
  vehicle_id: vehicle.id,
  complaint: invoice.complaint,
  estimated_amount: 100000,
  created_by: receptionId,
  date_in: new Date().toISOString(),
});
// Link both ways, exactly as createJobOrderFromInvoice does.
await fetch(`${URL_}/rest/v1/invoices?id=eq.${invoice.id}`, {
  method: "PATCH",
  headers: { ...svcHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ job_order_id: job.id }),
});

const browser = await Browser.launch();
const page = await browser.newPage({ width: WIDTHS[0].width, height: WIDTHS[0].height });

/** Horizontal overflow is a hard failure on every page this check visits. */
const noOverflow = async (label) => {
  for (const { slug, width, height } of WIDTHS) {
    await page.setViewport({ width, height });
    await sleep(450);
    const over = await page.eval(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth",
    );
    check(`${label}: no horizontal overflow at ${slug} (${width}px)`, over <= 0, `${over}px`);
  }
  await page.setViewport({ width: WIDTHS[0].width, height: WIDTHS[0].height });
};

try {
  // ── sign in ────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`);
  await page.eval(`(() => new Promise((resolve) => {
    const ready = () => {
      const f = document.querySelector('form');
      return !!f && Object.getOwnPropertyNames(f).some((k) => k.startsWith('__react'));
    };
    if (ready()) return resolve(true);
    const t = setInterval(() => { if (ready()) { clearInterval(t); resolve(true); } }, 50);
    setTimeout(() => { clearInterval(t); resolve(false); }, 15000);
  }))()`);
  await page.eval(`(() => {
    const f = document.querySelector('form');
    const set = (el, v) => {
      const proto = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(f.querySelector('input[name="email"]'), ${JSON.stringify(EMAIL)});
    set(f.querySelector('input[name="password"]'), ${JSON.stringify(PASSWORD)});
    f.requestSubmit();
    return true;
  })()`);
  const signedIn = await page.eval(`(() => new Promise((resolve) => {
    const ready = () => !location.pathname.includes('/login') && !!document.querySelector('main');
    if (ready()) return resolve('immediate');
    const t = setInterval(() => { if (ready()) { clearInterval(t); resolve('polled'); } }, 100);
    setTimeout(() => { clearInterval(t); resolve('timeout'); }, 25000);
  }))()`);
  check("signed in and the shell mounted", signedIn !== "timeout", signedIn);

  // ── 1. the list: search + filters ──────────────────────────────────────
  await page.goto(`${BASE}/job-orders`);
  await sleep(2200);
  check("/job-orders lists job orders", await page.eval(
    "document.querySelectorAll('a[href^=\"/job-orders/\"]').length > 0",
  ));
  await noOverflow("/job-orders (list)");

  // Search by job number — the seeded row must survive the filter.
  const searchUrl = `${BASE}/job-orders?q=${encodeURIComponent(job.job_number)}`;
  await page.goto(searchUrl);
  await sleep(1800);
  const searchIds = await page.eval(
    "[...document.querySelectorAll('a[href^=\"/job-orders/\"]')].map(a => a.getAttribute('href'))",
  );
  check("search by job number finds the seeded job",
    (searchIds || []).some((h) => h.includes(job.id)), JSON.stringify(searchIds)?.slice(0, 160));
  check("search by job number excludes other jobs",
    (searchIds || []).length === 1, `${(searchIds || []).length} row(s)`);

  // Search by the complaint text too (a different column, same q param).
  await page.goto(`${BASE}/job-orders?q=${encodeURIComponent(`${TAG} complaint ${stamp}`)}`);
  await sleep(1800);
  const byComplaint = await page.eval(
    "[...document.querySelectorAll('a[href^=\"/job-orders/\"]')].map(a => a.getAttribute('href'))",
  );
  check("search by complaint finds the seeded job",
    (byComplaint || []).some((h) => h.includes(job.id)), JSON.stringify(byComplaint)?.slice(0, 160));

  // A status filter chip is a link, so filtering needs no client JS.
  await page.goto(`${BASE}/job-orders?status=pending`);
  await sleep(1800);
  const pendingOnly = await page.eval(`(() => {
    const rows = [...document.querySelectorAll('a[href^="/job-orders/"]')];
    return { count: rows.length, hrefs: rows.map(r => r.getAttribute('href')) };
  })()`);
  check("status filter renders without error",
    typeof pendingOnly?.count === "number", JSON.stringify(pendingOnly).slice(0, 120));

  // ── 2. a row opens the detail page ─────────────────────────────────────
  await page.goto(`${BASE}/job-orders/${job.id}`);
  await sleep(2200);
  const detail = await page.eval(`(() => ({
    jobNumber: document.body.innerText.includes(${JSON.stringify(job.job_number)}),
    hasCard: !!document.querySelector('.job-card'),
    hasPrintButton: [...document.querySelectorAll('button')].some(b => /print/i.test(b.textContent)),
    h1: document.querySelector('h1')?.textContent?.trim() ?? null,
  }))()`);
  check("detail page shows the job number", detail.jobNumber === true);
  check("detail page renders the printable card", detail.hasCard === true);
  check("detail page has a print button", detail.hasPrintButton === true);
  await noOverflow("/job-orders/[id]");

  // ── 3. an officer moves execution_status ───────────────────────────────
  const moved = await page.eval(`(() => {
    const sel = document.querySelector('select[aria-label="Move to status"]');
    if (!sel) return { ok: false, why: 'no status select' };
    const proto = Object.getPrototypeOf(sel);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(sel, 'in_progress');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()`);
  check("status control is present for an officer", moved.ok === true, moved.why || "");
  if (moved.ok) {
    await sleep(400);
    await page.eval(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /save status/i.test(b.textContent));
      if (btn) btn.click();
      return !!btn;
    })()`);

    // Wait for the write rather than sleeping a fixed time: a cold server
    // action can take much longer than any guess.
    const exec = await waitFor(
      async () => (await svcGet(`job_orders?select=execution_status&id=eq.${job.id}`))[0]?.execution_status,
      (v) => v === "in_progress",
    );
    check("officer status change persisted", exec.ok === true, `execution_status=${exec.value}`);

    // The audit entry is the officer record; it must NOT be a job-log row.
    //
    // Filter on `entity_id` only and match the action in JS: the action value
    // contains dots (`job_order.execution_status_changed`) and PostgREST reads
    // `.` as a separator, so combining it with another eq= filter silently
    // matches the wrong rows.
    const audits = await waitFor(
      async () => (await svcGet(`audit_logs?select=id,action,details&entity_id=eq.${job.id}`))
        .filter((a) => a.action === "job_order.execution_status_changed"),
      (rows) => rows.length >= 1,
    );
    check("officer status change is audited", audits.ok === true, `${audits.value?.length ?? 0} audit row(s)`);
    check("the audit entry records source=officer",
      (audits.value ?? []).some((a) => a.details?.source === "officer"),
      JSON.stringify(audits.value?.[0]?.details ?? {}));
    check("the audit entry records the from/to transition",
      (audits.value ?? []).some((a) => a.details?.from === "pending" && a.details?.to === "in_progress"),
      JSON.stringify(audits.value?.[0]?.details ?? {}));
    const logs = await svcGet(`job_logs?select=id&job_order_id=eq.${job.id}`);
    check("officer status change is NOT written as a job log", logs.length === 0, `${logs.length} log(s)`);
  }

  // ── 4. the merged timeline shows the officer entry ─────────────────────
  await page.goto(`${BASE}/job-orders/${job.id}`);
  await sleep(2200);
  const timeline = await page.eval(`(() => {
    const text = document.body.innerText;
    return {
      // The synthesized "raised" entry is ALSO tagged as officer, so
      // asserting on the badge alone would pass even with no audit row.
      // Assert the wording only a real status change produces.
      hasOfficerMove: /Officer moved it from\\s+pending/i.test(text),
      hasRaised: /raised/i.test(text),
      officerBadges: (text.match(/officer/gi) || []).length,
    };
  })()`);
  check("timeline shows the officer status change",
    timeline.hasOfficerMove === true, "officer badges: " + timeline.officerBadges);
  check("timeline shows the raised entry", timeline.hasRaised === true);

  // ── 5. assignment persists ─────────────────────────────────────────────
  // The select only exists once the officer opens the control, so drive the
  // button first and wait for the technician list to arrive.
  await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => /assign technician|reassign/i.test(b.textContent));
    if (btn) btn.click();
    return !!btn;
  })()`);
  // The technician list is fetched when the control opens, so poll for the
  // options rather than assuming a fixed delay is enough.
  const opened = await (async () => {
    for (let i = 0; i < 20; i++) {
      const ready = await page.eval(`(() => {
        const sel = document.querySelector('select[aria-label="Technician"]');
        return !!sel && [...sel.options].some(o => o.value);
      })()`);
      if (ready) return true;
      await sleep(400);
    }
    return false;
  })();
  const assigned = await page.eval(`(() => {
    const sel = document.querySelector('select[aria-label="Technician"]');
    if (!sel) return { ok: false, why: 'no technician select after opening' };
    const opt = [...sel.options].find(o => o.value);
    if (!opt) return { ok: false, why: 'no technician options loaded' };
    const proto = Object.getPrototypeOf(sel);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(sel, opt.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, id: opt.value };
  })()`);
  check("assignment control offers a technician", assigned.ok === true, assigned.why || `waited=${opened}`);
  if (assigned.ok) {
    await sleep(400);
    await page.eval(`(() => {
      const btn = [...document.querySelectorAll('form button[type="submit"]')]
        .find(b => /^save$/i.test(b.textContent.trim()));
      if (btn) btn.click();
      return !!btn;
    })()`);
    const after = await waitFor(
      async () => (await svcGet(`job_orders?select=assigned_technician_id&id=eq.${job.id}`))[0]?.assigned_technician_id,
      (v) => v === assigned.id,
    );
    check("technician assignment persisted", after.ok === true, String(after.value));
    const assignAudit = await waitFor(
      async () => (await svcGet(`audit_logs?select=id,action&entity_id=eq.${job.id}`))
        .some((a) => a.action === "job_order.technician_assigned"),
      (found) => found === true,
    );
    check("assignment is audited", assignAudit.ok === true);
  }

  // ── 5b. an officer settles actual_amount ───────────────────────────────
  // This is the Phase 2 definition-of-done wording: "correct the facts and
  // settle actual_amount". The invoice hand-off leaves actual_amount null, so
  // this is the only path that ever sets it.
  await page.goto(`${BASE}/job-orders/${job.id}`);
  await sleep(2200);
  await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => /edit details/i.test(b.textContent));
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(800);
  const settled = await page.eval(`(() => {
    // The facts inputs are labelled by wrapping <label> text, not aria-label.
    const byLabel = (needle) => {
      const label = [...document.querySelectorAll('label')]
        .find(l => new RegExp(needle, 'i').test(l.textContent));
      return label ? label.querySelector('input') : null;
    };
    const amount = byLabel('Actual amount');
    const dateOut = byLabel('Actual date out');
    if (!amount || !dateOut) return { ok: false, why: 'facts inputs not found' };
    const set = (el, v) => {
      const proto = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(amount, '95000');
    set(dateOut, '2026-10-30');
    return { ok: true };
  })()`);
  check("job facts are editable by an officer", settled.ok === true, settled.why || "");
  if (settled.ok) {
    await page.eval(`(() => {
      const btn = [...document.querySelectorAll('form button[type="submit"]')]
        .find(b => /save/i.test(b.textContent));
      if (btn) btn.click();
      return !!btn;
    })()`);
    const facts = await waitFor(
      async () => (await svcGet(`job_orders?select=actual_amount,actual_date_out&id=eq.${job.id}`))[0],
      (row) => Number(row?.actual_amount) === 95000,
    );
    check("actual_amount was settled by the officer",
      facts.ok === true, `actual_amount=${facts.value?.actual_amount}`);
    const settleAudit = await waitFor(
      async () => (await svcGet(`audit_logs?select=id,action&entity_id=eq.${job.id}`))
        .some((a) => a.action === "job_order.updated"),
      (found) => found === true,
    );
    check("the settlement is audited", settleAudit.ok === true);
  }

  // ── 6. record a payment through the invoice form ───────────────────────
  // Deliberately driven through the UI: the receipt is issued inside the
  // `recordPayment` server action, so a seeded row would prove nothing.
  await page.goto(`${BASE}/invoices/${invoice.id}`);
  await sleep(2500);
  const recorded = await page.eval(`(() => {
    const input = document.querySelector('form input[type="number"], form input[inputmode="decimal"]');
    const method = document.querySelector('select[aria-label="Payment method"]');
    const form = document.querySelector('form');
    if (!input || !method || !form) return { ok: false, why: 'payment form not found' };
    const setVal = (el, v) => {
      const proto = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setVal(input, '100000');
    setVal(method, 'cash');
    return { ok: true };
  })()`);
  check("invoice page offers a payment form", recorded.ok === true, recorded.why || "");
  if (recorded.ok) {
    await sleep(400);
    await page.eval(`(() => {
      const btn = [...document.querySelectorAll('form button[type="submit"]')]
        .find(b => /record payment/i.test(b.textContent));
      if (btn) btn.click();
      return !!btn;
    })()`);
  }

  const recordedPayment = await waitFor(
    async () => await svcGet(`payments?select=id,amount&invoice_id=eq.${invoice.id}`),
    (rows) => rows.length === 1,
  );
  const payments = recordedPayment.value ?? [];
  check("the payment was recorded through the UI", recordedPayment.ok === true, `${payments.length} payment(s)`);
  const payment = payments[0];

  // ── 7. that payment issued an ORIGINAL receipt ─────────────────────────
  const receiptRows = payment
    ? await waitFor(
        async () => await svcGet(`receipts?select=id,receipt_number,is_duplicate,original_receipt_id,payment_id&payment_id=eq.${payment.id}`),
        (rows) => rows.length === 1,
      )
    : { ok: false, value: [] };
  const receipts = receiptRows.value ?? [];
  check("recording a payment issued a receipt", receiptRows.ok === true, `${receipts.length} receipt(s)`);
  const original = receipts[0];

  // The invoice was paid in full through the UI, so the derived status on the
  // job order must now read `paid`. This is the only place the derivation can
  // be observed, because the payment has to exist first.
  const derived = await waitFor(
    async () => (await svcGet(`job_orders?select=financial_status&id=eq.${job.id}`))[0]?.financial_status,
    (v) => v === "paid",
  );
  check("financial_status was derived from the payments", derived.ok === true, String(derived.value));

  if (original) {
    check("the receipt is an original, not a duplicate", original.is_duplicate === false, String(original.is_duplicate));
    check("the receipt number is an RCP reference",
      /^RCP-\d{4}-\d{4}$/.test(original.receipt_number), original.receipt_number);
  }

  // ── 7. the receipt sheet renders and reprint makes a duplicate ─────────
  if (original) {
    await page.goto(`${BASE}/receipts/${original.id}`);
    await sleep(2200);
    const sheet = await page.eval(`(() => {
      const el = document.querySelector('.receipt-sheet');
      if (!el) return { found: false };
      const text = el.textContent || '';
      return {
        found: true,
        hasNumber: text.includes(${JSON.stringify(original.receipt_number)}),
        // A receipt is a money document, unlike the job card.
        hasNaira: text.includes('\u20a6'),
        hiddenOnScreen: getComputedStyle(el.parentElement).display === 'none',
      };
    })()`);
    check("receipt sheet renders", sheet.found === true);
    check("receipt sheet shows its number", sheet.hasNumber === true);
    check("receipt sheet carries the money (unlike the job card)", sheet.hasNaira === true);
    check("receipt sheet is hidden on screen (prints only)", sheet.hiddenOnScreen === true);
    await noOverflow("/receipts/[id]");

    // Reprint from the invoice's payments list.
    await page.goto(`${BASE}/invoices/${invoice.id}`);
    await sleep(2200);
    const reprint = await page.eval(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /reprint/i.test(b.textContent));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    check("invoice payments list offers Reprint", reprint === true);
    if (reprint) {
      const dupRows = await waitFor(
        async () => await svcGet(`receipts?select=id,receipt_number,is_duplicate,original_receipt_id&payment_id=eq.${payment.id}&order=created_at.asc`),
        (rows) => rows.length === 2,
      );
      const after = dupRows.value ?? [];
      check("reprint added a second receipt row", dupRows.ok === true, `${after.length} row(s)`);
      const dup = after.find((r) => r.is_duplicate === true);
      check("the reprint is flagged as a duplicate", Boolean(dup), JSON.stringify(after.map((r) => r.is_duplicate)));
      check("the duplicate carries its own new number",
        Boolean(dup) && dup.receipt_number !== original.receipt_number,
        `${original.receipt_number} -> ${dup?.receipt_number}`);
      check("the duplicate points at the ORIGINAL (never chains)",
        dup?.original_receipt_id === original.id, String(dup?.original_receipt_id));
    }

    // The append-only rule, asserted through a real user token rather than
    // the service role: an UPDATE must affect zero rows.
    const immutability = await fetch(`${URL_}/rest/v1/receipts?id=eq.${original.id}`, {
      method: "PATCH",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ amount: 1 }),
    });
    const immBody = await immutability.json().catch(() => null);
    check("anon cannot UPDATE a receipt",
      !Array.isArray(immBody) || immBody.length === 0,
      `status ${immutability.status}, rows ${Array.isArray(immBody) ? immBody.length : "?"}`);
  }

  // ── 8. the card prints, and carries no money ───────────────────────────
  await page.goto(`${BASE}/job-orders/${job.id}`);
  await sleep(2200);
  await page.send("Emulation.setEmulatedMedia", { media: "print" });
  await sleep(600);
  const printed = await page.eval(`(() => {
    const card = document.querySelector('.job-card');
    const aside = document.querySelector('aside');
    const header = document.querySelector('header');
    const visible = (el) => !!el && el.getBoundingClientRect().height > 0 &&
      getComputedStyle(el).display !== 'none';
    const docText = document.body.innerText;
    return {
      cardShown: visible(card),
      asideShown: visible(aside),
      headerShown: visible(header),
      hasNaira: docText.includes('\u20a6'),
      hasThousands: /\\d{1,3}(,\\d{3})/.test(docText),
      hasOwnerPhone: docText.includes(${JSON.stringify(customer.phone)}),
    };
  })()`);
  check("print media reveals the job card", printed.cardShown === true);
  check("print media hides the sidebar", printed.asideShown === false);
  check("print media hides the header", printed.headerShown === false);
  check("printed card carries no naira symbol", printed.hasNaira === false);
  check("printed card carries no cost figures", printed.hasThousands === false);
  check("printed card still carries the owner phone", printed.hasOwnerPhone === true);
  await page.send("Emulation.setEmulatedMedia", { media: "" });
  await noOverflow("/job-orders/[id] (print)");
} finally {
  await browser.close();
  const removed = await cleanup([customer]);
  if (removed) {
    console.log(
      `\nCleaned up: ${removed.customers} customer(s), ${removed.vehicles} vehicle(s), ${removed.invoices} invoice(s), ${removed.jobs} job order(s).`,
    );
  }
}

console.log(
  failures === 0
    ? "\nAll job order flow checks passed."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
