// Job card check — verifies the printable sheet that goes inside the vehicle.
// The card is rendered on the job order detail page, hidden on screen and
// revealed by `@media print`, so printing needs no extra navigation:
//   1. the detail page hosts the card and a print button, with no card route
//   2. the card shows owner name/phone, vehicle details and the work items
//   3. it carries no money and no technician timeline / internal commentary
//   4. the QR renders and decodes to this job order's absolute URL
//   5. emulated print media reveals the card and hides the whole screen UI
//   6. nothing overflows horizontally at 390px
//
//   node --env-file=.env.local scripts/job-card-check.mjs
//
// Seeds its own customer/vehicle/invoice/payment/job order and deletes them
// when it finishes (KEEP_TEST_DATA=1 keeps them). Rows left by an earlier run
// can be cleared once with:
//
//   node --env-file=.env.local scripts/job-card-check.mjs --purge
//
// Prints PASS/FAIL lines and exits non-zero on any FAIL.
import { Browser, sleep } from "../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jsQR = require("jsqr").default ?? require("jsqr");

const BASE = process.env.PREVIEW_URL || "http://localhost:3000";
const EMAIL = "reception.test@wms.local";
const PASSWORD = process.env.PREVIEW_PASSWORD || "WmsTest!2026#";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TAG = "CardCheck";
const PURGE_ONLY = process.argv.includes("--purge");
const KEEP_DATA = process.env.KEEP_TEST_DATA === "1";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS  " : "FAIL  "}${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const restGet = (path) =>
  fetch(`${URL_}/rest/v1/${path}`, { headers: adminHeaders }).then((r) => r.json());
const restPost = (table, body) =>
  fetch(`${URL_}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
const restDelete = async (table, filter) => {
  const res = await fetch(`${URL_}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { ...adminHeaders, Prefer: "return=minimal" },
  });
  return res.ok;
};
const idList = (ids) => `(${ids.map((id) => `"${id}"`).join(",")})`;

/** customers.name is unique enough with the stamp; phone doubles as a key. */
const purge = async () => {
  const customers = await restGet(`customers?select=id&name=like.${TAG}*`);
  const ids = (customers || []).map((c) => c.id);
  if (!ids.length) return 0;
  const invoices = await restGet(`invoices?select=id&customer_id=in.${idList(ids)}`);
  const jobs = await restGet(`job_orders?select=id&customer_id=in.${idList(ids)}`);
  const invoiceIds = (invoices || []).map((i) => i.id);
  const jobIds = (jobs || []).map((j) => j.id);
  if (invoiceIds.length) await restDelete("payments", `invoice_id=in.${idList(invoiceIds)}`);
  if (invoiceIds.length) await restDelete("invoices", `id=in.${idList(invoiceIds)}`);
  if (jobIds.length) {
    await restDelete("job_logs", `job_order_id=in.${idList(jobIds)}`);
    await restDelete("service_history", `linked_job_order_id=in.${idList(jobIds)}`);
    await restDelete("job_orders", `id=in.${idList(jobIds)}`);
  }
  await restDelete("vehicles", `customer_id=in.${idList(ids)}`);
  await restDelete("customers", `id=in.${idList(ids)}`);
  await restDelete("audit_logs", `entity_id=in.${idList([...ids, ...invoiceIds, ...jobIds])}`);
  return ids.length;
};

if (!URL_ || !SERVICE) {
  console.log("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.");
  process.exit(1);
}

if (PURGE_ONLY) {
  const n = await purge();
  console.log(`Purged ${n} ${TAG} customer(s).`);
  process.exit(0);
}

await purge();
const { users } = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, {
  headers: adminHeaders,
}).then((r) => r.json());
const userId = (email) => users.find((u) => u.email === email).id;

const stamp = Date.now();
const [customer] = await restPost("customers", {
  name: `${TAG} Customer ${stamp}`,
  phone: "+2348098765432",
  email: "card.check@example.com",
});
const [vehicle] = await restPost("vehicles", {
  customer_id: customer.id,
  make: "Honda",
  model: "CR-V",
  year: 2019,
  license_plate: `CRD-${stamp}`,
  vin: `VIN${stamp}XZ`,
  color: "Silver",
});
const [invoice] = await restPost("invoices", {
  customer_id: customer.id,
  vehicle_id: vehicle.id,
  complaint: "CNG conversion plus a full service",
  billing_type: "upfront",
  category: "cng",
  cost_breakdown: [
    { description: "CNG conversion kit and installation", amount: 400000, itemType: "part" },
    { description: "Engine oil and filter change", amount: 45000, itemType: "part" },
    { description: "Installation labour", amount: 80000, itemType: "labor" },
  ],
  total_amount: 525000,
  created_by: userId(EMAIL),
});
await restPost("payments", {
  invoice_id: invoice.id,
  amount: 400000,
  payment_method: "cash",
  received_by: userId(EMAIL),
});
const [job] = await restPost("job_orders", {
  job_number: `JO-${TAG.replace(/[^A-Z]/g, "")}-${stamp}`,
  customer_id: customer.id,
  vehicle_id: vehicle.id,
  complaint: invoice.complaint,
  estimated_amount: 525000,
  execution_status: "in_progress",
  financial_status: "part_paid",
  assigned_technician_id: userId("tech.test@wms.local"),
  created_by: userId(EMAIL),
  date_in: new Date().toISOString().slice(0, 10),
  expected_date_out: new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10),
  notes: "Customer will collect on Saturday morning.",
});
await fetch(`${URL_}/rest/v1/invoices?id=eq.${invoice.id}`, {
  method: "PATCH",
  headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ job_order_id: job.id }),
});
// Internal-only commentary that must never reach a card in the vehicle.
const SECRET = "INTERNAL ONLY: re-quote if the manifold is cracked";
await restPost("job_logs", {
  job_order_id: job.id,
  technician_id: userId("tech.test@wms.local"),
  execution_status: "in_progress",
  notes: SECRET,
});

const cleanup = async () => {
  if (KEEP_DATA) {
    console.log(`      kept test data (job ${job.job_number})`);
    return;
  }
  await purge();
};

const browser = await Browser.launch();
const page = await browser.newPage({ width: 1440, height: 900 });

try {
  // ── sign in ────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`);
  await page.eval(() => document.fonts.ready.then(() => true));
  for (let i = 0; i < 40; i++) {
    const ready = await page
      .eval(() => Boolean(document.querySelector('form input[type="email"]')?._valueTracker))
      .catch(() => false);
    if (ready) break;
    await sleep(250);
  }
  await sleep(300);
  await page.eval(
    ({ email, password }) => {
      const set = (el, v) => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      set(document.querySelector('form input[type="email"]'), email);
      set(document.querySelector('form input[type="password"]'), password);
      document.querySelector("form button")?.click();
    },
    { email: EMAIL, password: PASSWORD },
  );
  for (let i = 0; i < 60; i++) {
    const path = await page.eval(() => location.pathname).catch(() => null);
    if (path && path !== "/login") break;
    await sleep(250);
  }

  // ── the detail page hosts the print flow (no separate card route) ──────
  await page.goto(`${BASE}/job-orders/${job.id}`);
  const detail = await page.eval(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /print job card/i.test(b.textContent || ""),
    );
    const strayLink = [...document.querySelectorAll('a[href*="/card"]')].length;
    const card = document.querySelector(".job-card");
    const hidden = card ? getComputedStyle(card.parentElement).display === "none" : null;
    return { hasButton: !!btn, strayCardLinks: strayLink, hasCard: !!card, cardHiddenOnScreen: hidden };
  });
  check("detail page has a print button", detail.hasButton === true);
  check("no navigation to a separate card route remains", detail.strayCardLinks === 0, `${detail.strayCardLinks} link(s)`);
  check("the card is rendered on the detail page", detail.hasCard === true);
  check("the card is hidden on screen", detail.cardHiddenOnScreen === true, String(detail.cardHiddenOnScreen));

  // ── emulate print media: the card alone must be visible ────────────────
  await page.send("Emulation.setEmulatedMedia", { media: "print" });
  await sleep(500);
  const printed = await page.eval(() => {
    const visible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const card = document.querySelector(".job-card");
    const cardShown = visible(card);
    // Screen-only surfaces that must NOT reach paper.
    const screenWrapper = card ? card.parentElement.previousElementSibling : null;
    const screenShown = visible(screenWrapper);
    const aside = document.querySelector("aside");
    const header = document.querySelector("header");
    return {
      cardShown,
      screenShown,
      asideShown: visible(aside),
      headerShown: visible(header),
      docText: document.body.innerText,
    };
  });
  check("print media reveals the card", printed.cardShown === true);
  check("print media hides the screen UI", printed.screenShown === false, String(printed.screenShown));
  check("print media hides the sidebar", printed.asideShown === false, String(printed.asideShown));
  check("print media hides the header", printed.headerShown === false, String(printed.headerShown));

  // Even with everything on screen, paper must carry no money or internals.
  check("printed output has no naira symbol", !printed.docText.includes("\u20a6"));
  check("printed output has no cost figures", !/\d{1,3}(,\d{3})(\.\d+)?/.test(printed.docText));
  check("printed output has no internal note", !printed.docText.includes(SECRET));
  await page.send("Emulation.setEmulatedMedia", { media: "" });
  await sleep(300);

  // ── the card's own content ─────────────────────────────────────────────
  const card = await page.eval(() => {
    const el = document.querySelector(".job-card");
    return el ? el.innerText : null;
  });
  check("card renders the sheet", typeof card === "string" && card.length > 0, String(card).slice(0, 80));
  if (typeof card !== "string") throw new Error("no card to inspect");

  check("shows the job number", card.includes(job.job_number), job.job_number);
  check("shows the owner name", card.includes(`${TAG} Customer ${stamp}`));
  check("shows the owner phone", card.includes("+2348098765432"));
  check("shows the plate", card.includes(`CRD-${stamp}`));
  check("shows make/model/year", /Honda CR-V\s*·\s*2019/.test(card), card.match(/Honda[^\n]*/)?.[0]);
  check("shows the VIN", card.includes(`VIN${stamp}XZ`));
  check("shows the colour", /Colour:\s*Silver/.test(card));
  check("shows every work item description", [
    "CNG conversion kit and installation",
    "Engine oil and filter change",
    "Installation labour",
  ].every((d) => card.includes(d)));

  // ── money and internals must not appear ────────────────────────────────
  check("no naira symbol on the card", !card.includes("\u20a6"));
  check(
    "no cost figures on the card",
    !/\d{1,3}(,\d{3})(\.\d+)?/.test(card),
    card.match(/\d{1,3}(,\d{3})[\s\S]{0,20}/)?.[0],
  );
  check("no internal technician note", !card.includes(SECRET) && !card.includes("INTERNAL"));
  check("no work timeline on the card", !/work timeline|job log/i.test(card));

  // ── the QR decodes to this job order ───────────────────────────────────
  const expectedUrl = `${BASE}/job-orders/${job.id}`;
  const qrSvg = await page.eval(() => {
    const svg = document.querySelector('.job-card footer svg, .job-card svg[viewBox^="0 0 3"]');
    return svg ? svg.outerHTML : null;
  });
  check("card renders a QR svg", typeof qrSvg === "string" && qrSvg.includes("<path"), String(qrSvg).slice(0, 60));

  let decoded = null;
  if (typeof qrSvg === "string") {
    const n = Number(qrSvg.match(/viewBox="0 0 (\d+) (\d+)"/)?.[1]);
    const grid = Array.from({ length: n }, () => Array(n).fill(0));
    const dark = qrSvg.match(/stroke="#000000" d="([^"]+)"/)?.[1] ?? "";
    for (const row of dark.split(/(?=M\d+ \d+\.5)/).filter(Boolean)) {
      const head = row.match(/^M(\d+) (\d+)\.5/);
      if (!head) continue;
      let x = Number(head[1]);
      const y = Number(head[2]);
      const rest = row.slice(head[0].length);
      const first = rest.match(/^h(\d+)/);
      if (first) {
        for (let i = 0; i < Number(first[1]); i++) grid[y][x + i] = 1;
        x += Number(first[1]);
      }
      for (const m of rest.matchAll(/m(\d+) 0h(\d+)/g)) {
        x += Number(m[1]);
        for (let i = 0; i < Number(m[2]); i++) grid[y][x + i] = 1;
        x += Number(m[2]);
      }
    }
    const scale = 6;
    const quiet = 4;
    const size = (n + quiet * 2) * scale;
    const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (!grid[y][x]) continue;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const o = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
            rgba[o] = rgba[o + 1] = rgba[o + 2] = 0;
            rgba[o + 3] = 255;
          }
      }
    decoded = jsQR(rgba, size, size)?.data ?? null;
  }
  check("QR decodes to the job order url", decoded === expectedUrl, String(decoded));

  // The page's own URL string is printed beside the code, for humans.
  const shownUrl = await page.eval(() =>
    Boolean(document.querySelector(".job-card")?.textContent?.includes(`${location.origin}/job-orders/`)),
  );
  check("card prints the plain url too", shownUrl === true);

  // ── print stylesheet ───────────────────────────────────────────────────
  const printCss = await page.eval(async () => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
    const texts = await Promise.all(links.map((h) => fetch(h).then((r) => r.text()).catch(() => "")));
    return texts.join("\n");
  });
  check("print css sets an A4 page", /@page\s*\{[^}]*size:\s*A4/i.test(printCss));
  check("print css hides the app shell", /@media print[\s\S]*?aside[\s\S]*?display:\s*none/i.test(printCss));
  check("print css unframes the card", /\.job-card\s*\{[^}]*max-width:\s*none/i.test(printCss));

  const printHidden = await page.eval(() => {
    const screenChrome = [...document.querySelectorAll(".print\\:hidden")];
    return screenChrome.length > 0;
  });
  check("screen-only chrome is marked print:hidden", printHidden === true);

  // ── no horizontal overflow at phone width ──────────────────────────────
  await page.setViewport({ width: 390, height: 844 });
  await sleep(400);
  const overflow = await page.eval(() => ({
    docScrollW: document.documentElement.scrollWidth,
    innerW: innerWidth,
  }));
  check(
    "no horizontal overflow at 390px",
    overflow.docScrollW <= overflow.innerW + 1,
    `scrollWidth ${overflow.docScrollW} > ${overflow.innerW}`,
  );
} catch (err) {
  failures++;
  console.log(`FAIL  unexpected error — ${err.message}`);
} finally {
  await cleanup();
  await browser.close?.().catch?.(() => {});
}

console.log(failures === 0 ? "\nAll job card checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
