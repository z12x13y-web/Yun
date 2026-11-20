#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Yun 首页数据构建：从 TVBox 配置里挑一个可直连站点，抓几页片单，
按类型归到 电影 / 电视剧 / 动漫 / 综艺 四个分区，输出 data.json。
网络不通或全部失败时输出空分区，页面自动回退示例数据。"""
import json, os, sys, urllib.request, concurrent.futures
from datetime import datetime

SOURCE = os.environ.get("YUN_SOURCE", "").strip() or "http://xhztv.top/dc"
UA = {"User-Agent": "Mozilla/5.0 (compatible; YunBuild/2.0)"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")
CATS = [("movie", "电影"), ("tv", "电视剧"), ("anime", "动漫"), ("variety", "综艺")]
PER_CAT = 12


def log(*a):
    print(*a, flush=True)


def get(url, timeout=15):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load_json(url):
    raw = get(url).decode("utf-8", "replace").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        import re
        raw = re.sub(r"//[^\n]*", "", raw)
        raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
        raw = re.sub(r",\s*([}\]])", r"\1", raw)
        return json.loads(raw)


def sites_of(cfg, depth=0):
    out = []
    for s in cfg.get("sites") or []:
        api = str(s.get("api") or "")
        if s.get("type") == 1 and api.startswith("http"):
            out.append({"name": s.get("name") or api, "api": api})
    for u in (cfg.get("urls") or [])[:2] if depth == 0 else []:
        try:
            out.extend(sites_of(load_json(u.get("url")), depth + 1))
        except Exception:
            pass
    return out


def classify(item):
    t = " ".join(str(item.get(k) or "") for k in ("type_name", "vod_type", "vod_class"))
    if any(k in t for k in ("动漫", "动画", "番剧", "国漫")):
        return "anime"
    if any(k in t for k in ("综艺", "真人秀", "脱口秀", "晚会")):
        return "variety"
    if any(k in t for k in ("剧", "电视")):
        return "tv"
    if any(k in t for k in ("片", "电影")):
        return "movie"
    return None


def to_item(v):
    score = str(v.get("vod_score") or "").strip()
    meta = (v.get("vod_remarks") or v.get("vod_pubdate") or v.get("vod_year") or "").strip()
    if not meta and v.get("vod_year"):
        meta = str(v.get("vod_year"))
    return {
        "name": (v.get("vod_name") or "").strip(),
        "pic": (v.get("vod_pic") or "").strip(),
        "score": score if score and score not in ("0", "0.0") else "",
        "meta": meta,
    }


def fetch_site(site, pages=3):
    buckets = {k: [] for k, _ in CATS}
    base = site["api"]
    for pg in range(1, pages + 1):
        url = base + ("&" if "?" in base else "?") + "ac=videolist&pg=%d" % pg
        try:
            data = load_json(url)
        except Exception:
            break
        lst = data.get("list") or []
        if not lst:
            break
        for v in lst:
            cat = classify(v)
            if not cat or len(buckets[cat]) >= PER_CAT:
                continue
            item = to_item(v)
            if item["name"] and item["pic"]:
                buckets[cat].append(item)
        if all(len(buckets[k]) >= PER_CAT for k, _ in CATS):
            break
    return buckets


def main():
    try:
        cfg = load_json(SOURCE)
    except Exception as e:
        log("配置读取失败:", e)
        cfg = {}
    sites = sites_of(cfg)
    log("可直连站点:", len(sites))

    result = {k: [] for k, _ in CATS}
    best_site = ""
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(fetch_site, s): s for s in sites[:8]}
        for f in concurrent.futures.as_completed(futs):
            try:
                b = f.result()
            except Exception:
                continue
            gained = sum(len(v) for v in b.values())
            if gained and gained > sum(len(v) for v in result.values()):
                result = b
                best_site = futs[f]["name"]
                log("采用站点:", best_site, {k: len(v) for k, v in b.items()})
            if all(len(result[k]) >= 6 for k, _ in CATS):
                break

    data = {
        "builtAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "site": best_site,
        "sections": [
            {"key": k, "title": t, "items": result[k]} for k, t in CATS
        ],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log("写入", OUT, {k: len(v) for k, v in result.items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
