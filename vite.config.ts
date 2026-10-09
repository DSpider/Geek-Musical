import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  plugins: [react()],
  root: "src",
  publicDir: "../public",
  envDir: false,
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: path.resolve("src/index.html"),
        blog: path.resolve("src/blog.html"),
        admin: path.resolve("src/admin.html"),
      },
    },
  },
  server: {
    fs: {
      strict: true,
      allow: ["src", "shared", "public"].map((directory) =>
        path.resolve(directory),
      ),
      deny: [
        "**/.env*",
        "**/server/**",
        "**/scripts/**",
        "**/content/**",
        "**/docs/**",
        "**/*.log",
      ],
    },
  },
});
