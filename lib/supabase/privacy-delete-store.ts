import "server-only";

import { supabaseAdmin } from "./client";
import { createPrivacyDeleteStore } from "./privacy-delete-store-core";

export const privacyDeleteStore = createPrivacyDeleteStore(supabaseAdmin);
export * from "./privacy-delete-store-core";
