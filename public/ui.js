// Shared page helpers: theme storage and locking the page behind a modal.

export const STORE_KEY = "doviz-faiz-settings";

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    // private mode: settings live for this page view only
  }
}

/** "light" | "dark" pins the theme; anything else follows the system. */
export function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

// iOS Safari ignores overflow:hidden on body, so pin the page with position:fixed while a modal is open.
let lockedScrollY = 0;
const blockScroll = (e) => e.preventDefault();

export function lockPage() {
  lockedScrollY = window.scrollY;
  document.documentElement.classList.add("modal-open");
  Object.assign(document.body.style, { position: "fixed", top: `-${lockedScrollY}px`, left: "0", right: "0", width: "100%" });
  document.addEventListener("touchmove", blockScroll, { passive: false });
}

export function unlockPage() {
  document.documentElement.classList.remove("modal-open");
  Object.assign(document.body.style, { position: "", top: "", left: "", right: "", width: "" });
  document.removeEventListener("touchmove", blockScroll);
  window.scrollTo(0, lockedScrollY);
}

/** Opens `dialog` from `button` with the page locked; closes on backdrop click. */
export function setupModal(button, dialog, onOpen) {
  button.addEventListener("click", () => {
    onOpen?.();
    lockPage();
    dialog.showModal();
  });
  dialog.addEventListener("close", unlockPage);
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}

// ---- Sidebar (shadcn/ui Sidebar look: fixed on desktop, collapsible to icons; sheet drawer on small screens) ----

// Lucide icons (ISC licence), the icon set shadcn/ui uses.
const icon = (paths) =>
  `<svg class="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  fx: icon('<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>'), // chart-line
  gold: icon('<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>'), // coins
  settings: icon('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  stats: icon('<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>'), // chart-column
  panel: icon('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>'), // panel-left
  logo: icon('<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>'),
};

// Kept apart from the settings object so saving settings never resets it.
const SIDEBAR_KEY = "doviz-faiz-sidebar-collapsed";
const readFlag = (k) => {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const writeFlag = (k, on) => {
  try {
    localStorage.setItem(k, on ? "1" : "0");
  } catch {
    // ignore: private mode
  }
};

const NAV = [
  { id: "fx", href: "/", label: "Döviz & Faiz", short: "Döviz", icon: ICONS.fx },
  { id: "gold", href: "altin.html", label: "Altın", icon: ICONS.gold },
  { id: "stats", href: "istatistik.html", label: "İstatistik", icon: ICONS.stats },
];

/** Builds the desktop sidebar and the mobile tab bar. `active` is the current page id ("fx" | "gold"). */
export function setupSidebar(active) {
  if (readFlag(SIDEBAR_KEY)) document.documentElement.classList.add("sb-collapsed");

  const items = NAV.map(
    (n) => `<li><a href="${n.href}" class="sb-item${n.id === active ? " active" : ""}" ${n.id === active ? 'aria-current="page"' : ""} title="${n.label}">${n.icon}<span>${n.label}</span></a></li>`,
  ).join("");
  const aside = document.createElement("aside");
  aside.className = "sidebar";
  aside.id = "sidebar";
  aside.setAttribute("aria-label", "Ana menü");
  aside.innerHTML = `
    <div class="sb-header">
      <a href="/" class="sb-brand" title="Tuğrul Tale"><span class="sb-logo">${ICONS.logo}</span><span>Tuğrul Tale</span></a>
    </div>
    <nav class="sb-content">
      <div class="sb-group-label">Sayfalar</div>
      <ul class="sb-menu">${items}</ul>
    </nav>
    <div class="sb-footer">
      <button type="button" class="sb-item sb-collapse" data-sb-collapse title="Menüyü daralt">${ICONS.panel}<span>Daralt</span></button>
      <p class="sb-note">Kaynak: TCMB EVDS</p>
    </div>`;
  document.body.prepend(aside);
  setupPullToRefresh();

  // Phones and tablets: floating "liquid glass" tab bar at the bottom instead of the sidebar.
  const tabbar = document.createElement("nav");
  tabbar.className = "tabbar";
  tabbar.setAttribute("aria-label", "Alt menü");
  tabbar.innerHTML =
    NAV.map(
      (n) => `<a href="${n.href}" class="tab${n.id === active ? " active" : ""}" ${n.id === active ? 'aria-current="page"' : ""}>${n.icon}<span>${n.short ?? n.label}</span></a>`,
    ).join("");
  document.body.append(tabbar);
  setupTabBlob(tabbar);

  aside.querySelector("[data-sb-collapse]").addEventListener("click", () => {
    writeFlag(SIDEBAR_KEY, document.documentElement.classList.toggle("sb-collapsed"));
    window.dispatchEvent(new Event("resize")); // let charts fit the new width
  });
}

// ---- Pull to refresh (phones) ----
// Works the same in Safari, Chrome and home-screen apps, where the browser's own gesture may be missing.

const PTR_TRIGGER = 72; // px of pull needed to reload

export function setupPullToRefresh() {
  if (!matchMedia("(pointer: coarse)").matches) return;
  const el = document.createElement("div");
  el.className = "ptr";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = icon('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>');
  document.body.append(el);

  let startY = null;
  let pull = 0;
  const busy = () => document.documentElement.classList.contains("modal-open") || document.querySelector("dialog[open]");
  const show = (px) => {
    const p = Math.min(px / PTR_TRIGGER, 1);
    el.style.transform = `translate(-50%, ${Math.min(px, PTR_TRIGGER * 1.4) - 48}px) rotate(${p * 270}deg)`;
    el.style.opacity = String(Math.min(p * 1.2, 1));
    el.classList.toggle("ready", px >= PTR_TRIGGER);
  };
  const reset = () => {
    startY = null;
    pull = 0;
    el.classList.add("settle");
    el.style.transform = "";
    el.style.opacity = "0";
    el.classList.remove("ready");
  };

  document.addEventListener(
    "touchstart",
    (e) => {
      if (window.scrollY > 0 || e.touches.length > 1 || busy()) return;
      startY = e.touches[0].clientY;
      el.classList.remove("settle");
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        if (pull) reset();
        return;
      }
      pull = dy * 0.55; // resistance, like a native pull
      show(pull);
    },
    { passive: true },
  );
  document.addEventListener("touchend", () => {
    if (startY == null) return;
    if (pull >= PTR_TRIGGER) {
      el.classList.add("spin");
      location.reload();
    } else reset();
  });
}

// ---- Tab bar "liquid drop": the active pill slides between tabs, stretching like a drop ----

const TAB_FROM_KEY = "doviz-faiz-tab-from";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades the page in after a tab change. Pages call it once their data is drawn,
 * so the fade does not compete with chart drawing and the content does not pop in later.
 */
export function revealPage() {
  const root = document.documentElement;
  if (!root.classList.contains("page-enter")) return;
  // Two frames: let the browser paint the new content before the fade starts.
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("page-enter")));
}

function setupTabBlob(tabbar) {
  const tabs = [...tabbar.querySelectorAll(".tab")];
  const activeIndex = tabs.findIndex((t) => t.classList.contains("active"));
  if (activeIndex < 0) return;
  const blob = document.createElement("span");
  blob.className = "tab-blob";
  tabbar.prepend(blob);

  const rect = (i) => ({ x: tabs[i].offsetLeft, w: tabs[i].offsetWidth });
  const place = (i) => {
    const r = rect(i);
    blob.style.transform = `translateX(${r.x}px)`;
    blob.style.width = `${r.w}px`;
  };

  /** Moves the drop from tab `from` to tab `to`: stretch over both, then pull in with a small overshoot. */
  const slide = (from, to, duration = 460) => {
    const a = rect(from);
    const b = rect(to);
    const left = Math.min(a.x, b.x);
    const span = Math.max(a.x + a.w, b.x + b.w) - left;
    const overshoot = (b.x - a.x) * 0.06;
    return blob.animate(
      [
        { transform: `translateX(${a.x}px) scaleY(1)`, width: `${a.w}px` },
        { transform: `translateX(${left}px) scaleY(0.86)`, width: `${span}px`, offset: 0.45 },
        { transform: `translateX(${b.x + overshoot}px) scaleY(1.04)`, width: `${b.w}px`, offset: 0.8 },
        { transform: `translateX(${b.x}px) scaleY(1)`, width: `${b.w}px` },
      ],
      { duration, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)" },
    );
  };

  place(activeIndex);
  requestAnimationFrame(() => blob.classList.add("ready"));
  setTimeout(revealPage, 1500); // slow data: show the page with its loading state

  // Arrived from another tab: finish the slide that started on the previous page.
  let from = null;
  try {
    from = sessionStorage.getItem(TAB_FROM_KEY);
    sessionStorage.removeItem(TAB_FROM_KEY);
  } catch {
    // storage blocked: no carry-over animation
  }
  if (from != null && Number(from) !== activeIndex && tabs[Number(from)] && !reducedMotion()) {
    slide(Number(from), activeIndex, 380);
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", (e) => {
      if (i === activeIndex || reducedMotion() || !tab.href) return;
      e.preventDefault();
      try {
        sessionStorage.setItem(TAB_FROM_KEY, String(activeIndex));
      } catch {
        // ignore
      }
      tabs[activeIndex].classList.remove("active");
      tab.classList.add("active");
      document.documentElement.classList.add("page-leave");
      place(i); // the end state, so the drop does not jump back before the next page shows
      let gone = false;
      const go = () => {
        if (!gone) location.href = tab.href;
        gone = true;
      };
      slide(activeIndex, i, 300).onfinish = go;
      setTimeout(go, 400); // safety net if the animation does not finish
    });
  });
  // Back button from the next page (back-forward cache): show this page's own tab again.
  addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    document.documentElement.classList.remove("page-leave", "page-enter");
    tabs.forEach((t, i) => t.classList.toggle("active", i === activeIndex));
    place(activeIndex);
  });
  addEventListener("resize", () => place(tabs.findIndex((t) => t.classList.contains("active"))));
}
