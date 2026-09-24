/**
 * Страница расширения в Preferences → Extensions: состояние команды `lc`.
 *
 * Без React. Ванильный Freelens 2.x React расширениям не отдаёт (на
 * `FreelensExtensionApi` только `Common` и `Renderer`), а свой в бандле — это
 * второй экземпляр в одном дереве и сломанные хуки. Поэтому компоненты здесь —
 * функции, которые возвращают строку: для React это законный результат
 * компонента, и `createElement` для него не нужен. Кнопок на такой странице не
 * сделать — ставят и убирают `lc` из палитры команд (`commands.ts`), а страница
 * говорит, что сейчас с командой и где её искать.
 *
 * Это второе место, где ветки расходятся: в `v1` хост отдаёт React, и там на
 * странице настоящие кнопки.
 */
import { describe, inspect, NAME, supported, systemDirs } from "./cli";

/** Перечитывается при каждом открытии страницы: состояние живёт на диске. */
export function CliInput(): string {
  if (!supported) return `The ${NAME} command is a shell script and is not available on Windows.`;

  return describe(inspect(systemDirs()));
}

export function CliHint(): string {
  return (
    `${NAME} colors your own logs in any terminal the same way: kubectl logs -f pod | ${NAME}. ` +
    `It needs node on PATH. Install or remove it from the command palette (Cmd+Shift+P): ` +
    `"Logs color: install the ${NAME} terminal command" and "Logs color: remove the ${NAME} terminal command". ` +
    `Nothing is installed together with the extension; the command is removed when the extension is disabled ` +
    `or uninstalled, and comes back when it is enabled again.`
  );
}

export const preferences = [
  {
    title: `Terminal command: ${NAME}`,
    id: "cli",
    components: { Input: CliInput, Hint: CliHint },
  },
];
