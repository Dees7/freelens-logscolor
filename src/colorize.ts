/**
 * Раскраска строк лога для штатного вьювера Freelens.
 *
 * Главный инвариант, на котором держится всё остальное: **снятие ANSI-кодов
 * обязано возвращать исходную строку символ в символ**. Мы ничего не
 * переставляем, не перекодируем и не экранируем — только вставляем escape-коды
 * между уже существующими кусками текста. Из этого следует, что сломаться
 * раскраска может максимум в цвете: любой неожиданный ввод отдаётся как есть.
 *
 * Куда это попадает: обёртка над `PodApi.getLogs` (см. `log-colors.ts`), то
 * есть текст уходит в `LogStore`, а тот отдаёт его в список, который прогоняет
 * строки через AnsiUp и DOMPurify. Поэтому на выходе именно ANSI, а не HTML:
 * HTML был бы экранирован и показан текстом.
 *
 * Коды выбраны из того, что AnsiUp 6 действительно понимает: 0, 1 (bold),
 * 2 (faint), 3 (italic), 30-37 и 90-97. 256-цветные и truecolor он тоже умеет,
 * но 16 базовых переживают любую тему.
 */

/** Строку длиннее этого не трогаем: одна гигантская строка не стоит разбора. */
const MAX_LINE = 64 * 1024;

const ESC = "\u001b[";
const RESET = `${ESC}0m`;

/**
 * «Тусклое»: фон строки — то, что глаз должен пропускать, не читая. Скобки и
 * запятые JSON, таймстемпы, стектрейсы, шапка klog.
 *
 * Вынесено отдельной константой, потому что это единственное место, где ветки
 * `v1` и `v2` расходятся: AnsiUp 5 (Freelens 1.x) про `faint` не знает и код 2
 * молча выбрасывает, так что там на этой строке стоит серый `0;90`. Всё
 * остальное в файле общее, и правки логики переносятся между ветками
 * черри-пиком без конфликтов.
 */
export const FAINT = "0;2";

/**
 * Палитра. Значение — тело SGR-последовательности до `m`.
 *
 * Пустая строка — «не красить»: текст остаётся цветом темы, то есть белым на
 * тёмной и чёрным на светлой. Так покрашены строковые значения — их в строке
 * больше всего, и когда цветное всё подряд, не выделяется уже ничего.
 */
const C = {
  string: "",
  number: "0;33",
  literal: "0;35", // true / false / null
  punct: FAINT, // скобки, запятые, двоеточия
  faint: FAINT,
  time: FAINT,
  addr: "0;36", // адрес: ip, url, host:port в url
  id: "0;35", // uuid — длинный идентификатор, который ищут глазами целиком
  trace: FAINT,
  debug: "0;35",
  info: "0;32",
  warn: "0;33",
  error: "0;1;31",
  fatal: "0;1;91",
} as const;

/**
 * Цвета ключей: каждый ключ всегда одного и того же цвета, выбранного по имени.
 *
 * Так `pod` или `trace_id` ловится глазом в потоке строк, не читая их. Из
 * шестнадцати базовых цветов сюда отобраны десять: без красного (он занят
 * ошибками, и ключ такого цвета читался бы как авария), без серого (он же
 * faint — им тушатся стектрейсы) и без чёрного с белым (пропадают в тёмной и
 * светлой теме соответственно).
 *
 * Зелёный тут потому, что строковые значения больше не красятся вовсе: цвет
 * освободился, и `"msg":"текст"` в одно пятно уже не сливается. С уровнем INFO
 * он не путается — тот стоит в значении, а не в имени поля.
 *
 * Десяток оттенков — примерно предел, на котором цвета ещё различимы между
 * собой; дальше набор перестаёт помогать. Хочется иначе — правится этот список
 * и больше ничего.
 */
const KEY_PALETTE = [
  "0;34", // синий
  "0;94", // яркий синий
  "0;35", // сиреневый
  "0;95", // яркий сиреневый
  "0;36", // бирюзовый
  "0;96", // яркий бирюзовый
  "0;33", // жёлтый
  "0;93", // яркий жёлтый
  "0;32", // зелёный
  "0;92", // яркий зелёный
];

type Color = string;

/** Пустой цвет — не красить: текст остаётся тем, что даёт тема вьювера. */
function paint(color: Color, text: string): string {
  return text === "" || color === "" ? text : `${ESC}${color}m${text}${RESET}`;
}

/**
 * Значение поля: либо свой цвет целиком, либо — если цвета нет — подсветка
 * токенов внутри.
 *
 * Строковые значения намеренно остаются цветом темы (см. `C.string`), и ровно в
 * них, прежде всего в `msg`, живут адреса, uuid и ключи команд. Красить такое
 * значение целиком по-прежнему нельзя — оно и так самое длинное в строке, — а
 * выделить внутри него адрес можно: цвет ложится на кусок, а не поверх уже
 * покрашенного.
 */
function paintValue(color: Color, text: string): string {
  return color === "" ? highlightTokens(text) : paint(color, text);
}

/**
 * Цвет ключа по его имени — FNV-1a, чтобы близкие имена (`pod` и `pods`)
 * расходились по разным цветам, а не липли в один.
 *
 * `Math.imul` тут не для скорости, а для 32-битного переполнения: обычное
 * умножение ушло бы в double и потеряло младшие биты.
 */
export function keyColor(name: string): Color {
  let hash = 2166136261;

  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return KEY_PALETTE[(hash >>> 0) % KEY_PALETTE.length];
}

/**
 * Таймстемп, который kubernetes приписывает в начало строки.
 *
 * Его нельзя ни красить, ни сдвигать: `LogStore` по нему считает `sinceTime`
 * для дозагрузки (`/^\d+\S+/`) и вырезает его, когда выключены таймстемпы
 * (`/^\d+.*?\s/`). Escape-код перед ним сломал бы и то, и другое.
 *
 * Пробел после таймстемпа ровно один, и забирать его жадным `\s+` нельзя: в
 * строках стектрейса дальше идёт табуляция, и по ней же они и узнаются.
 */
const KUBE_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2}) )([\s\S]*)$/;

/**
 * Таймстемп в начале самого сообщения — этот уже можно притушить.
 *
 * Форматов много, и каждый живой: логгер пишет так, как принято в его языке и
 * регионе. Узнаются:
 *
 * - ISO 8601 и его «пробельный» вариант, с `,` в долях (log4j, python):
 *   `2026-09-23T15:13:40.716Z`, `2026-09-23 15:13:40,716 +0300`;
 * - год первым через `/` или `.`: `2026/09/23 15:13:40` — Go `log`, nginx,
 *   fluent-bit; `2026.09.23 15:13:40.716` — ClickHouse;
 * - день первым: `23.09.2026 15:13:40` (ru, de), `23/09/2026`, американское
 *   `09/23/2026 03:13:40 PM` — день это или месяц, для цвета неважно;
 * - месяц словом: `23/Sep/2026:15:13:40 +0000` (access-лог apache и nginx),
 *   `23-Sep-2026 15:13:40.716` (tomcat);
 * - syslog и ctime: `Sep 23 15:13:40`, `Wed Sep 23 15:13:40.123456 2026` (error-лог apache);
 * - просто время: `15:13:40.716` — так пишут консольные логгеры в dev-режиме.
 *
 * Любой из них может стоять в квадратных скобках — тогда скобки тушатся вместе
 * с ним. Справа таймстемп обязан заканчиваться: цифра или буква сразу за ним
 * значат, что это не время, а что-то на него похожее.
 */
const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const WEEKDAY = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
const CLOCK = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?(?:\s?[AP]M)?`;
const ZONE = String.raw`(?:Z|\s?[+-]\d{2}:?\d{2}|\s(?:UTC|GMT))?`;
const TIMESTAMP = [
  String.raw`\d{4}-\d{2}-\d{2}(?:[T ]${CLOCK})?`,
  String.raw`\d{4}[/.]\d{2}[/.]\d{2}(?:[T ]${CLOCK})?`,
  String.raw`\d{1,2}[./-]\d{1,2}[./-]\d{4}(?:,?\s${CLOCK})?`,
  String.raw`\d{1,2}[/ -]${MONTH}[/ -]\d{4}(?:[: ]${CLOCK})?`,
  String.raw`(?:${WEEKDAY}\s)?${MONTH}\s+\d{1,2}\s${CLOCK}(?:\s\d{4})?`,
  // одно время без даты — только с секундами, иначе `10:30` из фразы сошло бы за него
  String.raw`\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?`,
]
  .map((format) => `(?:${format})${ZONE}`)
  .join("|");
const OWN_TIMESTAMP = new RegExp(String.raw`^(\[\s*(?:${TIMESTAMP})\s*\]|(?:${TIMESTAMP})(?![\w:.\/-]))`);

/**
 * Уровень словом: в начале строки — в любом регистре, дальше — только капсом.
 *
 * В начале он может стоять в скобках, и внутри скобок бывает пробел: fluent-bit
 * выравнивает `[ info]` и `[ warn]` по ширине `[error]`. Здесь же уровни
 * syslog, которые пишут nginx и apache: `[crit]`, `[emerg]`, `[alert]`, `[notice]`,
 * и `SEVERE` из java.util.logging (tomcat).
 */
const LEVEL_AT_START =
  /^(\s*[[<(]?\s*)(trace|debug|info|notice|warn|warning|error|severe|crit|critical|alert|emerg|fatal|panic)(\s*[\]>)](?!\w)|\b)/i;
const LEVEL_WORDS = "TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|PANIC";

/**
 * Уровень буквой с восклицательным знаком: `I! [agent] Starting Telegraf`.
 *
 * Так пишет Telegraf и всё, что собрано на его логгере (`influxdata/wlog`):
 * Kapacitor, сторонние плагины и сборки Telegraf. Буква с `!` и пробелом после
 * ни с чем другим в начале строки не путается.
 */
const LEVEL_BANG = /^(\s*)([TDIWE]!)(?=\s|$)/;

const BANG_LEVELS: Record<string, string> = {
  T: "trace",
  D: "debug",
  I: "info",
  W: "warn",
  E: "error",
};

/**
 * Тег компонента сразу за уровнем: `[engine]`, `[input:tail:tail.0]`,
 * `[outputs.yandex_monitoring]`. Красится как ключ, по имени — так строки
 * одного плагина видны в потоке одним цветом.
 *
 * Ищется только прямо за уровнем: скобки где-то посреди текста могут значить
 * что угодно, от индекса массива до `[running]` у горутины.
 */
const COMPONENT_TAG = /^(\s+)\[([\w.:\/@-]+)\](?=[\s:]|$)/;

/**
 * Ключи, значение которых красится как уровень, а не как обычная строка.
 *
 * Имя сравнивается целиком и в нижнем регистре, так что `logLevel` сюда попадает
 * через `loglevel`, а вот `levelname` и `log.level` — это отдельные имена, и без
 * них питоновский `logging` и ECS остаются некрашеными.
 */
const LEVEL_KEYS = [
  "level",
  "lvl",
  "severity",
  "loglevel",
  "log_level",
  "levelname", // python logging, structlog
  "log.level", // ECS / Elastic
  "severity_text", // OpenTelemetry
  "severitytext", // он же в camelCase
  "@level", // hashicorp: vault, nomad, terraform
];

/**
 * Шкалы числового уровня: `[граница, уровень]`, значение меньше границы — этот
 * уровень; что не попало ни в одну границу — `fatal`.
 *
 * Числовые уровни пишут ровно столько же, сколько словесные (`pino` и `bunyan`
 * иначе не умеют), а без шкалы они уходили в ветку обычных чисел и красились
 * жёлтым — тем же цветом, что и `warn`. То есть `"level":50` выглядел
 * предупреждением, хотя это ошибка; молчаливо неверный цвет хуже, чем никакой.
 */
type Level = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** pino и bunyan: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal. */
const PINO_SCALE: [number, Level][] = [
  [20, "trace"],
  [30, "debug"],
  [40, "info"],
  [50, "warn"],
  [60, "error"],
];

/** python logging: 10 debug, 20 info, 30 warning, 40 error, 50 critical. */
const PYTHON_SCALE: [number, Level][] = [
  [10, "trace"],
  [20, "debug"],
  [30, "info"],
  [40, "warn"],
  [50, "error"],
];

/** OpenTelemetry severityNumber: по четыре номера на уровень, 1-24. */
const OTEL_SCALE: [number, Level][] = [
  [5, "trace"],
  [9, "debug"],
  [13, "info"],
  [17, "warn"],
  [21, "error"],
];

/**
 * Какой ключ по какой шкале считается.
 *
 * Шкала выбирается по имени ключа, а не по числу: одно и то же `20` у pino —
 * debug, а у питона — info, и угадать по значению нельзя. Ключа нет в таблице —
 * значит число и есть число.
 *
 * `severity` здесь нет намеренно: в syslog он числовой и перевёрнутый (0 —
 * emerg, 7 — debug), так что любая из этих шкал покрасила бы его наоборот.
 */
const NUMERIC_LEVEL_KEYS: Record<string, [number, Level][]> = {
  "level": PINO_SCALE,
  "lvl": PINO_SCALE,
  "loglevel": PINO_SCALE,
  "log_level": PINO_SCALE,
  "log.level": PINO_SCALE,
  "@level": PINO_SCALE,
  "levelno": PYTHON_SCALE,
  "severitynumber": OTEL_SCALE,
  "severity_number": OTEL_SCALE,
};

/** Начало аварии: дальше почти наверняка идёт стектрейс. */
const CRASH_LINE = /^(panic:|fatal error:|Exception in thread|Traceback \(most recent call last\):)/;

/**
 * klog — формат компонентов самого кубера и всего, что собрано с их логгером:
 * `I0918 13:00:33.350123       1 controller.go:42] Reconciling cluster`.
 *
 * Первая буква — уровень, дальше время, id треда и место в коде. Всё это шапка,
 * её тушим, а уровень красим; сообщение остаётся как есть.
 */
const KLOG_LINE = /^([IWEFD])(\d{4} [\d:.]+\s+\d+\s+\S+?\])(.*)$/;

const KLOG_LEVELS: Record<string, string> = {
  D: "debug",
  I: "info",
  W: "warn",
  E: "error",
  F: "fatal",
};

/**
 * Продолжение стектрейса — такие строки тушим целиком.
 *
 * Список собран по языкам, которые реально встречаются в кластере: Go
 * (`goroutine 1 [running]:`, `\t/app/main.go:42 +0x1a5`), Java и Kotlin
 * (`\tat com.foo.Bar`, `Caused by:`, `... 12 more`), Python (`  File "x", line 1`),
 * JS (`    at fn (file:1:2)`). Общий признак у всех — отступ в начале.
 */
const STACK_LINE = [
  /^\s+\S/,
  /^\s*at\s+\S/,
  /^Caused by:/,
  /^\s*\.\.\.\s*\d+\s+(more|common frames omitted)/,
  /^goroutine\s+\d+\s+\[/,
  /^\s*File\s+".*",\s+line\s+\d+/,
  /^created by\s+\S/,
  /^\s*#\d+\s+0x[0-9a-f]+/,
];

export function levelColor(word: string): Color {
  switch (word.toLowerCase()) {
    case "trace":
      return C.trace;
    case "debug":
      return C.debug;
    case "info":
    case "notice":
      return C.info;
    case "warn":
    case "warning":
      return C.warn;
    case "fatal":
    case "panic":
    case "critical":
    case "crit":
    case "alert":
    case "emerg":
      return C.fatal;
    case "error":
    case "err":
    case "severe": // java.util.logging, tomcat
      return C.error;
    default:
      // не уровень — значит обычное значение поля level, и красить его нечем
      return C.string;
  }
}

/** Уровень по числу — или `undefined`, если у этого ключа шкалы нет. */
export function numericLevel(key: string, value: string): Level | undefined {
  const scale = NUMERIC_LEVEL_KEYS[key.toLowerCase()];

  if (!scale || !/^\d+$/.test(value)) return undefined;

  const number = Number(value);

  for (const [edge, level] of scale) {
    if (number < edge) return level;
  }

  return "fatal";
}

/**
 * Цвет значения, если ключ — про уровень. `undefined` — «не про уровень»,
 * тогда значение красится как обычно, по своему типу.
 *
 * Одна точка входа на оба формата: в json сюда приходит содержимое кавычек или
 * число, в logfmt — значение пары. Иначе числовой уровень пришлось бы чинить
 * дважды и по-разному.
 */
function levelValueColor(key: string, value: string): Color | undefined {
  const level = numericLevel(key, value);

  if (level) return levelColor(level);

  return LEVEL_KEYS.includes(key.toLowerCase()) ? levelColor(value) : undefined;
}

/**
 * Весь ответ `getLogs` целиком.
 *
 * Перенос строки нормализуем так же, как это потом сделает `LogStore`
 * (`\r` → `\n`): иначе одинокий `\r` внутри нашей раскрашенной строки позже
 * разрезал бы её посреди escape-последовательности.
 */
export function colorizeLogs(text: string): string {
  if (text === "") return text;

  return text
    .split(/\r\n|\r|\n/)
    .map(colorizeLine)
    .join("\n");
}

/** Одна строка. Что бы ни случилось — на выходе как минимум исходный текст. */
export function colorizeLine(line: string): string {
  if (line === "" || line.length > MAX_LINE) return line;

  try {
    const match = KUBE_TIMESTAMP.exec(line);
    const prefix = match ? match[1] : "";
    const rest = match ? match[2] : line;

    return prefix + colorizeMessage(rest);
  } catch (error) {
    // цвет — не повод потерять строку лога
    console.warn("[logscolor] could not colorize a log line:", error);

    return line;
  }
}

/** Каскад разбора: JSON → logfmt → обычный текст. */
function colorizeMessage(text: string): string {
  const trimmed = text.trimStart();

  if (trimmed.startsWith("{") && isJson(trimmed)) {
    const indent = text.length - trimmed.length;

    return text.slice(0, indent) + colorJson(trimmed);
  }

  if (looksLogfmt(text)) return colorLogfmt(text);

  return colorPlain(text);
}

function isJson(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);

    return typeof value === "object" && value !== null;
  } catch {
    return false;
  }
}

/**
 * JSON посимвольно: каждый токен оборачивается в цвет, остальное — как было.
 *
 * Не через `JSON.parse` + сборку обратно: тогда потерялись бы порядок пробелов
 * и исходное экранирование. Строка уже проверена `isJson`, так что неожиданный
 * символ здесь — это наша ошибка, и она честно роняет разбор в `colorizeLine`,
 * а строка отдаётся сырой.
 */
export function colorJson(text: string): string {
  let out = "";
  let index = 0;
  let lastKey = "";

  while (index < text.length) {
    const char = text[index];

    if (char === " " || char === "\t") {
      out += char;
      index++;
      continue;
    }

    if (char === "{" || char === "}" || char === "[" || char === "]" || char === "," || char === ":") {
      out += paint(C.punct, char);
      index++;
      continue;
    }

    if (char === '"') {
      const end = stringEnd(text, index);
      const raw = text.slice(index, end);

      if (isKeyAt(text, end)) {
        lastKey = raw.slice(1, -1);
        out += paint(keyColor(lastKey), raw);
      } else {
        out += paintValue(levelValueColor(lastKey, raw.slice(1, -1)) ?? C.string, raw);
      }

      index = end;
      continue;
    }

    const literal = /^(true|false|null)/.exec(text.slice(index));

    if (literal) {
      out += paint(C.literal, literal[1]);
      index += literal[1].length;
      continue;
    }

    const number = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));

    if (number) {
      out += paint(levelValueColor(lastKey, number[0]) ?? C.number, number[0]);
      index += number[0].length;
      continue;
    }

    throw new Error(`неожиданный символ ${JSON.stringify(char)} на позиции ${index}`);
  }

  return out;
}

/** Конец строкового литерала с учётом экранирования: возвращает индекс за кавычкой. */
function stringEnd(text: string, start: number): number {
  let index = start + 1;

  while (index < text.length) {
    const char = text[index];

    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === '"') return index + 1;

    index++;
  }

  throw new Error("незакрытая строка");
}

/** Строка — ключ, если следом (через пробелы) идёт двоеточие. */
function isKeyAt(text: string, end: number): boolean {
  return /^\s*:/.test(text.slice(end));
}

/** `key=value`, как пишут Go и Rust. Значение может быть в кавычках. */
const LOGFMT_PAIR = /([A-Za-z_][\w.\-]*)=("(?:\\.|[^"])*"|[^\s]*)/g;

/**
 * Похоже ли на logfmt: минимум две пары, и они занимают большую часть строки.
 *
 * Порог нужен, чтобы обычная фраза с одним `=` внутри (`result=ok, всё
 * остальное просто текст`) не поехала по этой ветке.
 */
export function looksLogfmt(text: string): boolean {
  const pairs = [...text.matchAll(new RegExp(LOGFMT_PAIR))];

  if (pairs.length < 2) return false;

  const covered = pairs.reduce((sum, pair) => sum + pair[0].length, 0);

  return covered >= text.trim().length / 2;
}

export function colorLogfmt(text: string): string {
  let out = "";
  let index = 0;

  for (const pair of text.matchAll(new RegExp(LOGFMT_PAIR))) {
    const start = pair.index ?? 0;
    const [, key, value] = pair;

    out += plainSegment(text.slice(index, start));
    out += paint(keyColor(key), key);
    out += paint(C.punct, "=");
    out += paintValue(valueColor(key, value), value);
    index = start + pair[0].length;
  }

  return out + plainSegment(text.slice(index));
}

function valueColor(key: string, value: string): Color {
  const level = levelValueColor(key, value.replace(/"/g, ""));

  if (level !== undefined) return level;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return C.number;
  if (value === "true" || value === "false" || value === "null") return C.literal;

  return C.string;
}

/** Текст между парами logfmt: уровень и токены подсветить, остальное не трогать. */
function plainSegment(text: string): string {
  return text === "" ? text : highlightPlain(text);
}

/**
 * Обычная строка: уровень, свой таймстемп, аварии и стектрейсы.
 *
 * Тут ничего не разбирается по-настоящему — только подсвечивается то, что
 * узнаётся наверняка. Всё прочее остаётся ровно как в kubectl.
 *
 * Авария и стектрейс красятся целиком и токенов внутри не ищут: строка уже
 * получила свой цвет, а вложенный цвет погасил бы её до конца.
 */
export function colorPlain(text: string): string {
  if (CRASH_LINE.test(text)) return paint(C.error, text);

  if (STACK_LINE.some((pattern) => pattern.test(text))) return paint(C.faint, text);

  const klog = KLOG_LINE.exec(text);

  if (klog) {
    const [, level, header, message] = klog;

    return (
      paint(levelColor(KLOG_LEVELS[level]), level) + paint(C.faint, header) + highlightTokens(message)
    );
  }

  return highlightPlain(text);
}

/**
 * Токены, которые узнаются в тексте без всякого формата.
 *
 * Это ответ на логи, которые не json и не logfmt, — те самые «просто строки»,
 * где до сих пор красился один уровень. Разбирать их целиком нельзя, зато в них
 * есть куски, которые ни с чем не спутать: адрес, uuid, имя переменной капсом,
 * ключ командной строки, число с единицей. Их и подсвечиваем, остальное — как в
 * `kubectl`.
 *
 * Все варианты собраны в одну регулярку с именованными группами и проходятся
 * одним сканом слева направо. Так куски заведомо не пересекаются, а значит цвет
 * не вложится в цвет: вложенный `RESET` погасил бы внешний цвет до конца строки.
 *
 * Порядок веток важен — побеждает первая, совпавшая в самой левой позиции.
 * `url` идёт раньше адресов и чисел, иначе `http://10.0.0.1:8080/x` распался бы
 * на куски.
 *
 * Границы почти везде через `(?<!…)`, а не через `\b`: `\b` не видит точку, и
 * в `v1.5s` покрасился бы хвост номера версии, а в `catrtq2msqc5j0dm2vko` —
 * кусок идентификатора.
 */
const TOKEN = new RegExp(
  [
    // схема://что-угодно; хвостовая пунктуация («…на http://host.» ) остаётся снаружи
    String.raw`(?<url>\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>\\]*[^\s"'<>\\.,;:!?)\]}])`,
    // ipv6 — и в скобках с портом (`[2a0d:d6c0::1c5]:6432`), и голый
    String.raw`(?<ip6>\[[0-9a-fA-F:]{2,}\](?::\d{1,5})?|(?<![\w:])(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(?![\w:]))`,
    // ipv4, при желании с маской и портом; октеты проверяются уже кодом
    String.raw`(?<ip4>(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?(?::\d{1,5})?(?![\w.]))`,
    String.raw`(?<uuid>\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b)`,
    // ПЕРЕМЕННАЯ_КАПСОМ: минимум одно подчёркивание, иначе сюда попал бы каждый
    // уровень (`ERROR`) и каждая аббревиатура
    String.raw`(?<env>\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b)`,
    // ключ командной строки: только в начале слова и только перед `=`, пробелом
    // или концом — иначе дефис внутри `kube-proxy-ds-ready` читался бы ключом
    String.raw`(?<flag>(?<![\w=\/-])--?[A-Za-z][\w-]*(?=[=\s"'),;\]]|$))`,
    // число с единицей: `50Mi`, `1.5s`, `200ms`, `3%`, составное `1h30m`
    String.raw`(?<size>(?<![\w.])(?:\d+(?:[.,]\d+)?(?:[KMGTP]i?B|[KMGTP]i|ns|µs|us|ms|s|m|h|d|%))+(?![\w.]))`,
    `(?<level>\\b(?:${LEVEL_WORDS})\\b)`,
  ].join("|"),
  "g",
);

/** Октеты ipv4 — единственное, что регуляркой не проверить: `999.1.1.1` не адрес. */
function isIPv4(text: string): boolean {
  const host = text.split("/")[0].split(":")[0];

  return host.split(".").every((octet) => Number(octet) <= 255);
}

/**
 * Похоже ли на ipv6 — проверка того, что регулярка отличить не может.
 *
 * Время `13:00:30` — тоже «группы через двоеточие», и красить его адресом
 * нельзя. Настоящий адрес либо имеет `::`, либо где-то содержит букву a-f;
 * всё остальное с двумя-тремя двоеточиями — это часы, порт или go-шный
 * `map[a:b]`, и мы их не трогаем.
 */
function looksIPv6(text: string): boolean {
  const body = text.startsWith("[") ? text.slice(1, text.indexOf("]")) : text;

  return body.includes("::") || /[a-fA-F]/.test(body);
}

/**
 * Цвет для найденного токена. `undefined` — «показалось»: кусок остаётся
 * сырым, как будто мы его и не находили.
 */
function paintToken(groups: Record<string, string | undefined>, piece: string): string | undefined {
  if (groups.url) return paint(C.addr, piece);
  if (groups.ip6) return looksIPv6(piece) ? paint(C.addr, piece) : undefined;
  if (groups.ip4) return isIPv4(piece) ? paint(C.addr, piece) : undefined;
  if (groups.uuid) return paint(C.id, piece);
  // имя красится как ключ: `LOG_LEVEL` в тексте и `log_level` в json — про одно
  // и то же, но цвет у каждого свой и всегда один и тот же
  if (groups.env) return paint(keyColor(piece), piece);
  if (groups.flag) return paint(keyColor(piece.replace(/^-+/, "")), piece);
  if (groups.size) return paint(C.number, piece);
  if (groups.level) return paint(levelColor(piece), piece);

  return undefined;
}

/**
 * Подсветить токены в куске текста, который иначе остался бы без цвета.
 *
 * Зовётся и для обычных строк, и для значений, которым цвет не положен
 * (`msg` в json, значение logfmt): там чаще всего и живут адреса. Текст между
 * токенами не меняется вовсе.
 */
export function highlightTokens(text: string): string {
  let out = "";
  let index = 0;

  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    const piece = match[0];
    const painted = paintToken(match.groups ?? {}, piece);

    if (painted === undefined) continue;

    out += text.slice(index, start) + painted;
    index = start + piece.length;
  }

  return out + text.slice(index);
}

/**
 * Обычная строка: сначала свой таймстемп, потом уровень, потом токены.
 *
 * Таймстемп ищется здесь, а не в `colorPlain`, потому что сюда же попадает
 * текст перед первой парой logfmt: у fluent-bit это
 * `[2026/09/23 15:16:40.731] [ info] [input:tail:tail.0] inotify_fs_add(): inode=…`.
 *
 * Уровень в начале строки принимается в любом регистре и в скобках (`[warn]`,
 * `[ warn]`, `WARN:`) или буквой Telegraf (`W!`), дальше по строке — только
 * капсом: иначе покрасится слово «error» в середине человеческой фразы.
 * Капсовый уровень — такой же токен, как адрес, и ищется в общем скане.
 */
function highlightPlain(text: string): string {
  const time = OWN_TIMESTAMP.exec(text);

  if (time) return paint(C.time, time[1]) + highlightLevel(text.slice(time[1].length));

  return highlightLevel(text);
}

function highlightLevel(text: string): string {
  const atStart = LEVEL_AT_START.exec(text);

  if (atStart) {
    const [whole, before, word, after] = atStart;

    return before + paint(levelColor(word), word) + after + afterLevel(text.slice(whole.length));
  }

  const bang = LEVEL_BANG.exec(text);

  if (bang) {
    const [whole, before, mark] = bang;

    return before + paint(levelColor(BANG_LEVELS[mark[0]]), mark) + afterLevel(text.slice(whole.length));
  }

  return highlightTokens(text);
}

/** Хвост строки за уровнем: тег компонента, если он есть, потом токены. */
function afterLevel(text: string): string {
  const tag = COMPONENT_TAG.exec(text);

  if (!tag) return highlightTokens(text);

  const [whole, space, name] = tag;

  return space + paint(keyColor(name), `[${name}]`) + highlightTokens(text.slice(whole.length));
}

/** Снять раскраску — для тестов и для того, кому нужен исходный текст. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}
