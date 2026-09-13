import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "block-group": "src/scripts/block-group.ts" },
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  noExternal: ["@manix/shared"],
});
