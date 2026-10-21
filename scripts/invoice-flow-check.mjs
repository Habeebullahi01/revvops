// Invoice flow check — drives the invoice-first flow in headless Chrome end to end:
//   1. the New-customer dialog never exceeds the viewport at 1440/768/390
//   2. create customer + vehicle in the dialog, selection returns to the form
//   3. cost breakdown totals, then create the invoice
//   4. creating lands on the invoice's detail page (50% job-order guard shown)
//   5. record payments against the invoice, then raise its job order
//   6. /invoices is the list; a row opens the detail page
//   7. custom 404
//
//   node --env-file=.env.local scripts/invoice-flow-check.mjs
//
// The run deletes its own customer/vehicle/invoice/payment/job-order rows
// when it finishes (KEEP_TEST_DATA=1 keeps them for debugging). Rows left by
// older runs can be cleared once with:
//
//   node --env-file=.env.local scripts/invoice-flow-check.mjs --purge
//
// Prints PASS/FAIL lines and exits non-zero on any FAIL.
import { Browser, sleep } from "../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const BASE = process.env.PREVIEW_URL || "http://localhost:3000";
const EMAIL = "reception.test@wms.local";
const PASSWORD = process.env.PREVIEW_PASSWORD || "WmsTest!2026#";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WIDTHS = [
  { slug: "desktop", width: 1440, height: 900 },
  { slug: "tablet", width: 768, height: 1024 },
  { slug: "phone", width: 390, height: 844 },
];

const stamp = String(Date.now()).slice(-6);
const PURGE_ONLY = process.argv.includes("--purge");
const KEEP_DATA = process.env.KEEP_TEST_DATA === "1";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS  " : "FAIL  "}${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

// ---- test-data housekeeping (service role; RLS is bypassed on purpose) ----
const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const restGet = (path) => fetch(`${URL_}/rest/v1/${path}`, { headers: adminHeaders }).then((r) => r.json());

const restDelete = async (table, filter) => {
  const res = await fetch(`${URL_}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { ...adminHeaders, Prefer: "return=minimal" },
  });
  if (!res.ok) {
    const body = String(await res.text()).slice(0, 140);
    console.log(`      could not clear ${table}: ${res.status} ${body}`);
  }
  return res.ok;
};

const idList = (ids) => `(${ids.map((id) => `"${id}"`).join(",")})`;

/**
 * Delete everything belonging to the given customers, children first:
 * receipts → payments → invoices → job orders → vehicles → customer → audit.
 * Vehicles/invoices cascade from the customer, but job orders reference the
 * customer without a cascade, so they go before it.
 */
async function purgeCustomers(customers) {
  const ids = (customers || []).map((c) => c.id);
  if (!ids.length || !URL_ || !SERVICE) return null;

  const vehicles = await restGet(`vehicles?select=id&customer_id=in.${idList(ids)}`);
  const invoices = await restGet(`invoices?select=id&customer_id=in.${idList(ids)}`);
  const jobs = await restGet(`job_orders?select=id&customer_id=in.${idList(ids)}`);
  const vehicleIds = (vehicles || []).map((v) => v.id);
  const invoiceIds = (invoices || []).map((i) => i.id);
  const jobIds = (jobs || []).map((j) => j.id);

  const paymentFilter = [
    invoiceIds.length ? `invoice_id.in.${idList(invoiceIds)}` : null,
    jobIds.length ? `job_order_id.in.${idList(jobIds)}` : null,
  ].filter(Boolean);

  if (paymentFilter.length) {
    const filter = `or=(${paymentFilter.join(",")})`;
    const pays = await restGet(`payments?select=id&${filter}`);
    const payIds = (pays || []).map((p) => p.id);
    if (payIds.length) await restDelete("receipts", `payment_id=in.${idList(payIds)}`);
    await restDelete("payments", filter);
  }

  if (invoiceIds.length) await restDelete("invoices", `customer_id=in.${idList(ids)}`);
  if (jobIds.length) {
    // No cascade from a job order into service history.
    await restDelete("service_history", `linked_job_order_id=in.${idList(jobIds)}`);
    await restDelete("job_orders", `customer_id=in.${idList(ids)}`);
  }
  if (vehicleIds.length) await restDelete("vehicles", `customer_id=in.${idList(ids)}`);
  await restDelete("customers", `id=in.${idList(ids)}`);

  const auditIds = [...ids, ...invoiceIds, ...jobIds, ...vehicleIds];
  if (auditIds.length) await restDelete("audit_logs", `entity_id=in.${idList(auditIds)}`);
  for (const id of ids) {
    await restDelete("audit_logs", `details->>customer_id=eq.${id}`);
  }

  return {
    customers: ids.length,
    vehicles: vehicleIds.length,
    invoices: invoiceIds.length,
    jobs: jobIds.length,
  };
}

const testCustomers = async (filter) => {
  const rows = await restGet(`customers?select=id,name,phone&${filter}`);
  return Array.isArray(rows) ? rows : [];
};

// ---- --purge: clear rows left by earlier runs, then stop -----------------
if (PURGE_ONLY) {
  if (!URL_ || !SERVICE) {
    console.log("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — cannot purge.");
    process.exit(1);
  }
  const byName = await testCustomers(`name=like.${encodeURIComponent("Check Customer*")}`);
  const byPhone = await testCustomers(`phone=like.${encodeURIComponent("*1555*")}`);
  const merged = [...new Map([...byName, ...byPhone].map((c) => [c.id, c])).values()];
  const removed = await purgeCustomers(merged);
  console.log(
    removed
      ? `Purged ${removed.customers} test customer(s): ${removed.vehicles} vehicles, ${removed.invoices} invoices, ${removed.jobs} job orders.`
      : "No test customers to purge.",
  );
  process.exit(0);
}

const browser = await Browser.launch();
const page = await browser.newPage({ width: WIDTHS[0].width, height: WIDTHS[0].height });

const dialogBox = () =>
  page.eval(() => {
    const pop = document.querySelector('[data-slot="dialog-content"]');
    if (!pop) return null;
    const r = pop.getBoundingClientRect();
    const body = pop.querySelector(".overflow-y-auto");
    return {
      vw: innerWidth,
      vh: innerHeight,
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      bodyScrolls: body ? body.scrollHeight > body.clientHeight + 1 : false,
      bodyFits: body ? body.scrollHeight <= body.clientHeight + 1 : true,
      docScrollW: document.documentElement.scrollWidth,
    };
  });

const clickByText = (text) =>
  page.eval((t) => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.trim().toLowerCase().includes(t.toLowerCase()),
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, text);

try {
  // ── sign in ────────────────────────────────────────────────────────────
  const fillLogin = () =>
    page.eval(
      ({ email, password }) => {
        const emailEl = document.querySelector('form input[type="email"]');
        const passEl = document.querySelector('form input[type="password"]');
        if (!emailEl || !passEl) throw new Error("login form not found");
        setValShim(emailEl, email);
        setValShim(passEl, password);
        document.querySelector("form button")?.click();
        function setValShim(el, v) {
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      },
      { email: EMAIL, password: PASSWORD },
    );

  await page.goto(`${BASE}/login`);
  await page.eval(() => document.fonts.ready.then(() => true));

  let landed = null;
  for (let attempt = 1; attempt <= 3 && (!landed || landed === "/login"); attempt++) {
    // React must own the inputs (its _valueTracker is the cheapest signal)
    // or the typed values never reach the action.
    for (let i = 0; i < 40; i++) {
      const ready = await page
        .eval(() => Boolean(document.querySelector('form input[type="email"]')?._valueTracker))
        .catch(() => false);
      if (ready) break;
      await sleep(250);
    }
    await sleep(300);
    await fillLogin();
    for (let i = 0; i < 40; i++) {
      landed = await page.eval(() => location.pathname).catch(() => null);
      if (landed && landed !== "/login") break;
      await sleep(250);
    }
  }
  check("signed in", Boolean(landed) && landed !== "/login", `landed on ${landed}`);

  // ── 1. dialog geometry at every width ──────────────────────────────────
  for (const w of WIDTHS) {
    await page.setViewport({ width: w.width, height: w.height });
    await page.goto(`${BASE}/invoices/new`);
    await page.eval(() => document.fonts.ready.then(() => true));

    const pageFit = await page.eval(() => ({
      vw: innerWidth,
      docW: document.documentElement.scrollWidth,
    }));
    check(
      `no horizontal scroll on /invoices/new @${w.slug}`,
      pageFit.docW <= pageFit.vw + 1,
      `doc ${pageFit.docW} > viewport ${pageFit.vw}`,
    );

    check(`New customer button present @${w.slug}`, await clickByText("New customer"));
    await sleep(350);

    const box = await dialogBox();
    check(`dialog opens @${w.slug}`, Boolean(box));
    if (box) {
      check(
        `dialog inside viewport @${w.slug}`,
        box.top >= -1 && box.bottom <= box.vh + 1 && box.left >= -1 && box.right <= box.vw + 1,
        `top ${Math.round(box.top)} bottom ${Math.round(box.bottom)} left ${Math.round(box.left)} right ${Math.round(box.right)} vs ${box.vw}x${box.vh}`,
      );
      check(
        `dialog body scrolls or fits @${w.slug}`,
        box.bodyScrolls || box.bodyFits,
        "no way to reach the lower fields",
      );
    }

    await page.eval(() => {
      const cancel = [...document.querySelectorAll('[data-slot="dialog-content"] button')].find((b) =>
        b.textContent.trim().toLowerCase() === "cancel",
      );
      cancel?.click();
    });
    await sleep(600);
    check(
      `dialog closes @${w.slug}`,
      (await dialogBox()) === null,
    );
  }

  // ── 2. create customer + vehicle, selection returns to the form ────────
  await page.setViewport({ width: WIDTHS[0].width, height: WIDTHS[0].height });
  await page.goto(`${BASE}/invoices/new`);
  await page.eval(() => document.fonts.ready.then(() => true));

  const plate = `TS-${stamp}`;

  await clickByText("New customer");
  await sleep(350);

  const filled = await page.eval(
    ({ name, phone, plate: pl }) => {
      const set = (sel, v) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };
      return {
        name: set("#new-customer-name", name),
        phone: set("#new-customer-phone", phone),
        plate: set('input[id^="plate-"]', pl),
        make: set('input[id^="make-"]', "Toyota"),
        model: set('input[id^="model-"]', "Corolla"),
      };
    },
    { name: `Check Customer ${stamp}`, phone: `+1555${stamp}00`, plate },
  );
  check("dialog form fields filled", Object.values(filled).every(Boolean), JSON.stringify(filled));

  await clickByText("Create customer");
  let closed = false;
  for (let i = 0; i < 30; i++) {
    closed = (await dialogBox()) === null;
    if (closed) break;
    await sleep(250);
  }
  check("dialog closes after create", closed, "still open after 7.5s");

  const selection = await page.eval(() => {
    const search = document.querySelector("#invoice-customer");
    const vehicle = document.querySelector("#invoice-vehicle");
    return {
      query: search ? search.value : null,
      vehicleValue: vehicle ? vehicle.value : null,
      vehicleLabel: vehicle && vehicle.value ? vehicle.options[vehicle.selectedIndex].text : null,
      vehicleDisabled: vehicle ? vehicle.disabled : null,
      optionCount: vehicle ? vehicle.options.length : 0,
      focusTag: document.activeElement ? document.activeElement.tagName + "#" + document.activeElement.id : null,
    };
  });
  check("customer populated in the invoice form", Boolean(selection.query), JSON.stringify(selection));
  check(
    "new vehicle auto-selected",
    Boolean(selection.vehicleValue) && (selection.vehicleLabel || "").includes(plate),
    JSON.stringify(selection),
  );
  check("vehicle control enabled", selection.vehicleDisabled === false, JSON.stringify(selection));

  // ── 3. complaint + cost breakdown + total ──────────────────────────────
  await page.eval(() => {
    const el = document.querySelector("#invoice-complaint");
    const proto = HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, "Check engine light, rough idle on CNG.");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await clickByText("Add line");
  await sleep(200);

  const lines = await page.eval(({ l1, l2, a1, a2, type2 }) => {
    const desc = [...document.querySelectorAll('input[placeholder="Cylinder kit, labour, fittings"]')];
    const amt = [...document.querySelectorAll('input[aria-label="Line amount"]')];
    const type = [...document.querySelectorAll('select[aria-label="Line type"]')];
    const set = (el, v) => {
      if (!el) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    };
    const ok = [
      set(desc[0], l1),
      set(amt[0], a1),
      set(desc[1], l2),
      set(amt[1], a2),
    ];
    if (type[1]) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(type[1], type2);
      type[1].dispatchEvent(new Event("change", { bubbles: true }));
    }
    return ok.every(Boolean);
  }, { l1: "Labour: diagnosis + install", a1: 5000, l2: "Cylinder kit", a2: 12500, type2: "part" });

  check("two cost lines filled", lines);

  const totals = await page.eval(() => {
    const total = document.querySelector("#invoice-total");
    // innerText honours text-transform, so the header arrives uppercased.
    const text = document.body.innerText;
    const m = text.match(/breakdown total\s*₦([\d,]+\.\d\d)/i);
    return {
      totalValue: total ? total.value : null,
      breakdown: m ? m[1] : null,
      labor: (text.match(/labor\s*₦([\d,]+\.\d\d)/i) || [])[1] || null,
      parts: (text.match(/parts\s*₦([\d,]+\.\d\d)/i) || [])[1] || null,
    };
  });
  check(
    "breakdown total = 17,500.00",
    totals.breakdown === "17,500.00",
    JSON.stringify(totals),
  );
  check(
    "labor / parts subtotals split correctly",
    totals.labor === "5,000.00" && totals.parts === "12,500.00",
    JSON.stringify(totals),
  );
  check(
    "total field mirrors the breakdown",
    Number(totals.totalValue) === 17500,
    JSON.stringify(totals),
  );

  // ── 4. submit, then verify it lands on the new invoice's detail page ───
  // Scope to the invoice form: the header also renders a <form> (Sign out).
  await page.eval(() => {
    const form = document.querySelector("#invoice-complaint")?.closest("form");
    form?.querySelector('button[type="submit"]')?.click();
  });

  let detailPath = null;
  for (let i = 0; i < 120; i++) {
    detailPath = await page.eval(() => location.pathname).catch(() => null);
    if (detailPath && /^\/invoices\/[0-9a-f-]{36}$/.test(detailPath)) break;
    await sleep(250);
  }
  check(
    "create navigates to the invoice detail page",
    /^\/invoices\/[0-9a-f-]{36}$/.test(detailPath || ""),
    `landed on ${detailPath}`,
  );

  await page.eval(() => document.fonts.ready.then(() => true));
  const alertText = await page.eval(() => document.querySelector('[role="alert"]')?.innerText ?? null);

  const detail = await page.eval(() => {
    const text = document.body.innerText;
    const jobBtn = [...document.querySelectorAll("button")].find((b) =>
      /Create job order/.test(b.textContent),
    );
    return {
      heading: document.querySelector("main h1")?.innerText ?? null,
      hasRecordPayment: [...document.querySelectorAll("button")].some((b) =>
        /Record payment/.test(b.textContent),
      ),
      jobDisabled: jobBtn ? jobBtn.disabled : null,
      warning: /At least 50% of the invoice must be paid first/.test(text),
      balance: (text.match(/Balance\s*₦([\d,.]+)/) || [])[1] || null,
      paid: (text.match(/Paid to date\s*₦([\d,.]+)/) || [])[1] || null,
    };
  });
  check(
    "detail page shows the invoice",
    /Invoice\s*INV-/.test(detail.heading || ""),
    `${JSON.stringify(detail)} alert=${JSON.stringify(alertText)}`,
  );
  check("detail offers Record payment", detail.hasRecordPayment, JSON.stringify(detail));
  check("detail shows ₦ balance and paid", detail.balance === "17,500.00" && detail.paid === "0.00", JSON.stringify(detail));
  check("job order button disabled below 50%", detail.jobDisabled === true, JSON.stringify(detail));
  check("50% warning spelled out on the detail page", detail.warning, JSON.stringify(detail));

  let scriptCustomerId = null;
  let scriptInvoiceId = null;
  if (URL_ && SERVICE) {
    const hdr = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
    const customers = await fetch(`${URL_}/rest/v1/customers?phone=eq.${encodeURIComponent(`+1555${stamp}00`)}`, { headers: hdr }).then((r) => r.json());
    const customerId = customers?.[0]?.id;
    scriptCustomerId = customerId ?? null;
    check("customer row exists", Boolean(customerId), JSON.stringify(customers).slice(0, 200));

    const invoices = await fetch(`${URL_}/rest/v1/invoices?select=*&customer_id=eq.${customerId}&order=created_at.desc&limit=1`, { headers: hdr }).then((r) => r.json());
    const inv = invoices?.[0];
    scriptInvoiceId = inv?.id ?? null;
    check("invoice row exists", Boolean(inv), JSON.stringify(invoices).slice(0, 200));
    if (inv) {
      check("invoice total = 17500", Number(inv.total_amount) === 17500, String(inv.total_amount));
      check("invoice carries 2 cost lines", Array.isArray(inv.cost_breakdown) && inv.cost_breakdown.length === 2, JSON.stringify(inv.cost_breakdown));
      check("invoice has no job order", inv.job_order_id === null, String(inv.job_order_id));
      check(
        "invoice has no technician field",
        !("technician_id" in inv),
        "column still on the table — paste migration 0012",
      );
      check("invoice customer matches", inv.customer_id === customerId, `${inv.customer_id} vs ${customerId}`);
      if (customerId) {
        const vehicles = await fetch(`${URL_}/rest/v1/vehicles?customer_id=eq.${customerId}&select=id,license_plate`, { headers: hdr }).then((r) => r.json());
        check(
          "invoice vehicle belongs to that customer",
          vehicles?.some((v) => v.id === inv.vehicle_id && v.license_plate === plate),
          JSON.stringify(vehicles),
        );
      }
    }
  } else {
    check("supabase env available for the DB read", false, "NEXT_PUBLIC_SUPABASE_URL / SERVICE key missing");
  }
  // ── 5. payments against the invoice, then the job order ────────────────
  const payState = () =>
    page.eval(() => {
      const text = document.body.innerText;
      const jobBtn = [...document.querySelectorAll("button")].find((b) =>
        /Create job order/.test(b.textContent),
      );
      // Receipt numbers are shown as links in the payments list, one per
      // payment (the original auto-issued when the payment was recorded).
      const receipts = [...document.querySelectorAll('a[href^="/receipts/"]')].map(
        (a) => a.textContent.trim(),
      );
      return {
        balance: (text.match(/Balance\s*₦([\d,.]+)/) || [])[1] || null,
        paid: (text.match(/Paid to date\s*₦([\d,.]+)/) || [])[1] || null,
        pill: (text.match(/^\s*(Unpaid|Part paid|Paid)\s*$/m) || [])[1] || null,
        jobDisabled: jobBtn ? jobBtn.disabled : null,
        alert: document.querySelector('[role="alert"]')?.innerText ?? null,
        receipts,
      };
    });

  const waitPay = async (wanted) => {
    let state = await payState();
    for (let i = 0; i < 120 && !wanted(state); i++) {
      await sleep(250);
      state = await payState();
    }
    return state;
  };

  const setAmount = (value) =>
    page.eval((v) => {
      const el = document.querySelector("#pay-amount");
      if (!el) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }, value);

  await setAmount(5000);
  await clickByText("Record payment");
  let pay = await waitPay((s) => s.paid === "5,000.00");
  check("partial payment recorded", pay.paid === "5,000.00", JSON.stringify(pay));
  check("status pill reads Part paid", pay.pill === "Part paid", JSON.stringify(pay));
  check("job order still locked below 50%", pay.jobDisabled === true, JSON.stringify(pay));
  check(
    "payment auto-issued a receipt",
    pay.receipts.length === 1 && /^RCP-\d{4}-\d{4}$/.test(pay.receipts[0]),
    JSON.stringify(pay.receipts),
  );

  const usedFullBalance = await page.eval(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /Full balance/.test(b.textContent),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  check("full-balance shortcut offered", usedFullBalance);

  await clickByText("Record payment");
  pay = await waitPay((s) => s.paid === "17,500.00");
  check("second payment clears the balance", pay.paid === "17,500.00" && pay.balance === "0.00", JSON.stringify(pay));
  check("status pill reads Paid", pay.pill === "Paid", JSON.stringify(pay));
  check("job order button unlocks at 50%+", pay.jobDisabled === false, JSON.stringify(pay));
  check(
    "each payment carries its own receipt",
    pay.receipts.length === 2 && new Set(pay.receipts).size === 2,
    JSON.stringify(pay.receipts),
  );

  // The receipt sheet is a real page: open it and confirm it renders the
  // payment and has a print control (the artefact must be printable).
  const receiptHref = await page.eval(() => {
    const a = document.querySelector('a[href^="/receipts/"]');
    return a ? a.getAttribute("href") : null;
  });
  if (receiptHref) {
    await page.goto(`${BASE}${receiptHref}`);
    await sleep(600);
    const sheet = await page.eval(() => ({
      heading: !!document.querySelector("h1")?.textContent?.match(/Receipt/),
      hasPrint: [...document.querySelectorAll("button")].some((b) =>
        /Print receipt/.test(b.textContent),
      ),
      hiddenSheetPresent: !!document.querySelector(".receipt-sheet"),
    }));
    check("receipt page renders", sheet.heading && sheet.hasPrint, JSON.stringify(sheet));
    check("receipt sheet is on the page (print-only)", sheet.hiddenSheetPresent, JSON.stringify(sheet));

    // Emulate print media: the sheet alone must be visible, and the screen
    // summary must be gone. A receipt is a financial document, so unlike the
    // job card it MUST carry the money.
    await page.send("Emulation.setEmulatedMedia", { media: "print" });
    await sleep(400);
    const printed = await page.eval(() => {
      const visible = (el) => {
        if (!el) return false;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const sheetEl = document.querySelector(".receipt-sheet");
      return {
        sheetShown: visible(sheetEl),
        screenShown: visible(sheetEl ? sheetEl.parentElement.previousElementSibling : null),
        asideShown: visible(document.querySelector("aside")),
        text: document.body.innerText,
      };
    });
    check("print media reveals the receipt sheet", printed.sheetShown === true);
    check("print media hides the screen summary", printed.screenShown === false, String(printed.screenShown));
    check("print media hides the sidebar", printed.asideShown === false, String(printed.asideShown));
    check("printed receipt states the amount and balance", printed.text.includes("\u20a6") && /Balance outstanding/.test(printed.text));
    await page.send("Emulation.setEmulatedMedia", { media: "" });
    await sleep(300);

    // Return to the invoice so the rest of the flow continues.
    await page.goto(`${BASE}${detailPath}`);
    await sleep(600);
  } else {
    check("receipt page renders", false, "no receipt link found");
  }

  await clickByText("Create job order");
  await sleep(500);
  check(
    "job order form opens",
    await page.eval(() =>
      [...document.querySelectorAll("button")].some((b) => /Raise job order/.test(b.textContent)),
    ),
  );

  await clickByText("Raise job order");
  let jobNumber = null;
  for (let i = 0; i < 120; i++) {
    jobNumber = await page
      .eval(() => (document.body.innerText.match(/JO-[A-Za-z0-9-]+/) || [])[0] || null)
      .catch(() => null);
    if (jobNumber) break;
    await sleep(250);
  }
  const jobAlert = await page.eval(() => document.querySelector('[role="alert"]')?.innerText ?? null);
  check("job order raised from the invoice", Boolean(jobNumber), `job=${jobNumber} alert=${jobAlert}`);

  if (URL_ && SERVICE && jobNumber && scriptInvoiceId) {
    const hdr2 = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
    const invId = scriptInvoiceId;
    const rows = await fetch(`${URL_}/rest/v1/invoices?select=id,job_order_id,customer_id&id=eq.${invId}`, { headers: hdr2 }).then((r) => r.json());
    check("invoice stamped with its job order", Boolean(rows?.[0]?.job_order_id), JSON.stringify(rows));

    const pays = await fetch(`${URL_}/rest/v1/payments?select=amount,payment_method,job_order_id&invoice_id=eq.${invId}`, { headers: hdr2 }).then((r) => r.json());
    const payRows = Array.isArray(pays) ? pays : [];
    const sum = payRows.reduce((t, r) => t + Number(r.amount), 0);
    check("two payments totalling the invoice", payRows.length === 2 && sum === 17500, JSON.stringify(pays));

    const jobs = await fetch(`${URL_}/rest/v1/job_orders?select=id,job_number,estimated_amount,customer_id&job_number=eq.${encodeURIComponent(jobNumber)}`, { headers: hdr2 }).then((r) => r.json());
    check(
      "job order row carries the invoice's customer and total",
      Boolean(jobs?.[0]) && Number(jobs[0].estimated_amount) === 17500 && jobs[0].customer_id === rows?.[0]?.customer_id,
      JSON.stringify(jobs),
    );
  }


  // ── 5b. add a vehicle to an existing customer ──────────────────────────
  // The customer page owns the owner, so the dialog only asks about the car.
  if (scriptCustomerId) {
    const addedPlate = `ADD-${stamp}`;
    const dialogOpen = () =>
      page.eval(() => document.querySelector('[data-slot="dialog-content"]')?.innerText ?? null);

    const addVehicle = async (fillPlate) => {
      const opened = await page.eval(() => {
        const btn = [...document.querySelectorAll("main button")].find(
          (b) => b.textContent.trim() === "Add vehicle",
        );
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!opened) return { opened: false };

      for (let i = 0; i < 20 && !(await dialogOpen()); i++) await sleep(100);

      await page.eval((value) => {
        const pop = document.querySelector('[data-slot="dialog-content"]');
        if (!pop) return false;
        const set = (id, v) => {
          const el = pop.querySelector(id);
          if (!el) return false;
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        };
        const ok =
          set("#new-vehicle-plate", value) &&
          set("#new-vehicle-make", "Hyundai") &&
          set("#new-vehicle-model", "Tucson");
        pop.querySelector('button[type="submit"]')?.click();
        return ok;
      }, fillPlate);

      return { opened: true };
    };

    const waitDialogGone = async () => {
      for (let i = 0; i < 60; i++) {
        if (!(await dialogOpen())) return true;
        await sleep(250);
      }
      return false;
    };

    await page.goto(`${BASE}/customers/${scriptCustomerId}`);
    await page.eval(() => document.fonts.ready.then(() => true));
    await sleep(400);

    const first = await addVehicle(addedPlate);
    check("customer page offers Add vehicle", first.opened, JSON.stringify(first));
    const closed = await waitDialogGone();
    let cardText = "";
    for (let i = 0; i < 40; i++) {
      cardText = await page.eval(() => document.querySelector("main")?.innerText ?? "");
      if (cardText.includes(addedPlate)) break;
      await sleep(250);
    }
    check(
      "vehicle added to the existing customer shows on the card",
      closed && cardText.includes(addedPlate) && /2 vehicles/.test(cardText),
      cardText.replace(/\s+/g, " ").slice(0, 260),
    );

    if (URL_ && SERVICE) {
      const hdr3 = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
      const rows = await fetch(
        `${URL_}/rest/v1/vehicles?select=license_plate,customer_id,vin&customer_id=eq.${scriptCustomerId}`,
        { headers: hdr3 },
      ).then((r) => r.json());
      check(
        "new vehicle row belongs to that customer",
        rows?.some((v) => v.license_plate === addedPlate),
        JSON.stringify(rows),
      );
    }

    const duplicate = await addVehicle(addedPlate);
    let duplicateAlert = null;
    for (let i = 0; i < 40; i++) {
      duplicateAlert = await page.eval(
        () =>
          document.querySelector('[data-slot="dialog-content"] [role="alert"]')?.innerText ?? null,
      );
      if (duplicateAlert) break;
      await sleep(250);
    }
    check(
      "duplicate plate is explained, not swallowed",
      duplicate.opened && /already registered/i.test(duplicateAlert || ""),
      `alert=${JSON.stringify(duplicateAlert)}`,
    );
    await page.keyboard?.("Escape");
    await page.eval(() => {
      const pop = document.querySelector('[data-slot="dialog-content"]');
      const cancel = pop && [...pop.querySelectorAll("button")].find((b) => /Cancel/.test(b.textContent));
      cancel?.click();
    });
    await waitDialogGone();
  } else {
    check("customer id available for the add-vehicle check", false);
  }

  // ── 6. the list is the root, rows open the detail page ─────────────────
  await sleep(500); // let the job-order refresh settle before navigating
  await page.goto(`${BASE}/invoices`);
  await page.eval(() => document.fonts.ready.then(() => true));
  await sleep(800); // let the list hydrate before clicking a row

  const list = await page.eval(() => ({
    h1: document.querySelector("main h1")?.innerText ?? null,
    hasNewButton: [...document.querySelectorAll("main a")].some((a) =>
      /New invoice/.test(a.textContent),
    ),
    rows: document.querySelectorAll("main tbody tr").length,
    firstHref:
      [...document.querySelectorAll('main a[href^="/invoices/"]')]
        .map((a) => a.getAttribute("href"))
        .find((h) => /^\/invoices\/[0-9a-f-]{36}$/.test(h)) ?? null,
    money: (document.body.innerText.match(/₦[\d,]+\.\d\d/g) || []).slice(0, 3),
  }));
  check("root /invoices is the list", list.h1 === "Invoices", JSON.stringify(list));
  check("list has a New invoice button", list.hasNewButton, JSON.stringify(list));
  check("list shows every invoice", list.rows >= 4, JSON.stringify(list));
  check("list figures carry ₦ and commas", list.money.length > 0 && list.money[0].includes(","), JSON.stringify(list.money));

  const rowHref = list.firstHref;
  await page.eval(() => {
    [...document.querySelectorAll('main a[href^="/invoices/"]')]
      .find((a) => /^\/invoices\/[0-9a-f-]{36}$/.test(a.getAttribute("href") || ""))
      ?.click();
  });
  let rowLanded = null;
  for (let i = 0; i < 40; i++) {
    rowLanded = await page.eval(() => location.pathname).catch(() => null);
    if (rowLanded && /^\/invoices\/[0-9a-f-]{36}$/.test(rowLanded)) break;
    await sleep(250);
  }
  check(
    "clicking a row opens that invoice",
    /^\/invoices\/[0-9a-f-]{36}$/.test(rowLanded || "") && rowLanded === rowHref,
    `clicked ${rowHref} landed ${rowLanded}`,
  );

  // ── 7. custom 404 ──────────────────────────────────────────────────────
  await page.goto(`${BASE}/no-such-page-xyz`);
  const notFound = await page.eval(() => document.body.innerText);
  check(
    "custom 404 renders",
    /404/.test(notFound) && /not in the workshop/i.test(notFound),
    notFound.replace(/\s+/g, " ").slice(0, 160),
  );

  // ── 8. directory pages fit a phone ─────────────────────────────────────
  await page.setViewport({ width: 390, height: 844 });
  const directoryPages = [
    ["/customers", "customers list"],
    ["/customers?q=baba", "customers search"],
    ["/vehicles", "vehicles search"],
    ["/vehicles?q=baba", "vehicle results"],
    ...(scriptCustomerId ? [[`/customers/${scriptCustomerId}`, "customer detail"]] : []),
  ];
  for (const [path, label] of directoryPages) {
    await page.goto(`${BASE}${path}`);
    await page.eval(() => document.fonts.ready.then(() => true));
    const fit = await page.eval(() => ({
      vw: innerWidth,
      docW: document.documentElement.scrollWidth,
      mainW: Math.round(document.querySelector("main")?.getBoundingClientRect().width ?? 0),
    }));
    check(
      `no horizontal scroll on ${label} @phone`,
      fit.docW <= fit.vw + 1,
      JSON.stringify(fit),
    );
  }

  const detailRoute = /^\/invoices\/[0-9a-f-]{36}$/.test(detailPath || "")
    ? detailPath
    : scriptInvoiceId
      ? `/invoices/${scriptInvoiceId}`
      : null;
  if (detailRoute) {
    await page.goto(`${BASE}${detailRoute}`);
    await page.eval(() => document.fonts.ready.then(() => true));
    const fit = await page.eval(() => ({
      vw: innerWidth,
      docW: document.documentElement.scrollWidth,
    }));
    check(
      "no horizontal scroll on invoice detail @phone",
      fit.docW <= fit.vw + 1,
      JSON.stringify(fit),
    );
  }
} catch (error) {
  check("script completed", false, String(error).slice(0, 300));
} finally {
  await browser.close().catch(() => {});

  if (KEEP_DATA) {
    console.log(`\nKEEP_TEST_DATA=1 — left this run's rows in place (phone +1555${stamp}00).`);
  } else if (URL_ && SERVICE) {
    const customers = await testCustomers(`phone=eq.${encodeURIComponent(`+1555${stamp}00`)}`).catch(
      () => [],
    );
    const removed = await purgeCustomers(customers).catch((error) => {
      console.log(`      cleanup failed: ${String(error).slice(0, 160)}`);
      return null;
    });
    if (removed) {
      console.log(
        `\nCleaned up ${removed.customers} test customer(s), ${removed.vehicles} vehicle(s), ${removed.invoices} invoice(s), ${removed.jobs} job order(s).`,
      );
    }
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
