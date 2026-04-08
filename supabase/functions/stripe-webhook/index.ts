import { createStripeWebhookHandler } from "../_shared/stripe-webhook-handler.ts";

Deno.serve(createStripeWebhookHandler("swim-hub"));
