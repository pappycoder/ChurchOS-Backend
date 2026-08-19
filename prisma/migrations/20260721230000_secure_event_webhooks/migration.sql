-- Enforce one payment reference and one issued ticket per event registration.
-- These constraints back the atomic webhook settlement flow.
CREATE UNIQUE INDEX "event_registrations_payment_reference_key"
  ON "event_registrations"("payment_reference");

CREATE UNIQUE INDEX "tickets_registration_id_key"
  ON "tickets"("registration_id");

CREATE UNIQUE INDEX "tickets_payment_reference_key"
  ON "tickets"("payment_reference");
