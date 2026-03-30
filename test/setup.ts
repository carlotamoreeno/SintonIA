import "@testing-library/jest-dom/vitest";

process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.AUTH_SECRET ??= "test-auth-secret";
process.env.AUTH_TRUST_HOST ??= "true";
process.env.AUTH_GOOGLE_ID ??= "test-google-client-id";
process.env.AUTH_GOOGLE_SECRET ??= "test-google-client-secret";
process.env.AUTH_EXPERT_EMAILS ??= "";
process.env.AUTH_ADMIN_EMAILS ??= "";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-supabase-service-role-key";
process.env.OPENAI_API_KEY ??= "test-openai-api-key";
process.env.OPENAI_TIMEOUT_MS ??= "30000";
process.env.CHAT_MAX_MESSAGE_CHARS ??= "4000";
