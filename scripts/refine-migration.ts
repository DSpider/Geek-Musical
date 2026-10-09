import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readSourceContent } from "../server/content/catalog.js";
const source = readSourceContent();
const official = JSON.parse(
  readFileSync("docs/migration/official-affiliate-verification.json", "utf8"),
) as {
  records: {
    url: string;
    product: string;
    tracking: string;
    officialCandidate?: string;
  }[];
};
const corrections = new Map(
  official.records
    .filter(
      (r) =>
        r.product === "correct" &&
        r.tracking === "official-candidate-confirmed" &&
        r.officialCandidate,
    )
    .map((r) => [r.url, r.officialCandidate!]),
);
const changes = [];
const previous = JSON.parse(
  readFileSync("docs/migration/review-differences.json", "utf8"),
) as {
  id: string;
  differences: {
    field: string;
    before: string;
    after: string;
    reason: string;
  }[];
}[];
for (const post of source.posts) {
  const before = JSON.stringify(post),
    diffs = [];
  post.editorialFormat =
    post.slug === "dicas-de-canto" || /^(?:como-|aprenda-)/.test(post.slug)
      ? "tutorial"
      : /review|avaliação|opinião|[ée] bo[ma]|vale.*pena|análise/i.test(
            post.title,
          ) && !/confira.*melhores/i.test(post.title)
        ? "review"
        : /melhor|top\s*\d|top\s*#\d|(?:os|as)\s+\d/i.test(
              post.title + " " + post.slug,
            )
          ? "ranking"
          : "guide";
  if (post.origin) {
    for (const key of ["sourcePublishedAt", "sourceUpdatedAt"] as const)
      if (post.origin[key] && !post.origin[key]!.includes("T"))
        post.origin[key] = post.origin[key]!.replace(" ", "T") + "-03:00";
  }
  for (const link of post.links || []) {
    const corrected = corrections.get(link.url);
    if (corrected && corrected !== link.url) {
      diffs.push({
        field: "affiliate-url",
        before: link.url,
        after: corrected,
        reason:
          "Same ASIN and exact title returned by official Amazon API with geekmusical-20.",
      });
      link.url = corrected;
    }
  }
  if (/\sEm$/i.test(post.seoTitle)) {
    diffs.push({
      field: "seoTitle",
      before: post.seoTitle,
      after: post.title,
      reason:
        "Incomplete placeholder-based legacy metadata replaced with the preserved article title.",
    });
    post.seoTitle = post.title;
  }
  const match = post.seoTitle.match(/^(?:Top\s*)?(\d+)/i),
    titleMatch = post.title.match(/^(?:Top\s*)?(\d+)/i);
  if (match && titleMatch && match[1] !== titleMatch[1]) {
    diffs.push({
      field: "seoTitle",
      before: post.seoTitle,
      after: post.title,
      reason: "SEO count disagreed with the preserved article heading.",
    });
    post.seoTitle = post.title;
  }
  const { body, ...metadata } = post;
  if (JSON.stringify(post) !== before)
    writeFileSync(
      "content/blog/" + post.id + ".md",
      "---\n" + JSON.stringify(metadata, null, 2) + "\n---\n\n" + body + "\n",
    );
  changes.push({
    id: post.id,
    path: post.canonicalPath,
    format: post.editorialFormat,
    bodySha256: createHash("sha256").update(body).digest("hex"),
    differences: [
      ...(previous.find((p) => p.id === post.id)?.differences || []),
      ...diffs,
    ],
    datesChanged: false,
    factualReview: "pending-primary-source-review",
    mediaReview:
      "original-URLs-and-files-preserved; model-and-credit-confirmation-pending",
    originalSourceHash: post.origin?.sourceHash,
  });
}
writeFileSync(
  "docs/migration/review-differences.json",
  JSON.stringify(changes, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    articles: changes.length,
    linksCorrected: changes
      .flatMap((c) => c.differences)
      .filter((d) => d.field === "affiliate-url").length,
    seoCorrections: changes
      .flatMap((c) => c.differences)
      .filter((d) => d.field === "seoTitle").length,
    officiallyVerifiedSourceOffers: corrections.size,
  }),
);
