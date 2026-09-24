/**
 * Установка `lc` в PATH.
 *
 * Главное, что здесь проверяется, — чужой файл не трогается ни при каких
 * условиях: ни свой `lc` поверх, ни удаление при выключении.
 */
import * as assert from "assert";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { test as check } from "vitest";

import { config, configPath, setConfig } from "./config";
import { inspect, MARK, NAME, remove, wrapper, write } from "./cli";

function sandbox(...names: string[]): string[] {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "logscolor-cli-"));

  return names.map((name) => {
    const dir = path.join(root, name);

    fs.mkdirSync(dir);

    return dir;
  });
}

const CONTENT = wrapper("/nowhere/lc.js", undefined);

check("ставится в первый предпочтительный каталог из PATH", () => {
  const [a, b, c] = sandbox("a", "b", "c");

  // c предпочтительнее, но его нет в PATH
  const dirs = { pathDirs: [a, b], preferred: [c, b, a] };

  assert.deepStrictEqual(inspect(dirs), { ours: [], foreign: undefined, target: path.join(b, NAME) });
  assert.strictEqual(write(dirs, CONTENT), path.join(b, NAME));
  assert.strictEqual(fs.readFileSync(path.join(b, NAME), "utf8"), CONTENT);
  assert.ok(fs.statSync(path.join(b, NAME)).mode & 0o100, "файл не исполняемый");
  assert.ok(!fs.existsSync(path.join(c, NAME)));
  assert.deepStrictEqual(inspect(dirs).ours, [path.join(b, NAME)]);
});

check("свой файл обновляется на месте, второй копии не заводится", () => {
  const [a, b] = sandbox("a", "b");
  const dirs = { pathDirs: [a, b], preferred: [b, a] };

  write(dirs, CONTENT);
  fs.renameSync(path.join(b, NAME), path.join(a, NAME));

  const next = wrapper("/elsewhere/lc.js", undefined);

  assert.strictEqual(write(dirs, next), path.join(a, NAME));
  assert.strictEqual(fs.readFileSync(path.join(a, NAME), "utf8"), next);
  assert.ok(!fs.existsSync(path.join(b, NAME)));
});

check("чужой lc в PATH — не ставим и не трогаем", () => {
  const [a, b] = sandbox("a", "b");
  const foreign = path.join(b, NAME);
  const dirs = { pathDirs: [a, b], preferred: [a] };

  fs.writeFileSync(foreign, "#!/bin/sh\necho mine\n");

  assert.strictEqual(inspect(dirs).foreign, foreign);
  assert.throws(() => write(dirs, CONTENT), /does not belong to this extension/);
  assert.deepStrictEqual(remove(dirs), []);
  assert.ok(!fs.existsSync(path.join(a, NAME)));
  assert.strictEqual(fs.readFileSync(foreign, "utf8"), "#!/bin/sh\necho mine\n");
});

check("удаление убирает свой файл и оставляет чужой", () => {
  const [a, b] = sandbox("a", "b");

  write({ pathDirs: [a], preferred: [a] }, CONTENT);
  fs.writeFileSync(path.join(b, NAME), "#!/bin/sh\n");

  assert.deepStrictEqual(remove({ pathDirs: [a, b], preferred: [a] }), [path.join(a, NAME)]);
  assert.ok(!fs.existsSync(path.join(a, NAME)));
  assert.ok(fs.existsSync(path.join(b, NAME)));
});

check("некуда писать — так и говорим", () => {
  const [a] = sandbox("a");
  const dirs = { pathDirs: [a], preferred: ["/definitely/not/here"] };

  assert.strictEqual(inspect(dirs).target, undefined);
  assert.throws(() => write(dirs, CONTENT), /is on PATH and writable/);
});

check("настройка: cli по умолчанию выключен, запись не теряет чужих ключей, битый файл не трогается", () => {
  const [home] = sandbox("home");
  const saved = process.env.HOME;

  process.env.HOME = home;

  try {
    assert.strictEqual(config().cli, false);

    // у Lens каталог свой — туда файл и ляжет
    fs.mkdirSync(path.join(home, ".k8slens"));
    setConfig({ cli: true });
    assert.strictEqual(configPath(), path.join(home, ".k8slens", "freelens-logscolor.json"));
    assert.deepStrictEqual(config(), { enabled: true, cli: true });

    fs.writeFileSync(configPath(), JSON.stringify({ enabled: false, cli: true, extra: 1 }));
    setConfig({ cli: false });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(configPath(), "utf8")), { enabled: false, cli: false, extra: 1 });

    fs.writeFileSync(configPath(), "{ half");
    assert.throws(() => setConfig({ cli: true }));
    assert.strictEqual(fs.readFileSync(configPath(), "utf8"), "{ half");
  } finally {
    process.env.HOME = saved;
  }
});

check("обёртка: метка на месте, пути с кавычками не ломают sh", () => {
  const [dir] = sandbox("it's here");
  const script = path.join(dir, "lc.js");

  fs.writeFileSync(script, 'process.stdin.pipe(process.stdout); console.error("ran");\n');

  const text = wrapper(script, "/no/such/host");
  const file = path.join(dir, NAME);

  assert.ok(text.split("\n")[1].startsWith(MARK));
  fs.writeFileSync(file, text, { mode: 0o755 });

  // node в PATH есть (тесты им и запущены) — значит, до host дело не дойдёт
  assert.strictEqual(execFileSync(file, { input: "hello\n" }).toString(), "hello\n");
});

check("обёртка без расширения пропускает логи как есть", () => {
  const [dir] = sandbox("x");
  const file = path.join(dir, NAME);

  fs.writeFileSync(file, wrapper(path.join(dir, "gone.js"), undefined), { mode: 0o755 });

  const out = execFileSync(file, { input: "as is\n", stdio: ["pipe", "pipe", "ignore"] });

  assert.strictEqual(out.toString(), "as is\n");
});
