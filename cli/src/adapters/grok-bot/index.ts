import type { CLIAdapterModule } from "@paperclipai/adapter-utils";
import { printHttpStdoutEvent } from "../http/format-event.js";

export const grokBotCLIAdapter: CLIAdapterModule = {
  type: "grok_bot",
  formatStdoutEvent: printHttpStdoutEvent,
};
