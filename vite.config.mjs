// Сборка расширения под Freelens 1.x (и Lens 6.x).
//
// Два отличия от ветки `v2`, оба про то, как хост грузит расширение.
//
// Формат — CommonJS: extension-loader зовёт обычный `require()` на файл из
// поля `renderer` манифеста, ESM он проглотить не умеет. По той же причине в
// `package.json` нет `"type": "module"` — иначе Node посчитал бы `dist/*.js`
// модулем и уронил бы require.
//
// Глобал другой: рендерер v1 собран с `libraryTarget: "global"`, поэтому его
// экспорты лежат прямо на глобальном объекте — `LensExtensions` (а рядом
// `React`, `Mobx`, `MobxReact`, которые нам не нужны: компонентов у расширения
// нет). В v2 на месте этого `globalThis.FreelensExtensionApi`.
//
// Lens 6.x кладёт туда же и то же самое, поэтому `@k8slens/extensions`
// подменяется тем же модулем — одна сборка работает в обоих приложениях.

import { defineConfig } from "vite";

const HOST_GLOBAL = "globalThis.LensExtensions";

const hostApi = `const api = ${HOST_GLOBAL};
export const Common = api.Common;
export const Main = api.Main;
export const Renderer = api.Renderer;
`;

// React тоже хостовый: страница настроек должна рендериться тем же React, что
// и приложение, — второй экземпляр в одном дереве ломает хуки
//
// Хост без React (такого 1.x не встречалось, но загрузка не должна падать из-за
// страницы настроек) даёт undefined: страница тогда просто не регистрируется.
const hostReact = `const React = globalThis.React;
export default React;
export const useState = React?.useState;
`;

const hostProvidedModules = {
  "@freelensapp/extensions": hostApi,
  "@k8slens/extensions": hostApi,
  react: hostReact,
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
// nodeIntegration), поэтому модули Node должны остаться require'ами, а не
// попытками их забандлить.
const nodeBuiltins = ["fs", "os", "path", "node:fs", "node:os", "node:path"];

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
    // 1.10.3 живёт на electron 41, но ветка обслуживает всю линейку 1.x и Lens
    // 6.x, где Chromium заметно старше; es2020 переживут они все
    target: "es2020",
    minify: false,
    sourcemap: true,
    // не чистим: рядом лежит dist/lc.js второго прохода (vite.lc.config.mjs),
    // и `npm start` снёс бы его; `npm run build` и так начинается с clean
    emptyOutDir: false,
    lib: {
      entry: "src/renderer.ts",
      formats: ["cjs"],
      fileName: () => "renderer.js",
    },
    rollupOptions: {
      external: nodeBuiltins,
      output: {
        // Загрузчик расширений берёт класс как `require(...).default`, а
        // rollup на единственном default-экспорте по умолчанию пишет
        // `module.exports = Класс` — и хост получил бы undefined. С `named`
        // экспорт остаётся на своём месте, в `exports.default`.
        exports: "named",
      },
    },
  },
});
