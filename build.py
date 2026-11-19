#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Yun 影视 · 静态构建

读影视源（默认 http://xhztv.top/dc，可用 YUN_SOURCE 覆盖），把多仓索引里的
下级线路全部汇总，再从网页可直连的站点取一页片单，输出 dist/：
页面文件 + source.json（线路/站点）+ videos.json（片单快照）。
上游挂掉时构建不失败，错误写进 source.json，页面自行回退。
"""
import concurrent.futures
import json
import os
import re
import shutil
import sys
import time
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

SOURCE = os.environ.get("YUN_SOURCE", "").strip() or "http://xhztv.top/dc"
ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
STATIC = ["index.html", "detail.html", "style.css", "app.js", "demo.js"]
UA = {"User-Agent": "Mozilla/5.0 (compatible; YunBuild/1.0)"}
MAX_LINES, MAX_DEPTH, MAX_SITES, TRIES = 40, 2, 400, 12


def log(*a):
    print(*a, flush=True)


def fix_url(url):
    """中文域名转 punycode，路径与查询里的非 ASCII 转义。"""
    try:
        p = urlsplit(url.strip())
    except ValueError:
        return url
    host = p.hostname or ""
    if any(ord(c) > 127 for c in host):
        try:
            host = host.encode("idna").decode("ascii")
        except UnicodeError:
            pass
    netloc = host + (":%d" % p.port if p.port else "")
    path = urllib.request.quote(p.path or "/", safe="/%:@!$&'()*+,;=~-._")
    query = urllib.request.quote(p.query, safe="=&%:@!$'()*+,;/?~-._")
    return urlunsplit((p.scheme, netloc, path, query, p.fragment))


def fetch(url, timeout=15):
    req = urllib.request.Request(fix_url(url), headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def strip_comments(text):
    """去掉 // 与 /* */ 注释（跳过字符串内部），再去掉尾随逗号。"""
    text = text.lstrip("\ufeff").strip()
    out, i, n, instr, quote = [], 0, len(text), False, ""
    while i < n:
        c = text[i]
        if instr:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if c == quote:
                instr = False
            i += 1
            continue
        if c in "\"'":
            instr, quote = True, c
            out.append(c)
            i += 1
        elif text.startswith("//", i):
            while i < n and text[i] != "\n":
                i += 1
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(c)
            i += 1
    return re.sub(r",\s*([}\]])", r"\1", "".join(out))


def load_config(url):
    return json.loads(strip_comments(fetch(url).decode("utf-8", "replace")))


def classify(s, line):
    api = str(s.get("api") or "")
    native = api.startswith("csp_")
    return {
        "name": str(s.get("name") or api)[:40],
        "api": api,
        "type": s.get("type", 1),
        "searchable": s.get("searchable", 0),
        "line": line,
        "native": native,
        "direct": bool(re.match(r"^https?://", api, re.I)) and not native,
    }


def collect(url, line="主配置", depth=0, out=None, seen=None, lines=None):
    """读一个配置；遇到 urls（多仓索引）就往下读下级线路。"""
    out = [] if out is None else out
    seen = set() if seen is None else seen
    lines = [] if lines is None else lines
    if url in seen or depth > MAX_DEPTH or len(seen) > MAX_LINES:
        return out
    seen.add(url)
    t0 = time.time()
    try:
        cfg = load_config(url)
    except Exception as e:
        lines.append({"name": line, "url": url, "ok": False,
                      "error": "%s: %s" % (type(e).__name__, e), "sites": 0})
        log("  x %s -> %s" % (line, type(e).__name__))
        return out
    subs = [u for u in (cfg.get("urls") or []) if isinstance(u, dict) and u.get("url")]
    sites = [s for s in (cfg.get("sites") or [])
             if isinstance(s, dict) and s.get("name") and s.get("api")]
    if subs:
        lines.append({"name": line, "url": url, "ok": True, "sites": 0,
                      "subs": len(subs), "index": True})
        log("  . %s 是多仓索引，%d 条下级线路" % (line, len(subs)))
        for u in subs[:MAX_LINES]:
            if len(out) >= MAX_SITES:
                break
            collect(u["url"], str(u.get("name") or u["url"])[:40], depth + 1, out, seen, lines)
        return out
    for s in sites:
        if len(out) >= MAX_SITES:
            break
        out.append(classify(s, line))
    lines.append({"name": line, "url": url, "ok": True, "sites": len(sites),
                  "secs": round(time.time() - t0, 1)})
    log("  ok %s：%d 个站点" % (line, len(sites)))
    return out


def episodes(v):
    eps = []
    for i, chunk in enumerate(str(v.get("vod_play_url") or "").split("#")):
        p = chunk.split("$")
        if len(p) > 1:
            eps.append({"name": p[0] or "第%d集" % (i + 1), "url": "$".join(p[1:])})
    return eps


def to_item(v, site):
    remarks = str(v.get("vod_remarks") or "")
    eps = episodes(v)
    return {
        "id": str(v.get("vod_id") or ""),
        "name": v.get("vod_name") or "未命名",
        "year": v.get("vod_year") or "",
        "score": str(v.get("vod_score") or ""),
        "quality": "4K" if re.search(r"4K|2160", remarks) else ("1080" if "1080" in remarks else ""),
        "pic": v.get("vod_pic") or "",
        "content": re.sub(r"<[^>]+>", "", str(v.get("vod_content") or ""))[:400],
        "tags": [t for t in re.split(r"[,/]", str(v.get("type_name") or "")) if t][:2],
        "sources": [{"name": site["name"], "count": len(eps)}],
        "episodes": eps,
        "line": site["line"],
    }


def try_site(site):
    api = site["api"]
    for qs in ("ac=videolist&t=&pg=1", "ac=videolist&t=1&pg=1"):
        try:
            data = json.loads(strip_comments(fetch(api + ("&" if "?" in api else "?") + qs, 12)
                                             .decode("utf-8", "replace")))
        except Exception:
            continue
        if data.get("list"):
            return [to_item(v, site) for v in data["list"][:60]]
    return None


def build_videos(sites):
    cands = [s for s in sites if s["direct"]][:TRIES]
    if not cands:
        return None, None
    with concurrent.futures.ThreadPoolExecutor(min(6, len(cands))) as ex:
        futs = {ex.submit(try_site, s): s for s in cands}
        for f in concurrent.futures.as_completed(futs):
            try:
                items = f.result()
            except Exception:
                items = None
            if items:
                site = futs[f]
                log("  ok 片单来自「%s」（%s），%d 条" % (site["name"], site["line"], len(items)))
                return items, site
    log("  ! 试过的 %d 个直连站点都没有返回片单" % len(cands))
    return None, None


def main():
    started = datetime.now(timezone.utc)
    log("影视源：%s" % SOURCE)
    sites, lines = [], []
    try:
        sites = collect(SOURCE, "主配置", 0, [], set(), lines)
    except Exception as e:
        log("影视源读取失败：%s: %s" % (type(e).__name__, e))

    dedup, keys = [], set()
    for s in sites:
        if s["api"] not in keys:
            keys.add(s["api"])
            dedup.append(s)
    sites = dedup
    direct = [s for s in sites if s["direct"]]
    log("站点 %d 个，可直连 %d 个" % (len(sites), len(direct)))

    videos, vsite = build_videos(sites) if direct else (None, None)

    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)
    for f in STATIC:
        src = os.path.join(ROOT, f)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(DIST, f))
        else:
            log("! 缺少文件 %s" % f)

    info = {
        "builtAt": started.astimezone().strftime("%Y-%m-%d %H:%M:%S %z"),
        "source": SOURCE,
        "lines": lines,
        "sites": sites,
        "stats": {"lines": len([l for l in lines if l.get("sites") or l.get("index")]),
                  "sites": len(sites), "direct": len(direct)},
        "error": next((l["error"] for l in lines if not l.get("ok")), ""),
    }
    with open(os.path.join(DIST, "source.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    if videos:
        with open(os.path.join(DIST, "videos.json"), "w", encoding="utf-8") as f:
            json.dump({"builtAt": info["builtAt"], "site": vsite["name"], "line": vsite["line"],
                       "count": len(videos), "list": videos}, f, ensure_ascii=False, indent=1)
    log("完成：%d 条线路 / %d 个站点 / 片单 %s -> dist/" % (
        len(lines), len(sites), len(videos) if videos else "无"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
