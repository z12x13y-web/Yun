# Yun 影视

一款影视浏览与播放客户端的界面实现：影片列表、影片详情、播放源切换与选集，影视源使用 FongMi/TVBox 的 JSON 配置格式。

- 列表页（深色）：3 列海报网格，左上评分、右下画质角标，支持按日期/评分/年份排序、搜索、影视源设置
- 详情页（浅色）：16:9 播放器、影视/影评标签、评分、类型标签、简介、弹幕/缓存/收藏/投屏、播放源切换、选集
- 影视源：直接读取配置里的 `sites`（站点即播放源）；若地址是多仓索引（`urls`），则列出其中的线路，在「影视源」面板可修改地址并即时生效

> 页面样式依据需求截图实现：列表页深色、详情页浅色。

## 影视源

默认配置地址（页面右上角「⋯」可修改，保存在浏览器本地）：

```
http://xhztv.top/dc
```

配置格式（FongMi / TVBox）：

```json
{
  "sites": [
    { "key": "site1", "name": "小山·蓝光4K【推荐】", "type": 1, "api": "https://example.com/api.php/provide/vod/", "searchable": 1 }
  ],
  "parses": []
}
```

- 站点列表显示在「影视源」面板，并标注「网页可直连 / App 内运行」
- `type: 1` 且 `api` 为 http(s) 的站点，网页端可直接请求 `?ac=videolist&t=&pg=` 取片单
- `api` 以 `csp_` 开头的原生爬虫站点只能在 FongMi TV 等 App 内运行，浏览器无法执行

### 多仓索引（`urls`）

有些地址不是站点配置，而是「多仓」索引，形如：

```json
{ "urls": [ { "name": "🚀小盒子", "url": "http://xhztv.top/xhz" } ] }
```

页面会把 `urls` 里的线路列在「影视源」面板（标注「下级配置」），不会当成站点直接取片单。

> 说明：2026-11-18 21:04 读取 `http://xhztv.top/dc` 时，它先 `301` 跳到 `http://xhztv.top/dc/`，返回 `200 application/json`，内容是 18 个线路的多仓索引（`{"urls": [...]}`），不是 `sites` 站点配置；响应里也没有 `Access-Control-Allow-Origin`，所以从其他域名打开的页面用浏览器直接读取会被跨域策略拦下。

## 目录结构

```
index.html    电影列表页
detail.html   影片详情 / 播放页
style.css     样式（列表页深色、详情页浅色）
app.js        影视源加载、片单解析、页面渲染
demo.js       界面示例数据（影视源不可用时回退）
```

## 运行

纯静态页面，无需构建：

```bash
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080/index.html
```

也可以直接打开 `index.html`（部分浏览器对 `file://` 的 fetch 有限制，建议用本地服务器）。

## 安装包（APK）

`android/` 是一个极简 WebView 壳：把构建产物放进 `assets`，用
`WebViewAssetLoader` 以 `https://appassets.androidplatform.net/assets/` 提供页面，
所以 `fetch("source.json")` 这类同源请求在 App 内也能正常工作。

GitHub Actions 的「打包 APK」workflow 会在推送 `android/**` 或手动触发时构建，
并把安装包传到 Release：

```
https://github.com/z12x13y-web/Yun/releases/tag/apk-latest
```

本地构建：

```bash
python3 build.py
mkdir -p android/app/src/main/assets && cp dist/* android/app/src/main/assets/
gradle -p android assembleRelease
```

## 说明

- 本项目只包含界面与影视源解析逻辑，不附带、不托管任何影片资源；播放内容来自使用者自行配置的影视源。
- 网页端受同源策略限制，影视源接口需要允许跨域；不支持跨域的接口需自备反向代理。
- 请仅用于播放你有权观看的内容，并遵守所在地区的法律法规。
