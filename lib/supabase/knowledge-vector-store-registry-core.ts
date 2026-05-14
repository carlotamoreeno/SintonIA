import type { SupabaseAdminClient } from "./client-core";

const knowledgeVectorStoreRegistrationSelect =
  "id, dataset_version, vector_store_id, name, is_active, activated_at, activated_by_user_id, created_at, updated_at";

type KnowledgeVectorStoreRegistrationRow = {
  activated_at: string | null;
  activated_by_user_id: string | null;
  created_at: string;
  dataset_version: string;
  id: string;
  is_active: boolean;
  name: string;
  updated_at: string;
  vector_store_id: string;
};

type KnowledgeVectorStoreActivationResultRow = {
  activated_at: string;
  active_dataset_version: string;
  active_vector_store_id: string;
  changed: boolean;
  previous_dataset_version: string | null;
  previous_vector_store_id: string | null;
};

export type KnowledgeVectorStoreRegistration = {
  activatedAt: string | null;
  activatedByUserId: string | null;
  createdAt: string;
  datasetVersion: string;
  id: string;
  isActive: boolean;
  name: string;
  updatedAt: string;
  vectorStoreId: string;
};

export type KnowledgeVectorStoreRegistrationStoreClient = Pick<
  SupabaseAdminClient,
  "from" | "rpc"
>;

export type KnowledgeVectorStoreActivationResult = {
  activatedAt: string;
  activeDatasetVersion: string;
  activeVectorStoreId: string;
  changed: boolean;
  previousDatasetVersion: string | null;
  previousVectorStoreId: string | null;
};

export type KnowledgeVectorStoreRegistrationStore = {
  activateDataset(input: {
    activatedByUserId: string | null;
    datasetVersion: string;
  }): Promise<KnowledgeVectorStoreActivationResult>;
  createRegistration(input: {
    datasetVersion: string;
    name: string;
    vectorStoreId: string;
  }): Promise<KnowledgeVectorStoreRegistration>;
  findActiveRegistration(): Promise<KnowledgeVectorStoreRegistration | null>;
  findByDatasetVersion(
    datasetVersion: string,
  ): Promise<KnowledgeVectorStoreRegistration | null>;
  findByVectorStoreId(
    vectorStoreId: string,
  ): Promise<KnowledgeVectorStoreRegistration | null>;
  listRegistrations(): Promise<KnowledgeVectorStoreRegistration[]>;
};

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function mapKnowledgeVectorStoreRegistration(
  row: KnowledgeVectorStoreRegistrationRow,
): KnowledgeVectorStoreRegistration {
  return {
    activatedAt: row.activated_at,
    activatedByUserId: row.activated_by_user_id,
    createdAt: row.created_at,
    datasetVersion: row.dataset_version,
    id: row.id,
    isActive: row.is_active,
    name: row.name,
    updatedAt: row.updated_at,
    vectorStoreId: row.vector_store_id,
  };
}

function mapKnowledgeVectorStoreActivationResult(
  row: KnowledgeVectorStoreActivationResultRow,
): KnowledgeVectorStoreActivationResult {
  return {
    activatedAt: row.activated_at,
    activeDatasetVersion: row.active_dataset_version,
    activeVectorStoreId: row.active_vector_store_id,
    changed: row.changed,
    previousDatasetVersion: row.previous_dataset_version,
    previousVectorStoreId: row.previous_vector_store_id,
  };
}

export function createKnowledgeVectorStoreRegistrationStore(
  client: KnowledgeVectorStoreRegistrationStoreClient,
): KnowledgeVectorStoreRegistrationStore {
  return {
    async activateDataset(input) {
      const { data, error } = await client
        .rpc("activate_knowledge_dataset", {
          p_activated_by_user_id: input.activatedByUserId,
          p_dataset_version: input.datasetVersion,
        })
        .single<KnowledgeVectorStoreActivationResultRow>();

      if (error || !data) {
        throw new Error(
          `Failed to activate knowledge dataset: ${error?.message}`,
        );
      }

      return mapKnowledgeVectorStoreActivationResult(data);
    },

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

    async findActiveRegistration() {
      const { data, error } = await client
        .from("knowledge_vector_store_registry")
        .select(knowledgeVectorStoreRegistrationSelect)
        .eq("is_active", true)
        .order("activated_at", {
          ascending: false,
          nullsFirst: false,
        })
        .limit(1)
        .returns<KnowledgeVectorStoreRegistrationRow[]>();

      if (error) {
        throw new Error(
          `Failed to load active knowledge vector store registration: ${error.message}`,
        );
      }

      const row = data?.[0];

      return row ? mapKnowledgeVectorStoreRegistration(row) : null;
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

    async listRegistrations() {
      const { data, error } = await client
        .from("knowledge_vector_store_registry")
        .select(knowledgeVectorStoreRegistrationSelect)
        .order("is_active", {
          ascending: false,
        })
        .order("dataset_version", {
          ascending: true,
        })
        .returns<KnowledgeVectorStoreRegistrationRow[]>();

      if (error) {
        throw new Error(
          `Failed to list knowledge vector store registrations: ${error.message}`,
        );
      }

      return (data ?? []).map(mapKnowledgeVectorStoreRegistration);
    },
  };
}
