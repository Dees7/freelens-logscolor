/**
 * Настройка расширения: один файл, два ключа, никаких зависимостей.
 *
 * Раскраска по умолчанию **включена** — расширение ровно для этого и ставится.
 * Команда `lc` по умолчанию **не ставится**: её ставят и убирают кнопкой на
 * странице настроек (`preferences.tsx`), и туда же пишется выбор:
 *
 * ```json
 * { "enabled": false, "cli": true }
 * ```
 *
 * Читается на каждый ответ `getLogs`, поэтому правка `enabled` действует
 * сразу, без перезапуска окна. Чтение дешёвое: `statSync` + разбор только при
 * изменении файла, а логи приходят пачками, а не построчно.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const FILE = "freelens-logscolor.json";

/**
 * Каталоги, где ищется файл: сначала Freelens, потом Lens.
 *
 * Берётся первый существующий файл; если нет ни одного — путь в `~/.freelens`,
 * чтобы было что показать в сообщении и куда положить файл.
 */
const HOMES = [".freelens", ".k8slens"];

export function configPath(): string {
  const candidates = HOMES.map((home) => path.join(os.homedir(), home, FILE));

  return candidates.find((file) => fs.existsSync(file)) ?? candidates[0];
}

interface Config {
  enabled: boolean;
  /** Пользователь поставил команду `lc` и её надо держать в PATH (см. `cli.ts`). */
  cli: boolean;
}

const DEFAULT: Config = { enabled: true, cli: false };

let cache: { mtimeMs: number; size: number; config: Config } | undefined;

/**
 * Текущая настройка.
 *
 * Битый JSON не должен выключать раскраску молча посреди правки файла:
 * при ошибке разбора остаётся прошлое значение, а если его нет — дефолт.
 */
export function config(): Config {
  const file = configPath();

  let stat: fs.Stats;

  try {
    stat = fs.statSync(file);
  } catch {
    return DEFAULT;
  }

  if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) {
    return cache.config;
  }

  let parsed: Config;

  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));

    const given = raw as Partial<Config> | null;

    parsed = { enabled: given?.enabled !== false, cli: given?.cli === true };
  } catch (error) {
    console.warn(`[logscolor] could not parse ${file}, keeping the previous setting:`, error);

    return cache?.config ?? DEFAULT;
  }

  cache = { mtimeMs: stat.mtimeMs, size: stat.size, config: parsed };

  return parsed;
}

export function enabled(): boolean {
  return config().enabled;
}

/**
 * Записать часть настройки, не трогая остального в файле — в том числе ключей,
 * которых мы не знаем. Файла ещё нет — он появится там, где у приложения уже
 * есть каталог: у Lens это `~/.k8slens`, а не `~/.freelens`.
 */
export function setConfig(patch: Partial<Config>): void {
  let file = configPath();

  if (!fs.existsSync(file)) {
    const home = HOMES.map((dir) => path.join(os.homedir(), dir)).find((dir) => fs.existsSync(dir));

    file = path.join(home ?? path.join(os.homedir(), HOMES[0]), FILE);
  }

  let current: Record<string, unknown> = {};

  // битый файл не перезаписываем: в нём чья-то недописанная правка
  if (fs.existsSync(file)) {
    const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));

    if (raw && typeof raw === "object" && !Array.isArray(raw)) current = raw as Record<string, unknown>;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...current, ...patch }, null, 2) + "\n");
  cache = undefined;
}
