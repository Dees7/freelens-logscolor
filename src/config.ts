/**
 * Настройка расширения: один файл, один ключ, никаких зависимостей.
 *
 * Расширение по умолчанию **включено** — оно ровно для этого и ставится.
 * Файл нужен только чтобы выключить раскраску, не удаляя расширение:
 *
 * ```json
 * { "enabled": false }
 * ```
 *
 * Читается на каждый ответ `getLogs`, поэтому правка действует сразу, без
 * перезапуска окна. Чтение дешёвое: `statSync` + разбор только при изменении
 * файла, а логи приходят пачками, а не построчно.
 *
 * Своей панели настроек у расширения нет намеренно: она потребовала бы React,
 * а значит и хост, который отдаёт свой React расширениям. Без неё расширение
 * обходится одним `@freelensapp/extensions` и работает на ванильной сборке.
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
}

const DEFAULT: Config = { enabled: true };

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

    parsed = { enabled: (raw as Partial<Config> | null)?.enabled !== false };
  } catch (error) {
    console.warn(`[logscolor] не разобрал ${file}, оставляю прежнюю настройку:`, error);

    return cache?.config ?? DEFAULT;
  }

  cache = { mtimeMs: stat.mtimeMs, size: stat.size, config: parsed };

  return parsed;
}

export function enabled(): boolean {
  return config().enabled;
}
