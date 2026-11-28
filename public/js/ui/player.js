// Chaptered animation player. A scene is HTML whose elements declare when they appear:
//   data-at="2"            visible from chapter 2 onward
//   data-until="4"         hidden again from chapter 4
//   data-pos="1:20,30;3:70,60"  (cursor) left%,top% per chapter
//   data-click="2,3"       (cursor) press animation on these chapters
// The player behaves like a short looping video: play/pause, chapter scrubbing,
// autoplay only while on screen, and a static final frame for reduced motion.

import { esc, prefersReducedMotion } from "../core/util.js";
import { icon } from "./icons.js";
import { SCENES } from "./scenes.js";

const players = new WeakMap();

export function demo(sceneId, { size = "", label = "", compact = false } = {}) {
  const scene = SCENES[sceneId];
  if (!scene) return "";
  const chapters = scene.chapters;
  return (
    '<figure class="demo ' + size + (compact ? " compact" : "") + '" data-demo="' + esc(sceneId) + '" aria-label="' + esc(label || scene.label) + '" style="margin:0">' +
    '<div class="demo-stage" aria-hidden="true">' + scene.html + "</div>" +
    '<figcaption class="demo-bar">' +
    '<button class="demo-play" type="button" data-demo-toggle aria-label="Pause walkthrough">' + icon("pause") + "</button>" +
    '<div class="demo-caption" aria-live="polite"><b>01</b><span>' + esc(chapters[0]) + "</span></div>" +
    '<div class="demo-track">' + chapters.map((c, i) => '<button type="button" data-demo-step="' + (i + 1) + '" aria-label="Chapter ' + (i + 1) + ": " + esc(c) + '"><i></i></button>').join("") + "</div>" +
    "</figcaption></figure>"
  );
}

export function mountDemos(root) {
  root.querySelectorAll("[data-demo]").forEach((el) => {
    if (players.has(el)) return;
    players.set(el, new Player(el));
  });
}

export function demoController(el) {
  return players.get(el);
}

class Player {
  constructor(el) {
    this.el = el;
    this.scene = SCENES[el.getAttribute("data-demo")];
    this.count = this.scene.chapters.length;
    this.stepMs = this.scene.stepMs || 2800;
    this.step = 1;
    this.elapsed = 0;
    this.playing = !prefersReducedMotion();
    this.visible = false;
    this.last = 0;
    this.raf = 0;
    this.listeners = new Set();
    this.items = [...el.querySelectorAll("[data-at],[data-until]")];
    this.cursors = [...el.querySelectorAll("[data-pos]")];
    this.bars = [...el.querySelectorAll("[data-demo-step] i")];
    this.caption = el.querySelector(".demo-caption span");
    this.captionNum = el.querySelector(".demo-caption b");
    this.toggleBtn = el.querySelector("[data-demo-toggle]");

    this.toggleBtn.addEventListener("click", () => this.toggle());
    el.querySelectorAll("[data-demo-step]").forEach((b) =>
      b.addEventListener("click", () => this.seek(Number(b.getAttribute("data-demo-step")))));

    if (!this.playing) {
      this.step = this.count;
      this.toggleBtn.innerHTML = icon("play");
      this.toggleBtn.setAttribute("aria-label", "Play walkthrough");
    }
    this.render(true);
    this.paintProgress();

    if ("IntersectionObserver" in window) {
      this.io = new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        this.visible ? this.start() : this.stop();
      }, { threshold: 0.25 });
      this.io.observe(el);
    } else {
      this.visible = true;
      this.start();
    }
    document.addEventListener("visibilitychange", () => (document.hidden ? this.stop() : this.visible && this.start()));
  }

  onStep(fn) { this.listeners.add(fn); fn(this.step); }

  start() {
    if (!this.playing || this.raf || !this.el.isConnected) return;
    this.last = performance.now();
    const tick = (now) => {
      if (!this.el.isConnected) { this.stop(); if (this.io) this.io.disconnect(); return; }
      this.elapsed += now - this.last;
      this.last = now;
      if (this.elapsed >= this.stepMs) {
        this.elapsed = 0;
        this.step = this.step >= this.count ? 1 : this.step + 1;
        this.render(this.step === 1);
      }
      this.paintProgress();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  toggle() {
    this.playing = !this.playing;
    this.toggleBtn.innerHTML = this.playing ? icon("pause") : icon("play");
    this.toggleBtn.setAttribute("aria-label", this.playing ? "Pause walkthrough" : "Play walkthrough");
    if (this.playing) {
      if (this.step >= this.count && this.elapsed >= this.stepMs - 50) { this.step = 1; this.render(true); }
      this.start();
    } else {
      this.stop();
    }
  }

  seek(step) {
    this.step = Math.max(1, Math.min(this.count, step));
    this.elapsed = 0;
    this.render(true);
    this.paintProgress();
  }

  render(reset) {
    const s = this.step;
    if (reset) {
      // Jump without transitions when looping back so the scene resets cleanly.
      this.el.classList.add("no-anim");
      this.items.forEach((n) => n.style.transition = "none");
    }
    this.items.forEach((n) => {
      const at = Number(n.getAttribute("data-at") || 1);
      const until = Number(n.getAttribute("data-until") || 99);
      n.classList.toggle("on", s >= at && s < until);
    });
    this.cursors.forEach((c) => {
      const map = c.getAttribute("data-pos").split(";").map((p) => {
        const [k, xy] = p.split(":");
        const [x, y] = xy.split(",");
        return [Number(k), x, y];
      });
      let pos = map[0];
      map.forEach((m) => { if (m[0] <= s) pos = m; });
      c.style.left = pos[1] + "%";
      c.style.top = pos[2] + "%";
      const clicks = (c.getAttribute("data-click") || "").split(",").map(Number);
      if (clicks.includes(s)) {
        setTimeout(() => c.classList.add("click"), 850);
        setTimeout(() => c.classList.remove("click"), 1050);
      }
    });
    if (reset) {
      void this.el.offsetWidth;
      this.items.forEach((n) => n.style.transition = "");
      this.el.classList.remove("no-anim");
      // Re-apply on the next frame so elements visible at this step animate in.
      if (s === 1 && this.playing) {
        this.items.forEach((n) => n.classList.remove("on"));
        requestAnimationFrame(() => this.items.forEach((n) => {
          const at = Number(n.getAttribute("data-at") || 1);
          const until = Number(n.getAttribute("data-until") || 99);
          n.classList.toggle("on", s >= at && s < until);
        }));
      }
    }
    this.caption.textContent = this.scene.chapters[s - 1];
    this.captionNum.textContent = String(s).padStart(2, "0");
    this.listeners.forEach((fn) => fn(s));
  }

  paintProgress() {
    const frac = this.playing ? Math.min(1, this.elapsed / this.stepMs) : 1;
    this.bars.forEach((bar, i) => {
      const idx = i + 1;
      bar.style.width = idx < this.step ? "100%" : idx === this.step ? Math.round(frac * 100) + "%" : "0%";
    });
  }
}
