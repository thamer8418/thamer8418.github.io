/* ==========================================================================
   pages.js — بناء محتوى كل صفحة من data/site.json
   الرئيسية (page-home) · القسم (page-section) · التواصل (page-contact)
   ========================================================================== */
(function () {
  "use strict";

  var body = document.body;
  var LOCK_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="5.5" width="8" height="5.5"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';
  var M = window.Motion || { lift: function () {}, scan: function () {}, split: function () {}, observe: function (e) { e.classList.add("is-in"); }, marquee: function () {}, onStart: function (f) { f(); } };

  function $(sel) { return document.querySelector(sel); }
  function text(el, v) { if (el) el.textContent = v || ""; }
  function byId(data, id) { return data.photos.filter(function (p) { return p.id === id; })[0]; }

  // صورة الواجهة: تُحمَّل ثم تُرفع شاشة الافتتاح (أو بعد ٣ ثوانٍ كحد أقصى)
  function heroImage(photo, alt) {
    var img = $("[data-hero-img]"), hero = $("[data-hero]");
    return new Promise(function (resolve) {
      if (!img || !photo) { resolve(); return; }
      var s = Site.sources(photo);
      img.alt = alt || photo.alt || "";
      img.decoding = "async";
      var done = function () { img.classList.add("is-loaded"); resolve(); };
      img.onload = done; img.onerror = function () { resolve(); };
      if (s.srcset) { img.srcset = s.srcset; img.sizes = "100vw"; }
      img.src = s.src;
      if (img.complete && img.naturalWidth) done();
      setTimeout(resolve, 3000);
      M.onStart(function () { if (hero) hero.classList.add("is-in"); });
    });
  }

  // شاشة الافتتاح تُرفع بمجرد وصول البيانات وصورة الواجهة (قبل أي كلمة مرور)
  Site.loaded.then(function (data) {
    var hp = null;
    if (body.classList.contains("page-home")) {
      hp = byId(data, data.settings.heroPhoto) || data.photos.filter(function (p) { return p.home && p.w > p.h; })[0] || data.photos[0];
      text($("[data-hero-caption]"), hp && hp.title);
    } else if (body.classList.contains("page-section")) {
      var s = currentSection(data);
      hp = s && (byId(data, s.cover) || data.photos.filter(function (p) { return p.section === s.id; })[0]);
    }
    return heroImage(hp);
  }).then(function () { M.lift(); }, function () { M.lift(); });

  Site.ready.then(function (data) {
    if (body.classList.contains("page-home")) home(data);
    else if (body.classList.contains("page-section")) section(data);
    else if (body.classList.contains("page-contact")) contact(data);
  });

  /* ── الرئيسية ─────────────────────────────────────────────────────────── */
  function home(data) {
    var picks = data.photos.filter(function (p) { return p.home; });
    text($("[data-selected-count]"), Site.photoWord(picks.length));
    M.split($("#home-title"), 250);
    $(".chapter-title") && document.querySelectorAll(".chapter-title").forEach(function (h) { h.setAttribute("data-split", ""); });
    Site.show();
    Gallery.mount($("[data-gallery]"), picks);

    M.marquee($(".marquee"), data.sections.map(function (s) { return s.title; }).concat(["ثامر الحربي"]));

    var grid = $("[data-sections]");
    if (!data.sections.length) { $("[data-sections-block]").hidden = true; }
    data.sections.forEach(function (s, i) {
      var n = data.photos.filter(function (p) { return p.section === s.id; }).length;
      var cover = byId(data, s.cover);
      var a = document.createElement("a");
      a.className = "section-card";
      a.href = encodeURIComponent(s.id) + "/";
      a.innerHTML =
        '<span class="num"></span><div class="cover"></div>' +
        '<div class="meta"><h3></h3><span class="sub"></span></div>' +
        '<p></p><span class="go">ادخل القسم <span aria-hidden="true">←</span></span>';
      text(a.querySelector(".num"), Site.pad(i + 1));
      var c = a.querySelector(".cover");
      if (cover) {
        var src = Site.sources(cover), img = document.createElement("img");
        img.alt = ""; img.loading = "lazy"; img.decoding = "async";
        if (src.srcset) { img.srcset = src.srcset; img.sizes = "(max-width: 760px) 100vw, 50vw"; }
        img.src = src.src;
        img.onload = function () { img.classList.add("is-loaded"); };
        c.appendChild(img);
      } else c.innerHTML = '<div class="no-cover"><span class="logo-mark"></span></div>';
      text(a.querySelector("h3"), s.title);
      a.querySelector(".sub").innerHTML = (s.locked ? LOCK_SVG + " محمي · " : "") + Site.photoWord(n);
      text(a.querySelector("p"), s.description);
      a.style.transitionDelay = (i % 2) * 120 + "ms";
      a.querySelector(".cover").style.transitionDelay = (i % 2) * 120 + "ms";
      grid.appendChild(a);
      M.observe(a);
    });
    M.scan();
  }

  /* ── صفحة القسم ───────────────────────────────────────────────────────── */
  function currentSection(data) {
    // الرابط المختصر: موقعك/weddings  ←  أو الرابط الكامل: section.html?id=weddings
    var id = new URLSearchParams(location.search).get("id") ||
      decodeURIComponent(location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "").split("/").pop());
    return data.sections.filter(function (x) { return x.id === id; })[0];
  }

  function section(data) {
    var s = currentSection(data);
    if (!s) {
      document.documentElement.classList.remove("has-hero");
      $("main").innerHTML = '<p class="empty-note" style="padding-top:30vh">هذا القسم غير موجود. <a href="index.html" style="text-decoration:underline">العودة للرئيسية</a></p>';
      Site.show(); return;
    }
    document.title = s.title + " — " + (data.texts.homeTitle || "ثامر الحربي");
    var gate = s.locked
      ? Site.requirePassword({
          key: "ta-unlock-sec-" + s.id, hash: s.passwordHash, remember: data.settings.rememberUnlock,
          eyebrow: "قسم خاص", title: s.title, homeLink: true,
          text: "هذا القسم خاص بأصحابه. أدخل كلمة المرور التي وصلتك للدخول."
        })
      : Promise.resolve();

    gate.then(function () {
      var photos = data.photos.filter(function (p) { return p.section === s.id; });
      text($("[data-section-title]"), s.title);
      text($("[data-section-desc]"), s.description);
      text($("[data-section-count]"), Site.photoWord(photos.length));
      M.split($("[data-section-title]"), 150);
      Site.show();
      Gallery.mount($("[data-gallery]"), photos);
      M.scan();
    });
  }

  /* ── التواصل ─────────────────────────────────────────────────────────── */
  function contact(data) {
    var C = data.contact, list = $("[data-channels]");
    var rows = [
      { key: "email", label: "البريد الإلكتروني", href: function (v) { return "mailto:" + v; }, ltr: true },
      { key: "whatsapp", label: "واتساب", ltr: true, external: true,
        href: function (v) { return "https://wa.me/" + String(v).replace(/\D/g, "") + (C.whatsappMessage ? "?text=" + encodeURIComponent(C.whatsappMessage) : ""); },
        show: function (v) { return C.whatsappDisplay || "+" + String(v).replace(/\D/g, ""); } },
      { key: "instagram", label: "إنستقرام", ltr: true, external: true, always: true,
        href: function (v) { return "https://www.instagram.com/" + String(v).replace(/^@/, "") + "/"; },
        show: function (v) { return "@" + String(v).replace(/^@/, ""); } },
      { key: "city", label: "المدينة" }
    ];
    rows.forEach(function (r) {
      var v = C[r.key];
      if (!v && !r.always) return;
      var li = document.createElement("li");
      li.className = "channel";
      if (!v) {
        li.classList.add("is-placeholder");
        li.innerHTML = '<div><span class="label"></span><span class="value">لم يُضف بعد — يُضاف من لوحة التحكم</span><span class="badge">غير مضاف</span></div>';
      } else if (r.href) {
        li.innerHTML = '<a><span class="label"></span><span class="value"><span></span></span><span class="arrow" aria-hidden="true">↖</span></a>';
        var a = li.querySelector("a");
        a.href = r.href(v);
        if (r.external) { a.target = "_blank"; a.rel = "noopener"; }
        var span = li.querySelector(".value span");
        span.textContent = r.show ? r.show(v) : v;
        if (r.ltr) span.className = "ltr";
      } else {
        li.innerHTML = '<div><span class="label"></span><span class="value"></span><span></span></div>';
        text(li.querySelector(".value"), v);
      }
      text(li.querySelector(".label"), r.label);
      list.appendChild(li);
    });
    Site.show();
    M.scan();
    M.lift();
  }
})();
