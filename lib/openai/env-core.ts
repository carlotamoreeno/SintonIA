import { z } from "zod";
import type { OpenAIVectorStoreFileChunkingStrategy } from "./adapter-core";

const nonEmptyString = z.string().trim().min(1);

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-nano";
export const DEFAULT_OPENAI_TIMEOUT_MS = 30000;
export const DEFAULT_OPENAI_VECTOR_STORE_FILE_CHUNKING_STRATEGY = "auto";
export const MIN_OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS = 100;
export const MAX_OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS = 4096;

const requiredIntegerString = z
  .string()
  .trim()
  .min(1)
  .transform((value, context) => {
    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue)) {
      context.addIssue({
        code: "custom",
        message: "Expected an integer value.",
      });

      return z.NEVER;
    }

    return parsedValue;
  });

const openAIServerEnvSchema = z.object({
  OPENAI_API_KEY: nonEmptyString,
  OPENAI_ACTIVE_VECTOR_STORE_ID: nonEmptyString,
  OPENAI_MODEL: nonEmptyString.default(DEFAULT_OPENAI_MODEL),
  OPENAI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_OPENAI_TIMEOUT_MS),
  OPENAI_VECTOR_STORE_FILE_CHUNKING_STRATEGY: z
    .enum(["auto", "static"])
    .default(DEFAULT_OPENAI_VECTOR_STORE_FILE_CHUNKING_STRATEGY),
  OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS: z.string().optional(),
  OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS: z.string().optional(),
});

const staticVectorStoreFileChunkingEnvSchema = z
  .object({
    OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS: requiredIntegerString.pipe(
      z.number().int().nonnegative(),
    ),
    OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS: requiredIntegerString.pipe(
      z
        .number()
        .int()
        .min(MIN_OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS)
        .max(MAX_OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS),
    ),
  })
  .superRefine((env, context) => {
    if (
      env.OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS >
      Math.floor(env.OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS / 2)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS must be less than or equal to half of OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS.",
        path: ["OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS"],
      });
    }
  });

export type OpenAIServerEnv = {
  activeVectorStoreId: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  vectorStoreFileChunkingStrategy: OpenAIVectorStoreFileChunkingStrategy;
};

function parseOpenAIVectorStoreFileChunkingStrategy(
  input: z.output<typeof openAIServerEnvSchema>,
): OpenAIVectorStoreFileChunkingStrategy {
  if (input.OPENAI_VECTOR_STORE_FILE_CHUNKING_STRATEGY === "auto") {
    const prohibitedFields = [
      input.OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS !== undefined
        ? "OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS"
        : null,
      input.OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS !== undefined
        ? "OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS"
        : null,
    ].filter((field): field is string => field !== null);

    if (prohibitedFields.length > 0) {
      throw new Error(
        `${prohibitedFields.join(", ")} must not be set when OPENAI_VECTOR_STORE_FILE_CHUNKING_STRATEGY=auto.`,
      );
    }

    return {
      type: "auto",
    };
  }

  const staticChunkingEnv = staticVectorStoreFileChunkingEnvSchema.parse({
    OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS:
      input.OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS,
    OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS:
      input.OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS,
  });

  return {
    type: "static",
    static: {
      chunk_overlap_tokens:
        staticChunkingEnv.OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS,
      max_chunk_size_tokens:
        staticChunkingEnv.OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS,
    },
  };
}

export function parseOpenAIServerEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): OpenAIServerEnv {
  const env = openAIServerEnvSchema.parse(input);

  return {
    activeVectorStoreId: env.OPENAI_ACTIVE_VECTOR_STORE_ID,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
    vectorStoreFileChunkingStrategy:
      parseOpenAIVectorStoreFileChunkingStrategy(env),
  };
}
