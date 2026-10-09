import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { existsSync } from "node:fs";
const env = dotenv.parse(
  await readFile(process.env.CHECK_SECRETS_ENV_FILE || ".env", "utf8"),
);
const secrets = Object.entries({ ...process.env, ...env }).filter(
  ([key, value]) =>
    key !== "CHECK_SECRETS_ENV_FILE" &&
    // ADC uses a file path here; the credential contents are scanned below.
    key !== "GOOGLE_APPLICATION_CREDENTIALS" &&
    key !== "MERCADOLIVRE_CREDENTIALS_FILE" &&
    /SECRET|PASSWORD|CREDENTIAL|API_KEY|TOKEN|SERP_API|JEV_KEY|APP_ID_SHOPEE|SHOPEE_APP_ID|^PWD$|^pdb$/i.test(
      key,
    ) &&
    value &&
    value.length > 5,
);
const credentialsFile =
  env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (credentialsFile) {
  const credentials = JSON.parse(
    await readFile(credentialsFile, "utf8"),
  ) as Record<string, unknown>;
  for (const field of [
    "private_key",
    "client_secret",
    "refresh_token",
    "access_token",
  ])
    if (typeof credentials[field] === "string") {
      const value = credentials[field] as string;
      secrets.push(["GOOGLE_" + field.toUpperCase(), value]);
      if (field === "private_key")
        for (const line of value
          .split(/\r?\n/)
          .filter((line) => line.length > 30 && !line.startsWith("---")))
          secrets.push(["GOOGLE_PRIVATE_KEY_FRAGMENT", line]);
    }
}
const mercadoLivreFile =
  env.MERCADOLIVRE_CREDENTIALS_FILE ||
  process.env.MERCADOLIVRE_CREDENTIALS_FILE;
if (mercadoLivreFile && existsSync(mercadoLivreFile)) {
  const credential = JSON.parse(
    await readFile(mercadoLivreFile, "utf8"),
  ) as Record<string, unknown>;
  for (const field of ["accessToken", "refreshToken"])
    if (typeof credential[field] === "string")
      secrets.push(["MERCADOLIVRE_" + field, credential[field] as string]);
}
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? files(path.join(directory, e.name))
          : Promise.resolve([path.join(directory, e.name)]),
      ),
    )
  ).flat();
}
let leaks = 0;
for (const filename of await files("dist/client")) {
  const bytes = await readFile(filename);
  for (const [key, value] of secrets)
    if (value && bytes.includes(Buffer.from(value))) {
      console.error(`Secret found: ${key} in ${filename}`);
      leaks++;
    }
}
if (leaks) process.exitCode = 1;
else
  console.log(
    `PASS: ${secrets.length} configured sensitive values checked; none appear in the frontend build.`,
  );
