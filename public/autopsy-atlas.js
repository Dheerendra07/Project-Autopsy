(function () {
  "use strict";

  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  function buildHeroMatrix() {
    var matrix = document.getElementById("atlasMatrix");
    if (!matrix || matrix.childElementCount) return;

    var fragment = document.createDocumentFragment();
    for (var index = 0; index < 72; index += 1) {
      var cell = document.createElement("span");
      var seed = (index * 13 + Math.floor(index / 12) * 7 + (index % 5) * 3) % 19;
      var level = seed < 4 ? 0 : seed < 8 ? 1 : seed < 12 ? 2 : seed < 16 ? 3 : seed < 18 ? 4 : 5;
      cell.className = "atlas-matrix-cell";
      cell.setAttribute("data-level", String(level));
      fragment.appendChild(cell);
    }
    matrix.appendChild(fragment);
  }

  function buildPreviewCalendar() {
    var grid = document.getElementById("activityPreviewGrid");
    var months = document.getElementById("activityPreviewMonths");
    if (!grid || !months || grid.childElementCount) return;

    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var first = new Date(now);
    first.setDate(first.getDate() - first.getDay() - 52 * 7);

    var cells = document.createDocumentFragment();
    var labels = document.createDocumentFragment();

    for (var week = 0; week < 53; week += 1) {
      var weekStart = new Date(first);
      weekStart.setDate(first.getDate() + week * 7);

      var monthAnchor = new Date(weekStart);
      if (monthAnchor.getDate() <= 7) {
        var month = document.createElement("span");
        month.style.gridColumn = String(week + 1);
        month.textContent = monthAnchor.toLocaleDateString("en", { month: "short" });
        labels.appendChild(month);
      }

      for (var day = 0; day < 7; day += 1) {
        var date = new Date(weekStart);
        date.setDate(weekStart.getDate() + day);

        var seed = (week * 19 + day * 31 + (week % 5) * 7) % 17;
        var level = date > now ? 0 : seed < 5 ? 0 : seed < 9 ? 1 : seed < 13 ? 2 : seed < 16 ? 3 : 4;
        var cell = document.createElement("span");
        cell.className = "pa-preview-cell";
        cell.setAttribute("data-level", String(level));
        cells.appendChild(cell);
      }
    }

    months.appendChild(labels);
    grid.appendChild(cells);
  }

  function mountAtlasMotion() {
    var board = document.querySelector(".atlas-board");
    var hero = document.querySelector(".pa-hero");
    if (!board || !hero || reducedMotion || coarsePointer) return;

    var frame = 0;
    var bounds = null;

    function onMove(event) {
      if (!bounds) bounds = board.getBoundingClientRect();
      var x = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
      var y = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
      var tiltX = Math.max(-1, Math.min(1, .5 - y));
      var tiltY = Math.max(-1, Math.min(1, x - .5));

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function () {
        board.style.setProperty("--atlas-rx", (tiltX * 2.4 + 1.2).toFixed(2) + "deg");
        board.style.setProperty("--atlas-ry", (tiltY * 4.8 - 1.8).toFixed(2) + "deg");
      });
    }

    function reset() {
      bounds = null;
      cancelAnimationFrame(frame);
      board.style.removeProperty("--atlas-rx");
      board.style.removeProperty("--atlas-ry");
    }

    board.addEventListener("pointermove", onMove, { passive: true });
    board.addEventListener("pointerleave", reset, { passive: true });
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
    var rangeButton = event.target.closest && event.target.closest("[data-activity-range]");
    if (!rangeButton) return;

    var card = rangeButton.closest(".pa-activity-card");
    applyActivityRange(Number(rangeButton.getAttribute("data-activity-range")) || 365, card || document);
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

  function keepActiveViewVisible() {
    var nav = document.getElementById("nav");
    if (!nav || !window.MutationObserver) return;

    var lastActive = null;
    var observer = new MutationObserver(function () {
      var active = nav.querySelector("button.active");
      if (!active || active === lastActive) return;
      lastActive = active;

      if (window.matchMedia && window.matchMedia("(max-width: 940px)").matches) {
        active.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest", inline: "center" });
      }
    });
    observer.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  function init() {
    buildHeroMatrix();
    buildPreviewCalendar();
    mountAtlasMotion();
    observeWorkspace();
    keepActiveViewVisible();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();