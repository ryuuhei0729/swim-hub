import { createRevenueCatWebhookHandler } from "../_shared/revenucat-webhook-handler.ts";

Deno.serve(createRevenueCatWebhookHandler("swim-hub"));
