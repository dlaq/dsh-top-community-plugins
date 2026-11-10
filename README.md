# DSH Top Community Plugins Index

A plugin-market **format-1** index of the most popular DeepSeek Harness (DSH) community
plugins: the top 60 installable entries, ordered by npm downloads in the stats window
(~30 days), with `downloads` and `stars` sort keys for the Discover page.

DSH 社区**最流行插件**市场索引（format-1）：按 npm 近 30 天下载量排序的 Top 60 可安装插件，
Discover 页面可按下载量 / star 数排序，并一键安装。

## Data sources

| What | Source |
| --- | --- |
| Installable entries, pinned versions, install sources, categories | [dsh-plugin-catalog](https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json) (awesome-dsh-plugin community catalog, format-1) |
| npm downloads (30-day window), GitHub stars | [awesome-dsh-plugin.com/plugins.json](https://awesome-dsh-plugin.com/plugins.json), refreshed daily |

This repository republishes a popularity-ranked subset; it is not affiliated with
DeepSeek. Listing is not endorsement — review a plugin before installing.

## Use in DSH

Open **Plugins → Discover → Index sources** and add one URL:

- `https://cdn.jsdelivr.net/gh/dlaq/dsh-top-community-plugins@main/index.json`
- `https://dlaq.github.io/dsh-top-community-plugins/index.json` (fallback; may be slow from some networks)

Or add it to the profile's `cordis.patch.yml`:

```yaml
- id: plugin-market
  name: "@deepseek-ai/dsh-plugin-market"
  config:
    indexes:
      - https://cdn.jsdelivr.net/gh/dlaq/dsh-top-community-plugins@main/index.json
```

## Refresh

```sh
node build-top-index.mjs --top 60 --out index.json
git commit -am "refresh top index" && git push
```

GitHub Pages updates within a minute of a push; the jsDelivr `@main` URL may keep the
previous revision cached for a while. Requires network access to
`cdn.jsdelivr.net` and `awesome-dsh-plugin.com`.
