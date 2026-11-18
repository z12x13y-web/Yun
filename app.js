/* Yun 影视 · 前端逻辑
* 影视源：FongMi/TVBox 格式 JSON 配置（sites / parses），也支持多仓索引（urls）
* 网页端只能直连提供 HTTP JSON 接口（type 1）的站点；csp_ 开头的原生爬虫站点需在 App 内运行。
*/
(function () {
 "use strict";

 var DEFAULT_SOURCE = "http://xhztv.top/dc";
 var LS_SOURCE = "yun:source";
 var LS_ITEM = "yun:item";
 var $ = function (s) { return document.querySelector(s); };
 var $$ = function (s) { return [].slice.call(document.querySelectorAll(s)); };
 var esc = function (v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
   return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
 };

 var state = { sourceUrl: "", sites: [], repos: [], items: [], sort: "date", demo: true, message: "" };

 function sourceUrl() {
  var q = new URLSearchParams(location.search);
  return q.get("source") || localStorage.getItem(LS_SOURCE) || DEFAULT_SOURCE;
 }

 function setSource(url) {
  if (url && url !== DEFAULT_SOURCE) localStorage.setItem(LS_SOURCE, url);
  else localStorage.removeItem(LS_SOURCE);
  state.sourceUrl = url || DEFAULT_SOURCE;
 }

 /* 影视源：读取并解析站点列表 */
 function loadConfig(url) {
  return fetch(url, { cache: "no-store" }).then(function (r) {
   if (!r.ok) throw new Error("影视源返回 " + r.status);
   return r.json();
  }).then(function (cfg) {
   state.repos = [];
   if (cfg && cfg.urls && cfg.urls.length) {
    /* 多仓索引：urls 是下一级影视源地址，网页端受跨域限制通常读不到 */
    state.repos = cfg.urls.filter(function (u) { return u && u.url; }).map(function (u) {
     return { name: u.name || u.url, url: u.url };
    });
    state.sites = [];
    return state.sites;
   }
   state.sites = ((cfg && cfg.sites) || []).filter(function (s) {
    return s && s.name && s.api;
   }).map(function (s) {
    return {
     name: s.name,
     api: s.api,
     native: String(s.api).indexOf("csp_") === 0,
     direct: !String(s.api).indexOf("csp_") && /^https?:\/\//i.test(s.api)
    };
   });
   return state.sites;
  });
 }

 function siteApi(site, params) {
  var qs = Object.keys(params).map(function (k) {
   return k + "=" + encodeURIComponent(params[k]);
  }).join("&");
  return site.api + (site.api.indexOf("?") >= 0 ? "&" : "?") + qs;
 }

 /* 取片单：只对可直连的站点发请求 */
 function fetchVideos(site) {
  return fetch(siteApi(site, { ac: "videolist", t: 1, pg: 1 }), { cache: "no-store" })
   .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
   .then(function (data) {
    if (!data || !data.list || !data.list.length) throw new Error("空片单");
    return data.list.map(function (v) {
     var eps = [];
     if (v.vod_play_url) {
      String(v.vod_play_url).split("#").forEach(function (chunk, i) {
       var p = chunk.split("$");
       if (p.length > 1) eps.push({ name: p[0] || "第" + (i + 1) + "集", url: p.slice(1).join("$") });
      });
     }
     return {
      id: String(v.vod_id || ""),
      name: v.vod_name || "未命名",
      year: v.vod_year || "",
      score: v.vod_score ? String(v.vod_score) : "",
      quality: /4K|2160/i.test(v.vod_remarks || "") ? "4K" : (/1080/i.test(v.vod_remarks || "") ? "1080" : ""),
      pic: v.vod_pic || "",
      content: String(v.vod_content || "").replace(/<[^>]+>/g, ""),
      tags: String(v.type_name || "").split(/[,/]/).filter(Boolean).slice(0, 2),
      sources: [{ name: site.name, count: eps.length }],
      episodes: eps
     };
    });
   });
 }

 /* 列表页 */
 function card(item) {
  var poster = item.pic
   ? '<img class="card__img" src="' + esc(item.pic) + '" alt="" loading="lazy" onerror="this.remove()">'
   : '<div class="card__img card__img--ph"><span>' + esc(item.name.slice(0, 4)) + "</span></div>";
  return '<a class="card" href="detail.html?id=' + encodeURIComponent(item.id) + '">' +
   '<div class="card__poster">' + poster +
   (item.score ? '<span class="card__score">' + esc(item.score) + "</span>" : "") +
   (item.quality ? '<span class="card__quality">' + esc(item.quality) + "</span>" : "") +
   "</div><div class=\"card__name\">" + esc(item.name) + "</div>" +
   '<div class="card__year">' + esc(item.year) + "</div></a>";
 }

 function renderList() {
  var list = state.items.slice();
  if (state.sort === "score") list.sort(function (a, b) { return (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0); });
  if (state.sort === "year") list.sort(function (a, b) { return (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0); });
  $("#grid").innerHTML = list.map(card).join("");
  $("#count").textContent = list.length;
  $("#sortBtn").firstChild.nodeValue = { date: "按添加日期", score: "按评分", year: "按年份" }[state.sort];
  $("#note").hidden = !state.message;
  $("#note").textContent = state.message;
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

  loadConfig(state.sourceUrl).then(function (sites) {
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
  }).then(renderList);
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
