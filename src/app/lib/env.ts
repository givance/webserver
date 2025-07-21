// src/env.mjs
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  /*
   * Serverside Environment variables, not available on the client.
   * Will throw if you access these variables on the client.
   */
  server: {
    DATABASE_URL: z.string().url(),
    OPENAI_API_KEY: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_WEBHOOK_SECRET: z.string().min(1),
    SMALL_MODEL: z.string().min(1),
    MID_MODEL: z.string().min(1),
    TRIGGER_SECRET_KEY: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_REDIRECT_URI: z.string().min(1),
    MICROSOFT_APPLICATION_ID: z.string().min(1),
    MICROSOFT_CLIENT_SECRET: z.string().min(1),
    MICROSOFT_CLIENT_SECRET_ID: z.string().min(1),
    MICROSOFT_REDIRECT_URI: z.string().min(1),
    BASE_URL: z.string().min(1),
    AZURE_OPENAI_API_KEY: z.string().min(1),
    AZURE_OPENAI_ENDPOINT: z.string().min(1),
    AZURE_OPENAI_RESOURCE_NAME: z.string().min(1),
    AZURE_OPENAI_DEPLOYMENT_NAME: z.string().min(1).default('gpt-4.1'),
    AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME: z.string().min(1).default('gpt-4.1'),
    AZURE_OPENAI_O3_DEPLOYMENT_NAME: z.string().min(1).default('gpt-o3'),
    GOOGLE_SEARCH_API_KEY: z.string().min(1),
    GOOGLE_SEARCH_ENGINE_ID: z.string().min(1).optional(),
    USE_AGENTIC_FLOW: z
      .string()
      .transform((val) => val === 'true')
      .optional(),
    WHATSAPP_TOKEN: z.string().optional().default('placeholder-whatsapp-token'),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z
      .string()
      .optional()
      .default('placeholder-whatsapp-verify-token'),
    // Blackbaud integration
    BLACKBAUD_CLIENT_ID: z.string().optional(),
    BLACKBAUD_CLIENT_SECRET: z.string().optional(),
    BLACKBAUD_REDIRECT_URI: z.string().optional(),
    BLACKBAUD_SUBSCRIPTION_KEY: z.string().optional(),
    BLACKBAUD_USE_SANDBOX: z
      .string()
      .optional()
      .transform((val) => val === 'true')
      .default('false'),
  },
  /*
   * Environment variables available on the client (and server).
   *
   * 💡 You'll get type errors if these are not prefixed with NEXT_PUBLIC_.
   */
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    // NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
  },
  /*
   * Due to how Next.js bundles environment variables on Edge and Client,
   * we need to manually destructure them to make sure all are included in bundle.
   *
   * 💡 You'll get type errors if not all variables from `server` & `client` are included here.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    SMALL_MODEL: process.env.SMALL_MODEL,
    MID_MODEL: process.env.MID_MODEL,
    TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    BASE_URL: process.env.BASE_URL,
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_RESOURCE_NAME: process.env.AZURE_OPENAI_RESOURCE_NAME,
    AZURE_OPENAI_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
    AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME,
    AZURE_OPENAI_O3_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_O3_DEPLOYMENT_NAME,
    GOOGLE_SEARCH_API_KEY: process.env.GOOGLE_SEARCH_API_KEY,
    GOOGLE_SEARCH_ENGINE_ID: process.env.GOOGLE_SEARCH_ENGINE_ID,
    USE_AGENTIC_FLOW: process.env.USE_AGENTIC_FLOW,
    MICROSOFT_APPLICATION_ID: process.env.MICROSOFT_APPLICATION_ID,
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
    MICROSOFT_CLIENT_SECRET_ID: process.env.MICROSOFT_CLIENT_SECRET_ID,
    MICROSOFT_REDIRECT_URI: process.env.MICROSOFT_REDIRECT_URI,
    WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    // NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
  },
});
