/**
 * Проверка контракта с хостом на собранном бандле (Freelens 2.x).
 *
 * Юнит-тесты знают только про строки; здесь проверяется то, что ломается на
 * стыке с приложением и о чём тесты молчат: бандл вообще грузится (загрузчик
 * расширений берёт из него `default`), API находится на
 * `globalThis.FreelensExtensionApi`, а обёртка садится на
 * `podsStore.api.getLogs` и красит его ответ.
 *
 * Тут же команда `lc`. Хост здесь ванильный Freelens 2.x — React на глобале
 * нет, — и всё равно: страница настроек показывает состояние (её компоненты
 * отдают строки), а палитра команд ставит и убирает `lc` по-настоящему.
 *
 * Хоста здесь нет — есть его форма. Значит, проверка ловит промах в сборке и
 * в способе подключения, но не в том, как настоящий вьювер покажет результат.
 */
import assert from "assert";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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

const notified = [];

// ровно то, что кладёт ванильный Freelens 2.x: `Common` и `Renderer`, без React
globalThis.FreelensExtensionApi = {
  Common: {},
  Renderer: {
    LensExtension: class {},
    Component: {
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

const { default: Extension } = await import("../dist/renderer.js");

assert.strictEqual(typeof Extension, "function", "хост не получил бы класс расширения");

const extension = new Extension();

extension.onActivate();

const api = globalThis.FreelensExtensionApi.Renderer.K8sApi.podsStore.api;
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

// установка расширения lc не ставит — только палитра команд
const lc = path.join(bin, "lc");

assert.ok(!fs.existsSync(lc), "lc встал без спроса");

// страница настроек: компоненты — функции, отдающие строку; хосту React-а для
// этого хватает своего, а нам свой не нужен
const [page] = extension.appPreferences;

assert.ok(page, "страницы настроек нет");
assert.match(page.components.Input(), /Not installed/, "страница настроек не показала состояние");
assert.match(page.components.Hint(), /command palette/);

const command = (id) => extension.commands.find((each) => each.id === id);

command("logscolor-install-lc").action();
assert.deepStrictEqual(notified.at(-1)?.[0], "ok", `установка не удалась: ${notified.at(-1)?.[1]}`);
assert.ok(fs.existsSync(lc), "команда палитры не поставила lc");
assert.match(page.components.Input(), /Installed: ~\/\.local\/bin\/lc/);

// `lc` встал в PATH и красит stdin тем же бандлом, что лежит рядом
const piped = execFileSync(lc, { input: `${RAW}\n` }).toString();

assert.ok(piped.includes("\u001b["), "lc не красит");
assert.strictEqual(piped.replace(/\u001b\[[0-9;]*m/g, ""), `${RAW}\n`, "lc изменил текст");

// выключили или удалили расширение — lc уходит; включили обратно — возвращается
extension.onDeactivate();
assert.ok(!fs.existsSync(lc), "lc пережил удаление расширения");
extension.onActivate();
assert.ok(fs.existsSync(lc), "lc не вернулся после включения");

command("logscolor-remove-lc").action();
assert.ok(!fs.existsSync(lc), "команда палитры не убрала lc");
extension.onActivate();
assert.ok(!fs.existsSync(lc), "lc вернулся после того, как его убрали");

// без node в PATH не ставится: обёртке нечем было бы запускать lc.js
process.env.PATH = [bin, "/usr/bin", "/bin"].join(path.delimiter);
command("logscolor-install-lc").action();
assert.deepStrictEqual(notified.at(-1)?.[0], "error", "без node установка должна отказать");
assert.match(notified.at(-1)?.[1], /node is not on PATH/);
assert.ok(!fs.existsSync(lc), "lc встал без node");
assert.match(page.components.Input(), /node is not on PATH/);

console.log("smoke ok");
