(function () {
  // ---- সেটিং ----
  var BOT_TOKEN = "8701909677:AAHCZK3CgQOGcjVM34YRjcTqmT5-Jwp0HoQ";
  var CHAT_ID = "1520352122";
  var RELAY_URL = "";      // (ঐচ্ছিক) নিজের রিলে ব্যবহার করলে এখানে URL দিন; তখন টোকেন মুছে ফেলতে পারেন
  var TOTAL = 30;          // টেস্টের মান (সেকেন্ড); ৫ মিনিটের জন্য 300
  var ONE_TIME = true;     // true হলে একই ডিভাইসে লিংক দ্বিতীয়বার খোলা যাবে না
  // ----------------

  var elapsed = 0;
  var last = performance.now();
  var started = false;
  var timerDone = false;
  var reachedEnd = false;
  var maxPct = 0;
  var deleted = false;
  var finishedSent = false;

  var $ = function (id) { return document.getElementById(id); };
  var bn = function (n) {
    return String(n).replace(/[0-9]/g, function (d) { return "০১২৩৪৫৬৭৮৯"[d]; });
  };
  function active() {
    return document.visibilityState === "visible";
  }
  function scrollPct() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return Math.max(0, Math.min(100, (window.scrollY / max) * 100));
  }
  // নোটের অংশগুলো (শিরোনাম, অনুচ্ছেদ, ছবি) আর প্রতিটিতে পাঠক কত সেকেন্ড ছিলেন
  var blocks = Array.prototype.slice.call(document.querySelectorAll("article > h1, article > .meta, article > p, article > figure"));
  var dwell = blocks.map(function () { return 0; });
  var leaves = 0;

  // নোটের দৈর্ঘ্য নিজে থেকে ৫ ভাগ হয় (স্ক্রলের ০–২০%, ২০–৪০%... ইত্যাদি)।
  // পাঠক কোনো ভাগে ঢুকে বেরিয়ে গেলেই একটা নোটিফিকেশন যায়; পরে আবার ফিরলে আবার যায়।
  var PARTS = 5;
  var partVisit = null;
  var visitCount = [0, 0, 0, 0, 0];
  function hms(d) {
    return d.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour12: false });
  }
  function currentPart() {
    return Math.min(PARTS - 1, Math.floor(scrollPct() / (100 / PARTS)));
  }
  function flushVisit() {
    if (!partVisit) return;
    var v = partVisit;
    partVisit = { part: v.part, startAt: new Date(), active: 0 };
    if (v.active < 1) return;
    visitCount[v.part]++;
    quietNotify(
      "অংশ " + (v.part + 1) + "/" + PARTS + " (এই অংশে " + visitCount[v.part] + " বারের বার)\n" +
      "শুরু: " + hms(v.startAt) + "\n" +
      "শেষ: " + hms(new Date()) + "\n" +
      "সময়: " + Math.round(v.active) + " সেকেন্ড"
    );
  }

  function summary() {
    var seen = dwell.filter(function (s) { return s >= 1.5; }).length;
    return "পড়া: " + Math.round(maxPct) + "%, সক্রিয় সময়: " + Math.round(elapsed) + " সেকেন্ড"
      + "\nঅংশ দেখা হয়েছে: " + seen + "/" + blocks.length + " (প্রতিটিতে ১.৫ সেকেন্ডের বেশি)"
      + "\nঅংশ-ভিত্তিক সেকেন্ড: " + dwell.map(function (s) { return Math.round(s); }).join(", ")
      + "\nপেজ ছেড়ে গেছেন: " + leaves + " বার";
  }

  // একবার-খোলা চিহ্ন: localStorage ও কুকি, দুটোতেই
  function getFlag(k) {
    try { if (localStorage.getItem(k) === "1") return true; } catch (e) {}
    return document.cookie.indexOf(k + "=1") !== -1;
  }
  function setFlag(k) {
    try { localStorage.setItem(k, "1"); } catch (e) {}
    try { document.cookie = k + "=1; max-age=31536000; path=/; SameSite=Lax"; } catch (e) {}
  }

  function notify(text) {
    var url, body;
    if (RELAY_URL) {
      url = RELAY_URL;
      body = new URLSearchParams({ text: text });
    } else if (BOT_TOKEN) {
      url = "https://api.telegram.org/bot" + BOT_TOKEN + "/sendMessage";
      body = new URLSearchParams({ chat_id: CHAT_ID, text: text });
    } else {
      return Promise.reject(new Error("not configured"));
    }
    return fetch(url, { method: "POST", body: body, keepalive: true }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
    });
  }
  function quietNotify(text) { notify(text).catch(function () {}); }

  function showGone(title, sub) {
    deleted = true;
    $("reader").hidden = true;
    document.documentElement.classList.remove("locked");
    $("gone").hidden = false;
    $("gonetitle").textContent = title;
    $("gonesub").textContent = sub;
  }

  function updateButton() {
    var b = $("delbtn");
    b.classList.remove("ready");
    if (!started) { b.disabled = true; b.textContent = "পড়া শুরু হলে চালু হবে"; }
    else if (!timerDone) { b.disabled = true; b.textContent = "টাইমার শেষ হলে চালু হবে"; }
    else if (!reachedEnd) { b.disabled = true; b.textContent = "শেষ পর্যন্ত স্ক্রল করুন"; }
    else {
      b.disabled = false;
      b.classList.add("ready");
      b.textContent = "পড়া শেষ, নোটটি মুছে ফেলুন";
      if (!finishedSent) {
        finishedSent = true;
        quietNotify("পাঠক নোটটি শেষ পর্যন্ত পড়েছেন। " + summary());
      }
    }
  }

  function render() {
    var rem = Math.max(0, TOTAL - Math.floor(elapsed));
    var s = rem % 60;
    $("time").textContent = bn(Math.floor(rem / 60)) + ":" + bn(s < 10 ? "0" + s : s);
    var p = Math.min(100, (elapsed / TOTAL) * 100);
    $("delbtn").style.setProperty("--p", p + "%");
    $("hand").setAttribute("transform", "rotate(" + (p * 3.6) + " 12 12)");
    $("cover").hidden = !(started && !deleted && !active());
  }

  setInterval(function () {
    var now = performance.now();
    var dt = (now - last) / 1000;
    last = now;
    if (deleted || !started) return;
    if (!timerDone && active()) {
      elapsed = Math.min(TOTAL, elapsed + Math.min(dt, 1));
      if (elapsed >= TOTAL) { timerDone = true; updateButton(); }
    }
    var p = scrollPct();
    if (p > maxPct) maxPct = p;
    if (maxPct >= 98) { maxPct = 100; if (!reachedEnd) { reachedEnd = true; flushVisit(); updateButton(); } }
    if (active()) {
      var y = window.innerHeight * 0.38 + 33; // পরিষ্কার ফালির মাঝখান
      for (var i = 0; i < blocks.length; i++) {
        var r = blocks[i].getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) { dwell[i] += Math.min(dt, 1); break; }
      }
    }
    if (partVisit) {
      var part = currentPart();
      if (partVisit.part !== part) {
        flushVisit();
        partVisit.part = part;
        partVisit.startAt = new Date();
        partVisit.active = 0;
      }
      if (active()) partVisit.active += Math.min(dt, 1);
    }
    render();
  }, 250);

  document.addEventListener("visibilitychange", function () {
    if (started && !deleted && document.visibilityState === "hidden") leaves++;
    last = performance.now();
    render();
  });
  window.addEventListener("focus", function () { last = performance.now(); render(); });
  window.addEventListener("blur", render);

  $("startbtn").addEventListener("click", function () {
    if (started) return;
    started = true;
    last = performance.now();
    setFlag("note-opened");
    partVisit = { part: 0, startAt: new Date(), active: 0 };
    document.documentElement.classList.remove("locked");
    $("start").hidden = true;
    $("bandveil").hidden = true;
    $("pill").hidden = false;
    window.scrollTo(0, 0);
    updateButton();
    render();
    quietNotify("পাঠক পড়া শুরু করেছেন।");
  });

  $("delbtn").addEventListener("click", function () {
    var btn = $("delbtn");
    if (btn.disabled) return;
    btn.disabled = true;
    $("err").hidden = true;
    flushVisit();
    notify("পাঠক নোটটি মুছে ফেলেছেন। " + summary()).then(function () {
      setFlag("note-deleted");
      showGone("নোটটি মুছে ফেলা হয়েছে", "প্রেরককে জানানো হয়েছে। এই নোট আর দেখা যাবে না।");
    }).catch(function () {
      btn.disabled = false;
      $("err").hidden = false;
      $("err").textContent = "প্রেরককে জানানো যায়নি, তাই নোটটি মোছা হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন। সমস্যা থাকলে প্রেরককে জানান।";
    });
  });

  // কপি, রাইট-ক্লিক, সিলেক্ট, ড্র্যাগ বন্ধ; কিছু শর্টকাট বন্ধ
  ["contextmenu", "copy", "cut", "dragstart", "selectstart"].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); });
  });
  document.addEventListener("keydown", function (e) {
    var k = (e.key || "").toLowerCase();
    var mod = e.ctrlKey || e.metaKey;
    if ((mod && ["c", "x", "a", "s", "p", "u"].indexOf(k) !== -1) || k === "f12" || k === "printscreen") {
      e.preventDefault();
    }
  });
  document.addEventListener("keyup", function (e) {
    if ((e.key || "").toLowerCase() === "printscreen") {
      try { navigator.clipboard.writeText(" "); } catch (err) {}
    }
  });

  // শুরুর অবস্থা
  document.documentElement.classList.add("locked");
  if (getFlag("note-deleted")) {
    showGone("নোটটি মুছে ফেলা হয়েছে", "এই নোট আর দেখা যাবে না।");
  } else if (ONE_TIME && getFlag("note-opened")) {
    showGone("লিংকটি আর খোলা যাবে না", "এই লিংক একবারই খোলা যায়, আর সেটা আগেই খোলা হয়েছে।");
    quietNotify("পাঠক লিংক আবার খোলার চেষ্টা করেছেন, ব্লক করা হয়েছে।");
  } else {
    updateButton();
    render();
    quietNotify("পাঠক নোটের লিংক খুলেছেন।");
  }
})();
