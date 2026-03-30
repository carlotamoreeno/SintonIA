import "server-only";

import { createOpenAIClient } from "./client-core";
import { openAIServerEnv } from "./env";

export { OPENAI_MAX_RETRIES, createOpenAIClient } from "./client-core";
export type { OpenAIClient, OpenAIClientConfig } from "./client-core";

export const openAIClient = createOpenAIClient(openAIServerEnv);
