 /* 构建快照：source.json / videos.json 与页面同源，由 build.py 生成 */
 function loadBuilt() {
  return fetch("source.json", { cache: "no-store" }).then(function (r) {
   if (!r.ok) throw new Error("没有构建数据");
   return r.json();
  }).then(function (cfg) {
   state.sites = ((cfg && cfg.sites) || []).filter(function (s) {
    return s && s.name && s.api;
   }).map(function (s) {
    return { name: s.name, api: s.api, native: !!s.native, direct: !!s.direct };
   });
   return fetch("videos.json", { cache: "no-store" });
  }).then(function (r) {
   return r.ok ? r.json() : null;
  }).then(function (v) {
   if (!v || !v.list || !v.list.length) throw new Error("没有片单快照");
   state.items = v.list;
   state.demo = false;
   state.message = "构建快照：" + (state.sites.length ? state.sites.length + " 个站点，" : "") +
    v.count + " 部影片（播放源「" + v.site + "」，构建于 " + v.builtAt + "）。";
  }).catch(function () {
   return loadRemote();
  });
 }

 function loadRemote() {
  return loadConfig(state.sourceUrl).then(function (sites) {
   var direct = sites.filter(function (s) { return s.direct; });
   if (!direct.length) {
    if (state.repos.length) {
     state.message = "影视源是多仓索引（" + state.repos.length + " 个线路），网页端读取下级配置受跨域限制，当前为界面示例数据。";
    } else {
     state.message = "影视源已读取（" + sites.length + " 个站点），这些站点需要在 App 内运行；当前为界面示例数据。";
    }
    return;
   }
   return fetchVideos(direct[0]).then(function (items) {
    state.items = items;
    state.demo = false;
    state.message = "";
   }).catch(function () {
    state.message = "影视源已读取，但第一个可直连站点没有返回片单；当前为界面示例数据。";
   });
  }).catch(function (err) {
   state.message = "影视源读取失败（" + err.message + "），当前为界面示例数据。";
  })
 }

 function initList() {
  setSource(sourceUrl());
  state.sort = localStorage.getItem("yun:sort") || "date";
  state.items = window.YUN_DEMO.list;
  renderList();

  $("#grid").addEventListener("click", function (e) {
   var a = e.target.closest && e.target.closest("a.card");
   if (!a) return;
   var id = decodeURIComponent(a.getAttribute("href").split("id=")[1] || "");
   var item = state.items.filter(function (v) { return v.id === id; })[0];
   if (item) sessionStorage.setItem(LS_ITEM, JSON.stringify(item));
  });

  $("#sortBtn").addEventListener("click", function () {
   var order = ["date", "score", "year"];
   state.sort = order[(order.indexOf(state.sort) + 1) % 3];
   localStorage.setItem("yun:sort", state.sort);
   renderList();
  });

  $("#searchBtn").addEventListener("click", function () {
   $("#searchbar").hidden = !$("#searchbar").hidden;
   if (!$("#searchbar").hidden) $("#searchInput").focus();
  });

  var base = state.items;
  $("#searchInput").addEventListener("input", function (e) {
   var kw = e.target.value.trim();
   state.items = kw ? base.filter(function (v) { return v.name.indexOf(kw) >= 0; }) : base;
   renderList();
  });

  $("#sourceBtn").addEventListener("click", function () {
   $("#sourceSheet").hidden = false;
   $("#sourceInput").value = state.sourceUrl;
   renderSites();
  });
  $("#sourceSave").addEventListener("click", function () {
   var url = $("#sourceInput").value.trim();
   if (!url) return;
   setSource(url);
   location.reload();
  });

  var custom = !!localStorage.getItem(LS_SOURCE) || !!new URLSearchParams(location.search).get("source");
  (custom ? loadRemote() : loadBuilt()).then(renderList);
 }

 function renderSites() {
  var box = $("#siteList");
  if (!state.sites.length) {
   if (state.repos && state.repos.length) {
    box.innerHTML = '<p class="sheet__hint">该地址是多仓索引，含 ' + state.repos.length + ' 个线路配置：</p>' +
     state.repos.map(function (r) {
      return '<li class="site">' + esc(r.name) + '<em class="site__tag">下级配置</em></li>';
     }).join("");
    return;
   }
   box.innerHTML = '<p class="sheet__hint">还没有读到站点列表。</p>';
   return;
  }
  box.innerHTML = state.sites.map(function (s) {
   return "<li class=\"site\">" + esc(s.name) + '<em class="site__tag">' +
    (s.native ? "App 内运行" : "网页可直连") + "</em></li>";
  }).join("");
 }

 /* 详情页 */
 function initDetail() {
  setSource(sourceUrl());
  var q = new URLSearchParams(location.search);
  var id = q.get("id");
  var item = null;
  try { item = JSON.parse(sessionStorage.getItem(LS_ITEM) || "null"); } catch (e) { item = null; }
  if (!item || (id && item.id !== id)) {
   item = window.YUN_DEMO.list.filter(function (v) { return v.id === id; })[0] || window.YUN_DEMO.list[0];
  }

  document.title = item.name + " · 云影视";
  $("#dTitle").textContent = item.name;
  $("#dPlayerTitle").textContent = item.name + " · 第1集";
  $("#dScore").textContent = item.score || "暂无";
  $("#dIntro").textContent = item.content || "暂无简介。";
  $("#dTags").innerHTML = [item.year, (item.tags || [])[0]].filter(Boolean).map(function (t) {
   return '<span class="chip">' + esc(t) + "</span>";
  }).join("");

  var sources = (item.sources && item.sources.length) ? item.sources : [{ name: "小山·蓝光4K【推荐】", count: 20 }];
  $("#dSources").innerHTML = sources.map(function (s, i) {
   return '<button class="src' + (i === 0 ? " is-on" : "") + '" type="button">' + esc(s.name) +
    (s.count ? '<b class="src__n">' + s.count + "</b>" : "") + "</button>";
  }).join("");
  $$("#dSources .src").forEach(function (btn) {
   btn.addEventListener("click", function () {
    $$("#dSources .src").forEach(function (b) { b.classList.remove("is-on"); });
    btn.classList.add("is-on");
   });
  });

  var eps = (item.episodes && item.episodes.length) ? item.episodes : [];
  while (eps.length < (item.episodes || 0)) eps.push({ name: "第" + (eps.length + 1) + "集", url: "#" });
  $("#dEpCount").textContent = "更新至 " + eps.length + " 集";
  $("#dEps").innerHTML = eps.map(function (ep) {
   return '<a class="ep" href="' + esc(ep.url || "#") + '" target="_blank" rel="noopener">' +
    '<span class="ep__thumb"><span class="ep__badge">有资源</span>' +
    '<span class="ep__time">' + esc(ep.duration || "45:00") + "</span></span>" +
    '<span class="ep__name">' + esc(ep.name) + "</span></a>";
  }).join("");
 }

 document.addEventListener("DOMContentLoaded", function () {
  if (document.body.getAttribute("data-page") === "detail") initDetail();
  else initList();
 });
})();
