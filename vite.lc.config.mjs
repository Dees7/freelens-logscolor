// Отдельный бандл для команды `lc` (см. src/lc.ts и src/cli.ts).
//
// Отдельный, а не второй вход в vite.config.mjs: с двумя входами rollup вынес
// бы общий colorize.ts в третий файл-чанк, а так оба бандла самодостаточны.
// Хоста здесь нет вовсе — только Node, так что и подмена `@freelensapp/*`
// не нужна.

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // lc запускается и системным node, и Node из Electron приложения; es2020
    // переживёт оба
    target: "es2020",
    minify: false,
    sourcemap: false,
    // dist/renderer.js к этому моменту уже собран первым проходом
    emptyOutDir: false,
    lib: {
      entry: "src/lc.ts",
      formats: ["cjs"],
      fileName: () => "lc.js",
    },
  },
});
