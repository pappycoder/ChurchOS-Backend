-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('paystack', 'flutterwave', 'manual');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "payment_gateway" "PaymentGateway" NOT NULL DEFAULT 'paystack';
