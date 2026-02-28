import type { Logger } from "pino";

export type AppEnv = {
  Variables: {
    log: Logger;
    requestId: string;
  };
};
