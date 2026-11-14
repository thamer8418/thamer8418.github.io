/* ==========================================================================
   gallery.js — معرض بصفوف متناسقة يحافظ على أبعاد كل صورة الأصلية،
   مع "صفحات مزدوجة" للصور المميّزة (feature) وتحميل كسول وعارض بملء الشاشة.
   الاستخدام: Gallery.mount(عنصر, قائمة_الصور)
   ========================================================================== */
(function () {
  "use strict";

  function metrics(width) {
    var gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 10;
    var target;
    if (width < 560) target = width * 0.62;
    else if (width < 1000) target = width * 0.36;
    else target = Math.min(470, Math.max(300, width * 0.27));
    return { gap: gap, target: target, featureMax: Math.min(innerHeight * 0.86, width * 0.9) };
  }

  function buildRows(list, width) {
    var m = metrics(width), rows = [], row = [], sum = 0;
    function flush(last) {
      if (!row.length) return;
      var h = (width - m.gap * (row.length - 1)) / sum;
      if (last) h = Math.min(h, m.target * 1.1);
      rows.push({ items: row, height: h, last: !!last });
      row = []; sum = 0;
    }
    list.forEach(function (p) {
      var r = p.w / p.h;
      if (p.feature && width >= 560) {
        flush(false);
        rows.push({ items: [p], height: Math.min(m.featureMax, width / r), feature: true });
        return;
      }
      var hWith = (width - m.gap * row.length) / (sum + r);
      var hWithout = row.length ? (width - m.gap * (row.length - 1)) / sum : Infinity;
      if (row.length && hWith < m.target && Math.abs(hWithout - m.target) < Math.abs(hWith - m.target)) flush(false);
      row.push(p); sum += r;
      if ((width - m.gap * (row.length - 1)) / sum <= m.target) flush(false);
    });
    flush(true);
    return rows;
  }

  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.filter(function (e) { return e.isIntersecting; }).forEach(function (e, k) {
      var el = e.target;
      el.style.transitionDelay = Math.min(k * 70, 420) + "ms";
      el.classList.add("is-in");
      setTimeout(function () { el.style.transitionDelay = ""; }, 1600);
      io.unobserve(el);
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.01 }) : null;

  function mount(el, items) {
    var state = { width: 0 };

    function render() {
      var width = Math.floor(el.getBoundingClientRect().width);
      if (!width) return;
      state.width = width;
      el.innerHTML = "";
      if (!items.length) { el.innerHTML = '<p class="empty-note">لا توجد صور هنا بعد.</p>'; return; }

      var frag = document.createDocumentFragment(), index = 0;
      buildRows(items, width).forEach(function (row, ri) {
        var rowEl = document.createElement("div");
        rowEl.className = "gallery-row" + (row.feature ? " is-feature" : "") + (row.last ? " is-last" : "");
        row.items.forEach(function (p) {
          var w = Math.floor(row.height * p.w / p.h * 100) / 100, h = Math.round(row.height * 100) / 100;
          var s = Site.sources(p), i = index++;
          var tile = document.createElement("a");
          tile.className = "tile";
          tile.href = s.largest;
          tile.setAttribute("data-index", i);
          tile.setAttribute("aria-label", (p.title || "صورة") + " — عرض بملء الشاشة");
          tile.style.width = w + "px"; tile.style.height = h + "px";
          if (p.color) tile.style.setProperty("--ph", p.color);

          var img = document.createElement("img");
          img.alt = p.alt || p.title || "";
          img.width = Math.round(w); img.height = Math.round(h);
          img.decoding = "async";
          img.loading = ri < 2 ? "eager" : "lazy";
          if (ri === 0) img.setAttribute("fetchpriority", "high");
          if (s.srcset) { img.srcset = s.srcset; img.sizes = Math.ceil(w) + "px"; }
          img.src = s.src;
          var done = function () { img.classList.add("is-loaded"); };
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          tile.appendChild(img);

          var cap = document.createElement("span");
          cap.className = "tile-cap";
          cap.innerHTML = '<span class="t"></span><span class="n"></span>';
          cap.querySelector(".t").textContent = p.title || "";
          cap.querySelector(".n").textContent = Site.pad(i + 1);
          tile.appendChild(cap);
          rowEl.appendChild(tile);
        });
        frag.appendChild(rowEl);
      });
      el.appendChild(frag);
      el.querySelectorAll("img").forEach(function (img) { if (img.complete && img.naturalWidth) img.classList.add("is-loaded"); });
      el.querySelectorAll(".tile").forEach(function (t) { if (io) io.observe(t); else t.classList.add("is-in"); });
    }

    el.addEventListener("click", function (e) {
      var tile = e.target.closest(".tile");
      if (!tile || !window.Lightbox || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      Lightbox.open(items, +tile.getAttribute("data-index"), tile);
    });

    var timer;
    addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { if (Math.floor(el.getBoundingClientRect().width) !== state.width) render(); }, 120);
    });
    render();
  }

  window.Gallery = { mount: mount };
})();
