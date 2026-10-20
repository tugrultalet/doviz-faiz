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
      <a href="/" class="sb-brand" title="Döviz mi, faiz mi?"><span class="sb-logo">${ICONS.logo}</span><span>Döviz mi, faiz mi?</span></a>
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

  // Phones and tablets: floating "liquid glass" tab bar at the bottom instead of the sidebar.
  const tabbar = document.createElement("nav");
  tabbar.className = "tabbar";
  tabbar.setAttribute("aria-label", "Alt menü");
  tabbar.innerHTML =
    NAV.map(
      (n) => `<a href="${n.href}" class="tab${n.id === active ? " active" : ""}" ${n.id === active ? 'aria-current="page"' : ""}>${n.icon}<span>${n.short ?? n.label}</span></a>`,
    ).join("");
  document.body.append(tabbar);

  aside.querySelector("[data-sb-collapse]").addEventListener("click", () => {
    writeFlag(SIDEBAR_KEY, document.documentElement.classList.toggle("sb-collapsed"));
    window.dispatchEvent(new Event("resize")); // let charts fit the new width
  });
}
