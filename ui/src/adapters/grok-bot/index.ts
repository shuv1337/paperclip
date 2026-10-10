import type { UIAdapterModule } from "../types";
import { parseGrokBotStdoutLine } from "./parse-stdout";
import { GrokBotConfigFields } from "./config-fields";
import { buildGrokBotConfig } from "./build-config";

export const grokBotUIAdapter: UIAdapterModule = {
  type: "grok_bot",
  label: "Grok Bot",
  parseStdoutLine: parseGrokBotStdoutLine,
  ConfigFields: GrokBotConfigFields,
  buildAdapterConfig: buildGrokBotConfig,
};
