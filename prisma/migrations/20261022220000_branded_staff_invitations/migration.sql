ALTER TABLE "company_email_notifications" DROP CONSTRAINT "company_email_kind_check";
ALTER TABLE "company_email_notifications" ADD CONSTRAINT "company_email_kind_check"
  CHECK ("kind" IN ('welcome','activation','renewal','upgrade','invitation'));
