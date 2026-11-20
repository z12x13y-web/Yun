/* Yun 首页：分区横向卡片（标题 + 数量 + 箭头），数据来自构建快照 data.json */
(function () {
  var elSections = document.getElementById("sections");
  var elFooter = document.getElementById("footer");
  var elSearch = document.getElementById("searchbar");
  var elInput = document.getElementById("searchInput");
  var elBtn = document.getElementById("searchBtn");

  var TITLES = { movie: "电影", tv: "电视剧", anime: "动漫", variety: "综艺" };
  var ORDER = ["movie", "tv", "anime", "variety"];

  var state = { sections: [], all: [] };

  function demoData() {
    var names = {
      movie: ["肖申克的救赎", "霸王别姬", "泰坦尼克号", "十二生肖"],
      tv: ["今天是太阳雨", "不眠日", "爱你", "当我飞奔向你"],
      anime: ["斗罗大陆", "咒术回战", "间谍过家家", "时光代理人"],
      variety: ["不止此行", "后会无期", "脱口秀大会", "奔跑吧"]
    };
    var metas = { movie: ["1994-09-10", "1993-01-01", "1997-12-19", "2012-12-20"],
                  tv: ["共1季", "共1季", "共1季", "共1季"],
                  anime: ["更新至120集", "全24集", "全12集", "全11集"],
                  variety: ["共12期", "共10期", "共8期", "更新至6期"] };
    return ORDER.map(function (k) {
      return {
        key: k, title: TITLES[k],
        items: names[k].map(function (n, i) {
          return { name: n, pic: "", score: (9.7 - i * 0.3).toFixed(1), meta: metas[k][i] };
        })
      };
    });
  }

  function render(list, query) {
    elSections.innerHTML = "";
    if (!list.length) {
      elSections.innerHTML = '<p class="footer">没有找到相关影片。</p>';
      return;
    }
    list.forEach(function (sec) {
      var items = sec.items;
      if (query) {
        items = items.filter(function (it) {
          return (it.name || "").toLowerCase().indexOf(query) >= 0;
        });
        if (!items.length) return;
      }
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
      items.forEach(function (it) {
        rail.appendChild(card(it));
      });
      section.appendChild(rail);
      elSections.appendChild(section);
    });
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

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function boot(data) {
    var sections = (data && data.sections) || [];
    var all = [];
    sections.forEach(function (s) {
      s.items = s.items || [];
      all = all.concat(s.items);
    });
    state.sections = sections;
    state.all = all;
    render(sections, "");
    elFooter.textContent = data && data.site
      ? "数据来自「" + data.site + "」，抓取于 " + (data.builtAt || "") + "。" +
        "本应用只提供界面，内容由使用者自行配置的影视源提供。"
      : "当前为示例数据：影视源不可用时展示。请在设置中配置可用的影视源。";
  }

  fetch("data.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("no data"); return r.json(); })
    .then(function (d) {
      if (!d || !d.sections || !d.sections.length) throw new Error("empty");
      boot(d);
    })
    .catch(function () { boot({ sections: demoData() }); });

  elBtn.addEventListener("click", function () {
    var shown = !elSearch.hidden;
    elSearch.hidden = shown;
    if (!shown) elInput.focus();
    else { elInput.value = ""; render(state.sections, ""); }
  });

  elInput.addEventListener("input", function () {
    var q = elInput.value.trim().toLowerCase();
    render(state.sections, q);
  });
})();
