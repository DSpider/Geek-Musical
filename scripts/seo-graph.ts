export function linkGraph(docs: Map<string, Document>, origin: string) {
  const edges = new Map<string, Set<string>>();
  for (const [path, doc] of docs) {
    const links = new Set<string>();
    for (const anchor of doc.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href")!;
      try {
        const url = new URL(href, origin + path);
        const target = url.pathname + url.search;
        if (url.origin === origin && docs.has(target)) links.add(target);
      } catch {
        /* Invalid destinations are reported by the caller's URL checks. */
      }
    }
    edges.set(path, links);
  }
  const reachable = new Set<string>(),
    queue = ["/"];
  while (queue.length) {
    const path = queue.shift()!;
    if (reachable.has(path)) continue;
    reachable.add(path);
    if (path !== "/mapa-do-site/") queue.push(...(edges.get(path) || []));
  }
  return { edges, reachable };
}
