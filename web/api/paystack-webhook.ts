import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./_firebase-admin.js";
import { createHmac } from "node:crypto";

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function updateDonationTransaction(reference: string, data: Record<string, unknown>) {
  const firestore = db();
  const amountPaid = Number(data.amount ?? 0) / 100;
  const providerTransactionId = text(data.id, 120) || text(data.reference, 180);
  const storeId = text((data.metadata as Record<string, unknown> | undefined)?.storeId, 160);
  const fundTransactionId = text((data.metadata as Record<string, unknown> | undefined)?.fundTransactionId, 180);

  const updatePayload = {
    status: "captured",
    provider: "paystack",
    providerReference: reference,
    providerTransactionId: providerTransactionId || null,
    confirmedAmount: Number.isFinite(amountPaid) ? amountPaid : null,
    confirmedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    payment: {
      provider: "paystack",
      status: "captured",
      reference,
      amountPaid: Number.isFinite(amountPaid) ? amountPaid : null,
      gatewayRaw: data,
    },
  };

  if (fundTransactionId) {
    const directRef = firestore.collection("fund_transactions").doc(fundTransactionId);
    const directSnap = await directRef.get();
    if (directSnap.exists) {
      await directRef.set(updatePayload, { merge: true });
      return { matched: true, fundTransactionId };
    }
  }

  let queryRef = firestore.collection("fund_transactions").where("reference", "==", reference).limit(10);
  if (storeId) queryRef = queryRef.where("storeId", "==", storeId);
  const snap = await queryRef.get();
  if (snap.empty) return { matched: false, fundTransactionId: null };

  await Promise.all(snap.docs.map(docSnap => docSnap.ref.set(updatePayload, { merge: true })));
  return { matched: true, fundTransactionId: snap.docs[0].id };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const secret = process.env.PAYSTACK_SECRET;
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
      await updateDonationTransaction(reference, data);
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