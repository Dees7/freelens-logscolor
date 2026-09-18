/**
 * Точка входа расширения (Freelens 2.x).
 *
 * Здесь намеренно пусто: ни пунктов меню, ни колонок, ни панели настроек —
 * единственное, что делает расширение, это обёртка над чтением логов.
 * Поэтому у файла расширение `.ts`, а не `.tsx`: React в сборке не участвует
 * вовсе, и расширению хватает того, что ванильный Freelens кладёт на
 * `globalThis.FreelensExtensionApi`.
 */
import { Renderer } from "@freelensapp/extensions";

import { installLogColors } from "./log-colors";

export default class LogsColorExtension extends Renderer.LensExtension {
  /**
   * Обёртка ставится здесь, а не в поле класса: к этому моменту контейнер
   * зависимостей приложения уже поднят, и `podsStore` можно трогать.
   */
  onActivate() {
    installLogColors();
  }
}
