-- Preserve historical NGN amounts/currencies. New quotes record their conversion snapshot.
ALTER TABLE subscription_payments ADD COLUMN pricing_snapshot JSONB;
ALTER TABLE subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_currency_check;
ALTER TABLE subscription_payments ADD CONSTRAINT subscription_payments_currency_check
 CHECK (currency IN ('USD','NGN','EUR','GBP','CAD','GHS','KES','ZAR','UGX','XAF','XOF'));
