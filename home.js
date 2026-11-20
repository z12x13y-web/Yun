/* Yun 首页：分区横滑卡片（标题 + 数量 + 箭头）
 * 数据顺序：内置快照 data.json → App 内原生请求影视源 → 示例数据 */
(function () {
  var elSections = document.getElementById("sections");
  var elFooter = document.getElementById("footer");
  var elSearch = document.getElementById("searchbar");
  var elInput = document.getElementById("searchInput");
  var elBtn = document.getElementById("searchBtn");
  var elBrand = document.querySelector(".brand");

  var TITLES = { movie: "电影", tv: "电视剧", anime: "动漫", variety: "综艺" };
  var ORDER = ["movie", "tv", "anime", "variety"];
  var SOURCE_KEY = "yun.source";
  var DEFAULT_SOURCE = "http://xhztv.top/dc";
  var PER_CAT = 12;

  var state = { sections: [], loading: true };

  /* ---------- 数据获取 ---------- */

  function nativeGet(url) {
    try {
      if (window.YunNative && window.YunNative.get) return window.YunNative.get(url);
    } catch (e) {}
    return null;
  }

  function httpGet(url) {
    var n = nativeGet(url);
    if (n !== null && n !== undefined && n !== "") return Promise.resolve(n);
    return fetch(url, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : null; })
      .catch(function () { return null; });
  }

  function parseJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) {}
    try {
      var t = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
        .replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(t);
    } catch (e) { return null; }
  }

  function collectSites(cfg, depth) {
    depth = depth || 0;
    var out = [];
    ((cfg && cfg.sites) || []).forEach(function (s) {
      var api = String(s.api || "");
      if (Number(s.type) === 1 && /^https?:/i.test(api)) out.push({ name: s.name || api, api: api });
    });
    if (depth === 0 && cfg && cfg.urls) {
      cfg.urls.slice(0, 2).forEach(function (u) { /* 下级配置留到下一轮 */ });
    }
    return out;
  }

  function classify(v) {
    var t = [v.type_name, v.vod_type, v.vod_class].join(" ");
    if (/动漫|动画|番剧|国漫/.test(t)) return "anime";
    if (/综艺|真人秀|脱口秀|晚会/.test(t)) return "variety";
    if (/剧|电视/.test(t)) return "tv";
    if (/片|电影/.test(t)) return "movie";
    return null;
  }

  function toItem(v) {
    var score = String(v.vod_score || "").trim();
    var meta = String(v.vod_remarks || v.vod_pubdate || v.vod_year || "").trim();
    return {
      name: String(v.vod_name || "").trim(),
      pic: String(v.vod_pic || "").trim(),
      score: score && score !== "0" && score !== "0.0" ? score : "",
      meta: meta
    };
  }

  function liveData() {
    var src = localStorage.getItem(SOURCE_KEY) || DEFAULT_SOURCE;
    return httpGet(src).then(function (text) {
      var cfg = parseJson(text);
      var sites = collectSites(cfg);
      if (!sites.length) return null;
      var buckets = { movie: [], tv: [], anime: [], variety: [] };
      var idx = 0;

      function nextSite() {
        if (idx >= Math.min(sites.length, 6)) return Promise.resolve(finish());
        var site = sites[idx++];
        var pg = 1;
        function nextPage() {
          if (pg > 3) return nextSite();
          var u = site.api + (site.api.indexOf("?") >= 0 ? "&" : "?") + "ac=videolist&pg=" + pg;
          pg++;
          return httpGet(u).then(function (body) {
            var data = parseJson(body);
            ((data && data.list) || []).forEach(function (v) {
              var cat = classify(v);
              if (!cat || buckets[cat].length >= PER_CAT) return;
              var it = toItem(v);
              if (it.name && it.pic) buckets[cat].push(it);
            });
            var enough = ORDER.every(function (k) { return buckets[k].length >= 6; });
            return enough ? finish() : nextPage();
          });
        }
        return nextPage();
      }

      function finish() {
        var total = ORDER.reduce(function (n, k) { return n + buckets[k].length; }, 0);
        if (!total) return null;
        return {
          site: (sites[0] && sites[0].name) || "影视源",
          builtAt: new Date().toLocaleString(),
          sections: ORDER.map(function (k) {
            return { key: k, title: TITLES[k], items: buckets[k] };
          }).filter(function (s) { return s.items.length; })
        };
      }
      return nextSite();
    }).catch(function () { return null; });
  }

  /* ---------- 示例数据 ---------- */

  function demoData() {
    var names = {
      movie: ["肖申克的救赎", "霸王别姬", "泰坦尼克号", "十二生肖"],
      tv: ["今天是太阳雨", "不眠日", "爱你", "当我飞奔向你"],
      anime: ["斗罗大陆", "咒术回战", "间谍过家家", "时光代理人"],
      variety: ["不止此行", "后会无期", "脱口秀大会", "奔跑吧"]
    };
    var metas = {
      movie: ["1994-09-10", "1993-01-01", "1997-12-19", "2012-12-20"],
      tv: ["共1季", "共1季", "共1季", "共1季"],
      anime: ["更新至120集", "全24集", "全12集", "全11集"],
      variety: ["共12期", "共10期", "共8期", "更新至6期"]
    };
    return ORDER.map(function (k) {
      return {
        key: k, title: TITLES[k],
        items: names[k].map(function (n, i) {
          return { name: n, pic: "", score: (9.7 - i * 0.3).toFixed(1), meta: metas[k][i] };
        })
      };
    });
  }

  /* ---------- 渲染 ---------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function card(it) {
    var a = document.createElement("a");
    a.className = "card";
    a.href = "detail.html?name=" + encodeURIComponent(it.name || "") +
      "&score=" + encodeURIComponent(it.score || "") +
      "&meta=" + encodeURIComponent(it.meta || "") +
      "&pic=" + encodeURIComponent(it.pic || "");
    var score = (it.score || "").toString().trim();
    a.innerHTML =
      '<div class="poster">' +
      (it.pic ? '<img loading="lazy" src="' + esc(it.pic) + '" alt="" onerror="this.style.display=\'none\'">' : "") +
      '<span class="poster__fallback">' + (it.pic ? "" : esc(it.name)) + "</span>" +
      (score ? '<span class="score">' + esc(score) + "</span>" : "") +
      "</div>" +
      '<p class="card__title">' + esc(it.name) + "</p>" +
      '<p class="card__meta">' + esc(it.meta || "") + "</p>";
    return a;
  }

  function render(list, query) {
    elSections.innerHTML = "";
    var shown = 0;
    list.forEach(function (sec) {
      var items = sec.items || [];
      if (query) {
        items = items.filter(function (it) {
          return (it.name || "").toLowerCase().indexOf(query) >= 0;
        });
      }
      if (!items.length) return;
      shown++;
      var section = document.createElement("section");
      section.className = "section";

      var head = document.createElement("button");
      head.className = "section__head";
      head.type = "button";
      head.innerHTML =
        '<span class="section__title">' + esc(sec.title) + "</span>" +
        '<span class="section__count">' + items.length + "</span>" +
        '<svg class="section__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      section.appendChild(head);

      var rail = document.createElement("div");
      rail.className = "rail";
      items.forEach(function (it) { rail.appendChild(card(it)); });
      section.appendChild(rail);
      elSections.appendChild(section);
    });
    if (!shown) {
      elSections.innerHTML = '<p class="footer">没有找到相关影片。</p>';
    }
  }

  function boot(data, note) {
    state.sections = (data && data.sections) || [];
    state.loading = false;
    render(state.sections, "");
    elFooter.textContent = note || "";
  }

  /* ---------- 启动 ---------- */

  function welcome(note) {
    render(demoData(), "");
    elFooter.textContent = note;
  }

  welcome("正在从影视源加载…");

  fetch("data.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var has = d && d.sections && d.sections.some(function (s) { return s.items && s.items.length; });
      if (has) {
        boot(d, "数据来自「" + d.site + "」，抓取于 " + (d.builtAt || "") + "。");
        return null;
      }
      return liveData().then(function (live) {
        if (live) {
          boot(live, "数据来自「" + live.site + "」，抓取于 " + live.builtAt + "。内容由使用者自行配置的影视源提供。");
        } else {
          boot({ sections: demoData() }, "暂时连不上影视源，先展示示例数据。长按左上角 Yun 可以改影视源地址。");
        }
      });
    })
    .catch(function () {
      boot({ sections: demoData() }, "示例数据。长按左上角 Yun 可以改影视源地址。");
    });

  /* ---------- 交互 ---------- */

  elBtn.addEventListener("click", function () {
    var shown = !elSearch.hidden;
    elSearch.hidden = shown;
    if (!shown) elInput.focus();
    else { elInput.value = ""; render(state.sections, ""); }
  });

  elInput.addEventListener("input", function () {
    render(state.sections, elInput.value.trim().toLowerCase());
  });

  var pressTimer = null;
  if (elBrand) {
    elBrand.addEventListener("touchstart", function () {
      pressTimer = setTimeout(function () {
        var cur = localStorage.getItem(SOURCE_KEY) || DEFAULT_SOURCE;
        var v = prompt("影视源配置地址（TVBox JSON）", cur);
        if (v && v.trim()) {
          localStorage.setItem(SOURCE_KEY, v.trim());
          location.reload();
        }
      }, 700);
    });
    elBrand.addEventListener("touchend", function () { clearTimeout(pressTimer); });
    elBrand.addEventListener("touchmove", function () { clearTimeout(pressTimer); });
  }
})();
