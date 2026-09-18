/**
 * Проверка контракта с хостом на собранном бандле (Freelens 1.x).
 *
 * Юнит-тесты знают только про строки; здесь проверяется то, что ломается на
 * стыке с приложением и о чём тесты молчат: бандл вообще грузится тем же
 * способом, что и у хоста (`require(...).default` — см. `requireExtension` в
 * extension-loader), API берётся с `global.LensExtensions`, а обёртка садится
 * на `podsStore.api.getLogs` и красит его ответ.
 *
 * Хоста здесь нет — есть его форма. Значит, проверка ловит промах в сборке и
 * в способе подключения, но не в том, как настоящий вьювер покажет результат.
 */
import assert from "assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const RAW = '2026-09-18T13:00:30.350123456Z {"level":"error","msg":"boom","pod":"web-1"}';

let served;

globalThis.LensExtensions = {
  Common: {},
  Renderer: {
    LensExtension: class {},
    K8sApi: {
      podsStore: {
        api: {
          getLogs: (params, query) => {
            served = { params, query };

            return Promise.resolve(RAW);
          },
        },
      },
    },
  },
};

const Extension = require("../dist/renderer.js").default;

assert.strictEqual(typeof Extension, "function", "хост не получил бы класс расширения");

const extension = new Extension();

extension.onActivate();

const api = globalThis.LensExtensions.Renderer.K8sApi.podsStore.api;
const painted = await api.getLogs({ name: "web-1", namespace: "default" }, { timestamps: true });

assert.ok(painted.includes("\u001b["), "обёртка не села на getLogs: цвета нет");
assert.strictEqual(painted.replace(/\u001b\[[0-9;]*m/g, ""), RAW, "текст строки изменился");
assert.ok(painted.startsWith("2026-09-18T"), "escape-код влез перед кубовым таймстемпом");
assert.deepStrictEqual(
  served,
  { params: { name: "web-1", namespace: "default" }, query: { timestamps: true } },
  "аргументы не дошли до исходного getLogs",
);

// второй onActivate не должен наложить цвет поверх цвета
extension.onActivate();

const again = await api.getLogs({ name: "web-1", namespace: "default" });

assert.strictEqual(again, painted, "обёртка встала дважды");

console.log("smoke ok");
