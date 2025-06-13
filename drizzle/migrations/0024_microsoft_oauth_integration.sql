-- Create Microsoft OAuth Tokens table
CREATE TABLE "microsoft_oauth_tokens" (
  "id" SERIAL PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "email" VARCHAR(255) NOT NULL,
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT NOT NULL,
  "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "scope" TEXT,
  "token_type" VARCHAR(50),
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "microsoft_oauth_tokens_user_id_unique" UNIQUE ("user_id")
);

-- Create Staff Microsoft OAuth Tokens table
CREATE TABLE "staff_microsoft_tokens" (
  "id" SERIAL PRIMARY KEY,
  "staff_id" INTEGER NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "email" VARCHAR(255) NOT NULL,
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT NOT NULL,
  "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "scope" TEXT,
  "token_type" VARCHAR(50),
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "staff_microsoft_tokens_staff_id_unique" UNIQUE ("staff_id")
);

-- Add indices for faster lookups
CREATE INDEX "microsoft_oauth_tokens_user_id_idx" ON "microsoft_oauth_tokens" ("user_id");
CREATE INDEX "staff_microsoft_tokens_staff_id_idx" ON "staff_microsoft_tokens" ("staff_id"); 