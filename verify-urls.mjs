// Verify the published index URLs serve a valid format-1 index.
const urls = [
  "https://cdn.jsdelivr.net/gh/dlaq/dsh-top-community-plugins@main/index.json",
  "https://dlaq.github.io/dsh-top-community-plugins/index.json",
];
for (let attempt = 1; attempt <= 4; attempt += 1) {
  for (const url of urls) {
    try {
      const t0 = Date.now();
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "error" });
      if (!response.ok) {
        await response.body?.cancel();
        console.log(`attempt ${attempt}: ${url} -> HTTP ${response.status}`);
        continue;
      }
      const body = await response.json();
      console.log(`attempt ${attempt}: ${url} -> HTTP ${response.status}, ${String(Date.now() - t0)} ms, format=${body.format}, plugins=${body.plugins.length}, title="${body.title?.zh ?? body.title?.en}"`);
    } catch (error) {
      console.log(`attempt ${attempt}: ${url} -> ${error.message}`);
    }
  }
  const settled = attempt === 4;
  if (settled) break;
  await new Promise((done) => setTimeout(done, 15_000));
}
