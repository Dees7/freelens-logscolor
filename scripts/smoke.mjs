/**
 * Проверка контракта с хостом на собранном бандле (Freelens 1.x).
 *
 * Юнит-тесты знают только про строки; здесь проверяется то, что ломается на
 * стыке с приложением и о чём тесты молчат: бандл вообще грузится тем же
 * способом, что и у хоста (`require(...).default` — см. `requireExtension` в
 * extension-loader), API берётся с `global.LensExtensions`, а обёртка садится
 * на `podsStore.api.getLogs` и красит его ответ.
 *
 * Тут же страница настроек: она рендерится хостовым React (17, как во
 * Freelens 1.x), и её кнопки действительно ставят и убирают `lc`.
 *
 * Хоста здесь нет — есть его форма. Значит, проверка ловит промах в сборке и
 * в способе подключения, но не в том, как настоящий вьювер покажет результат.
 */
import assert from "assert";
import { execFileSync } from "child_process";
import * as fs from "fs";
import { createRequire } from "module";
import * as os from "os";
import * as path from "path";

const require = createRequire(import.meta.url);

// `lc` ставится в PATH — пусть ставится в песочницу, а не в настоящий ~/.local/bin
const home = fs.mkdtempSync(path.join(os.tmpdir(), "logscolor-smoke-"));
const bin = path.join(home, ".local", "bin");

fs.mkdirSync(bin, { recursive: true });
process.env.HOME = home;
// PATH тоже свой: в настоящем может уже лежать `lc`, поставленный из приложения.
// node нужен обёртке, поэтому каталог текущего node — в конце
process.env.PATH = [bin, "/usr/bin", "/bin", path.dirname(process.execPath)].join(path.delimiter);

const RAW = '2026-09-18T13:00:30.350123456Z {"level":"error","msg":"boom","pod":"web-1"}';

let served;

/** Кнопки страницы настроек по подписи — чтобы «нажимать» их без DOM. */
const buttons = new Map();
const notified = [];

globalThis.React = require("react");

globalThis.LensExtensions = {
  Common: {},
  Renderer: {
    LensExtension: class {},
    Component: {
      Button: (props) => {
        buttons.set(props.label, props);

        return globalThis.React.createElement("button", { disabled: props.disabled }, props.label);
      },
      Notifications: {
        ok: (message) => notified.push(["ok", message]),
        error: (message) => notified.push(["error", message]),
      },
    },
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

// установка расширения lc не ставит — только кнопка на странице настроек
const lc = path.join(bin, "lc");

assert.ok(!fs.existsSync(lc), "lc встал без спроса");

const { renderToStaticMarkup } = require("react-dom/server");
const [page] = extension.appPreferences;
const render = () => renderToStaticMarkup(globalThis.React.createElement(page.components.Input));

assert.match(render(), /Not installed/, "страница настроек не показала состояние");
renderToStaticMarkup(globalThis.React.createElement(page.components.Hint));

buttons.get("Install lc").onClick();
assert.deepStrictEqual(notified.at(-1)?.[0], "ok", `установка не удалась: ${notified.at(-1)?.[1]}`);
assert.ok(fs.existsSync(lc), "кнопка не поставила lc");
assert.match(render(), /Installed: ~\/\.local\/bin\/lc/);

const piped = execFileSync(lc, { input: `${RAW}\n` }).toString();

assert.ok(piped.includes("\u001b["), "lc не красит");
assert.strictEqual(piped.replace(/\u001b\[[0-9;]*m/g, ""), `${RAW}\n`, "lc изменил текст");

// выключили или удалили расширение — lc уходит; включили обратно — возвращается
extension.onDeactivate();
assert.ok(!fs.existsSync(lc), "lc пережил удаление расширения");
extension.onActivate();
assert.ok(fs.existsSync(lc), "lc не вернулся после включения");

render();
buttons.get("Remove lc").onClick();
assert.ok(!fs.existsSync(lc), "кнопка не убрала lc");

// то же из палитры команд — ей React не нужен
const command = (id) => extension.commands.find((each) => each.id === id);

command("logscolor-install-lc").action();
assert.ok(fs.existsSync(lc), "команда палитры не поставила lc");
command("logscolor-remove-lc").action();
assert.ok(!fs.existsSync(lc), "команда палитры не убрала lc");
extension.onActivate();
assert.ok(!fs.existsSync(lc), "lc вернулся после того, как его убрали");

console.log("smoke ok");
