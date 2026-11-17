/* ==========================================================================
   site.js — مشترك بين كل الصفحات
   تحميل البيانات (data/site.json) · الوضع الفاتح/الداكن · الترويسة ·
   شاشات كلمة المرور (للموقع كاملًا ولكل قسم) · أدوات مساعدة
   كل المحتوى يُعدَّل من لوحة التحكم (admin/) — لا حاجة لتعديل هذا الملف.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var THEME_KEY = "ta-theme";
  var DEFAULT_THEME_KEY = "ta-default-theme";
  var IMG_ROOT = "assets/images/";
  var DEFAULT_WIDTHS = [800, 1600, 2400];

  function store(kind) { try { return kind === "local" ? localStorage : sessionStorage; } catch (e) { return null; } }
  function get(kind, key) { var s = store(kind); try { return s ? s.getItem(key) : null; } catch (e) { return null; } }
  function set(kind, key, val) { var s = store(kind); try { if (s) s.setItem(key, val); } catch (e) {} }

  /* ── أرقام عربية ───────────────────────────────────────────────────────── */
  function ar(n) { return String(n).replace(/\d/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[d]; }); }
  function pad(n) { return ar(n < 10 ? "0" + n : n); }
  function photoWord(n) { return n === 1 ? "صورة واحدة" : n === 2 ? "صورتان" : ar(n) + (n >= 3 && n <= 10 ? " صور" : " صورة"); }

  /* ── مصادر الصور ───────────────────────────────────────────────────────── */
  function sources(p, prefix) {
    prefix = prefix || "";
    if (p.src) return { src: prefix + p.src, srcset: "", largest: prefix + p.src };
    var widths = p.widths || DEFAULT_WIDTHS;
    var fmt = p.fmt || "webp";
    var base = prefix + IMG_ROOT + p.file + "-";
    var srcset = widths.map(function (w) { return base + w + "." + fmt + " " + w + "w"; }).join(", ");
    var jpgW = widths.indexOf(1600) > -1 ? 1600 : widths[widths.length - 1];
    return { src: base + jpgW + ".jpg", srcset: srcset, largest: base + widths[widths.length - 1] + "." + fmt };
  }

  /* ── الوضع الفاتح / الداكن ─────────────────────────────────────────────── */
  function currentTheme() { return root.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function paintToggles() {
    var next = currentTheme() === "dark" ? "light" : "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-label", next === "light" ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن");
      var l = btn.querySelector(".label");
      if (l) l.textContent = next === "light" ? "فاتح" : "داكن";
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", currentTheme() === "dark" ? "#121211" : "#f3efe7");
  }
  function setTheme(theme, remember) {
    if (remember) set("local", THEME_KEY, theme);
    var apply = function () { root.setAttribute("data-theme", theme); paintToggles(); };
    if (!remember) return apply();
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(apply);
    else { root.classList.add("theme-anim"); apply(); setTimeout(function () { root.classList.remove("theme-anim"); }, 750); }
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-theme-toggle]")) setTheme(currentTheme() === "dark" ? "light" : "dark", true);
  });

  /* ── الترويسة المصغّرة عند التمرير ─────────────────────────────────────── */
  var header = document.querySelector(".site-header");
  if (header) {
    var ticking = false;
    var onScroll = function () { header.classList.toggle("is-compact", scrollY > 24); ticking = false; };
    addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
  }

  /* ── تشفير SHA-256 (لمقارنة كلمة المرور بدون تخزينها) ───────────────────── */
  function sha256(text) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      });
    }
    return Promise.resolve(sha256Fallback(text));
  }
  function sha256Fallback(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var bytes = unescape(encodeURIComponent(ascii)), i, j, result = "", words = [];
    var bitLen = bytes.length * 8, hash = [], k = [], pc = 0, comp = {};
    for (var c = 2; pc < 64; c++) {
      if (!comp[c]) {
        for (i = 0; i < 313; i += c) comp[i] = c;
        hash[pc] = (Math.pow(c, .5) * 4294967296) | 0;
        k[pc++] = (Math.pow(c, 1 / 3) * 4294967296) | 0;
      }
    }
    hash = hash.slice(0, 8);
    bytes += "\x80";
    while (bytes.length % 64 - 56) bytes += "\x00";
    for (i = 0; i < bytes.length; i++) words[i >> 2] |= bytes.charCodeAt(i) << ((3 - i) % 4) * 8;
    words[words.length] = (bitLen / 4294967296) | 0;
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += (b < 16 ? "0" : "") + b.toString(16); }
    return result;
  }

  /* ── شاشة كلمة المرور ────────────────────────────────────────────────────
     تنبيه: هذه حماية "ردع" فقط وليست أمانًا حقيقيًا — ملفات GitHub Pages عامة.
     key: مفتاح الحفظ · hash: بصمة كلمة المرور · title/text: نص الشاشة      */
  function requirePassword(opts) {
    var expected = String(opts.hash || "").toLowerCase().trim();
    var remember = opts.remember === "device" ? "local" : "session";
    var saved = get("session", opts.key) || get("local", opts.key);
    if (!expected || saved === expected) return Promise.resolve();

    return new Promise(function (resolve) {
      root.classList.add("is-locked");
      var gate = document.createElement("section");
      gate.className = "gate";
      gate.setAttribute("aria-labelledby", "gate-title");
      gate.innerHTML =
        (opts.homeLink ? '<a class="gate-home" href="index.html">→ الرئيسية</a>' : "") +
        '<button class="theme-toggle" type="button" data-theme-toggle><span class="dot" aria-hidden="true"></span><span class="label"></span></button>' +
        '<span class="logo-mark" role="img" aria-label="شعار ثامر الحربي"></span>' +
        '<p class="eyebrow"></p><h1 id="gate-title"></h1><p class="gate-text"></p>' +
        '<form class="gate-form" novalidate>' +
        '<label class="sr-only" for="gate-password">كلمة المرور</label>' +
        '<input class="gate-input" id="gate-password" type="password" placeholder="كلمة المرور" autocomplete="current-password" required>' +
        '<button class="btn" type="submit">دخول</button>' +
        '<p class="gate-error" role="alert" aria-live="assertive"></p></form>';
      gate.querySelector(".eyebrow").textContent = opts.eyebrow || "محتوى خاص";
      gate.querySelector("h1").textContent = opts.title || "ثامر الحربي";
      gate.querySelector(".gate-text").textContent = opts.text || "هذا المحتوى خاص. أدخل كلمة المرور التي وصلتك.";
      document.body.appendChild(gate);
      paintToggles();

      var form = gate.querySelector("form"), input = gate.querySelector("input"),
          btn = gate.querySelector("button[type=submit]"), err = gate.querySelector(".gate-error");
      setTimeout(function () { input.focus(); }, 350);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!input.value) { err.textContent = "الرجاء إدخال كلمة المرور."; return; }
        btn.disabled = true;
        sha256(input.value).then(function (h) {
          btn.disabled = false;
          if (h === expected) {
            set(remember, opts.key, h);
            gate.remove();
            if (!document.querySelector(".gate")) root.classList.remove("is-locked");
            scrollTo(0, 0);
            resolve();
          } else {
            err.textContent = "كلمة المرور غير صحيحة، حاول مرة أخرى.";
            input.select();
            gate.classList.remove("shake"); void gate.offsetWidth; gate.classList.add("shake");
          }
        });
      });
    });
  }

  /* ── تحميل البيانات ────────────────────────────────────────────────────── */
  var dataPromise = fetch("data/site.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });

  var ready = dataPromise.then(function (data) {
    data.settings = data.settings || {};
    data.texts = data.texts || {};
    data.contact = data.contact || {};
    data.sections = data.sections || [];
    data.photos = (data.photos || []).filter(function (p) { return p && (p.file || p.src) && p.w && p.h; });

    // الوضع الافتراضي لأول زيارة
    var def = data.settings.defaultTheme || "dark";
    set("local", DEFAULT_THEME_KEY, def);
    if (!get("local", THEME_KEY)) {
      var t = def === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : def;
      if (t !== currentTheme()) setTheme(t, false);
    }

    // المظهر: خط الاسم + الشعار
    var st = data.settings;
    root.setAttribute("data-name-font", st.nameFont || "sans");
    if (st.logoRatio) root.style.setProperty("--logo-ratio", st.logoRatio);
    if (st.logoVersion) root.style.setProperty("--logo-url", 'url("' + new URL("assets/logo/logo-600.png?v=" + st.logoVersion, document.baseURI).href + '")');

    // نصوص مشتركة ثم الكشيدة في العناوين
    fillTexts(data);
    KASHIDA = st.kashida === false ? 0 : (+st.kashidaLength || 2);
    document.querySelectorAll("[data-kashida]").forEach(applyKashida);

    // حماية الموقع كاملًا (اختياري)
    if (data.settings.passwordProtection) {
      return requirePassword({
        key: "ta-unlock-site", hash: data.settings.passwordHash, remember: data.settings.rememberUnlock,
        eyebrow: "معرض خاص", title: data.texts.homeTitle || "ثامر الحربي",
        text: "هذا المعرض خاص. أدخل كلمة المرور التي وصلتك."
      }).then(function () { return data; });
    }
    return data;
  });

  ready.catch(function () {
    root.classList.remove("is-loading");
    var m = document.querySelector("main");
    if (m) m.innerHTML = '<p class="empty-note">تعذّر تحميل المحتوى. حاول تحديث الصفحة.</p>';
  });

  function fillTexts(data) {
    document.querySelectorAll("[data-text]").forEach(function (el) {
      var v = data.texts[el.getAttribute("data-text")];
      if (v) el.textContent = v;
    });
  }

  /* ── الكشيدة (التطويل) في العناوين ────────────────────────────────────
     تُضاف بين حرفين متصلين في آخر موضع مناسب من كل كلمة: ثامـــر الحربـــي.
     النص الأصلي يبقى لقارئات الشاشة ومحركات البحث.                         */
  var KASHIDA = 2;
  var DUAL = "بتثجحخسشصضطظعغفقكلمنهيئ";
  function kashida(text, n) {
    if (n == null) n = KASHIDA;
    if (!n || !text) return text;
    var t = new Array(n + 1).join("ـ");
    return String(text).split(/(\s+)/).map(function (w) {
      if (/\s/.test(w) || w.indexOf("ـ") > -1) return w;
      for (var i = w.length - 2; i >= 1; i--) {
        var c = w[i], next = w[i + 1];
        if (DUAL.indexOf(c) < 0 || !/[\u0621-\u064A]/.test(next)) continue;
        if (c === "ل" && /[اأإآ]/.test(next)) continue;          // لا نكسر «لا»
        return w.slice(0, i + 1) + t + w.slice(i + 1);
      }
      return w;
    }).join("");
  }
  function applyKashida(el) {
    if (!el || el.getAttribute("data-split-done")) return;
    var orig = el.getAttribute("data-orig") || el.textContent.trim();
    el.setAttribute("data-orig", orig);
    el.setAttribute("aria-label", orig);
    el.textContent = kashida(orig);
  }

  function show() {
    root.classList.remove("is-loading");
  }

  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = ar(new Date().getFullYear()); });
  paintToggles();

  window.Site = {
    ready: ready, loaded: dataPromise, show: show, kashida: kashida, applyKashida: applyKashida, requirePassword: requirePassword, sha256: sha256,
    sources: sources, ar: ar, pad: pad, photoWord: photoWord
  };
})();
