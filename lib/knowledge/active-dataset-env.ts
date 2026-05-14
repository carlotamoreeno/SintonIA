import "server-only";

import {
  parseActiveDatasetEnv,
  type ActiveDatasetEnv,
} from "./active-dataset-env-core";

export { parseActiveDatasetEnv };
export type { ActiveDatasetEnv };

export const activeDatasetEnv = parseActiveDatasetEnv(process.env);
