// Сборка расширения под Freelens 2.x.
//
// Приложение кладёт свой API на `globalThis.FreelensExtensionApi`, и импорт
// `@freelensapp/extensions` подменяется крошечным виртуальным модулем, который
// читает его оттуда. Бандлить сам пакет нельзя: внутри он тянет половину
// приложения.
//
// React нужен только странице настроек (команда `lc`) и берётся с того же
// глобала: второй экземпляр React в одном дереве ломает хуки. Ванильный
// Freelens 2.x React туда не кладёт — тогда `React` здесь undefined, страница
// не регистрируется, а раскраске логов хватает одного `Renderer`.
//
// Именованные экспорты ниже перечислены руками намеренно: импорт, которого тут
// нет, роняет сборку с «is not exported by», а не утаскивает вторую копию
// пакета в бандл.

import { defineConfig } from "vite";

const HOST_GLOBAL = "globalThis.FreelensExtensionApi";

const hostProvidedModules = {
  "@freelensapp/extensions": `const api = ${HOST_GLOBAL};
export const Common = api.Common;
export const Main = api.Main;
export const Renderer = api.Renderer;
`,
  react: `const React = ${HOST_GLOBAL}.React;
export default React;
export const useState = React?.useState;
`,
};

const virtualPrefix = "\0freelens-host:";

/** @type {import("vite").Plugin} */
const hostProvidedModulesPlugin = {
  name: "logscolor-host-provided-modules",
  enforce: "pre",

  resolveId(source) {
    return Object.hasOwn(hostProvidedModules, source) ? `${virtualPrefix}${source}` : null;
  },

  load(id) {
    return id.startsWith(virtualPrefix) ? hostProvidedModules[id.slice(virtualPrefix.length)] : null;
  },
};

// Расширение читает свой файл настроек прямо из рендерера (у него включён
// nodeIntegration), поэтому модули Node должны остаться импортами, а не
// попытками их забандлить.
const nodeBuiltins = ["fs", "os", "path", "url", "node:fs", "node:os", "node:path", "node:url"];

export default defineConfig({
  plugins: [hostProvidedModulesPlugin],
  // классический JSX: `React.createElement` из того `React`, что импортирован
  // в файле, то есть из хостового. Автоматический потянул бы react/jsx-runtime
  esbuild: {
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
  },
  build: {
    target: "esnext",
    minify: false,
    sourcemap: true,
    // не чистим: рядом лежит dist/lc.js второго прохода (vite.lc.config.mjs),
    // и `npm start` снёс бы его; `npm run build` и так начинается с clean
    emptyOutDir: false,
    lib: {
      entry: "src/renderer.ts",
      formats: ["es"],
      fileName: () => "renderer.js",
    },
    rollupOptions: {
      external: nodeBuiltins,
    },
  },
});
