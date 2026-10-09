import { settingsUpdateSchema } from "../../../shared/admin.js";
import { adminUser } from "../auth.js";
import type { AdminApiDefinition, PluginContext } from "../registry.js";
export function settingsApi(
  namespace: string,
  permission: string,
  extra?: (ctx: PluginContext) => Record<string, unknown>,
  onUpdate?: (ctx: PluginContext) => void,
): AdminApiDefinition[] {
  return [
    {
      method: "get",
      path: "/" + namespace,
      permission,
      handle: (ctx, _req, res) =>
        res.json({
          values: ctx.settings.values(namespace),
          revision: ctx.settings.revision(namespace),
          environment: ctx.web.environment || "development",
          ...extra?.(ctx),
        }),
    },
    {
      method: "put",
      path: "/" + namespace,
      permission,
      handle: (ctx, req, res) => {
        const input = settingsUpdateSchema.parse(req.body);
        const output = ctx.settings.update(
          namespace,
          input.revision,
          input.values,
          adminUser(res).id,
        );
        onUpdate?.(ctx);
        res.json(output);
      },
    },
  ];
}
