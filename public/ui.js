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
