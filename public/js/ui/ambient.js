// Ambient canvas behind every page: slow drifting color, grid lines revealed around
// the pointer, occasional grid cells that light up, and a spotlight that follows the
// pointer across interactive cards. Pointer effects are mouse-only; motion respects
// prefers-reduced-motion. Nothing here affects layout or reads application data.

import { prefersReducedMotion } from "../core/util.js";

const SPOT_SELECTOR = ".phase-tile, .project-card, .step-card, .principle, .health, .import-card, .auth-card, a.card.pad, .pager a";
const CELL = 40;

export function mountAmbient() {
  if (document.querySelector(".ambient")) return;
  const layer = document.createElement("div");
  layer.className = "ambient";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = '<i class="ambient-orb o1"></i><i class="ambient-orb o2"></i><i class="ambient-orb o3"></i><div class="ambient-wash"></div><div class="ambient-grid"></div>';
  document.body.insertBefore(layer, document.body.firstChild);

  const finePointer = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduced = prefersReducedMotion();

  if (finePointer) {
    let x = -1000, y = -1000, frame = 0, idle = 0;
    const paint = () => {
      frame = 0;
      layer.style.setProperty("--mx", x + "px");
      layer.style.setProperty("--my", y + "px");
    };
    window.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      x = event.clientX;
      y = event.clientY;
      layer.classList.add("live");
      clearTimeout(idle);
      idle = setTimeout(() => layer.classList.remove("live"), 2600);
      if (!frame) frame = requestAnimationFrame(paint);

      const card = event.target.closest && event.target.closest(SPOT_SELECTOR);
      if (card) {
        if (!card.classList.contains("spot")) card.classList.add("spot");
        const r = card.getBoundingClientRect();
        card.style.setProperty("--sx", (event.clientX - r.left) + "px");
        card.style.setProperty("--sy", (event.clientY - r.top) + "px");
      }
    }, { passive: true });
    document.addEventListener("pointerleave", () => layer.classList.remove("live"));
    window.addEventListener("blur", () => layer.classList.remove("live"));
  }

  // A few grid cells light up and fade, aligned to the 40px grid.
  if (!reduced) {
    const pulse = () => {
      if (document.hidden || layer.querySelectorAll(".ambient-cell").length >= 5) return;
      const cols = Math.ceil(window.innerWidth / CELL);
      const rows = Math.ceil(window.innerHeight / CELL);
      const cell = document.createElement("span");
      cell.className = "ambient-cell";
      cell.style.left = Math.floor(Math.random() * cols) * CELL - 1 + "px";
      cell.style.top = Math.floor(Math.random() * rows) * CELL - 1 + "px";
      cell.addEventListener("animationend", () => cell.remove(), { once: true });
      layer.appendChild(cell);
    };
    setInterval(pulse, 1400);
  }
}
