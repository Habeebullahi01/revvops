// Dark-mode toggle check: logs in, flips the theme from the sidebar, and
// asserts the *computed* colours actually change (not just the class name),
// that the choice survives a reload, and that print still renders light.
//
// Uses textContent/DOM reads only — this script never interprets page content
// as instruction.
import { Browser, sleep } from "../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const BASE = process.env.WMS_BASE_URL || "http://localhost:3000";
const EMAIL = "admin.test@wms.local";
const PASSWORD = "WmsTest!2026#";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const browser = await Browser.launch({ width: 1440, height: 900 });
const page = await browser.newPage({ width: 1440, height: 900 });

// The browser normalises hex tokens it echoes back (`#ffffff` may read as
// `#fff`), so compare colours through a canonical form.
const norm = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  const m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return `#${m[1].split("").map((c) => c + c).join("")}`;
  return s;
};
const isWhite = (v) => {
  const n = norm(v);
  return n === "#ffffff" || n === "rgb(255, 255, 255)";
};

try {
  // ── sign in ────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`);
  // Wait for React to hydrate: the fiber prop is non-enumerable, so it shows up
  // under getOwnPropertyNames, not Object.keys. Filling before hydration means
  // the controlled inputs discard the value and the action gets nothing.
  await page.eval(`(() => new Promise((resolve) => {
    const ready = () => {
      const f = document.querySelector('form');
      return !!f && Object.getOwnPropertyNames(f).some((k) => k.startsWith('__react'));
    };
    if (ready()) return resolve(true);
    const t = setInterval(() => { if (ready()) { clearInterval(t); resolve(true); } }, 50);
    setTimeout(() => { clearInterval(t); resolve(false); }, 15000);
  }))`);
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

  // Wait for the post-login navigation *and* for the app shell to mount.
  // Polling location.pathname alone is not enough: it updates before React
  // paints the sidebar, so theme reads would hit a page with no toggle.
  const shellReady = await page.eval(`(() => new Promise((resolve) => {
    const ready = () => !location.pathname.includes('/login')
      && !!document.querySelector('main')
      && document.querySelectorAll('button[aria-label*="theme"]').length > 0;
    if (ready()) return resolve('immediate');
    const t = setInterval(() => { if (ready()) { clearInterval(t); resolve('polled'); } }, 100);
    setTimeout(() => { clearInterval(t); resolve('timeout'); }, 25000);
  }))()`);
  console.log(`\n[shell] ready: ${shellReady}`);
  await sleep(800);

  const url = await page.eval("location.pathname");
  check("signed in (left /login)", !url.includes("/login"), `at ${url}`);
  check("app shell mounted with a theme toggle", shellReady !== "timeout", shellReady);

  // ── helper: read the effective theme state from the DOM ────────────────────
  const readTheme = () => page.eval(`(() => {
    const html = document.documentElement;
    const cs = getComputedStyle(html);
    const body = getComputedStyle(document.body);
    const main = document.querySelector('main');
    return {
      cls: html.className,
      isDark: html.classList.contains('dark'),
      bg: cs.getPropertyValue('--background').trim(),
      surface: cs.getPropertyValue('--surface').trim(),
      rule: cs.getPropertyValue('--rule').trim(),
      brand: cs.getPropertyValue('--brand').trim(),
      bodyBg: body.backgroundColor,
      mainBg: main ? getComputedStyle(main).backgroundColor : null,
      colorScheme: cs.colorScheme,
      toggleLabels: [...document.querySelectorAll('button[aria-label*="theme"]')]
        .map(b => b.getAttribute('aria-label')),
    };
  })()`);

  const light = await readTheme();
  console.log("\n[light]", JSON.stringify(light, null, 2));
  check("starts light (no .dark on <html>)", !light.isDark, light.cls);
  check("toggle is present in the sidebar", light.toggleLabels.length > 0,
    `${light.toggleLabels.length} found`);
  check("light --surface is the white sheet", isWhite(light.surface), light.surface);
  check("light color-scheme is light", light.colorScheme === "light", light.colorScheme);

  // ── click the toggle ───────────────────────────────────────────────────────
  const clicked = await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button[aria-label*="theme"]')]
      .find(b => b.offsetParent !== null);
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  check("clicked a visible theme toggle", clicked);
  await sleep(600);

  const dark = await readTheme();
  console.log("\n[dark]", JSON.stringify(dark, null, 2));
  check("class flipped to .dark", dark.isDark, dark.cls);
  check("--surface re-derived (not white)", !isWhite(dark.surface), dark.surface);
  check("--background darkens below --surface",
    dark.bg !== light.bg && dark.bg !== dark.surface, `bg=${dark.bg} surface=${dark.surface}`);
  check("--rule re-derived for dark", dark.rule !== light.rule, `${light.rule} -> ${dark.rule}`);
  check("--brand lifted for dark", dark.brand !== light.brand, `${light.brand} -> ${dark.brand}`);
  check("color-scheme follows to dark", dark.colorScheme === "dark", dark.colorScheme);

  // The real proof: the rendered sheet actually repainted, not just a var.
  check("main sheet repainted to a dark colour",
    dark.mainBg !== light.mainBg, `${light.mainBg} -> ${dark.mainBg}`);
  const parsed = (String(dark.mainBg ?? "").match(/\d+/g) || []).map(Number);
  const lum = parsed.length >= 3 ? (parsed[0] + parsed[1] + parsed[2]) / 3 : 255;
  check("main sheet is genuinely dark (mean RGB < 80)", lum < 80, `mean=${lum.toFixed(1)}`);
  check("toggle label now offers light",
    dark.toggleLabels.some((l) => /light/i.test(l)), dark.toggleLabels.join(" | "));

  // ── persistence across a reload ────────────────────────────────────────────
  const stored = await page.eval("localStorage.getItem('theme')");
  check("theme written to localStorage", stored === "dark", String(stored));

  await page.goto(`${BASE}${url}`);
  // Same reason as the first load: wait for the shell before reading colours.
  await page.eval(`(() => new Promise((resolve) => {
    const ready = () => !!document.querySelector('main')
      && document.querySelectorAll('button[aria-label*="theme"]').length > 0;
    if (ready()) return resolve(true);
    const t = setInterval(() => { if (ready()) { clearInterval(t); resolve(true); } }, 100);
    setTimeout(() => { clearInterval(t); resolve(false); }, 20000);
  }))`);
  await sleep(800);
  const afterReload = await readTheme();
  check("dark survives a reload", afterReload.isDark, afterReload.cls);
  check("no flash of light surface after reload",
    norm(afterReload.mainBg) === norm(dark.mainBg), `${afterReload.mainBg} vs ${dark.mainBg}`);

  // ── print still renders light ──────────────────────────────────────────────
  await page.send("Emulation.setEmulatedMedia", { media: "print" });
  await sleep(500);
  const printed = await page.eval(`(() => {
    const cs = getComputedStyle(document.documentElement);
    const main = document.querySelector('main');
    return {
      bg: cs.getPropertyValue('--background').trim(),
      surface: cs.getPropertyValue('--surface').trim(),
      colorScheme: cs.colorScheme,
      mainBg: main ? getComputedStyle(main).backgroundColor : null,
    };
  })()`);
  console.log("\n[print, while dark]", JSON.stringify(printed, null, 2));
  check("printed --background is white even while dark", isWhite(printed.bg), printed.bg);
  check("printed --surface is white even while dark", isWhite(printed.surface), printed.surface);
  check("printed color-scheme is light", printed.colorScheme === "light", printed.colorScheme);
  check("printed main is white", printed.mainBg === "rgb(255, 255, 255)", String(printed.mainBg));
  await page.send("Emulation.setEmulatedMedia", { media: "" });

  // ── back to light ──────────────────────────────────────────────────────────
  const clickedBack = await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button[aria-label*="theme"]')]
      .find(b => b.offsetParent !== null);
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  check("clicked toggle again", clickedBack);
  await sleep(700);
  const back = await readTheme();
  check("toggles back to light", !back.isDark, back.cls);
  check("light values restored", norm(back.surface) === norm(light.surface), back.surface);

  // ── the toggle is reachable at every width ─────────────────────────────────
  for (const [w, h] of [[1440, 900], [768, 900], [390, 844]]) {
    await page.setViewport({ width: w, height: h });
    await sleep(500);
    const reach = await page.eval(`(() => {
      const btns = [...document.querySelectorAll('button[aria-label*="theme"]')]
        .filter(b => b.offsetParent !== null);
      const b = btns[0];
      if (!b) return { visible: 0, inViewport: false };
      const r = b.getBoundingClientRect();
      return {
        visible: btns.length,
        inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      };
    })()`);
    check(`${w}px: a theme toggle is visible`, reach.visible > 0, `visible=${reach.visible}`);
    check(`${w}px: it sits inside the viewport`, reach.inViewport, JSON.stringify(reach.rect));
  }

  // Overflow regression: the shell must never scroll sideways at 390px.
  await page.setViewport({ width: 390, height: 844 });
  await sleep(500);
  const overflow = await page.eval(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  );
  check("no horizontal overflow at 390px", overflow <= 0, `overflow=${overflow}px`);
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
