/**
 * `lc` — та же раскраска, но для терминала: `kubectl logs -f pod | lc`.
 *
 * Читает stdin и красит его построчно, по мере прихода: `-f` не должен ждать
 * конца потока. Хвост без перевода строки держится до следующего куска или до
 * конца ввода.
 *
 * Собирается отдельным бандлом (`vite.lc.config.mjs`) без единого импорта
 * Freelens, поэтому запускается и обычным `node`, и бинарником самого
 * приложения с `ELECTRON_RUN_AS_NODE` — как именно, решает обёртка, которую
 * кладёт в PATH `cli.ts`.
 */
import { colorizeLine } from "./colorize";

/** `\r` из `\r\n` не красим, но и не теряем: текст на выходе тот же. */
function paint(line: string): string {
  return line.endsWith("\r") ? colorizeLine(line.slice(0, -1)) + "\r" : colorizeLine(line);
}

// `lc | head` закрывает трубу раньше, чем кончились логи, — это не ошибка
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);

  throw error;
});

let tail = "";

process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk: string) => {
  const lines = (tail + chunk).split("\n");

  tail = lines.pop() ?? "";

  if (lines.length > 0) process.stdout.write(lines.map(paint).join("\n") + "\n");
});

process.stdin.on("end", () => {
  if (tail !== "") process.stdout.write(paint(tail));
});
