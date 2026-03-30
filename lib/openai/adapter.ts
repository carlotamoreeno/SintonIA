import "server-only";

import OpenAI from "openai";
import { openAIClient, type OpenAIClient } from "./client";

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

type OpenAIVectorStoreFilesClient = Pick<
  OpenAIClient["vectorStores"]["files"],
  "create"
>;

export type OpenAIAdapterClient = {
  files: Pick<OpenAIClient["files"], "create">;
  responses: Pick<OpenAIClient["responses"], "create">;
  vectorStores: Pick<OpenAIClient["vectorStores"], "create"> & {
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
  createVectorStore(
    body: OpenAIVectorStoreCreateParams,
    options?: OpenAIVectorStoreCreateOptions,
  ): Promise<OpenAIVectorStoreCreateResult>;
  createVectorStoreFile(
    vectorStoreId: string,
    body: OpenAIVectorStoreFileCreateParams,
    options?: OpenAIVectorStoreFileCreateOptions,
  ): Promise<OpenAIVectorStoreFileCreateResult>;
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
  client: OpenAIAdapterClient = openAIClient,
): OpenAIAdapter {
  return {
    async createResponse(body, options) {
      return executeOpenAIRequest(() => client.responses.create(body, options));
    },

    async createFile(body, options) {
      return executeOpenAIRequest(() => client.files.create(body, options));
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
  };
}

export const openAIAdapter = createOpenAIAdapter();
