import { PluginRegistry } from "../registry.js";
import { postsPlugin } from "./posts.js";
import { homePlugin } from "./home.js";
import { categoriesPlugin } from "./categories.js";
import { themesPlugin } from "./themes.js";
import { linkBuildingPlugin } from "./link-building.js";
import { settingsPlugin } from "./settings.js";
import { redirectPlugin } from "./redirect/index.js";
import { analyticsPlugin } from "./analytics/index.js";
import { affiliatesPlugin } from "./affiliates.js";
import { governancePlugin } from "./governance.js";
export function builtinPlugins() {
  const registry = new PluginRegistry();
  for (const plugin of [
    postsPlugin,
    homePlugin,
    categoriesPlugin,
    themesPlugin,
    linkBuildingPlugin,
    settingsPlugin,
    redirectPlugin,
    analyticsPlugin,
    affiliatesPlugin,
    governancePlugin,
  ])
    registry.register(plugin);
  return registry;
}
