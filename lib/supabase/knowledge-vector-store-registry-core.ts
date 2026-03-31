import type { SupabaseAdminClient } from "./client-core";

const knowledgeVectorStoreRegistrationSelect =
  "id, dataset_version, vector_store_id, name, created_at, updated_at";

type KnowledgeVectorStoreRegistrationRow = {
  created_at: string;
  dataset_version: string;
  id: string;
  name: string;
  updated_at: string;
  vector_store_id: string;
};

export type KnowledgeVectorStoreRegistration = {
  createdAt: string;
  datasetVersion: string;
  id: string;
  name: string;
  updatedAt: string;
  vectorStoreId: string;
};

export type KnowledgeVectorStoreRegistrationStoreClient = Pick<
  SupabaseAdminClient,
  "from"
>;

export type KnowledgeVectorStoreRegistrationStore = {
  createRegistration(input: {
    datasetVersion: string;
    name: string;
    vectorStoreId: string;
  }): Promise<KnowledgeVectorStoreRegistration>;
  findByDatasetVersion(
    datasetVersion: string,
  ): Promise<KnowledgeVectorStoreRegistration | null>;
  findByVectorStoreId(
    vectorStoreId: string,
  ): Promise<KnowledgeVectorStoreRegistration | null>;
};

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function mapKnowledgeVectorStoreRegistration(
  row: KnowledgeVectorStoreRegistrationRow,
): KnowledgeVectorStoreRegistration {
  return {
    createdAt: row.created_at,
    datasetVersion: row.dataset_version,
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
    vectorStoreId: row.vector_store_id,
  };
}

export function createKnowledgeVectorStoreRegistrationStore(
  client: KnowledgeVectorStoreRegistrationStoreClient,
): KnowledgeVectorStoreRegistrationStore {
  return {
    async createRegistration(input) {
      const { data, error } = await client
        .from("knowledge_vector_store_registry")
        .insert({
          dataset_version: input.datasetVersion,
          name: input.name,
          updated_at: getCurrentTimestamp(),
          vector_store_id: input.vectorStoreId,
        })
        .select(knowledgeVectorStoreRegistrationSelect)
        .single<KnowledgeVectorStoreRegistrationRow>();

      if (error || !data) {
        throw new Error(
          `Failed to create knowledge vector store registration: ${error?.message}`,
        );
      }

      return mapKnowledgeVectorStoreRegistration(data);
    },

    async findByDatasetVersion(datasetVersion) {
      const { data, error } = await client
        .from("knowledge_vector_store_registry")
        .select(knowledgeVectorStoreRegistrationSelect)
        .eq("dataset_version", datasetVersion)
        .limit(1)
        .returns<KnowledgeVectorStoreRegistrationRow[]>();

      if (error) {
        throw new Error(
          `Failed to load knowledge vector store registration by dataset version: ${error.message}`,
        );
      }

      const row = data?.[0];

      return row ? mapKnowledgeVectorStoreRegistration(row) : null;
    },

    async findByVectorStoreId(vectorStoreId) {
      const { data, error } = await client
        .from("knowledge_vector_store_registry")
        .select(knowledgeVectorStoreRegistrationSelect)
        .eq("vector_store_id", vectorStoreId)
        .limit(1)
        .returns<KnowledgeVectorStoreRegistrationRow[]>();

      if (error) {
        throw new Error(
          `Failed to load knowledge vector store registration by vector store id: ${error.message}`,
        );
      }

      const row = data?.[0];

      return row ? mapKnowledgeVectorStoreRegistration(row) : null;
    },
  };
}
