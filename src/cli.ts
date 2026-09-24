/**
 * Команда `lc` в PATH — чтобы красить свои логи в любом терминале.
 *
 * Ставится только по кнопке на странице настроек расширения (`preferences.tsx`):
 * установка самого расширения в систему ничего не кладёт. Выбор запоминается в
 * `freelens-logscolor.json` (`"cli": true`), и дальше расширение держит файл в
 * порядке само: при активации обновляет, при отключении и удалении — убирает.
 * Freelens зовёт `onDeactivate` в обоих случаях (`removeInstance` →
 * `disable`), поэтому удалённое расширение не оставляет `lc` в системе, а
 * включённое обратно — возвращает его тем, кто его ставил.
 *
 * Кладётся не сам бандл, а короткий sh-скрипт, который зовёт `dist/lc.js` из
 * установленного расширения: так обновление расширения обновляет и `lc`.
 * Интерпретатор — `node` из PATH, и только он: без `node` команда не ставится.
 * Бинарник самого приложения с `ELECTRON_RUN_AS_NODE` мог бы его заменить, но
 * тогда `lc` зависел бы от того, где лежит и чем собран Freelens.
 *
 * Чужое не трогаем: если `lc` уже есть где-то в PATH и он не наш, команда не
 * ставится. Свой файл узнаём по метке во второй строке.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { config, setConfig } from "./config";

export const NAME = "lc";

export const MARK = "# freelens-logscolor: generated";

/**
 * Куда класть, в порядке предпочтения. Берётся первый, который есть в PATH и
 * доступен на запись. Домашние — первыми: они не общие для всех пользователей
 * машины. `~/bin` — после `~/.local/bin`, потому что его часто держат в
 * репозитории с дотфайлами, и лишний файл там был бы заметен в `git status`.
 */
export function preferredDirs(home = os.homedir()): string[] {
  return [path.join(home, ".local", "bin"), path.join(home, "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
}

/** Строка в одинарных кавычках для sh: `'` внутри закрывает, экранирует и открывает заново. */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Текст обёртки. Любая поломка — пропала `node` или само расширение — не рвёт
 * трубу: логи идут дальше как есть, а причина пишется в stderr.
 */
export function wrapper(script: string): string {
  return `#!/bin/sh
${MARK} — colorizes logs from stdin: kubectl logs -f pod | lc
# Installed from the extension's preferences page and removed from there, or
# together with the extension.
script=${shQuote(script)}
if [ ! -f "$script" ]; then
  echo "lc: freelens-logscolor is not installed anymore, passing logs through as is" >&2
  exec cat
fi
if ! command -v node >/dev/null 2>&1; then
  echo "lc: node is not on PATH, passing logs through as is" >&2
  exec cat
fi
exec node "$script" "$@"
`;
}

function isOurs(file: string): boolean {
  try {
    return fs.readFileSync(file, "utf8").slice(0, 256).includes(MARK);
  } catch {
    return false;
  }
}

function executable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);

    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function writable(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK);

    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Где искать и куда класть. В приложении — PATH и `preferredDirs()`, в тестах — песочница. */
export interface Dirs {
  /** Каталоги из PATH, по порядку. */
  pathDirs: string[];
  /** Каталоги-кандидаты, по предпочтению. */
  preferred: string[];
}

/** Что сейчас с командой. Ровно то, что показывает страница настроек. */
export interface CliState {
  /** Наши файлы в PATH; обычно один. */
  ours: string[];
  /** Чужой `lc` в PATH — ставить нельзя. */
  foreign?: string;
  /** Куда встанет (или уже стоит) наш файл; нет — значит, некуда. */
  target?: string;
  /** `node` из PATH, которым обёртка запустит `lc.js`; нет — ставить нельзя. */
  node?: string;
}

export function inspect({ pathDirs, preferred }: Dirs): CliState {
  const present = pathDirs.map((dir) => path.join(dir, NAME)).filter((file) => fs.existsSync(file));
  const ours = present.filter(isOurs);
  const foreign = present.find((file) => !isOurs(file));
  const dir = preferred.filter((candidate) => pathDirs.includes(candidate)).find(writable);
  const node = pathDirs.map((each) => path.join(each, "node")).find(executable);

  return { ours, foreign, target: ours[0] ?? (dir && path.join(dir, NAME)), node };
}

/** Состояние одной строкой — для страницы настроек. */
export function describe({ ours, foreign, target, node }: CliState, show = tilde): string {
  if (ours.length > 0) return `Installed: ${ours.map(show).join(", ")}`;

  if (foreign) return `Cannot install: ${show(foreign)} already exists and is not ours.`;

  if (!node) return "Cannot install: node is not on PATH. Install Node.js first.";

  if (target) return `Not installed. It will be put at ${show(target)}.`;

  return "Cannot install: none of ~/.local/bin, ~/bin, /opt/homebrew/bin, /usr/local/bin is on PATH and writable.";
}

/** Путь с `~` вместо домашнего каталога — короче и не светит имя пользователя на скриншоте. */
export function tilde(file: string): string {
  const home = os.homedir();

  return file.startsWith(`${home}/`) ? `~${file.slice(home.length)}` : file;
}

/**
 * Поставить или обновить. Возвращает путь к файлу, а если ставить нельзя —
 * бросает с причиной, которую страница настроек покажет как есть.
 */
export function write(dirs: Dirs, content: string): string {
  const { foreign, target, node } = inspect(dirs);

  if (foreign) throw new Error(`${foreign} already exists and does not belong to this extension`);

  if (!node) throw new Error("node is not on PATH: lc runs on Node.js, install it first");

  if (!target) throw new Error(`none of ${dirs.preferred.join(", ")} is on PATH and writable`);

  if (isOurs(target) && fs.readFileSync(target, "utf8") === content) return target;

  // через временный файл: активация идёт в каждом фрейме, и два фрейма не
  // должны оставить наполовину записанный скрипт
  const temp = `${target}.${process.pid}.tmp`;

  fs.writeFileSync(temp, content, { mode: 0o755 });
  fs.renameSync(temp, target);

  return target;
}

/** Убрать свои файлы. Чужие не трогаются. Возвращает, что удалено. */
export function remove(dirs: Dirs): string[] {
  const { ours } = inspect(dirs);

  ours.forEach((file) => fs.rmSync(file, { force: true }));

  return ours;
}

/** Каталоги этой машины. */
export function systemDirs(): Dirs {
  return {
    pathDirs: (process.env.PATH ?? "").split(path.delimiter).filter(Boolean),
    preferred: preferredDirs(),
  };
}

/**
 * Каталог собранного бандла (`dist/`), где рядом лежит `lc.js`.
 *
 * Единственное место в файле, где ветки расходятся: здесь бандл — CommonJS, и
 * его каталог даёт `__dirname`; в ветке `v2` бандл — ESM, там `import.meta.url`.
 */
function bundleDir(): string {
  return __dirname;
}

function content(): string {
  return wrapper(path.join(bundleDir(), "lc.js"));
}

/** Команда для этой ОС вообще возможна: sh-скрипт на Windows не запустится. */
export const supported = process.platform !== "win32";

/** Кнопка «Install». Выбор запоминается, чтобы переживать выключение расширения. */
export function installCli(): string {
  const file = write(systemDirs(), content());

  setConfig({ cli: true });
  console.info(`[logscolor] ${NAME} command installed: ${file}`);

  return file;
}

/** Кнопка «Remove». */
export function removeCli(): string[] {
  const removed = remove(systemDirs());

  setConfig({ cli: false });
  console.info(`[logscolor] ${NAME} command removed: ${removed.join(", ") || "nothing to remove"}`);

  return removed;
}

/**
 * Из `onActivate`: вернуть или обновить команду тем, кто её ставил. Без
 * `"cli": true` не делает ничего — установка расширения в систему не пишет.
 */
export function restoreCli(): void {
  if (!supported || !config().cli) return;

  try {
    write(systemDirs(), content());
  } catch (error) {
    console.warn(`[logscolor] could not restore the ${NAME} command:`, error);
  }
}

/**
 * Из `onDeactivate`: расширение выключают или удаляют — команда уходит вместе
 * с ним. Выбор в настройке не трогаем: включат обратно — `restoreCli` вернёт.
 */
export function dropCli(): void {
  if (!supported) return;

  try {
    remove(systemDirs());
  } catch (error) {
    console.warn(`[logscolor] could not remove the ${NAME} command:`, error);
  }
}
