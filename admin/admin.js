/* ==========================================================================
   admin.js — لوحة التحكم
   تقرأ data/site.json من GitHub وتعدّله، وتجهّز الصور الجديدة بأحجام الويب
   داخل المتصفح، ثم تنشر كل التعديلات في دفعة واحدة (commit) عبر GitHub API.
   ========================================================================== */
(function () {
  "use strict";

  var CFG_KEY = "ta-admin";
  var DATA_PATH = "data/site.json";
  var WIDTHS = [800, 1600, 2400];

  var cfg = null;              // { owner, repo, branch, token, local }
  var data = null;             // محتوى site.json
  var original = "";           // للمقارنة ومعرفة وجود تعديلات
  var uploads = {};            // photoId → [{ path, blob }]
  var deletes = {};            // path → true
  var localThumbs = {};        // photoId → objectURL
  var tab = "photos";
  var filter = "all";
  var busy = false;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ar(n) { return String(n).replace(/\d/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[d]; }); }

  /* ── تنبيهات ───────────────────────────────────────────────────────────── */
  var toastTimer;
  function toast(msg, isError) {
    var t = $("[data-toast]");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, isError ? 7000 : 3200);
  }

  /* ── GitHub API ────────────────────────────────────────────────────────── */
  function gh(path, opts) {
    opts = opts || {};
    var headers = {
      Authorization: "Bearer " + cfg.token,
      Accept: opts.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch("https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + path, {
      method: opts.method || "GET", headers: headers, cache: "no-store",
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = "خطأ من GitHub (" + r.status + ")";
          if (r.status === 401) msg = "رمز الوصول غير صحيح أو منتهي الصلاحية.";
          else if (r.status === 403) msg = "رمز الوصول لا يملك صلاحية الكتابة على هذا المستودع.";
          else if (r.status === 404) msg = "لم يُعثر على المستودع أو الملف. تأكد من الاسم والفرع وصلاحيات الرمز.";
          else if (r.status === 409 || r.status === 422) msg = "تعارض في المستودع — حدّث الصفحة وحاول مرة أخرى.";
          var e = new Error(msg); e.status = r.status; e.detail = t; throw e;
        });
      }
      return opts.raw ? r.text() : r.json();
    });
  }

  function loadFromGitHub() {
    return gh("").then(function (repo) {
      if (repo.permissions && !repo.permissions.push) throw new Error("رمز الوصول لا يملك صلاحية الكتابة على هذا المستودع.");
      return gh("/contents/" + DATA_PATH + "?ref=" + encodeURIComponent(cfg.branch), { raw: true });
    }).then(function (txt) { return JSON.parse(txt); });
  }

  function loadLocal() {
    return fetch("../" + DATA_PATH, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("تعذّر قراءة data/site.json");
      return r.json();
    });
  }

  /* ── الحفظ والنشر (commit واحد) ─────────────────────────────────────────── */
  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(",")[1]); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  function save() {
    if (busy || !isDirty()) return;
    if (cfg.local) { downloadJSON(); return; }
    busy = true; paintStatus("جارٍ النشر…");
    $("[data-save]").disabled = true;

    var refSha, baseTree, entries = [];
    var files = [];
    Object.keys(uploads).forEach(function (id) { files = files.concat(uploads[id]); });
    var delPaths = Object.keys(deletes);

    gh("/git/ref/heads/" + encodeURIComponent(cfg.branch))
      .then(function (ref) { refSha = ref.object.sha; return gh("/git/commits/" + refSha); })
      .then(function (commit) {
        baseTree = commit.tree.sha;
        return delPaths.length ? gh("/git/trees/" + baseTree + "?recursive=1") : { tree: [] };
      })
      .then(function (tree) {
        var existing = {};
        (tree.tree || []).forEach(function (t) { existing[t.path] = true; });
        delPaths.forEach(function (p) { if (existing[p]) entries.push({ path: p, mode: "100644", type: "blob", sha: null }); });
        // رفع الصور واحدة تلو الأخرى
        var chain = Promise.resolve(), done = 0;
        files.forEach(function (f) {
          chain = chain.then(function () {
            paintStatus("رفع الصور " + ar(++done) + " / " + ar(files.length) + "…");
            return blobToBase64(f.blob).then(function (b64) {
              return gh("/git/blobs", { method: "POST", body: { content: b64, encoding: "base64" } });
            }).then(function (b) { entries.push({ path: f.path, mode: "100644", type: "blob", sha: b.sha }); });
          });
        });
        return chain;
      })
      .then(function () {
        paintStatus("حفظ البيانات…");
        return gh("/git/blobs", { method: "POST", body: { content: serialize(), encoding: "utf-8" } });
      })
      .then(function (b) {
        entries.push({ path: DATA_PATH, mode: "100644", type: "blob", sha: b.sha });
        return gh("/git/trees", { method: "POST", body: { base_tree: baseTree, tree: entries } });
      })
      .then(function (tree) {
        return gh("/git/commits", { method: "POST", body: { message: "تحديث الموقع من لوحة التحكم", tree: tree.sha, parents: [refSha] } });
      })
      .then(function (commit) {
        return gh("/git/refs/heads/" + encodeURIComponent(cfg.branch), { method: "PATCH", body: { sha: commit.sha } });
      })
      .then(function () {
        original = serialize(); uploads = {}; deletes = {};
        busy = false; paintStatus();
        toast("تم النشر ✓ — يظهر التحديث على الموقع خلال دقيقة تقريبًا.");
      })
      .catch(function (e) {
        busy = false; paintStatus();
        toast("لم يكتمل النشر: " + e.message, true);
        console.error(e);
      });
  }

  // الحقول التي تبدأ بـ _ مؤقتة داخل اللوحة ولا تُحفظ
  function serialize() { return JSON.stringify(data, function (k, v) { return k.charAt(0) === "_" ? undefined : v; }, 1) + "\n"; }

  function downloadJSON() {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([serialize()], { type: "application/json" }));
    a.download = "site.json";
    a.click();
    toast("تم تنزيل site.json — ضعه في مجلد data بدل الملف القديم.");
  }

  /* ── حالة التعديل ──────────────────────────────────────────────────────── */
  function isDirty() { return serialize() !== original || Object.keys(uploads).length > 0 || Object.keys(deletes).length > 0; }
  function paintStatus(msg) {
    var s = $("[data-status]"), dirty = isDirty();
    s.textContent = msg || (dirty ? "توجد تعديلات غير منشورة" : "كل التعديلات منشورة");
    s.classList.toggle("dirty", !msg && dirty);
    var btn = $("[data-save]");
    btn.disabled = busy || !dirty;
    btn.textContent = cfg && cfg.local ? "تنزيل site.json" : "حفظ ونشر";
  }
  function changed() { paintStatus(); }
  addEventListener("beforeunload", function (e) { if (data && isDirty()) { e.preventDefault(); e.returnValue = ""; } });

  /* ── تجهيز الصور في المتصفح ────────────────────────────────────────────── */
  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return decodeViaImg(file); });
    }
    return decodeViaImg(file);
  }
  function decodeViaImg(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error("صيغة غير مدعومة")); };
      img.src = URL.createObjectURL(file);
    });
  }
  function resize(src, sw, sh, w) {
    var cur = src, cw = sw, ch = sh;
    while (cw / 2 >= w) {                      // تصغير تدريجي لجودة أعلى
      var c1 = document.createElement("canvas");
      c1.width = Math.round(cw / 2); c1.height = Math.round(ch / 2);
      var x1 = c1.getContext("2d"); x1.imageSmoothingQuality = "high";
      x1.drawImage(cur, 0, 0, c1.width, c1.height);
      cur = c1; cw = c1.width; ch = c1.height;
    }
    var c = document.createElement("canvas");
    c.width = w; c.height = Math.round(sh * w / sw);
    var x = c.getContext("2d"); x.imageSmoothingQuality = "high";
    x.drawImage(cur, 0, 0, c.width, c.height);
    return c;
  }
  function toBlob(canvas) {
    return new Promise(function (res) { canvas.toBlob(res, "image/jpeg", 0.86); });
  }
  function processFile(file, sectionId) {
    return decode(file).then(function (bmp) {
      var W = bmp.width, H = bmp.height;
      var widths = WIDTHS.filter(function (w) { return w < W; });
      if (W < WIDTHS[WIDTHS.length - 1]) widths.push(W);
      widths = widths.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
      var id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var folder = "assets/images/" + sectionId + "/";
      var out = [], chain = Promise.resolve();
      widths.forEach(function (w) {
        chain = chain.then(function () {
          return toBlob(resize(bmp, W, H, w)).then(function (b) { out.push({ path: folder + id + "-" + w + ".jpg", blob: b, w: w }); });
        });
      });
      return chain.then(function () {
        var px = resize(bmp, W, H, Math.min(W, 64)).getContext("2d");
        var c1 = document.createElement("canvas"); c1.width = c1.height = 1;
        c1.getContext("2d").drawImage(px.canvas, 0, 0, 1, 1);
        var d = c1.getContext("2d").getImageData(0, 0, 1, 1).data;
        var color = "#" + [d[0], d[1], d[2]].map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
        var small = out.filter(function (o) { return o.w === widths[0]; })[0];
        localThumbs[id] = URL.createObjectURL(small.blob);
        uploads[id] = out.map(function (o) { return { path: o.path, blob: o.blob }; });
        var title = file.name.replace(/\.[^.]+$/, "");
        return {
          id: id, section: sectionId, file: sectionId + "/" + id, w: W, h: H,
          widths: widths, fmt: "jpg", title: "", alt: "", home: false, feature: false, color: color, _name: title
        };
      });
    });
  }

  function photoPaths(p) {
    if (p.src) return [p.src];
    var ws = p.widths || WIDTHS, fmt = p.fmt || "webp", base = "assets/images/" + p.file + "-";
    var paths = ws.map(function (w) { return base + w + "." + fmt; });
    var jpgW = ws.indexOf(1600) > -1 ? 1600 : ws[ws.length - 1];
    paths.push(base + jpgW + ".jpg");
    return paths.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  function thumbFor(p) {
    if (localThumbs[p.id]) return localThumbs[p.id];
    if (p.src) return "../" + p.src;
    var ws = p.widths || WIDTHS;
    return "../assets/images/" + p.file + "-" + ws[0] + "." + (p.fmt || "webp");
  }

  /* ── أدوات البيانات ────────────────────────────────────────────────────── */
  function sectionById(id) { return data.sections.filter(function (s) { return s.id === id; })[0]; }
  function photosIn(id) { return data.photos.filter(function (p) { return p.section === id; }); }
  function sha256(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }
  function visiblePhotos() {
    if (filter === "all") return data.photos;
    if (filter === "home") return data.photos.filter(function (p) { return p.home; });
    return photosIn(filter);
  }
  function movePhoto(id, targetId) {          // ينقل الصورة لمكان صورة أخرى
    var from = data.photos.findIndex(function (p) { return p.id === id; });
    var to = data.photos.findIndex(function (p) { return p.id === targetId; });
    if (from < 0 || to < 0 || from === to) return;
    var item = data.photos.splice(from, 1)[0];
    data.photos.splice(to, 0, item);
    changed(); render();
  }

  /* ── العرض ─────────────────────────────────────────────────────────────── */
  function render() {
    $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === tab)); });
    var panel = $("[data-panel]");
    if (tab === "photos") panel.innerHTML = viewPhotos();
    else if (tab === "sections") panel.innerHTML = viewSections();
    else if (tab === "texts") panel.innerHTML = viewTexts();
    else panel.innerHTML = viewSettings();
    paintStatus();
  }

  function sectionOptions(selected, withAll) {
    var o = withAll ? '<option value="all"' + (selected === "all" ? " selected" : "") + '>كل الصور</option>' +
      '<option value="home"' + (selected === "home" ? " selected" : "") + '>مختارات الرئيسية</option>' : "";
    return o + data.sections.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === selected ? " selected" : "") + ">" + esc(s.title) + "</option>";
    }).join("");
  }

  function viewPhotos() {
    var list = visiblePhotos();
    var upSec = data.sections.some(function (s) { return s.id === filter; }) ? filter : (data.sections[0] || {}).id;
    var html =
      '<div class="toolbar">' +
      '<label class="field">عرض<select data-filter>' + sectionOptions(filter, true) + "</select></label>" +
      '<span class="muted small">' + ar(list.length) + " صورة · اسحب الصور لترتيبها، أو استخدم الأسهم</span></div>";
    if (data.sections.length) {
      html += '<div class="upload-box" data-dropzone>' +
        "<strong>إضافة صور جديدة</strong>" +
        '<div class="toolbar" style="margin:0">' +
        '<label class="field">إلى قسم<select data-upload-section>' + sectionOptions(upSec) + "</select></label>" +
        '<label class="btn" style="cursor:pointer">اختيار الصور<input type="file" accept="image/*" multiple hidden data-upload-input></label>' +
        "</div>" +
        '<p class="hint">' + (cfg.local ? "رفع الصور يحتاج الاتصال بـ GitHub." : "يمكنك أيضًا سحب الصور وإفلاتها هنا. تُصغَّر الصور تلقائيًا لأحجام الويب، والأصل على جهازك لا يتغيّر. صدّر من Lightroom بأعلى جودة (JPEG).") + "</p>" +
        '<p class="progress" data-upload-progress></p></div>';
    } else {
      html += '<p class="notice">أضف قسمًا أولًا من تبويب «الأقسام» قبل إضافة الصور.</p>';
    }
    html += '<div class="photo-grid" style="margin-top:22px">';
    list.forEach(function (p, i) {
      html +=
        '<article class="pcard" draggable="true" data-id="' + esc(p.id) + '">' +
        '<div class="thumb"><img loading="lazy" alt="" src="' + esc(thumbFor(p)) + '"><span class="num">' + ar(i + 1) + "</span>" +
        (uploads[p.id] ? '<span class="flag">جديدة</span>' : "") + "</div>" +
        '<div class="body">' +
        '<label class="field">العنوان<input data-f="title" value="' + esc(p.title) + '" placeholder="' + esc(p._name ? "مثال: لحظة الوصول" : "") + '"></label>' +
        '<label class="field">وصف الصورة (لمحركات البحث وقارئات الشاشة)<textarea data-f="alt" rows="2">' + esc(p.alt) + "</textarea></label>" +
        '<label class="field">القسم<select data-f="section">' + sectionOptions(p.section) + "</select></label>" +
        '<div class="row">' +
        '<label class="check"><input type="checkbox" data-f="home"' + (p.home ? " checked" : "") + "> في مختارات الرئيسية</label>" +
        '<label class="check"><input type="checkbox" data-f="feature"' + (p.feature ? " checked" : "") + "> عرض كبير</label>" +
        "</div>" +
        '<div class="actions"><div class="move">' +
        '<button class="icon-btn" type="button" data-move="-1" aria-label="تقديم">↑ تقديم</button>' +
        '<button class="icon-btn" type="button" data-move="1" aria-label="تأخير">↓ تأخير</button></div>' +
        '<button class="icon-btn del" type="button" data-delete>حذف</button></div>' +
        "</div></article>";
    });
    html += "</div>";
    if (!list.length) html += '<p class="empty-note">لا توجد صور في هذا العرض.</p>';
    return html;
  }

  function viewSections() {
    var html = '<p class="notice">لكل قسم صفحة مستقلة وكلمة مرور خاصة. من يدخل قسمًا لا يرى روابط للأقسام الأخرى، ' +
      "وكلمة مرور قسم لا تفتح غيره. كلمة المرور لا تُحفظ نصًا ولا يمكن عرضها لاحقًا — احتفظ بها عندك.</p>" +
      '<div class="cards">';
    data.sections.forEach(function (s, i) {
      var n = photosIn(s.id).length;
      var link = new URL("../section.html?id=" + encodeURIComponent(s.id), location.href).href;
      html +=
        '<div class="card" data-sid="' + esc(s.id) + '">' +
        '<div class="head"><h3>' + esc(s.title || "قسم بدون اسم") + '</h3><span class="muted small">' + ar(n) + " صورة</span></div>" +
        '<div class="linkbox">رابط القسم: <code>' + esc(link) + '</code><button class="icon-btn" type="button" data-copy="' + esc(link) + '">نسخ</button></div>' +
        '<div class="two">' +
        '<label class="field">اسم القسم<input data-s="title" value="' + esc(s.title) + '"></label>' +
        '<label class="field">صورة الغلاف في الرئيسية<select data-s="cover"><option value="">بدون صورة</option>' +
        photosIn(s.id).map(function (p, k) { return '<option value="' + esc(p.id) + '"' + (p.id === s.cover ? " selected" : "") + ">" + ar(k + 1) + " — " + esc(p.title || "بدون عنوان") + "</option>"; }).join("") +
        "</select></label></div>" +
        '<label class="field">الوصف<textarea data-s="description" rows="2">' + esc(s.description) + "</textarea></label>" +
        '<div class="two">' +
        '<label class="check" style="align-self:end"><input type="checkbox" data-s="locked"' + (s.locked ? " checked" : "") + "> محمي بكلمة مرور</label>" +
        '<label class="field">كلمة مرور جديدة' + (s.passwordHash ? " (اتركها فارغة للإبقاء على الحالية)" : "") +
        '<input data-s="password" type="text" dir="ltr" autocomplete="off" placeholder="••••••"></label></div>' +
        '<p class="ok-note" data-pw-note></p>' +
        '<div class="head"><div class="move" style="display:flex;gap:6px">' +
        '<button class="icon-btn" type="button" data-smove="-1">↑ تقديم</button><button class="icon-btn" type="button" data-smove="1">↓ تأخير</button></div>' +
        '<button class="icon-btn del" type="button" data-sdelete>حذف القسم</button></div>' +
        "</div>";
      void i;
    });
    html += "</div>" +
      '<div class="card" style="max-width:860px;margin-top:26px"><h3>إضافة قسم جديد</h3>' +
      '<div class="two"><label class="field">اسم القسم<input data-new="title" placeholder="مثال: التصوير الجوي"></label>' +
      '<label class="field">اسم الرابط (حروف إنجليزية)<input data-new="id" dir="ltr" placeholder="drone"></label></div>' +
      '<label class="field">كلمة المرور<input data-new="password" dir="ltr" autocomplete="off"></label>' +
      '<div><button class="btn" type="button" data-add-section>إضافة القسم</button></div></div>';
    return html;
  }

  var TEXT_FIELDS = [
    ["homeEyebrow", "سطر صغير فوق الاسم (الرئيسية)"],
    ["homeTitle", "الاسم الكبير"],
    ["homeIntro", "النبذة في الرئيسية", true],
    ["selectedTitle", "عنوان المختارات"],
    ["sectionsTitle", "عنوان الأقسام"],
    ["sectionsIntro", "سطر تحت عنوان الأقسام"],
    ["contactEyebrow", "سطر صغير في صفحة التواصل"],
    ["contactRole", "المسمّى المهني"],
    ["contactIntro", "النبذة في صفحة التواصل", true],
    ["footerTagline", "عبارة التذييل"]
  ];
  var CONTACT_FIELDS = [
    ["email", "البريد الإلكتروني", "ltr"],
    ["whatsapp", "رقم واتساب (أرقام فقط مع رمز الدولة، مثل 966555387138)", "ltr"],
    ["whatsappDisplay", "طريقة عرض الرقم (مثل ‎+966 55 538 7138)", "ltr"],
    ["whatsappMessage", "الرسالة الجاهزة في واتساب"],
    ["instagram", "حساب إنستقرام (بدون @)", "ltr"],
    ["city", "المدينة"]
  ];
  function viewTexts() {
    var html = '<div class="cards"><div class="card"><h3>نصوص الموقع</h3>';
    TEXT_FIELDS.forEach(function (f) {
      var v = data.texts[f[0]] || "";
      html += '<label class="field">' + f[1] + (f[2]
        ? '<textarea data-t="' + f[0] + '" rows="3">' + esc(v) + "</textarea>"
        : '<input data-t="' + f[0] + '" value="' + esc(v) + '">') + "</label>";
    });
    html += '</div><div class="card"><h3>بيانات التواصل</h3><p class="hint">اترك الحقل فارغًا لإخفائه من صفحة التواصل.</p>';
    CONTACT_FIELDS.forEach(function (f) {
      html += '<label class="field">' + f[1] + '<input data-c="' + f[0] + '" value="' + esc(data.contact[f[0]] || "") + '"' + (f[2] ? ' dir="ltr"' : "") + "></label>";
    });
    html += "</div></div>";
    return html;
  }

  function viewSettings() {
    var st = data.settings;
    return '<div class="cards">' +
      '<div class="card"><h3>قفل الموقع كاملًا</h3>' +
      '<p class="hint">عند التفعيل يطلب الموقع كلمة مرور قبل عرض أي صفحة (بما فيها الرئيسية)، إضافة لكلمات مرور الأقسام.</p>' +
      '<label class="check"><input type="checkbox" data-st="passwordProtection"' + (st.passwordProtection ? " checked" : "") + "> تفعيل كلمة مرور للموقع كاملًا</label>" +
      '<label class="field">كلمة مرور جديدة للموقع (اتركها فارغة للإبقاء على الحالية)<input data-st="password" dir="ltr" autocomplete="off"></label>' +
      '<p class="ok-note" data-pw-note></p>' +
      '<label class="field">تذكّر الدخول<select data-st="rememberUnlock">' +
      '<option value="session"' + (st.rememberUnlock !== "device" ? " selected" : "") + ">حتى إغلاق المتصفح</option>" +
      '<option value="device"' + (st.rememberUnlock === "device" ? " selected" : "") + ">دائمًا على نفس الجهاز</option></select></label></div>" +
      '<div class="card"><h3>المظهر</h3>' +
      '<label class="field">الوضع عند أول زيارة<select data-st="defaultTheme">' +
      [["dark", "داكن"], ["light", "فاتح"], ["system", "حسب جهاز الزائر"]].map(function (o) {
        return '<option value="' + o[0] + '"' + ((st.defaultTheme || "dark") === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></label></div>" +
      '<div class="card"><h3>تنبيه مهم عن الحماية</h3><p class="muted" style="margin:0">' +
      "كلمات المرور هنا «ردع» يمنع الزائر العادي، وليست حماية أمنية حقيقية: GitHub Pages يعرض كل الملفات علنًا، " +
      "ومن يعرف رابط صورة مباشر يستطيع فتحها. للخصوصية الحقيقية (مثل معارض العملاء) استخدم Cloudflare Access — الشرح في دليل الاستخدام.</p></div>" +
      "</div>";
  }

  /* ── الأحداث ───────────────────────────────────────────────────────────── */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var tabBtn = t.closest("[data-tab]");
    if (tabBtn) { tab = tabBtn.getAttribute("data-tab"); render(); return; }
    if (t.closest("[data-save]")) { save(); return; }
    if (t.closest("[data-logout]")) { logout(); return; }

    var card = t.closest(".pcard");
    if (card) {
      var id = card.getAttribute("data-id");
      var mv = t.closest("[data-move]");
      if (mv) {
        var list = visiblePhotos(), i = list.findIndex(function (p) { return p.id === id; });
        var other = list[i + Number(mv.getAttribute("data-move"))];
        if (other) movePhoto(id, other.id);
        return;
      }
      if (t.closest("[data-delete]")) {
        var p = data.photos.filter(function (x) { return x.id === id; })[0];
        if (!confirm("حذف الصورة «" + (p.title || "بدون عنوان") + "» من الموقع؟")) return;
        if (uploads[id]) delete uploads[id];
        else photoPaths(p).forEach(function (path) { deletes[path] = true; });
        data.photos = data.photos.filter(function (x) { return x.id !== id; });
        data.sections.forEach(function (s) { if (s.cover === id) s.cover = ""; });
        changed(); render(); toast("حُذفت الصورة — اضغط «حفظ ونشر» لتطبيق الحذف.");
        return;
      }
    }

    var sc = t.closest("[data-sid]");
    if (sc) {
      var sid = sc.getAttribute("data-sid"), idx = data.sections.findIndex(function (s) { return s.id === sid; });
      var sm = t.closest("[data-smove]");
      if (sm) {
        var j = idx + Number(sm.getAttribute("data-smove"));
        if (j < 0 || j >= data.sections.length) return;
        var it = data.sections.splice(idx, 1)[0]; data.sections.splice(j, 0, it);
        changed(); render(); return;
      }
      if (t.closest("[data-sdelete]")) {
        if (photosIn(sid).length) { toast("انقل صور هذا القسم أو احذفها أولًا.", true); return; }
        if (!confirm("حذف قسم «" + data.sections[idx].title + "»؟")) return;
        data.sections.splice(idx, 1); changed(); render(); return;
      }
    }
    var cp = t.closest("[data-copy]");
    if (cp) {
      (navigator.clipboard ? navigator.clipboard.writeText(cp.getAttribute("data-copy")) : Promise.reject())
        .then(function () { toast("نُسخ الرابط"); }, function () { toast("انسخ الرابط يدويًا", true); });
      return;
    }
    if (t.closest("[data-add-section]")) addSection();
  });

  document.addEventListener("input", function (e) {
    var t = e.target, card = t.closest(".pcard");
    if (card && t.matches("[data-f=title], [data-f=alt]")) {
      var p = data.photos.filter(function (x) { return x.id === card.getAttribute("data-id"); })[0];
      p[t.getAttribute("data-f")] = t.value; changed(); return;
    }
    var sc = t.closest("[data-sid]");
    if (sc && t.matches("[data-s=title], [data-s=description]")) {
      sectionById(sc.getAttribute("data-sid"))[t.getAttribute("data-s")] = t.value;
      if (t.getAttribute("data-s") === "title") $("h3", sc).textContent = t.value || "قسم بدون اسم";
      changed(); return;
    }
    if (t.matches("[data-t]")) { data.texts[t.getAttribute("data-t")] = t.value; changed(); return; }
    if (t.matches("[data-c]")) { data.contact[t.getAttribute("data-c")] = t.value.trim(); changed(); return; }
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches("[data-filter]")) { filter = t.value; render(); return; }
    if (t.matches("[data-upload-input]")) { handleFiles(t.files); t.value = ""; return; }

    var card = t.closest(".pcard");
    if (card) {
      var p = data.photos.filter(function (x) { return x.id === card.getAttribute("data-id"); })[0], f = t.getAttribute("data-f");
      if (f === "home" || f === "feature") { p[f] = t.checked; changed(); return; }
      if (f === "section") {
        data.sections.forEach(function (s) { if (s.cover === p.id) s.cover = ""; });
        p.section = t.value; changed(); if (filter !== "all" && filter !== "home") render(); return;
      }
    }
    var sc = t.closest("[data-sid]");
    if (sc) {
      var s = sectionById(sc.getAttribute("data-sid")), k = t.getAttribute("data-s");
      if (k === "cover") { s.cover = t.value; changed(); return; }
      if (k === "locked") {
        s.locked = t.checked;
        if (t.checked && !s.passwordHash) toast("اكتب كلمة مرور لهذا القسم.", true);
        changed(); return;
      }
      if (k === "password" && t.value) {
        var v = t.value;
        sha256(v).then(function (h) {
          s.passwordHash = h; s.locked = true; t.value = "";
          $("[data-s=locked]", sc).checked = true;
          $("[data-pw-note]", sc).textContent = "تم تعيين كلمة المرور الجديدة: " + v + " — احفظها عندك.";
          changed();
        });
      }
      return;
    }
    if (t.matches("[data-st]")) {
      var key = t.getAttribute("data-st");
      if (key === "passwordProtection") {
        if (t.checked && !data.settings.passwordHash) { toast("اكتب كلمة مرور للموقع أولًا.", true); t.checked = false; return; }
        data.settings.passwordProtection = t.checked;
      } else if (key === "password" && t.value) {
        var pv = t.value;
        sha256(pv).then(function (h) {
          data.settings.passwordHash = h; t.value = "";
          $("[data-pw-note]").textContent = "تم تعيين كلمة مرور الموقع الجديدة: " + pv + " — احفظها عندك.";
          changed();
        });
        return;
      } else data.settings[key] = t.value;
      changed();
    }
  });

  // السحب والإفلات لترتيب الصور
  var dragId = null;
  document.addEventListener("dragstart", function (e) {
    var c = e.target.closest && e.target.closest(".pcard");
    if (!c) return;
    dragId = c.getAttribute("data-id"); c.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", dragId); } catch (err) {}
  });
  document.addEventListener("dragend", function () { dragId = null; $$(".pcard").forEach(function (c) { c.classList.remove("dragging", "drop-target"); }); });
  document.addEventListener("dragover", function (e) {
    var c = e.target.closest && e.target.closest(".pcard");
    var dz = e.target.closest && e.target.closest("[data-dropzone]");
    if (c && dragId) { e.preventDefault(); $$(".pcard.drop-target").forEach(function (x) { x.classList.remove("drop-target"); }); c.classList.add("drop-target"); }
    else if (dz && !dragId) { e.preventDefault(); dz.classList.add("drag"); }
  });
  document.addEventListener("dragleave", function (e) { var dz = e.target.closest && e.target.closest("[data-dropzone]"); if (dz) dz.classList.remove("drag"); });
  document.addEventListener("drop", function (e) {
    var c = e.target.closest && e.target.closest(".pcard");
    var dz = e.target.closest && e.target.closest("[data-dropzone]");
    if (c && dragId) { e.preventDefault(); movePhoto(dragId, c.getAttribute("data-id")); return; }
    if (dz && e.dataTransfer.files.length) { e.preventDefault(); dz.classList.remove("drag"); handleFiles(e.dataTransfer.files); }
  });

  function handleFiles(fileList) {
    if (cfg.local) { toast("رفع الصور يحتاج الاتصال بـ GitHub.", true); return; }
    var files = Array.prototype.filter.call(fileList, function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|tiff?)$/i.test(f.name); });
    if (!files.length) return;
    var sec = $("[data-upload-section]").value, prog = $("[data-upload-progress]");
    var added = [], failed = [], chain = Promise.resolve();
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        prog.textContent = "تجهيز الصورة " + ar(i + 1) + " من " + ar(files.length) + "…";
        return processFile(f, sec).then(function (p) { added.push(p); }, function () { failed.push(f.name); });
      });
    });
    chain.then(function () {
      // الصور الجديدة تُضاف في بداية القسم
      var firstIdx = data.photos.findIndex(function (p) { return p.section === sec; });
      if (firstIdx < 0) firstIdx = data.photos.length;
      Array.prototype.splice.apply(data.photos, [firstIdx, 0].concat(added));
      if (filter !== "all" && filter !== sec) filter = sec;
      changed(); render();
      var msg = "أُضيفت " + ar(added.length) + " صورة — اكتب عناوينها ثم اضغط «حفظ ونشر».";
      if (failed.length) msg += " تعذّر قراءة: " + failed.join("، ") + " (جرّب تصديرها JPEG).";
      toast(msg, failed.length > 0);
    });
  }

  function addSection() {
    var title = $("[data-new=title]").value.trim();
    var id = $("[data-new=id]").value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    var pw = $("[data-new=password]").value;
    if (!title) { toast("اكتب اسم القسم.", true); return; }
    if (!id) { toast("اكتب اسم الرابط بحروف إنجليزية، مثل drone.", true); return; }
    if (sectionById(id)) { toast("يوجد قسم بنفس اسم الرابط.", true); return; }
    (pw ? sha256(pw) : Promise.resolve("")).then(function (h) {
      data.sections.push({ id: id, title: title, description: "", cover: "", locked: !!h, passwordHash: h });
      changed(); render();
      toast(pw ? "أُضيف القسم. كلمة مروره: " + pw + " — احفظها عندك." : "أُضيف القسم (بدون كلمة مرور).");
    });
  }

  /* ── الدخول والخروج ────────────────────────────────────────────────────── */
  function start(c) {
    cfg = c;
    var err = $("[data-connect-error]");
    err.textContent = "";
    var btn = $("[data-connect-form] button[type=submit]");
    btn.disabled = true; btn.textContent = "جارٍ الاتصال…";
    (cfg.local ? loadLocal() : loadFromGitHub()).then(function (d) {
      d.settings = d.settings || {}; d.texts = d.texts || {}; d.contact = d.contact || {};
      d.sections = d.sections || []; d.photos = d.photos || [];
      data = d; original = serialize();
      $("[data-view-connect]").hidden = true;
      $("[data-view-app]").hidden = false;
      $("[data-repo-label]").textContent = cfg.local ? "وضع التجربة — لا يُحفظ شيء على الموقع" : cfg.owner + "/" + cfg.repo + " · " + cfg.branch;
      render();
    }).catch(function (e) {
      err.textContent = e.message || "تعذّر الاتصال.";
      cfg = null;
    }).then(function () { btn.disabled = false; btn.textContent = "اتصال"; });
  }

  function logout() {
    if (isDirty() && !confirm("توجد تعديلات غير منشورة. الخروج بدون حفظ؟")) return;
    try { localStorage.removeItem(CFG_KEY); sessionStorage.removeItem(CFG_KEY); } catch (e) {}
    data = null; location.reload();
  }

  $("[data-connect-form]").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var c = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || "main", token: f.token.value.trim() };
    try {
      var s = f.remember.checked ? localStorage : sessionStorage;
      s.setItem(CFG_KEY, JSON.stringify(c));
    } catch (err) {}
    start(c);
  });
  $("[data-local-mode]").addEventListener("click", function () { start({ local: true }); });

  // دخول تلقائي إن كانت البيانات محفوظة
  try {
    var saved = JSON.parse(localStorage.getItem(CFG_KEY) || sessionStorage.getItem(CFG_KEY) || "null");
    if (saved && saved.token) {
      var f = $("[data-connect-form]");
      f.owner.value = saved.owner; f.repo.value = saved.repo; f.branch.value = saved.branch;
      start(saved);
    }
  } catch (e) {}
})();
