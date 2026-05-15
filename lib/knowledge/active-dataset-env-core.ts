import { z } from "zod";

const activeDatasetEnvSchema = z.object({
  ACTIVE_DATASET_VERSION: z.string().trim().min(1).optional(),
});

export type ActiveDatasetEnv = {
  fallbackDatasetVersion: string | null;
};

export function parseActiveDatasetEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): ActiveDatasetEnv {
  const env = activeDatasetEnvSchema.parse(input);

  return {
    fallbackDatasetVersion: env.ACTIVE_DATASET_VERSION ?? null,
  };
}
