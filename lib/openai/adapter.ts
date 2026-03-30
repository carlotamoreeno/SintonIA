import "server-only";

import { createOpenAIAdapter } from "./adapter-core";
import { openAIClient } from "./client";

export * from "./adapter-core";

export const openAIAdapter = createOpenAIAdapter(openAIClient);
