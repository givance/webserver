CREATE TABLE "oauth_pkce_verifiers" (
	"state" text PRIMARY KEY NOT NULL,
	"verifier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
