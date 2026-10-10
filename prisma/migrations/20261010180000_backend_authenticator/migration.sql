CREATE TABLE "profile_authenticators" (
  "user_id" TEXT NOT NULL PRIMARY KEY,
  "secret_ciphertext" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "last_used_step" BIGINT NOT NULL DEFAULT -1,
  "recovery_hashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "profile_authenticators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "verified_mfa_sessions" (
  "user_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("user_id", "session_id"),
  CONSTRAINT "verified_mfa_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "verified_mfa_sessions_expires_at_idx" ON "verified_mfa_sessions"("expires_at");
