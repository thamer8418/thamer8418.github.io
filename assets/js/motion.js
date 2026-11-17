/* ==========================================================================
   motion.js — الحركة والانتقالات (بدون مكتبات خارجية)
   · شاشة افتتاح بعدّاد (أول زيارة) وستارة بين الصفحات
   · تمرير ناعم بالعجلة (الكمبيوتر فقط) · شريط تقدّم · مؤشر مخصّص
   · ظهور العناوين كلمة كلمة · ظهور الصور كستارة · حركة الواجهة مع التمرير
   كل الحركة تتوقف لمن فعّل "تقليل الحركة" في جهازه.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  var SEEN = "ta-seen";

  function store() { try { return sessionStorage; } catch (e) { return null; } }

  /* ── شاشة الافتتاح / الستارة ───────────────────────────────────────────── */
  var loader = document.querySelector(".loader");
  var curtain = document.querySelector(".curtain");
  var countEl = document.querySelector(".loader-count");
  var barEl = document.querySelector(".loader-bar");
  var progress = 0, target = 0, lifted = false, started = performance.now();

  function ar(n) { return String(n).replace(/\d/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[d]; }); }

  function tickLoader() {
    if (lifted || !root.classList.contains("first-visit")) return;
    progress += (target - progress) * 0.08;
    if (target - progress < 0.4) progress = target;
    var p = Math.round(progress);
    if (countEl) countEl.textContent = ar(p);
    if (barEl) barEl.style.setProperty("--p", p / 100);
    if (p >= 100) return finishLift();
    requestAnimationFrame(tickLoader);
  }
  // تقدّم تقريبي: يتحرك وحده حتى ٨٥ ثم يكتمل عند الجاهزية
  var creep = setInterval(function () { if (target < 85) target += 3 + Math.random() * 6; }, 120);
  if (root.classList.contains("first-visit")) requestAnimationFrame(tickLoader);

  var readyToLift = false;
  function lift() {
    readyToLift = true;
    clearInterval(creep);
    if (root.classList.contains("first-visit")) {
      var wait = Math.max(0, 1300 - (performance.now() - started));   // حد أدنى لمدة العرض
      setTimeout(function () { target = 100; }, wait);
    } else finishLift();
  }
  function finishLift() {
    if (lifted) return; lifted = true;
    var el = root.classList.contains("first-visit") ? loader : curtain;
    var s = store(); if (s) try { s.setItem(SEEN, "1"); } catch (e) {}
    if (!el) { start(); return; }
    el.classList.add("is-done");
    setTimeout(start, root.classList.contains("first-visit") ? 450 : 200);
    setTimeout(function () { root.classList.remove("first-visit", "via-curtain"); el.classList.remove("is-done"); }, 1300);
  }
  // أمان: لا تبقى الشاشة أكثر من ٥ ثوانٍ
  setTimeout(function () { if (!readyToLift) lift(); }, 5000);

  /* بدء الحركات بعد رفع الستارة */
  var startQueue = [], hasStarted = false;
  function start() {
    hasStarted = true;
    document.dispatchEvent(new CustomEvent("motion:start"));
    startQueue.splice(0).forEach(function (f) { f(); });
  }
  function onStart(f) { if (hasStarted) f(); else startQueue.push(f); }

  /* ── ستارة عند الانتقال لصفحة أخرى ─────────────────────────────────────── */
  if (!reduce && curtain) {
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (a.target === "_blank" || a.hasAttribute("download") || a.closest(".gallery")) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (/\.(jpe?g|webp|png|avif)$/i.test(url.pathname)) return;
      e.preventDefault();
      curtain.classList.remove("is-done");
      curtain.classList.add("is-covering");
      setTimeout(function () { location.href = url.href; }, 650);
    });
    addEventListener("pageshow", function (e) { if (e.persisted) curtain.classList.remove("is-covering"); });
  }

  /* ── تمرير ناعم بالعجلة (الكمبيوتر فقط) ────────────────────────────────── */
  var smooth = { y: scrollY, target: scrollY, running: false };
  function maxScroll() { return document.documentElement.scrollHeight - innerHeight; }
  function blocked(e) {
    return document.body.classList.contains("lb-lock") || root.classList.contains("is-locked") ||
      root.classList.contains("first-visit") || root.classList.contains("via-curtain") ||
      (e && e.target.closest && e.target.closest("textarea, select, .lightbox, .gate"));
  }
  function smoothLoop() {
    smooth.y += (smooth.target - smooth.y) * 0.1;
    if (Math.abs(smooth.target - smooth.y) < 0.5) { smooth.y = smooth.target; smooth.running = false; }
    scrollTo(0, smooth.y);
    if (smooth.running) requestAnimationFrame(smoothLoop);
  }
  if (fine && !reduce) {
    addEventListener("wheel", function (e) {
      if (e.ctrlKey || blocked(e) || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (!smooth.running) smooth.y = scrollY;
      var d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      smooth.target = Math.max(0, Math.min(maxScroll(), (smooth.running ? smooth.target : scrollY) + d));
      if (!smooth.running) { smooth.running = true; requestAnimationFrame(smoothLoop); }
    }, { passive: false });
    addEventListener("scroll", function () { if (!smooth.running) { smooth.y = smooth.target = scrollY; } }, { passive: true });
  }

  /* ── شريط التقدّم ───────────────────────────────────────────────────────── */
  var bar = document.createElement("div");
  bar.className = "progress-bar";
  document.body.appendChild(bar);

  /* ── حركة مرتبطة بالتمرير: الواجهة + التوازي ───────────────────────────── */
  var hero = document.querySelector("[data-hero]");
  var heroMedia = hero && hero.querySelector(".hero-media");
  var heroContent = hero && hero.querySelector(".hero-content");
  var heroScroll = hero && hero.querySelector(".hero-scroll");
  var parallax = [];
  var ticking = false;
  function onScroll() {
    var y = scrollY, h = innerHeight;
    var max = maxScroll();
    bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0) + ")";
    if (hero && !reduce && y < h * 1.2) {
      var k = y / h;
      heroMedia.style.transform = "translate3d(0," + (y * 0.32) + "px,0) scale(" + (1 + k * 0.08) + ")";
      heroContent.style.transform = "translate3d(0," + (y * 0.18) + "px,0)";
      heroContent.style.opacity = String(Math.max(0, 1 - k * 1.25));
      if (heroScroll) heroScroll.style.opacity = String(Math.max(0, 1 - k * 4));
    }
    if (!reduce) parallax.forEach(function (p) {
      var r = p.el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > h + 200) return;
      var c = (r.top + r.height / 2 - h / 2) / h;
      p.inner.style.transform = "translate3d(0," + (c * p.k * -100) + "px,0) scale(1.12)";
    });
    ticking = false;
  }
  addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener("resize", onScroll);

  /* ── تقسيم العناوين إلى كلمات ──────────────────────────────────────────── */
  function split(el, delayMs) {
    if (!el || el.getAttribute("data-split-done")) return;
    var text = el.textContent.trim();
    if (!text) return;
    el.setAttribute("aria-label", text);
    el.textContent = "";
    text.split(/\s+/).forEach(function (word, i, arr) {
      var w = document.createElement("span"); w.className = "w"; w.setAttribute("aria-hidden", "true");
      var wi = document.createElement("span"); wi.className = "wi"; wi.textContent = word;
      wi.style.setProperty("--i", i);
      w.appendChild(wi); el.appendChild(w);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(" "));
    });
    if (delayMs) el.style.setProperty("--d0", delayMs + "ms");
    el.classList.add("split");
    el.setAttribute("data-split-done", "1");
    observe(el);
  }

  /* ── مراقب الظهور ──────────────────────────────────────────────────────── */
  var io = "IntersectionObserver" in window && !reduce ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      onStart(function () { el.classList.add("is-in"); });
      io.unobserve(el);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.01 }) : null;

  function observe(el) {
    if (!el) return;
    if (!io) { el.classList.add("is-in"); return; }
    io.observe(el);
  }

  function scan(scope) {
    (scope || document).querySelectorAll("[data-split]").forEach(function (el) { split(el, +el.getAttribute("data-split") || 0); });
    (scope || document).querySelectorAll("[data-reveal], .rule").forEach(observe);
    (scope || document).querySelectorAll("[data-parallax]").forEach(function (el) {
      var inner = el.querySelector("img"); if (!inner) return;
      parallax.push({ el: el, inner: inner, k: parseFloat(el.getAttribute("data-parallax")) || 0.2 });
    });
    onScroll();
  }

  /* ── المؤشر المخصّص ────────────────────────────────────────────────────── */
  if (fine && !reduce) {
    var dot = document.createElement("div"); dot.className = "cursor-dot";
    var ring = document.createElement("div"); ring.className = "cursor-ring";
    var label = document.createElement("span"); ring.appendChild(label);
    document.body.appendChild(dot); document.body.appendChild(ring);
    var mx = -100, my = -100, rx = -100, ry = -100, shown = false;
    addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
      if (!shown) { shown = true; rx = mx; ry = my; root.classList.add("has-cursor"); }
      var t = e.target.closest ? e.target : null;
      var view = t && t.closest(".tile, .section-card, [data-cursor]");
      var link = t && t.closest("a, button, input, select, textarea, label");
      root.classList.toggle("cursor-view", !!view);
      root.classList.toggle("cursor-link", !view && !!link);
      if (view) label.textContent = view.getAttribute("data-cursor") || (view.classList.contains("section-card") ? "ادخل" : "عرض");
    }, { passive: true });
    document.addEventListener("mouseleave", function () { root.classList.remove("has-cursor"); shown = false; });
    (function follow() {
      rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
      ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
      requestAnimationFrame(follow);
    })();
  }

  /* ── شريط الكلمات المتحرّك: تكرار المحتوى ليدور بلا انقطاع ───────────────── */
  function marquee(el, words) {
    var track = el.querySelector(".marquee-track");
    if (!track || !words.length) return;
    var html = words.map(function (w) { return "<span></span>"; }).join("");
    track.innerHTML = html + html + html + html;
    track.querySelectorAll("span").forEach(function (s, i) { s.textContent = words[i % words.length]; });
  }

  document.body.classList.add("grain");

  window.Motion = { lift: lift, split: split, scan: scan, observe: observe, onStart: onStart, marquee: marquee };
})();
