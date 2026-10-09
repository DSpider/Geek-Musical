import "../server/config.js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { postInputSchema } from "../shared/admin.js";
import { editorialProductSchema } from "../shared/content.js";
import { assertConsumerArticle } from "../server/content/editorial-policy.js";
import {
  eligibleSlot,
  lockedRun,
  recordStage,
  sealPackage,
  sha256,
  routineSite,
  writePrivate,
} from "../server/content/routine-run.js";
function semantic(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(semantic).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .filter((k) => value[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + semantic(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}

export class EditorialAdminClient {
  private cookie = "";
  private csrf = "";
  constructor(readonly origin: string) {
    if (![routineSite, "http://localhost:3230"].includes(origin))
      throw new Error("Ambiente não autorizado.");
  }
  async request(route: string, method = "GET", body?: unknown): Promise<any> {
    const response = await fetch(this.origin + "/api/admin" + route, {
      method,
      headers: {
        Origin: this.origin,
        Cookie: this.cookie,
        "X-CSRF-Token": this.csrf,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45000),
      redirect: "error",
    });
    const cookies = response.headers.getSetCookie();
    for (const cookie of cookies) this.cookie = cookie.split(";", 1)[0];
    const value = await response.json();
    if (!response.ok)
      throw new Error(
        "Admin " +
          response.status +
          ": " +
          (value.error?.message || value.error?.code || "falha"),
      );
    if (value.csrfToken) this.csrf = value.csrfToken;
    return value;
  }
  async login() {
    await this.request("/auth/csrf");
    const email =
      this.origin === routineSite
        ? process.env.adminEmail
        : process.env.adminEmailDev;
    const password =
      this.origin === routineSite
        ? process.env.adminPassword
        : process.env.adminPasswordDev;
    if (!email || !password)
      throw new Error("Credenciais próprias ausentes do ambiente privado.");
    await this.request("/auth/login", "POST", {
      email,
      password,
    });
    return this.request("/auth/session");
  }
}
export async function publicCheck(origin: string, post: any) {
  const health = await fetch(origin + "/api/health");
  const healthBody = await health.json();
  if (!health.ok || !healthBody.ok || healthBody.site !== "Geek Musical")
    throw new Error("Saúde inválida.");
  const url = origin + "/" + post.slug + "/";
  const response = await fetch(url, { cache: "no-store" });
  if (response.status !== 200) throw new Error("Artigo não retornou 200.");
  const doc = new JSDOM(await response.text()).window.document;
  const canonical = doc
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
  if (
    canonical !== routineSite + "/" + post.slug + "/" ||
    doc.querySelectorAll("h1").length !== 1 ||
    doc.querySelector("h1")?.textContent !== post.title
  )
    throw new Error("Canonical/título inválidos.");
  const schema = [
    ...doc.querySelectorAll('script[type="application/ld+json"]'),
  ].map((s) => JSON.parse(s.textContent || "{}"));
  const all = schema.flatMap((s) =>
    Array.isArray(s) ? s : s["@graph"] || [s],
  );
  if (
    !all.some(
      (s) =>
        ["Article", "BlogPosting"].includes(s["@type"]) &&
        s.headline === post.title &&
        JSON.stringify(s.author).includes("Daniel Lima"),
    )
  )
    throw new Error("Schema/autoria inválidos.");
  if (
    origin !== routineSite &&
    !/noindex/.test(response.headers.get("x-robots-tag") || "")
  )
    throw new Error("DEV indexável.");
  for (const image of [
    post.coverImage?.path,
    ...(post.editorialMedia || []).map((m: any) => m.url),
  ].filter(Boolean)) {
    const r = await fetch(origin + image);
    if (!r.ok || !r.headers.get("content-type")?.startsWith("image/"))
      throw new Error("Imagem indisponível.");
  }
  const sitemap = await fetch(origin + "/post-sitemap.xml");
  if (
    !sitemap.ok ||
    !(await sitemap.text()).includes(routineSite + "/" + post.slug + "/")
  )
    throw new Error("Artigo ausente do sitemap.");
  return {
    url,
    status: 200,
    canonical,
    health: healthBody,
    schema: true,
    images: true,
    sitemap: true,
  };
}
async function operator() {
  const [command, packetFile, evidenceFile] = process.argv.slice(2);
  const slot = eligibleSlot();
  if (!slot)
    throw new Error(
      "Nenhum horário elegível hoje. Não recuperar dias anteriores.",
    );
  const root = path.resolve(
    process.env.EDITORIAL_ROUTINE_ROOT || "artifacts/editorial-routine",
  );
  await lockedRun(root, slot, async (run, folder) => {
    if (command === "status") {
      console.log(JSON.stringify(run));
      return;
    }
    if (command === "attempt") {
      if (run.packageHash || run.attempts.length >= 2)
        throw new Error("Limite de pautas ou pacote selado.");
      run.attempts.push(packetFile);
      return;
    }
    const raw = readFileSync(packetFile, "utf8"),
      packet = JSON.parse(raw);
    const post = postInputSchema.parse(packet.post);
    (packet.products || []).forEach((p: unknown) =>
      editorialProductSchema.parse(p),
    );
    assertConsumerArticle(post);
    if (
      post.authorId !== "AUTHOR-DANIEL-LIMA" ||
      post.reviewerId ||
      !post.coverImage ||
      !post.sources.length
    )
      throw new Error("Contrato de autoria, fontes ou capa inválido.");
    sealPackage(run, folder, packet, raw);
    if (run.stage === "complete") {
      console.log(
        JSON.stringify({
          alreadyComplete: true,
          url: routineSite + "/" + post.slug + "/",
          hash: run.packageHash,
        }),
      );
      return;
    }
    const evidence = JSON.parse(readFileSync(evidenceFile, "utf8"));
    if (evidence.packageHash !== sha256(raw))
      throw new Error("Evidência pertence a outro pacote.");
    const gates = [
      "catalog",
      "research",
      "trends",
      "gsc",
      "factual",
      "images",
      "offers",
      "checks",
    ];
    if (command === "prod") gates.push("dev", "preservation", "backup");
    if (command === "complete")
      gates.push("dev", "preservation", "backup", "production", "layout");
    for (const gate of gates) {
      const proof = evidence.gates[gate];
      if (
        proof?.status !== "PASS" ||
        !proof.file ||
        !proof.sha256 ||
        !existsSync(proof.file) ||
        sha256(readFileSync(proof.file)) !== proof.sha256
      )
        throw new Error("Verificação pendente: " + gate);
    }
    if (!["dev", "prod", "complete"].includes(command))
      throw new Error("Use status, attempt, dev, prod ou complete.");
    const origin = command === "dev" ? "http://localhost:3230" : routineSite;
    const client = new EditorialAdminClient(origin);
    const session = await client.login();
    const policy = (await client.request("/governance")).values[
      "governance.editorialPolicy"
    ];
    if (
      !policy.enabled ||
      policy.site !== routineSite ||
      policy.authorId !== post.authorId ||
      !policy.authorizedBy ||
      !policy.authorizedAt
    )
      throw new Error("Política não autorizada.");
    if (command !== "complete") {
      let current: any;
      try {
        current = await client.request("/posts/" + post.id);
      } catch (e) {
        if (!String(e).includes("404")) throw e;
      }
      if (current?.post.status === "published") {
        const persisted = structuredClone(current.post);
        delete persisted.publishedAt;
        delete persisted.linkStates;
        persisted.updatedAt = post.updatedAt;
        persisted.createdAt = post.createdAt;
        persisted.status = post.status;
        if (semantic(persisted) !== semantic(post))
          throw new Error(
            "Artigo existente difere: preserve a edição administrativa.",
          );
      } else {
        if (
          current &&
          semantic(current.post) !==
            semantic({ ...post, status: current.post.status })
        )
          throw new Error("Rascunho alterado: conflito editorial.");
        const fresh = current || (await client.request("/posts/new"));
        recordStage(run, command + "-applying", {
          articleId: post.id,
          hash: run.packageHash,
          userId: session.user.id,
        });
        writePrivate(path.join(folder, "run.private.json"), run);
        await client.request(
          current ? "/posts/" + post.id : "/posts",
          current ? "PUT" : "POST",
          {
            revision: fresh.revision,
            post: { ...post, status: "published" },
            products: packet.products || [],
            approvePublication: true,
          },
        );
      }
      const fresh = await client.request("/posts/new");
      await client.request("/governance/published-snapshot", "POST", {
        revision: fresh.revision,
      });
    }
    const check = await publicCheck(origin, post);
    writePrivate(path.join(folder, command + "-http.private.json"), check);
    recordStage(
      run,
      command === "complete" ? "complete" : command + "-verified",
      {
        ...check,
        packageHash: run.packageHash,
        authorizedBy: policy.authorizedBy,
        executedBy: session.user.id,
        humanReview: false,
      },
    );
    console.log(
      JSON.stringify({
        stage: run.stage,
        ...check,
        packageHash: run.packageHash,
      }),
    );
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  operator().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
