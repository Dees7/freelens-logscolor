/**
 * Раскраска логов.
 *
 * Главная проверка здесь одна и та же для всех форматов: снятие ANSI обязано
 * возвращать исходную строку символ в символ. Пока это так, раскраска не может
 * ни потерять строку, ни доэкранировать кавычки, ни сломать таймстемп, по
 * которому вьювер догружает логи.
 */
import * as assert from "assert";
import { test as check } from "vitest";

import {
  colorizeLine,
  colorizeLogs,
  colorJson,
  colorPlain,
  FAINT,
  keyColor,
  levelColor,
  looksLogfmt,
  numericLevel,
  stripAnsi,
} from "./colorize";

const KUBE_TS = "2026-09-18T13:00:30.350123456Z ";

/**
 * Начало «тусклой» строки. Через константу, а не литералом: в ветке `v1` код
 * другой (AnsiUp 5 не знает faint), и тест обязан пережить черри-пик между
 * ветками без правок.
 */
const FAINT_START = `\u001b[${FAINT}m`;

const ZAP = JSON.stringify({
  level: "DEBUG",
  ts: "2026-09-18T13:00:30.350Z",
  caller: "tracers/log.go:24",
  msg: "node is alive",
  node: "node-02ojbudnoft84qnp.db.example.com:6432",
});

/** Строки всех сортов, которые реально прилетают из подов. */
const SAMPLES = [
  KUBE_TS + ZAP,
  ZAP,
  KUBE_TS + '{"level":"error","msg":"failed to \\"open\\" file","code":500,"ok":false,"extra":null}',
  KUBE_TS + '{"msg":"вложенное","fields":{"a":[1,2,{"b":"c"}]},"empty":{}}',
  KUBE_TS + 'ts=2026-09-18T13:00:30Z level=warn msg="node is flapping" pid=142727 ok=true',
  KUBE_TS + "I0918 13:00:30.350123       1 controller.go:42] Reconciling cluster",
  KUBE_TS + "panic: runtime error: index out of range [5] with length 3",
  KUBE_TS + "goroutine 42 [running]:",
  KUBE_TS + "\tmain.handle(0xc000123456, 0x2)",
  KUBE_TS + "\t/app/main.go:42 +0x1a5",
  KUBE_TS + "Caused by: java.lang.IllegalStateException: broken",
  KUBE_TS + "\tat com.example.Foo.bar(Foo.java:42)",
  KUBE_TS + "\t... 12 more",
  KUBE_TS + '  File "/app/main.py", line 42, in handle',
  KUBE_TS + "просто строка с кавычками \" и слешем \\ и словом error внутри",
  KUBE_TS + "[WARN] диск кончается, осталось 3%",
  KUBE_TS + "{не json, но начинается с фигурной скобки",
  KUBE_TS + '{"оборванный json": "без закрывающей',
  // шелловская строка из daemonset'а: ни json, ни logfmt — и до токенов в ней
  // не красилось ровно ничего
  KUBE_TS +
    'SECONDARY_KUBELET_OPTS="--node-labels=node.kubernetes.io/kube-proxy-ds-ready=true,' +
    'yandex.cloud/node-group-id=catrtq2msqc5j0dm2vko --cluster-dns=169.254.20.10 ' +
    '--container-log-max-size=50Mi "',
  KUBE_TS + "dial tcp [2a0d:d6c0:0:ff1b::1c5]:6432: i/o timeout after 1h30m",
  KUBE_TS + "GET https://api.example.com/v1/pods?limit=100 -> 200 in 12ms",
  KUBE_TS,
  "",
  "строка совсем без таймстемпа",
];

check("снятие цвета возвращает исходную строку, какой бы она ни была", () => {
  for (const line of SAMPLES) {
    assert.strictEqual(stripAnsi(colorizeLine(line)), line, `сломалась строка: ${line}`);
  }
});

check("кубовый таймстемп остаётся в начале строки нетронутым", () => {
  // по нему LogStore считает sinceTime (/^\d+\S+/) и вырезает его (/^\d+.*?\s/)
  for (const line of SAMPLES.filter((item) => item.startsWith(KUBE_TS) && item !== KUBE_TS)) {
    const painted = colorizeLine(line);

    assert.ok(/^\d/.test(painted), `строка перестала начинаться с цифры: ${painted}`);
    assert.ok(painted.startsWith(KUBE_TS), `таймстемп изменился: ${painted}`);
  }
});

/**
 * Покрашен ли кусок текста: перед ним стоит открывающий цвет, а не сброс.
 *
 * Сброс `\u001b[0m` тоже кончается на `m`, поэтому простым поиском по `m"…"`
 * непокрашенное значение не отличить от покрашенного.
 */
function hasColor(text: string, piece: string): boolean {
  return new RegExp(`\u001b\\[(?!0m)[0-9;]+m${piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text);
}

check("json раскрашивается, а не переписывается", () => {
  const painted = colorizeLine(KUBE_TS + ZAP);

  assert.ok(painted.includes("\u001b["), "цвета нет вовсе");
  assert.strictEqual(stripAnsi(painted).slice(KUBE_TS.length), ZAP);
  // ключ и значение — разными цветами
  assert.ok(painted.includes(`\u001b[${keyColor("msg")}m"msg"`), "ключ не раскрашен");
  // строковые значения остаются цветом темы: белым на тёмной, чёрным на светлой
  assert.ok(painted.includes('"node is alive"'), "строковое значение потеряно");
  assert.ok(!hasColor(painted, '"node is alive"'), "строковому значению зачем-то дали цвет");
});

check("уровень внутри json красится по значению, а не как обычная строка", () => {
  const error = colorJson('{"level":"error","msg":"boom"}');
  const debug = colorJson('{"level":"DEBUG","msg":"boom"}');

  assert.ok(error.includes(`\u001b[${levelColor("error")}m"error"`));
  assert.ok(debug.includes(`\u001b[${levelColor("debug")}m"DEBUG"`));
  // msg — обычная строка, она не должна получить ни цвет уровня, ни какой-либо ещё
  assert.ok(error.includes('"boom"'), "значение msg потеряно");
  assert.ok(!hasColor(error, '"boom"'), "значению msg зачем-то дали цвет");
});

check("уровень узнаётся под всеми ходовыми именами ключа", () => {
  // имя поля у каждого логгера своё, а смысл один: не покрасить — значит потерять уровень
  const keys = [
    "level",
    "lvl",
    "severity",
    "logLevel",
    "log_level",
    "levelname", // python logging
    "log.level", // ECS / Elastic
    "severity_text", // OpenTelemetry
    "severityText",
    "@level", // hashicorp
  ];

  for (const key of keys) {
    const painted = colorJson(`{${JSON.stringify(key)}:"error"}`);

    assert.ok(painted.includes(`\u001b[${levelColor("error")}m"error"`), `уровень под ключом ${key} не покрашен`);
  }
});

check("уровень цифрой красится по шкале своего логгера, а не как число", () => {
  // pino и bunyan: 30 info, 50 error. раньше оба были жёлтыми, то есть 50 читался как warn
  assert.strictEqual(numericLevel("level", "30"), "info");
  assert.strictEqual(numericLevel("level", "50"), "error");
  assert.strictEqual(numericLevel("level", "60"), "fatal");
  // питон считает иначе: те же 30 у него warning
  assert.strictEqual(numericLevel("levelno", "30"), "warn");
  // OpenTelemetry — по четыре номера на уровень
  assert.strictEqual(numericLevel("severityNumber", "17"), "error");

  const info = colorJson('{"level":30,"msg":"boom"}');
  const error = colorJson('{"level":50,"msg":"boom"}');

  assert.ok(info.includes(`\u001b[${levelColor("info")}m30`), "info цифрой не покрашен");
  assert.ok(error.includes(`\u001b[${levelColor("error")}m50`), "error цифрой не покрашен");
  assert.notStrictEqual(levelColor("info"), levelColor("error"));
  // и в logfmt тоже: раньше там числовой уровень не красился вовсе
  assert.ok(colorizeLine(`${KUBE_TS}level=50 msg=boom`).includes(`\u001b[${levelColor("error")}m50`));
});

check("числа, которые не уровень, остаются числами", () => {
  // у ключа нет шкалы — значит число и есть число
  assert.strictEqual(numericLevel("code", "500"), undefined);
  assert.strictEqual(numericLevel("level", "не число"), undefined);
  // severity в syslog числовой и перевёрнутый (0 — emerg, 7 — debug): любая шкала соврёт
  assert.strictEqual(numericLevel("severity", "3"), undefined);
  assert.ok(colorJson('{"code":500}').includes("\u001b[0;33m500"), "обычное число потеряло свой цвет");
});

check("вложенность не мешает: уровень красится на любой глубине", () => {
  const painted = colorJson('{"a":{"b":{"severity":"warning","msg":"deep"}}}');

  assert.ok(painted.includes(`\u001b[${levelColor("warn")}m"warning"`), "уровень в глубине не покрашен");
  // после закрытия вложенного объекта имя ключа не должно тянуться дальше
  const after = colorJson('{"o":{"level":"info"},"note":"error happened"}');

  assert.ok(!hasColor(after, '"error happened"'), "слово error во фразе покрасилось как уровень");
});

check("ключ всегда одного цвета — и в json, и в logfmt", () => {
  const json = colorJson('{"pod":"web-1","msg":"a"}');
  const logfmt = colorizeLine(`${KUBE_TS}pod=web-1 msg=a`);

  // цвет считается от имени, а не от позиции или формата — иначе глазами поле не поймать
  assert.ok(json.includes(`\u001b[${keyColor("pod")}m"pod"`));
  assert.ok(logfmt.includes(`\u001b[${keyColor("pod")}mpod`));
  assert.strictEqual(keyColor("pod"), keyColor("pod"));
});

check("близкие имена ключей расходятся по цветам, а палитра используется вся", () => {
  assert.notStrictEqual(keyColor("pod"), keyColor("pods"));

  const keys = [
    "level",
    "ts",
    "msg",
    "caller",
    "node",
    "pod",
    "container",
    "namespace",
    "err",
    "code",
    "trace_id",
    "duration",
    "host",
    "method",
    "status",
    "user",
  ];
  const used = new Set(keys.map(keyColor));

  assert.ok(used.size >= 5, `слишком мало цветов на 16 ключей: ${used.size}`);
  // красный занят ошибками, серый — стектрейсами; зелёный свободен с тех пор,
  // как строковые значения не красятся вовсе
  used.forEach((color) => {
    assert.ok(!color.includes("31") && !color.includes("91"), `ключ покрашен красным: ${color}`);
    assert.ok(color !== FAINT, `ключ покрашен как стектрейс: ${color}`);
    assert.ok(color !== "", `ключ остался без цвета: ключи красятся всегда`);
  });
});

check("битый json не красится вовсе и отдаётся как есть", () => {
  const broken = '{"level":"info", "msg": }';

  assert.strictEqual(colorizeLine(KUBE_TS + broken), KUBE_TS + broken);
});

check("экранирование внутри json не трогается", () => {
  const line = '{"msg":"failed to \\"open\\" file","path":"C:\\\\tmp"}';

  assert.strictEqual(stripAnsi(colorJson(line)), line);
});

check("logfmt: пары красятся, текст между ними остаётся", () => {
  const line = 'level=warn msg="node is flapping" pid=142727';
  const painted = colorizeLine(KUBE_TS + line);

  assert.strictEqual(stripAnsi(painted).slice(KUBE_TS.length), line);
  assert.ok(painted.includes(`\u001b[${keyColor("pid")}mpid`), "ключ logfmt не раскрашен");
  assert.ok(painted.includes("\u001b[0;33m142727"), "число не раскрашено");
});

check("одинокий знак равенства в человеческой фразе не делает строку logfmt", () => {
  assert.ok(!looksLogfmt("результат result=ok, дальше просто длинный человеческий текст"));
  assert.ok(looksLogfmt("level=warn pid=142727"));
});

check("паника красная, продолжения стектрейса тусклые", () => {
  assert.ok(colorPlain("panic: runtime error").startsWith("\u001b[0;1;31m"));
  assert.ok(colorPlain("\tmain.handle(0xc000123456)").startsWith(FAINT_START));
  assert.ok(colorPlain("\tat com.example.Foo.bar(Foo.java:42)").startsWith(FAINT_START));
  assert.ok(colorPlain("  File \"/app/main.py\", line 42, in handle").startsWith(FAINT_START));
  assert.ok(colorPlain("Caused by: java.lang.IllegalStateException").startsWith(FAINT_START));
});

check("табуляция стектрейса переживает отрезание кубового таймстемпа", () => {
  // таймстемп отделяется ровно одним пробелом: жадный \s+ съел бы \t, и строка
  // перестала бы опознаваться как продолжение стектрейса
  const painted = colorizeLine(`${KUBE_TS}\tat com.example.Foo.bar(Foo.java:42)`);

  assert.ok(painted.startsWith(`${KUBE_TS}${FAINT_START}\t`), painted);
});

check("klog: уровень буквой, шапка тусклая, сообщение нетронуто", () => {
  const line = "I0918 13:00:33.350123       1 controller.go:42] Reconciling cluster";
  const painted = colorPlain(line);

  assert.strictEqual(stripAnsi(painted), line);
  assert.ok(painted.startsWith(`\u001b[${levelColor("info")}mI`), painted);
  assert.ok(painted.endsWith(" Reconciling cluster"), "сообщение получило лишний цвет");
  assert.ok(colorPlain(line.replace(/^I/, "E")).startsWith(`\u001b[${levelColor("error")}mE`));
});

check("уровень в обычной строке: капс красится, строчный в середине фразы — нет", () => {
  assert.ok(colorPlain("[WARN] диск кончается").includes(`\u001b[${levelColor("warn")}mWARN`));
  assert.strictEqual(colorPlain("не удалось: error while reading"), "не удалось: error while reading");
  // в начале строки строчный уровень всё же узнаётся
  assert.ok(colorPlain("warn: диск кончается").includes(`\u001b[${levelColor("warn")}mwarn`));
});

check("адреса находятся в тексте любого формата", () => {
  // ради них всё и затевалось: в строке без формата адрес — единственное, что
  // ищут глазами, а раньше он был того же цвета, что и весь остальной текст
  const ip4 = colorPlain("connected to 10.0.0.1:6432");
  const ip6 = colorPlain("dial tcp [2a0d:d6c0:0:ff1b::1c5]:6432: i/o timeout");
  const url = colorPlain("GET https://api.example.com/v1/pods?limit=100 -> 200");
  const uuid = colorPlain("cluster 6f1e4f9a-1c3d-4b7a-9f2e-0a1b2c3d4e5f is ready");

  assert.ok(hasColor(ip4, "10.0.0.1:6432"), ip4);
  assert.ok(hasColor(ip6, "[2a0d:d6c0:0:ff1b::1c5]:6432"), ip6);
  assert.ok(hasColor(url, "https://api.example.com/v1/pods?limit=100"), url);
  assert.ok(hasColor(uuid, "6f1e4f9a-1c3d-4b7a-9f2e-0a1b2c3d4e5f"), uuid);
  // точка в конце фразы — это точка, а не часть адреса
  assert.ok(colorPlain("см. http://host/path.").endsWith("."), "хвостовая точка уехала в url");
});

check("время, версия и прочее похожее адресом не притворяются", () => {
  // всё это регулярка адреса ловит, и отличить их можно только проверкой
  const same = [
    "время 13:00:30 и версия v1.5.2 и дата 2026-09-18",
    "октетов таких не бывает: 999.1.1.1",
    "узел 1-2-3 в порядке",
  ];

  for (const line of same) {
    assert.strictEqual(colorPlain(line), line, `покрасилось то, что адресом не является: ${line}`);
  }
});

check("переменная капсом и ключ команды красятся как ключи", () => {
  const line = 'SECONDARY_KUBELET_OPTS="--cluster-dns=169.254.20.10 --node-labels=a/kube-proxy-ds-ready=true"';
  const painted = colorPlain(line);

  assert.strictEqual(stripAnsi(painted), line);
  // цвет считается от имени — так же, как у ключа json и logfmt
  assert.ok(painted.includes(`[${keyColor("SECONDARY_KUBELET_OPTS")}mSECONDARY_KUBELET_OPTS`), painted);
  assert.ok(painted.includes(`[${keyColor("cluster-dns")}m--cluster-dns`), painted);
  // дефис внутри слова ключом не является, иначе покрасилось бы пол-значения
  assert.ok(!hasColor(painted, "-proxy"), "дефис внутри значения принят за ключ команды");
  // капс без подчёркивания — это уровень или аббревиатура, а не имя переменной
  assert.strictEqual(colorPlain("HTTP GET готов"), "HTTP GET готов");
});

check("число с единицей — число, без единицы — просто текст", () => {
  assert.ok(hasColor(colorPlain("limit 50Mi"), "50Mi"));
  assert.ok(hasColor(colorPlain("took 250ms"), "250ms"));
  assert.ok(hasColor(colorPlain("ждали 1h30m"), "1h30m"), "составная длительность распалась");
  assert.ok(hasColor(colorPlain("[WARN] диск кончается, осталось 3%"), "3%"));
  // без единицы число в тексте не выделяется: иначе подсветится каждая цифра в строке
  assert.strictEqual(colorPlain("вернулось 200 записей"), "вернулось 200 записей");
});

check("токены находятся и внутри значений, которым своего цвета не положено", () => {
  const json = colorJson('{"msg":"dial tcp 169.254.20.10:53: i/o timeout","note":"всё хорошо"}');
  const logfmt = colorizeLine(`${KUBE_TS}level=warn msg="node 10.0.0.1 is flapping"`);

  assert.ok(hasColor(json, "169.254.20.10:53"), json);
  assert.ok(hasColor(logfmt, "10.0.0.1"), logfmt);
  // остальное в значении по-прежнему без цвета
  assert.ok(json.includes('"всё хорошо"') && !hasColor(json, '"всё хорошо"'), "значению дали цвет целиком");
});

check("уже покрашенную строку токены не трогают", () => {
  // цвет в цвете погасил бы внешний до конца строки: вложенный сброс общий
  const stack = colorPlain("\tat com.example.Foo.connect(10.0.0.1:6432)");
  const panic = colorPlain("panic: dial 10.0.0.1:6432 failed after 500ms");

  for (const painted of [stack, panic]) {
    const opens = painted.match(/\[(?!0m)[0-9;]+m/g) ?? [];

    assert.strictEqual(opens.length, 1, `цвет лёг поверх цвета: ${painted}`);
  }
});

check("весь ответ целиком: строки не склеиваются и не теряются", () => {
  const text = SAMPLES.join("\n");
  const painted = colorizeLogs(text);

  assert.strictEqual(stripAnsi(painted), text);
  assert.strictEqual(painted.split("\n").length, SAMPLES.length);
});

check("одинокий \\r не разрезает раскрашенную строку", () => {
  // LogStore потом всё равно превратит \r в перенос — важно, чтобы это случилось
  // на границе строк, а не посреди escape-последовательности
  const painted = colorizeLogs(`${KUBE_TS}${ZAP}\r${KUBE_TS}${ZAP}`);

  assert.strictEqual(painted.split("\n").length, 2);
  painted.split("\n").forEach((line) => assert.ok(line.startsWith("2026-")));
});

check("огромная строка отдаётся без разбора", () => {
  const huge = KUBE_TS + JSON.stringify({ msg: "x".repeat(70_000) });

  assert.strictEqual(colorizeLine(huge), huge);
});
