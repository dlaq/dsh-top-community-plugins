#!/usr/bin/env node
// Build a plugin-market format-1 index of the most popular community DSH plugins.
//
// Sources:
//   1. The installable community catalog, already format-1 (names, bilingual
//      titles/descriptions, categories, pinned versions + install sources):
//      https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json
//      (fallbacks: awesome-dsh-plugin.com / dshmarket.com).
//   2. Popularity stats for every entry: https://awesome-dsh-plugin.com/plugins.json
//      — same curator, refreshed daily; per plugin it carries the npm
//      download count for a ~30-day window (downloadsStart/downloadsEnd),
//      the GitHub star count, and the npm package name to join on.
//
// Output: ./index.json (override with --out). Plugins are ordered by npm
// downloads in the catalog's measurement window (descending), so the Discover
// page shows the most popular plugins first in its default "index" order;
// explicit "downloads" and "stars" sort keys are also declared for the sort
// selector.
//
// Usage:
//   node build-top-index.mjs [--top 60] [--out index.json]
//
// The output is validated against the format-1 rules before being written.

import { writeFile } from "node:fs/promises";
import path from "node:path";

const CATALOG_SOURCES = [
  "https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json",
  "https://awesome-dsh-plugin.com/index.json",
  "https://dshmarket.com/index.json",
];
const STATS_SOURCE = "https://awesome-dsh-plugin.com/plugins.json";

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] !== undefined ? Number(args[index + 1]) : fallback;
};
const TOP_N = argValue("--top", 60);
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : "index.json";

async function getJson(url, timeoutMs = 180_000) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${url} -> HTTP ${response.status}`);
  }
  return await response.json();
}

async function fetchCatalog() {
  const errors = [];
  for (const url of CATALOG_SOURCES) {
    try {
      const document = await getJson(url);
      if (document.format !== 1 || !Array.isArray(document.plugins)) throw new Error("not a format-1 index");
      console.log(`catalog source ok: ${url} (${document.plugins.length} installable plugins)`);
      return document;
    } catch (error) {
      errors.push(`  ${url}: ${error.message}`);
      console.error(`catalog source failed: ${url}: ${error.message}`);
    }
  }
  throw new Error(`no catalog source reachable:\n${errors.join("\n")}`);
}

/** npm package name -> { downloads, stars, window } from the curator's stats file. */
async function fetchStats() {
  const document = await getJson(STATS_SOURCE);
  const entries = Array.isArray(document) ? document : document.plugins;
  if (!Array.isArray(entries)) throw new Error(`${STATS_SOURCE}: no plugin list`);
  const stats = new Map();
  for (const entry of entries) {
    if (typeof entry?.npm !== "string" || entry.npm === "") continue;
    const downloads = typeof entry.downloads === "number" ? entry.downloads : 0;
    const stars = typeof entry.stars === "number" ? entry.stars : 0;
    const known = stats.get(entry.npm);
    // A package may appear under several repository entries; keep the best-known numbers.
    if (known === undefined || downloads > known.downloads || stars > known.stars) {
      stats.set(entry.npm, {
        downloads,
        stars,
        window: typeof entry.downloadsStart === "string" && typeof entry.downloadsEnd === "string"
          ? { start: entry.downloadsStart, end: entry.downloadsEnd }
          : undefined,
      });
    }
  }
  console.log(`stats source ok: ${STATS_SOURCE} (${entries.length} entries, ${stats.size} npm-mapped)`);
  return stats;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9a-zA-Z.-]+)?(?:\+[0-9a-zA-Z.-]+)?$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;

function checkLocalizedText(value, at) {
  if (typeof value === "string") {
    if (value.trim() === "") throw new Error(`${at}: empty text`);
    return;
  }
  if (typeof value !== "object" || value === null) throw new Error(`${at}: not text`);
  if (typeof value.en !== "string" || value.en.trim() === "") throw new Error(`${at}: missing en`);
  for (const [language, text] of Object.entries(value)) {
    if (!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/u.test(language)) throw new Error(`${at}.${language}: bad language id`);
    if (typeof text !== "string" || text.trim() === "") throw new Error(`${at}.${language}: empty text`);
  }
}

function selfCheck(index) {
  if (index.format !== 1) throw new Error("format must be 1");
  checkLocalizedText(index.title, "$.title");
  if (index.description !== undefined) checkLocalizedText(index.description, "$.description");
  const { categories, labels, sortKeys } = index.metadata;
  for (const [id, declaration] of Object.entries(sortKeys)) {
    if (declaration.order !== "asc" && declaration.order !== "desc") throw new Error(`sortKeys.${id}: bad order`);
    checkLocalizedText(declaration.title, `$.metadata.sortKeys.${id}.title`);
  }
  const names = new Set();
  for (const plugin of index.plugins) {
    if (!PACKAGE_NAME.test(plugin.name) || plugin.name.length > 214) throw new Error(`plugin ${plugin.name}: bad package name`);
    if (names.has(plugin.name)) throw new Error(`duplicate plugin ${plugin.name}`);
    names.add(plugin.name);
    if (plugin.title !== undefined) checkLocalizedText(plugin.title, `${plugin.name}.title`);
    if (plugin.description !== undefined) checkLocalizedText(plugin.description, `${plugin.name}.description`);
    if (plugin.metadata?.category !== undefined && !(plugin.metadata.category in categories)) {
      throw new Error(`${plugin.name}: undeclared category ${plugin.metadata.category}`);
    }
    for (const label of plugin.metadata?.labels ?? []) {
      if (!(label in labels)) throw new Error(`${plugin.name}: undeclared label ${label}`);
    }
    for (const [id, value] of Object.entries(plugin.metadata?.sortKeys ?? {})) {
      if (!(id in sortKeys)) throw new Error(`${plugin.name}: undeclared sort key ${id}`);
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${plugin.name}: sort key ${id} not finite`);
    }
    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) throw new Error(`${plugin.name}: no versions`);
    const seen = new Set();
    for (const version of plugin.versions) {
      if (!SEMVER.test(version.version)) throw new Error(`${plugin.name}@${version.version}: bad version`);
      if (seen.has(version.version)) throw new Error(`${plugin.name}: duplicate version ${version.version}`);
      seen.add(version.version);
      if (!Number.isInteger(version.publishTimestamp) || version.publishTimestamp < 0 || version.publishTimestamp >= 1e11) {
        throw new Error(`${plugin.name}@${version.version}: bad publishTimestamp`);
      }
      const source = version.source;
      if (source?.type !== "npm" && source?.type !== "git") throw new Error(`${plugin.name}@${version.version}: bad source`);
      if (source.type === "git" && !/^[0-9a-f]{40}$/u.test(source.commit)) throw new Error(`${plugin.name}@${version.version}: bad commit`);
      if (source.type === "npm" && source.registry !== undefined && /[?#]/u.test(source.registry)) {
        throw new Error(`${plugin.name}@${version.version}: registry has query/fragment`);
      }
    }
    if (plugin.homepage !== undefined && !URL.canParse(plugin.homepage)) throw new Error(`${plugin.name}: bad homepage`);
    if (plugin.repository?.url !== undefined && /[?#]/u.test(plugin.repository.url)) throw new Error(`${plugin.name}: repository url has query/fragment`);
    if (plugin.icon !== undefined && !/^(?:https:|data:image\/)/u.test(plugin.icon) && !URL.canParse(plugin.icon)) {
      throw new Error(`${plugin.name}: bad icon reference`);
    }
  }
}

const pick = (object, keys) => {
  const result = {};
  for (const key of keys) if (object[key] !== undefined) result[key] = object[key];
  return result;
};

async function main() {
  const [document, stats] = await Promise.all([fetchCatalog(), fetchStats()]);

  const ranked = document.plugins
    .map((plugin) => ({ plugin, known: stats.get(plugin.name) }))
    .filter((entry) => entry.known !== undefined && entry.known.downloads > 0)
    .sort(
      (a, b) =>
        b.known.downloads - a.known.downloads ||
        b.known.stars - a.known.stars ||
        a.plugin.name.localeCompare(b.plugin.name),
    );
  const top = ranked.slice(0, TOP_N);
  if (top.length === 0) throw new Error("no catalog plugin has a positive npm download count in the stats window");

  const windows = top.map(({ known }) => known.window).filter((window) => window !== undefined);
  const windowStart = windows.length > 0 ? windows.reduce((a, b) => (a.start <= b.start ? a : b)).start : undefined;
  const windowEnd = windows.length > 0 ? windows.reduce((a, b) => (a.end >= b.end ? a : b)).end : undefined;
  const windowText = windowStart !== undefined ? `${windowStart} to ${windowEnd}` : "the last 30 days";
  const windowTextZh = windowStart !== undefined ? `${windowStart} 至 ${windowEnd}` : "近 30 天";

  const usedCategories = new Set(top.map(({ plugin }) => plugin.metadata?.category).filter((id) => id !== undefined));
  const index = {
    format: 1,
    title: {
      en: "DSH Top Community Plugins",
      zh: "DSH 社区热门插件",
    },
    description: {
      en: `The ${top.length} most-downloaded installable community plugins, ranked by npm downloads (${windowText}), from the awesome-dsh-plugin catalog. Regenerate with build-top-index.mjs.`,
      zh: `按 npm 下载量（${windowTextZh}）排序的 Top ${top.length} 可安装社区插件，数据来自 awesome-dsh-plugin 社区目录。运行 build-top-index.mjs 可重新生成。`,
    },
    metadata: {
      categories: Object.fromEntries([...usedCategories].sort().map((id) => [id, document.metadata.categories[id]])),
      labels: {},
      sortKeys: {
        downloads: {
          title: { en: "Downloads (last 30 days)", zh: "近 30 天下載量" },
          order: "desc",
        },
        stars: { title: { en: "GitHub stars", zh: "GitHub star 数" }, order: "desc" },
      },
    },
    plugins: top.map(({ plugin, known }) => ({
      ...pick(plugin, ["name", "title", "description", "icon", "author", "homepage", "repository"]),
      metadata: {
        ...(plugin.metadata?.category === undefined ? {} : { category: plugin.metadata.category }),
        keywords: plugin.metadata?.keywords ?? [],
        labels: [],
        sortKeys: { downloads: known.downloads, stars: known.stars },
      },
      versions: plugin.versions,
    })),
  };

  selfCheck(index);
  const file = path.resolve(OUT);
  await writeFile(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  const width = Math.max(...top.map(({ plugin }) => plugin.name.length));
  console.log(`\ntop ${top.length} of ${ranked.length} ranked plugins (catalog had ${document.plugins.length} installable entries):`);
  for (const [position, { plugin, known }] of top.entries()) {
    console.log(`${String(position + 1).padStart(3)}. ${plugin.name.padEnd(width)}  ${String(known.downloads).padStart(8)} dl  ${String(known.stars).padStart(5)} ★`);
  }
  console.log(`\nwrote ${file}`);
}

await main();
