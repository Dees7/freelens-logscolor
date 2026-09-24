/**
 * Точка входа расширения (Freelens 1.x, Lens 6.x).
 *
 * Главное, что делает расширение, — обёртка над чтением логов. Кроме неё —
 * только команда `lc` для терминала: её ставят и убирают на странице в
 * Preferences → Extensions или из палитры команд; ни пунктов меню, ни колонок.
 */
import { Renderer } from "@freelensapp/extensions";

import { dropCli, restoreCli } from "./cli";
import { commands } from "./commands";
import { installLogColors } from "./log-colors";
import { preferences } from "./preferences";

export default class LogsColorExtension extends Renderer.LensExtension {
  appPreferences = preferences;

  commands = commands;

  /**
   * Обёртка ставится здесь, а не в поле класса: к этому моменту контейнер
   * зависимостей приложения уже поднят, и `podsStore` можно трогать.
   *
   * `lc` возвращается, только если пользователь сам его ставил, — установка
   * расширения в систему ничего не пишет.
   */
  onActivate() {
    installLogColors();
    restoreCli();
  }

  /** Выключают или удаляют — `lc` уходит вместе с расширением. */
  onDeactivate() {
    dropCli();
  }
}
