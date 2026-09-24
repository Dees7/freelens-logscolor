/**
 * Команды палитры (Cmd+Shift+P): поставить и убрать `lc`.
 *
 * Палитре не нужен React — заголовок строкой, действие функцией, — поэтому
 * этот путь работает на любом хосте, в том числе на ванильном Freelens 2.x,
 * который React расширениям не отдаёт. Кнопки на странице настроек (там, где
 * они есть) зовут то же самое.
 */
import { Renderer } from "@freelensapp/extensions";

import { installCli, NAME, removeCli, supported, tilde } from "./cli";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Выполнить и сказать, чем кончилось, уведомлением приложения. */
export function notify(action: () => string): void {
  const { Notifications } = Renderer.Component;

  try {
    Notifications.ok(action());
  } catch (error) {
    Notifications.error(`${NAME}: ${message(error)}`);
  }
}

export function install(): string {
  return `${NAME} installed: ${tilde(installCli())}`;
}

export function uninstall(): string {
  const removed = removeCli();

  return removed.length > 0 ? `${NAME} removed: ${removed.map(tilde).join(", ")}` : `${NAME} was not installed`;
}

export const commands = supported
  ? [
      {
        id: "logscolor-install-lc",
        title: `Logs color: install the ${NAME} terminal command`,
        action: () => notify(install),
      },
      {
        id: "logscolor-remove-lc",
        title: `Logs color: remove the ${NAME} terminal command`,
        action: () => notify(uninstall),
      },
    ]
  : [];
