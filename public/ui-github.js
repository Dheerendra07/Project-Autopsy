(function () {
  "use strict";

  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  function makePreviewGrid() {
    var grid = document.getElementById("activityPreviewGrid");
    var months = document.getElementById("activityPreviewMonths");
    if (!grid || !months) return;

    var cells = "";
    var monthLabels = "";
    var date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay() - 52 * 7);

    for (var week = 0; week < 53; week += 1) {
      var start = new Date(date);
      start.setDate(date.getDate() + week * 7);
      for (var day = 0; day < 7; day += 1) {
        var d = new Date(start);
        d.setDate(start.getDate() + day);
        if (d.getDate() === 1) {
          monthLabels += '<span style="grid-column:' + (week + 1) + '">' +
            d.toLocaleDateString("en", { month: "short" }) + "</span>";
        }

        /* Deterministic display-only texture, never presented as imported evidence. */
        var seed = (week * 19 + day * 31 + (week % 5) * 7) % 17;
        var level = d > new Date() ? 0 : seed < 5 ? 0 : seed < 9 ? 1 : seed < 13 ? 2 : seed < 16 ? 3 : 4;
        cells += '<span class="pa-preview-cell" data-level="' + level + '"></span>';
      }
    }
    months.innerHTML = monthLabels;
    grid.innerHTML = cells;
  }

  function mountCat() {
    var hero = document.querySelector(".pa-hero");
    var target = document.querySelector(".pa-hero-console");
    if (!hero || !target || hero.querySelector(".pa-cat-companion")) return;

    var cat = document.createElement("div");
    cat.className = "pa-cat-companion";
    cat.setAttribute("aria-hidden", "true");
    cat.innerHTML =
      '<svg viewBox="0 0 64 64" role="presentation">' +
        '<path class="cat-tail" d="M13 40 C4 43 5 54 13 55 C19 56 21 50 18 46"/>' +
        '<path class="cat-head" d="M15 24 L13 9 Q12 5 17 8 L27 15 Q32 13 37 15 L47 8 Q52 5 51 10 L49 25 Q54 31 51 41 Q47 54 32 54 Q17 54 13 41 Q10 31 15 24Z"/>' +
        '<path class="cat-ear-inner" d="M17 13 L25 19 L18 22Z M46 13 L39 19 L46 22Z"/>' +
        '<ellipse class="cat-eye" cx="24" cy="31" rx="2.2" ry="3.1"/>' +
        '<ellipse class="cat-eye" cx="40" cy="31" rx="2.2" ry="3.1"/>' +
        '<path class="cat-nose" d="M29 38 Q32 35 35 38 Q32 42 29 38Z"/>' +
        '<path class="cat-whisker" d="M26 39 L11 36 M26 42 L12 44 M38 39 L53 36 M38 42 L52 44"/>' +
        '<path d="M29 43 Q32 46 35 43" fill="none" stroke="#568562" stroke-width="1.5" stroke-linecap="round"/>' +
      "</svg>";
    target.appendChild(cat);

    if (reducedMotion || coarsePointer) return;

    var frame = 0;
    var bounds = null;
    function move(event) {
      if (!bounds) bounds = hero.getBoundingClientRect();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function () {
        var x = event.clientX - bounds.left;
        var y = event.clientY - bounds.top;
        var cx = bounds.width * 0.5;
        var cy = bounds.height * 0.45;
        var dx = Math.max(-1, Math.min(1, (x - cx) / Math.max(cx, 1)));
        var dy = Math.max(-1, Math.min(1, (y - cy) / Math.max(cy, 1)));
        var targetX = Math.max(-9, Math.min(9, dx * 8));
        var targetY = Math.max(-7, Math.min(7, dy * 6));
        var tilt = Math.max(-8, Math.min(8, dx * 6));
        cat.style.setProperty("--cat-x", targetX.toFixed(1) + "px");
        cat.style.setProperty("--cat-y", targetY.toFixed(1) + "px");
        cat.style.setProperty("--cat-tilt", tilt.toFixed(1) + "deg");
        cat.style.setProperty("--look-x", (dx * 1.5).toFixed(1) + "px");
        cat.style.setProperty("--look-y", (dy * 1.2).toFixed(1) + "px");
        cat.classList.add("is-active");
      });
    }
    function reset() {
      bounds = null;
      cat.style.setProperty("--cat-x", "0px");
      cat.style.setProperty("--cat-y", "0px");
      cat.style.setProperty("--cat-tilt", "0deg");
      cat.style.setProperty("--look-x", "0px");
      cat.style.setProperty("--look-y", "0px");
      cat.classList.remove("is-active");
    }
    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", reset, { passive: true });
    window.addEventListener("resize", function () { bounds = null; }, { passive: true });
  }

  function applyActivityRange(days, root) {
    var scope = root || document;
    var cells = Array.prototype.slice.call(scope.querySelectorAll(".pa-activity-cell[data-activity-cell]"));
    if (!cells.length) return;

    var commits = 0;
    var activeDays = 0;
    cells.forEach(function (cell) {
      var inRange = Number(cell.getAttribute("data-activity-age")) < days;
      var count = Number(cell.getAttribute("data-activity-count")) || 0;
      cell.classList.toggle("is-muted", !inRange);
      if (inRange && count > 0) {
        commits += count;
        activeDays += 1;
      }
    });

    var countNode = scope.querySelector(".pa-activity-count");
    var daysNode = scope.querySelector(".pa-activity-days");
    if (countNode) countNode.textContent = new Intl.NumberFormat("en-IN").format(commits);
    if (daysNode) daysNode.textContent = new Intl.NumberFormat("en-IN").format(activeDays);

    scope.querySelectorAll("[data-activity-range]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(Number(button.getAttribute("data-activity-range")) === days));
    });
  }

  function focusActivityCell(cell) {
    if (!cell) return;
    var grid = cell.closest(".pa-activity-grid");
    if (!grid) return;
    grid.querySelectorAll("[data-activity-cell]").forEach(function (item) {
      item.tabIndex = item === cell ? 0 : -1;
    });
    cell.focus();
  }

  document.addEventListener("click", function (event) {
    var rangeButton = event.target.closest("[data-activity-range]");
    if (rangeButton) {
      var card = rangeButton.closest(".pa-activity-card");
      applyActivityRange(Number(rangeButton.getAttribute("data-activity-range")) || 365, card || document);
    }
  });

  document.addEventListener("keydown", function (event) {
    var cell = event.target.closest && event.target.closest("[data-activity-cell]");
    if (!cell) return;
    var delta = 0;
    if (event.key === "ArrowUp") delta = -1;
    else if (event.key === "ArrowDown") delta = 1;
    else if (event.key === "ArrowLeft") delta = -7;
    else if (event.key === "ArrowRight") delta = 7;
    if (!delta) return;

    var grid = cell.closest(".pa-activity-grid");
    var cells = grid ? Array.prototype.slice.call(grid.querySelectorAll("[data-activity-cell]")) : [];
    var index = cells.indexOf(cell);
    if (index < 0) return;
    event.preventDefault();
    focusActivityCell(cells[Math.max(0, Math.min(cells.length - 1, index + delta))]);
  });

  function initialiseWorkspaceHeatmap() {
    var card = document.querySelector("#root .pa-activity-card");
    if (!card || card.getAttribute("data-activity-ready") === "true") return;
    card.setAttribute("data-activity-ready", "true");
    applyActivityRange(365, card);
  }

  function observeWorkspace() {
    var root = document.getElementById("root");
    if (!root || !window.MutationObserver) return;
    var observer = new MutationObserver(function () {
      initialiseWorkspaceHeatmap();
    });
    observer.observe(root, { childList: true, subtree: true });
    initialiseWorkspaceHeatmap();
  }

  function init() {
    makePreviewGrid();
    mountCat();
    observeWorkspace();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();