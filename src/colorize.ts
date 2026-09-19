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
 * Коды выбраны из того, что AnsiUp 5 (его держит Freelens 1.x) действительно
 * понимает: 0, 1 (bold), 3 (italic), 4, 22-24, 30-37 и 90-97. Кода 2 (faint) в
 * этом списке нет — см. `FAINT` ниже. 256-цветные и truecolor он тоже умеет, но
 * 16 базовых переживают любую тему.
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
 * `v1` и `v2` расходятся. Freelens 1.x показывает логи через AnsiUp 5, а тот
 * про `faint` не знает: в его разборе SGR обрабатываются 0, 1, 3, 4, 22-24, 39,
 * 49, 30-37, 40-47, 90-97 и 38/48, а код 2 молча выбрасывается — тусклое
 * осталось бы обычным цветом темы. Поэтому здесь серый, а не faint; в ветке
 * `v2` (AnsiUp 6) на этой строке стоит `0;2`.
 *
 * Серый — это тот же цвет, который по этой причине исключён из палитры ключей,
 * так что перепутать «тусклое» с ключом всё равно нельзя.
 *
 * Всё остальное в файле общее, и правки логики переносятся между ветками
 * черри-пиком без конфликтов.
 */
export const FAINT = "0;90";

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

/** Таймстемп в начале самого сообщения — этот уже можно притушить. */
const OWN_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}[T ][\d:.,]+(?:Z|[+-]\d{2}:?\d{2})?)/;

/** Уровень словом: в начале строки — в любом регистре, дальше — только капсом. */
const LEVEL_AT_START = /^(\s*[[<(]?)(trace|debug|info|warn|warning|error|fatal|panic)([\]>)]?\b)/i;
const LEVEL_ANYWHERE = /\b(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|PANIC)\b/;

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
      return C.fatal;
    case "error":
    case "err":
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
        out += paint(levelValueColor(lastKey, raw.slice(1, -1)) ?? C.string, raw);
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
    out += paint(valueColor(key, value), value);
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

/** Текст между парами logfmt: уровень подсветить, остальное не трогать. */
function plainSegment(text: string): string {
  return text === "" ? text : highlightLevel(text);
}

/**
 * Обычная строка: уровень, свой таймстемп, аварии и стектрейсы.
 *
 * Тут ничего не разбирается по-настоящему — только подсвечивается то, что
 * узнаётся наверняка. Всё прочее остаётся ровно как в kubectl.
 */
export function colorPlain(text: string): string {
  if (CRASH_LINE.test(text)) return paint(C.error, text);

  if (STACK_LINE.some((pattern) => pattern.test(text))) return paint(C.faint, text);

  const klog = KLOG_LINE.exec(text);

  if (klog) {
    const [, level, header, message] = klog;

    return paint(levelColor(KLOG_LEVELS[level]), level) + paint(C.faint, header) + message;
  }

  const time = OWN_TIMESTAMP.exec(text);

  if (time) {
    return paint(C.time, time[1]) + highlightLevel(text.slice(time[1].length));
  }

  return highlightLevel(text);
}

/**
 * Уровень словом.
 *
 * В начале строки принимается любой регистр и скобки (`[warn]`, `WARN:`),
 * дальше по строке — только капс: иначе покрасится слово «error» в середине
 * человеческой фразы.
 */
function highlightLevel(text: string): string {
  const atStart = LEVEL_AT_START.exec(text);

  if (atStart) {
    const [whole, before, word, after] = atStart;

    return before + paint(levelColor(word), word) + after + text.slice(whole.length);
  }

  const anywhere = LEVEL_ANYWHERE.exec(text);

  if (anywhere && anywhere.index !== undefined) {
    const word = anywhere[1];

    return (
      text.slice(0, anywhere.index) +
      paint(levelColor(word), word) +
      text.slice(anywhere.index + word.length)
    );
  }

  return text;
}

/** Снять раскраску — для тестов и для того, кому нужен исходный текст. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}
