import { z } from "zod";
import type { SupabaseAdminClient } from "./client-core";

export const PRIVACY_DELETE_SCHEMA_VERSION = "rgpd-delete-v1";

const privacyDeleteUserRowSchema = z.object({
  id: z.string().min(1),
});

export type PrivacyDeletePayload = {
  deleted: true;
  deletedAt: string;
  schemaVersion: typeof PRIVACY_DELETE_SCHEMA_VERSION;
};

type PrivacyDeleteStoreClient = Pick<SupabaseAdminClient, "from">;

export type PrivacyDeleteStore = {
  deleteUserData(input: {
    deletedAt?: string;
    userId: string;
  }): Promise<PrivacyDeletePayload>;
};

export function createPrivacyDeleteStore(
  client: PrivacyDeleteStoreClient,
): PrivacyDeleteStore {
  return {
    async deleteUserData({ deletedAt, userId }) {
      const { data, error } = await client
        .from("users")
        .delete()
        .eq("id", userId)
        .select("id")
        .returns<Array<z.infer<typeof privacyDeleteUserRowSchema>>>();

      if (error) {
        throw new Error(`Failed to delete user privacy data: ${error.message}`);
      }

      const deletedRows = privacyDeleteUserRowSchema.array().parse(data ?? []);

      if (deletedRows.length !== 1) {
        throw new Error(
          `Failed to delete user privacy data: expected 1 deleted user row for ${userId}, got ${deletedRows.length}`,
        );
      }

      return {
        schemaVersion: PRIVACY_DELETE_SCHEMA_VERSION,
        deletedAt: deletedAt ?? new Date().toISOString(),
        deleted: true,
      };
    },
  };
}
