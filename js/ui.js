export const SVG_EYE     = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
export const SVG_EYE_OFF = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
export const SVG_TRASH   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

export function openModal(id)  { document.getElementById(id).classList.add("open"); }
export function closeModal(id) { document.getElementById(id).classList.remove("open"); }
export function showError(el, msg) { el.textContent = msg; el.classList.remove("hidden"); }
export function clearError(el)     { el.textContent = ""; el.classList.add("hidden"); }

export function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
  document.querySelectorAll(".nav-item[data-view]").forEach(n => {
    n.classList.toggle("active", n.dataset.view === name);
  });
  const viewMap = {
    "setup":            "view-setup",
    "favorites":        "view-favorites",
    "nearly-completed": "view-nearly-completed",
    "browser":          "view-browser",
  };
  const id = viewMap[name];
  if (id) document.getElementById(id)?.classList.add("active-view");
}

export function pctClass(pct) {
  if (pct >= 99) return "pct-high";
  if (pct >= 90) return "pct-med";
  return "pct-low";
}

export function barColor(pct) {
  if (pct < 90) return "hsl(0,0%,50%)";
  const t   = Math.max(0, Math.min(1, (pct - 90) / 10));
  const lit = Math.round(50 + t * 20);
  const sat = Math.round(40 + t * 35);
  return `hsl(30,${sat}%,${lit}%)`;
}

export function rewardHtml(rewardStr) {
  return rewardStr
    .replace(/AP:(\d+)/g, '<img src="assets/AP.png" class="ap-icon" alt="AP"> $1')
    .replace(/MASTERY:([A-Za-z_]+)/g, (_, file) =>
      `<img src="assets/mastery/${file}.png" class="mastery-icon" alt="${file.replace(/_/g, " ")}">`
    )
    .replace(/\[([^\]]+)\]/g, '[<em>$1</em>]');
}