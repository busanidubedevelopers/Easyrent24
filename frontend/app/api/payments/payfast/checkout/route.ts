import { NextRequest, NextResponse } from "next/server";
import { buildPaymentRequest, PAYFAST_URLS, type PayfastMode } from "@backend/lib/payfast";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const merchantId = process.env.PAYFAST_MERCHANT_ID || "10000100";
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY || "46f0cd694581a";
    const passphrase = process.env.PAYFAST_PASSPHRASE || undefined;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const mode = (process.env.PAYFAST_MODE as PayfastMode) || "sandbox";

    const amount = Number(body.amount || 250);
    const mPaymentId = `DEMO-${Date.now()}`;

    const fields = buildPaymentRequest({
      merchantId,
      merchantKey,
      passphrase,
      returnUrl: `${appUrl}/apply/payment-success?application_id=${mPaymentId}`,
      cancelUrl: `${appUrl}/apply/payment-cancelled?application_id=${mPaymentId}`,
      notifyUrl: `${appUrl}/api/payments/payfast/notify`,
      mPaymentId,
      amount,
      itemName: "EasyRent24 Application Fee",
      itemDescription: "Tenant Application Processing Fee",
      nameFirst: body.firstName || "Demo",
      nameLast: body.lastName || "Tenant",
    });

    return NextResponse.json({
      processUrl: PAYFAST_URLS[mode].process,
      fields,
    });
  } catch (err) {
    console.error("PayFast demo checkout error:", err);
    return NextResponse.json({ error: "Failed to generate PayFast session" }, { status: 500 });
  }
}
