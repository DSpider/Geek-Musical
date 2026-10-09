import "../server/config.js";
import { config } from "../server/config.js";
import { adminConfig } from "../server/admin/config.js";
import { AdminDatabase } from "../server/admin/database.js";
import { builtinPlugins } from "../server/admin/plugins/index.js";
import { upsertAdminUser } from "../server/admin/auth.js";
const db = new AdminDatabase(adminConfig(config.web).databaseFile);
try {
  builtinPlugins().initialize(db);
  const production = config.web.environment === "production";
  const email = production ? process.env.adminEmail : process.env.adminEmailDev;
  const password = production
    ? process.env.adminPassword
    : process.env.adminPasswordDev;
  if (!email || !password)
    throw new Error("Credenciais próprias do ambiente não configuradas.");
  // Creation only. Existing passwords, hashes, roles and sessions are never replaced.
  if (
    !db.sql
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email.toLowerCase())
  )
    await upsertAdminUser(
      db,
      {
        email,
        password,
        name: "Administração Geek Musical",
        role: "super_admin",
      },
      false,
    );
  console.log("Administração inicializada sem alterar contas existentes.");
} finally {
  db.close();
}
