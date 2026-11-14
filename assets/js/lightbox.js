/* ==========================================================================
   lightbox.js — العارض بملء الشاشة
   الأسهم (← التالي، → السابق)، Esc للإغلاق، السحب باللمس، تحميل الصور المجاورة.
   ========================================================================== */
(function () {
  "use strict";

  var el = document.createElement("div");
  el.className = "lightbox";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "عارض الصور");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<div class="lb-top"><span class="lb-count"></span><button class="lb-btn" type="button" data-close>إغلاق ×</button></div>' +
    '<div class="lb-stage">' +
    '<button class="lb-zone prev" type="button" data-prev tabindex="-1" aria-hidden="true"></button>' +
    '<img alt="">' +
    '<button class="lb-zone next" type="button" data-next tabindex="-1" aria-hidden="true"></button></div>' +
    '<div class="lb-bottom"><p class="lb-cap"></p><div class="lb-nav">' +
    '<button class="lb-btn" type="button" data-prev>→ السابق</button>' +
    '<button class="lb-btn" type="button" data-next>التالي ←</button></div></div>';
  document.body.appendChild(el);

  var img = el.querySelector("img"), cap = el.querySelector(".lb-cap"), count = el.querySelector(".lb-count"),
      closeBtn = el.querySelector("[data-close]");
  var items = [], index = 0, opener = null;

  function show(i, dir) {
    index = (i + items.length) % items.length;
    var p = items[index], s = Site.sources(p);
    var swap = function () {
      img.removeAttribute("srcset");
      img.alt = p.alt || p.title || "";
      if (s.srcset) { img.srcset = s.srcset; img.sizes = "100vw"; }
      img.src = s.src;
      cap.textContent = p.title || "";
      count.textContent = Site.pad(index + 1) + " / " + Site.pad(items.length);
      var done = function () { img.classList.remove("is-leaving"); };
      if (img.complete) requestAnimationFrame(done); else img.onload = img.onerror = done;
      preload(index + 1); preload(index - 1);
    };
    if (dir && el.classList.contains("is-open")) { img.classList.add("is-leaving"); setTimeout(swap, 220); }
    else swap();
  }
  function preload(i) {
    var p = items[(i + items.length) % items.length]; if (!p) return;
    var s = Site.sources(p), pre = new Image();
    if (s.srcset) { pre.srcset = s.srcset; pre.sizes = "100vw"; }
    pre.src = s.src;
  }
  function open(list, i, from) {
    items = list || []; opener = from || document.activeElement;
    if (!items.length) return;
    show(i, 0);
    el.setAttribute("aria-hidden", "false");
    document.body.classList.add("lb-lock");
    requestAnimationFrame(function () { el.classList.add("is-open"); closeBtn.focus({ preventScroll: true }); });
  }
  function close() {
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lb-lock");
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  el.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) return close();
    if (e.target.closest("[data-prev]")) return show(index - 1, -1);
    if (e.target.closest("[data-next]")) return show(index + 1, 1);
  });
  document.addEventListener("keydown", function (e) {
    if (!el.classList.contains("is-open")) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowLeft") show(index + 1, 1);      // من اليمين لليسار: اليسار = التالي
    else if (e.key === "ArrowRight") show(index - 1, -1);
    else if (e.key === "Tab") {
      var f = el.querySelectorAll(".lb-btn"), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  var sx = 0, sy = 0, tracking = false, stage = el.querySelector(".lb-stage");
  stage.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (!tracking) return; tracking = false;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    // السحب لليمين يُظهر التالي (اتجاه القراءة العربية)
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) show(index + (dx > 0 ? 1 : -1), dx > 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) close();
  }, { passive: true });

  window.Lightbox = { open: open, close: close };
})();
