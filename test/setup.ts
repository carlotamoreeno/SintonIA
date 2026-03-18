import "@testing-library/jest-dom/vitest";

process.env.AUTH_SECRET ??= "test-auth-secret";
process.env.AUTH_TRUST_HOST ??= "true";
process.env.AUTH_GOOGLE_ID ??= "test-google-client-id";
process.env.AUTH_GOOGLE_SECRET ??= "test-google-client-secret";
