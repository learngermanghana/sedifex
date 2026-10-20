import { confirmDonation } from './_confirm-donation.js'
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./_firebase-admin.js";
import { createHmac } from "node:crypto";

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const secret = process.env.PAYSTACK_SECRET || process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY_LIVE;
  if (!secret) return res.status(500).send("PAYSTACK_SECRET not configured");

  const signature = req.headers["x-paystack-signature"] as string | undefined;
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const hash = createHmac("sha512", secret).update(raw).digest("hex");
  if (!signature || signature !== hash) return res.status(403).send("Invalid signature");

  const event = req.body?.event as string;
  const data = req.body?.data || {};

  if (event === "charge.success") {
    const reference = data.reference as string;
    const pageType = text(data.metadata?.pageType, 80);

    if (reference && pageType === "donation") {
      try {
        await confirmDonation(reference, text(data.metadata?.storeId, 160));
      } catch {
        return res.status(409).send('Donation verification failed');
      }
      return res.status(200).send("ok");
    }

    if (reference) {
      const snap = await db()
        .collection("sales")
        .where("payment.providerRef", "==", reference)
        .limit(1)
        .get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        const prev = doc.data();
        await doc.ref.set({
          payment: {
            ...prev.payment,
            status: "captured",
            amountPaid: (data.amount ?? 0) / 100,
            gatewayRaw: data
          }
        }, { merge: true });
      }
    }
  }

  return res.status(200).send("ok");
}