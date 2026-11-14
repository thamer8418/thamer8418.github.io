/* ==========================================================================
   pages.js — بناء محتوى كل صفحة من data/site.json
   الرئيسية (page-home) · القسم (page-section) · التواصل (page-contact)
   ========================================================================== */
(function () {
  "use strict";

  var body = document.body;
  var LOCK_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="5.5" width="8" height="5.5"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';

  function $(sel) { return document.querySelector(sel); }
  function text(el, v) { if (el) el.textContent = v || ""; }

  Site.ready.then(function (data) {
    if (body.classList.contains("page-home")) home(data);
    else if (body.classList.contains("page-section")) section(data);
    else if (body.classList.contains("page-contact")) contact(data);
  });

  /* ── الرئيسية ─────────────────────────────────────────────────────────── */
  function home(data) {
    var picks = data.photos.filter(function (p) { return p.home; });
    text($("[data-selected-count]"), Site.photoWord(picks.length));
    Site.show();
    Gallery.mount($("[data-gallery]"), picks);

    var grid = $("[data-sections]");
    if (!data.sections.length) { $("[data-sections-block]").hidden = true; return; }
    data.sections.forEach(function (s, i) {
      var n = data.photos.filter(function (p) { return p.section === s.id; }).length;
      var cover = data.photos.filter(function (p) { return p.id === s.cover; })[0];
      var a = document.createElement("a");
      a.className = "section-card reveal";
      a.style.setProperty("--d", (i * 0.08) + "s");
      a.href = "section.html?id=" + encodeURIComponent(s.id);
      a.innerHTML =
        '<div class="cover"></div>' +
        '<div class="meta"><h3></h3><span class="sub"></span></div>' +
        '<p></p><span class="go">ادخل القسم <span aria-hidden="true">←</span></span>';
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
      grid.appendChild(a);
    });
  }

  /* ── صفحة القسم ───────────────────────────────────────────────────────── */
  function section(data) {
    var id = new URLSearchParams(location.search).get("id");
    var s = data.sections.filter(function (x) { return x.id === id; })[0];
    if (!s) {
      $("main").innerHTML = '<p class="empty-note">هذا القسم غير موجود. <a href="index.html" style="text-decoration:underline">العودة للرئيسية</a></p>';
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
      Site.show();
      Gallery.mount($("[data-gallery]"), photos);
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
  }
})();
