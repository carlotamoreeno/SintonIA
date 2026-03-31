import { describe, expect, it, vi } from "vitest";
import { createChatRateLimitStore } from "./chat-rate-limit-store";

describe("createChatRateLimitStore", () => {
  it("returns the first allowed request in a new fixed window", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        allowed: true,
        remaining: 19,
        request_count: 1,
        window_start: "2026-03-31T14:20:00.000Z",
      },
      error: null,
    });
    const rpcMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const store = createChatRateLimitStore({
      rpc: rpcMock,
    } as never);

    const result = await store.consumeRequest({
      limit: 20,
      userId: "user-1",
    });

    expect(rpcMock).toHaveBeenCalledWith("consume_chat_rate_limit", {
      p_limit: 20,
      p_now: undefined,
      p_user_id: "user-1",
    });
    expect(result).toEqual({
      allowed: true,
      remaining: 19,
      requestCount: 1,
      windowStart: "2026-03-31T14:20:00.000Z",
    });
  });

  it("returns subsequent allowed requests while capacity remains in the same window", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        allowed: true,
        remaining: 3,
        request_count: 2,
        window_start: "2026-03-31T14:20:00.000Z",
      },
      error: null,
    });
    const rpcMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const store = createChatRateLimitStore({
      rpc: rpcMock,
    } as never);

    const result = await store.consumeRequest({
      limit: 5,
      now: "2026-03-31T14:20:21.000Z",
      userId: "user-1",
    });

    expect(result).toEqual({
      allowed: true,
      remaining: 3,
      requestCount: 2,
      windowStart: "2026-03-31T14:20:00.000Z",
    });
  });

  it("returns a blocked result once the fixed-window quota has been exhausted", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        allowed: false,
        remaining: 0,
        request_count: 5,
        window_start: "2026-03-31T14:20:00.000Z",
      },
      error: null,
    });
    const rpcMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const store = createChatRateLimitStore({
      rpc: rpcMock,
    } as never);

    const result = await store.consumeRequest({
      limit: 5,
      now: "2026-03-31T14:20:55.000Z",
      userId: "user-1",
    });

    expect(result).toEqual({
      allowed: false,
      remaining: 0,
      requestCount: 5,
      windowStart: "2026-03-31T14:20:00.000Z",
    });
  });
});
