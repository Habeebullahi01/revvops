// Design preview — photograph the app shell at the taste-skill widths
// (desktop 1440 / tablet 768 / phone 390) with a real login session, then
// judge each screen with the skill's app-screen rules (the text "eyes").
//
//   node --env-file=.env.local scripts/design-preview.mjs [--who admin|reception|tech]
//
// Writes PNGs to .taste-skill/preview/<who>/, prints rule findings, and
// exits 1 when any FAIL finding is present. Reuses the skill's zero-dependency
// CDP driver (headless Chrome — set CHROME_PATH if no system Chrome).
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Browser, sleep } from "../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import {
  probe,
  layout,
  app,
  colourShare,
} from "../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs";
import {
  judge,
  judgeLayout,
  judgeApp,
  APP_SKIP,
} from "../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs";

const BASE = process.env.PREVIEW_URL || "http://localhost:3000";
const PASSWORD = process.env.PREVIEW_PASSWORD || "WmsTest!2026#";

const whoIdx = process.argv.indexOf("--who");
const WHO = whoIdx === -1 ? "admin" : process.argv[whoIdx + 1];

const ACCOUNTS = {
  admin: { email: "admin.test@wms.local", routes: ["/dashboard", "/job-orders"] },
  reception: { email: "reception.test@wms.local", routes: ["/job-orders"] },
  tech: { email: "tech.test@wms.local", routes: ["/technician"] },
};
const account = ACCOUNTS[WHO];
if (!account) {
  console.error(`unknown --who ${WHO} (admin|reception|tech)`);
  process.exit(2);
}

const WIDTHS = [
  { slug: "desktop", width: 1440, height: 900 },
  { slug: "tablet", width: 768, height: 1024 },
  { slug: "phone", width: 390, height: 844 },
];

// direction granted by the draw (app rules are on; allowances would be here)
const direction = JSON.parse(
  readFileSync(".taste-skill/app/direction.json", "utf8"),
);
const allow = direction.allow || [];
const dealtFonts = [direction.style?.tokens?.font?.family].filter(Boolean);

const outDir = join(".taste-skill", "preview", WHO);
mkdirSync(outDir, { recursive: true });

const browser = await Browser.launch();
const page = await browser.newPage({ width: 1440, height: 900 });
const findings = [];

const shot = async (name) => {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, format: "png" });
  console.log(`  ${path}`);
};

// measure + judge the current page, tagging findings with route and width
const judgePage = async (label, width) => {
  try {
    const m = await page.eval(probe);
    const lay = await page.eval(layout).catch(() => null);
    const appM = await page.eval(app).catch(() => null);
    const jpeg = await page.screenshot({ format: "jpeg", quality: 70 });
    if (appM) {
      appM.colourShare = await page
        .eval(colourShare, "data:image/jpeg;base64," + jpeg)
        .catch(() => null);
    }
    let fs = [
      ...judge(m, { width, allow }),
      ...(lay ? judgeLayout(lay, { width, allow }) : []),
    ].filter(
      (f) => !APP_SKIP.has(f.id) && f.id !== "no-title" && f.id !== "small-title",
    );
    const norm = (f) =>
      String(f).toLowerCase().replace(/["']/g, "").replace(/\s+variable$/, "").trim();
    const used = m.type.families
      .filter((f) => f.share >= 0.1)
      .map((f) => norm(f.family));
    const missing = dealtFonts.filter(
      (f) => !used.some((u) => u === norm(f) || u.startsWith(norm(f))),
    );
    if (missing.length === dealtFonts.length) {
      fs.push({
        level: "FAIL",
        id: "font-not-dealt",
        message: `dealt ${dealtFonts.join(" and ")}, page renders ${m.type.families
          .slice(0, 2)
          .map((f) => f.family)
          .join(", ")}`,
        fix: "load the dealt face first in font-family",
      });
    }
    if (appM) fs.push(...judgeApp(appM, m, { width, allow }));
    for (const f of fs) findings.push({ label, width, ...f });
  } catch (e) {
    findings.push({
      label,
      width,
      level: "WARN",
      id: "judge-error",
      message: String(e).slice(0, 200),
      fix: "probe failed on this page",
    });
  }
};

const pathname = () => page.eval(() => location.pathname).catch(() => null);

try {
  // ---- logged-out login screen ----
  await page.goto(`${BASE}/login`);
  await page.eval(() => document.fonts.ready.then(() => true));
  await shot("login-desktop");
  await judgePage("login", 1440);

  // ---- sign in (React-controlled inputs need the native setter) ----
  const filled = await page.eval(
    ({ email, password }) => {
      const emailEl = document.querySelector(
        'form input[type="email"], form input[name="email"]',
      );
      const passEl = document.querySelector(
        'form input[type="password"], form input[name="password"]',
      );
      if (!emailEl || !passEl) return false;
      const set = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      set.call(emailEl, email);
      emailEl.dispatchEvent(new Event("input", { bubbles: true }));
      set.call(passEl, password);
      passEl.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("form button")?.click();
      return true;
    },
    { email: account.email, password: PASSWORD },
  );
  if (!filled) throw new Error("login form not found");

  let landed = null;
  for (let i = 0; i < 40; i++) {
    landed = await pathname();
    if (landed && landed !== "/login") break;
    await sleep(250);
  }
  if (!landed || landed === "/login") {
    await shot("login-failed");
    const diag = await page.eval(() => ({
      url: location.href,
      text: document.body.innerText.slice(0, 400),
    }));
    console.log(JSON.stringify(diag, null, 2));
    throw new Error("login did not redirect");
  }
  console.log(`signed in as ${WHO} -> ${landed}`);

  // ---- each role route at each width ----
  for (const w of WIDTHS) {
    await page.setViewport({ width: w.width, height: w.height });
    for (const route of account.routes) {
      await page.goto(`${BASE}${route}`);
      await page.eval(() => document.fonts.ready.then(() => true));
      const slug = route.replace(/^\//, "").replace(/\//g, "-") || "root";
      await shot(`${slug}-${w.slug}`);
      await judgePage(`${route}@${w.slug}`, w.width);
      if (w.slug === "phone") {
        await page.eval(() =>
          document.querySelector('[aria-label="Open menu"]')?.click(),
        );
        await sleep(400);
        await shot(`${slug}-phone-menu`);
        await page.eval(() =>
          document.querySelector('[data-slot="sheet-overlay"]')?.click(),
        );
        await sleep(300);
      }
    }
  }

  // ---- report ----
  if (page.consoleErrors.length) {
    console.log("\nconsole errors:");
    for (const e of page.consoleErrors) console.log(`  ${e}`);
  }
  const fails = findings.filter((f) => f.level === "FAIL");
  const warns = findings.filter((f) => f.level === "WARN");
  const print = (f) =>
    console.log(`  ${f.level} [${f.id}] ${f.label} — ${f.message}${f.fix ? `\n        fix: ${f.fix}` : ""}`);
  if (fails.length) {
    console.log(`\nFAIL (${fails.length}):`);
    fails.forEach(print);
  }
  if (warns.length) {
    console.log(`\nWARN (${warns.length}):`);
    warns.forEach(print);
  }
  console.log(
    `\n${findings.length - fails.length}/${findings.length} findings clear${fails.length ? " — FAIL" : ""}`,
  );
  process.exit(fails.length ? 1 : 0);
} finally {
  await browser.close();
}
