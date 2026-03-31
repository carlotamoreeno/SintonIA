import OpenAI from "openai";
import type { OpenAIClient } from "./client-core";

export type OpenAIResponsesCreateParams = Parameters<
  OpenAI["responses"]["create"]
>[0];
export type OpenAIResponsesCreateOptions = Parameters<
  OpenAI["responses"]["create"]
>[1];
export type OpenAIResponsesCreateResult = Awaited<
  ReturnType<OpenAI["responses"]["create"]>
>;

export type OpenAIFilesCreateParams = Parameters<OpenAI["files"]["create"]>[0];
export type OpenAIFilesCreateOptions = Parameters<OpenAI["files"]["create"]>[1];
export type OpenAIFilesCreateResult = Awaited<
  ReturnType<OpenAI["files"]["create"]>
>;
export type OpenAIFileWaitForProcessingOptions = Parameters<
  OpenAI["files"]["waitForProcessing"]
>[1];
export type OpenAIFileWaitForProcessingResult = Awaited<
  ReturnType<OpenAI["files"]["waitForProcessing"]>
>;
export type OpenAIFileRetrieveOptions = Parameters<
  OpenAI["files"]["retrieve"]
>[1];
export type OpenAIFileRetrieveResult = Awaited<
  ReturnType<OpenAI["files"]["retrieve"]>
>;
export type OpenAIFileDeleteOptions = Parameters<OpenAI["files"]["delete"]>[1];
export type OpenAIFileDeleteResult = Awaited<
  ReturnType<OpenAI["files"]["delete"]>
>;

export type OpenAIVectorStoreCreateParams = Parameters<
  OpenAI["vectorStores"]["create"]
>[0];
export type OpenAIVectorStoreCreateOptions = Parameters<
  OpenAI["vectorStores"]["create"]
>[1];
export type OpenAIVectorStoreCreateResult = Awaited<
  ReturnType<OpenAI["vectorStores"]["create"]>
>;

export type OpenAIVectorStoreFileCreateParams = Parameters<
  OpenAI["vectorStores"]["files"]["create"]
>[1];
export type OpenAIVectorStoreFileCreateOptions = Parameters<
  OpenAI["vectorStores"]["files"]["create"]
>[2];
export type OpenAIVectorStoreFileCreateResult = Awaited<
  ReturnType<OpenAI["vectorStores"]["files"]["create"]>
>;
export type OpenAIVectorStoreFileRetrieveOptions = Parameters<
  OpenAI["vectorStores"]["files"]["retrieve"]
>[2];
export type OpenAIVectorStoreFileRetrieveResult = Awaited<
  ReturnType<OpenAI["vectorStores"]["files"]["retrieve"]>
>;
export type OpenAIVectorStoreSearchParams = Parameters<
  OpenAI["vectorStores"]["search"]
>[1];
export type OpenAIVectorStoreSearchOptions = Parameters<
  OpenAI["vectorStores"]["search"]
>[2];
export type OpenAIVectorStoreSearchResult = Awaited<
  ReturnType<OpenAI["vectorStores"]["search"]>
>;

type OpenAIVectorStoreFilesClient = Pick<
  OpenAIClient["vectorStores"]["files"],
  "create" | "retrieve"
>;

export type OpenAIAdapterClient = {
  files: Pick<
    OpenAIClient["files"],
    "create" | "delete" | "retrieve" | "waitForProcessing"
  >;
  responses: Pick<OpenAIClient["responses"], "create">;
  vectorStores: Pick<OpenAIClient["vectorStores"], "create" | "search"> & {
    files: OpenAIVectorStoreFilesClient;
  };
};

export type OpenAIAdapter = {
  createResponse(
    body: OpenAIResponsesCreateParams,
    options?: OpenAIResponsesCreateOptions,
  ): Promise<OpenAIResponsesCreateResult>;
  createFile(
    body: OpenAIFilesCreateParams,
    options?: OpenAIFilesCreateOptions,
  ): Promise<OpenAIFilesCreateResult>;
  retrieveFile(
    fileId: string,
    options?: OpenAIFileRetrieveOptions,
  ): Promise<OpenAIFileRetrieveResult>;
  deleteFile(
    fileId: string,
    options?: OpenAIFileDeleteOptions,
  ): Promise<OpenAIFileDeleteResult>;
  waitForFileProcessing(
    fileId: string,
    options?: OpenAIFileWaitForProcessingOptions,
  ): Promise<OpenAIFileWaitForProcessingResult>;
  createVectorStore(
    body: OpenAIVectorStoreCreateParams,
    options?: OpenAIVectorStoreCreateOptions,
  ): Promise<OpenAIVectorStoreCreateResult>;
  createVectorStoreFile(
    vectorStoreId: string,
    body: OpenAIVectorStoreFileCreateParams,
    options?: OpenAIVectorStoreFileCreateOptions,
  ): Promise<OpenAIVectorStoreFileCreateResult>;
  retrieveVectorStoreFile(
    vectorStoreId: string,
    fileId: string,
    options?: OpenAIVectorStoreFileRetrieveOptions,
  ): Promise<OpenAIVectorStoreFileRetrieveResult>;
  searchVectorStore(
    vectorStoreId: string,
    body: OpenAIVectorStoreSearchParams,
    options?: OpenAIVectorStoreSearchOptions,
  ): Promise<OpenAIVectorStoreSearchResult>;
};

type OpenAIAdapterErrorInput = {
  cause: unknown;
  code?: string | null;
  message: string;
  requestId?: string | null;
  retryable: boolean;
  status?: number;
  type?: string;
};

const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

function isRetryableStatus(status: number | undefined) {
  return status !== undefined && RETRYABLE_STATUS_CODES.has(status);
}

function getUnknownErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "OpenAI adapter request failed.";
}

export class OpenAIAdapterError extends Error {
  readonly code: string | null | undefined;
  override readonly cause: unknown;
  readonly requestId: string | null | undefined;
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly type: string | undefined;

  constructor(input: OpenAIAdapterErrorInput) {
    super(input.message);
    this.name = "OpenAIAdapterError";
    this.status = input.status;
    this.requestId = input.requestId;
    this.code = input.code;
    this.type = input.type;
    this.retryable = input.retryable;
    this.cause = input.cause;
  }
}

export function toOpenAIAdapterError(error: unknown) {
  if (error instanceof OpenAIAdapterError) {
    return error;
  }

  if (error instanceof OpenAI.APIError) {
    return new OpenAIAdapterError({
      cause: error,
      code: error.code,
      message: error.message,
      requestId: error.requestID,
      retryable:
        error instanceof OpenAI.APIConnectionError ||
        error instanceof OpenAI.RateLimitError ||
        error instanceof OpenAI.InternalServerError ||
        isRetryableStatus(error.status),
      status: error.status,
      type: error.type,
    });
  }

  return new OpenAIAdapterError({
    cause: error,
    message: getUnknownErrorMessage(error),
    retryable: false,
  });
}

async function executeOpenAIRequest<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    throw toOpenAIAdapterError(error);
  }
}

export function createOpenAIAdapter(
  client: OpenAIAdapterClient,
): OpenAIAdapter {
  return {
    async createResponse(body, options) {
      return executeOpenAIRequest(() => client.responses.create(body, options));
    },

    async createFile(body, options) {
      return executeOpenAIRequest(() => client.files.create(body, options));
    },

    async retrieveFile(fileId, options) {
      return executeOpenAIRequest(() => client.files.retrieve(fileId, options));
    },

    async deleteFile(fileId, options) {
      return executeOpenAIRequest(() => client.files.delete(fileId, options));
    },

    async waitForFileProcessing(fileId, options) {
      return executeOpenAIRequest(() =>
        client.files.waitForProcessing(fileId, options),
      );
    },

    async createVectorStore(body, options) {
      return executeOpenAIRequest(() =>
        client.vectorStores.create(body, options),
      );
    },

    async createVectorStoreFile(vectorStoreId, body, options) {
      return executeOpenAIRequest(() =>
        client.vectorStores.files.create(vectorStoreId, body, options),
      );
    },

    async retrieveVectorStoreFile(vectorStoreId, fileId, options) {
      return executeOpenAIRequest(() =>
        client.vectorStores.files.retrieve(
          fileId,
          {
            vector_store_id: vectorStoreId,
          },
          options,
        ),
      );
    },

    async searchVectorStore(vectorStoreId, body, options) {
      return executeOpenAIRequest(() =>
        client.vectorStores.search(vectorStoreId, body, options),
      );
    },
  };
}
