import pino from "pino";

import { config } from "./index";

export const logger = pino({
  level: config.logLevel,
  name: "cc-server",
});
