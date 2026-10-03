import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import { useActiveStore } from "../hooks/useActiveStore";
import "./Bookings.css";

type BookingRecord = {
  id: string;
  serviceId: string;
  serviceName: string;
  bookingDate: string | null;
  bookingTime: string | null;
  preferredBranch: string | null;
  paymentAmount: string | null;
  paymentMethod: string | null;
  paymentCollectionMode: string | null;
  status: string;
  bookingStatus: string;
  syncStatus: string;
  paymentStatus: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  sourceLabel: string;
  reference: string | null;
  bookingId: string | null;
  paymentReference: string | null;
  duplicateMerged: boolean;
  sourcePath: "store" | "root" | "order";
  payment: Record<string, unknown>;
};

function pickString(
  data: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return null;
}

function pickTimestamp(
  data: Record<string, unknown>,
  keys: string[],
): Date | null {
  for (const key of keys) {
    const value = data[key];
    if (
      value &&
      typeof value === "object" &&
      typeof (value as Timestamp).toDate === "function"
    ) {
      return (value as Timestamp).toDate();
    }
  }
  return null;
}

const normalizeStatus = (value: unknown, fallback = "pending") =>
  typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : fallback;

const normalizePaymentStatus = (value: unknown) => {
  const normalized = normalizeStatus(value, "pending");
  if (["success", "confirmed", "paid"].includes(normalized)) return "paid";
  if (["payment_pending", "pending"].includes(normalized))
    return "payment_pending";
  return normalized;
};

const normalizeSource = (raw: unknown) => {
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  if (value.includes("market")) return "Retired online channel";
  if (value.includes("website")) return "Website";
  if (value.includes("manual")) return "Manual";
  return "Website";
};

const statusLabel = (status: string) =>
  ({
    pending_approval: "Needs approval",
    pending: "Needs approval",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
    deleted: "Cancelled",
    manual_review: "Needs approval",
  })[status] ?? "Needs approval";

const paymentLabel = (status: string) =>
  ({
    payment_pending: "Payment pending",
    pending: "Payment pending",
    manual_review: "Payment review",
    paid: "Paid",
  })[status] ?? "Payment pending";

const normalizePaymentClassifierValue = (value: string | null) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const DIRECT_PAYMENT_METHODS = new Set([
  "pay_later",
  "momo",
  "mobile_money",
  "cash",
  "transfer",
  "bank",
  "bank_transfer",
  "manual",
  "direct",
  "direct_payment",
  "store_payment",
]);

const DIRECT_PAYMENT_COLLECTION_MODES = new Set([
  "pay_later",
  "momo",
  "mobile_money",
  "cash",
  "transfer",
  "bank_transfer",
  "manual",
  "direct",
  "direct_payment",
  "store",
  "store_direct",
  "store_payment",
  "offline",
  "offline_payment",
]);

const isDirectPaymentBooking = (booking: BookingRecord) => {
  const paymentMethod = normalizePaymentClassifierValue(booking.paymentMethod);
  const paymentCollectionMode = normalizePaymentClassifierValue(
    booking.paymentCollectionMode,
  );

  return (
    DIRECT_PAYMENT_METHODS.has(paymentMethod) ||
    DIRECT_PAYMENT_COLLECTION_MODES.has(paymentCollectionMode)
  );
};

type BookingView = "needs_attention" | "confirmed" | "all";

const BOOKING_VIEW_KEY_PREFIX = "sedifex-bookings-view-";

export default function Bookings() {
  const { storeId } = useActiveStore();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<BookingView>("needs_attention");

  const hydrateBooking = useCallback(
    (
      id: string,
      data: Record<string, unknown>,
      serviceMap: Map<string, string>,
      sourcePath: "store" | "root" | "order",
    ) => {
      const nestedData =
        data.data && typeof data.data === "object"
          ? (data.data as Record<string, unknown>)
          : {};
      const customer =
        data.customer && typeof data.customer === "object"
          ? (data.customer as Record<string, unknown>)
          : {};
      const booking =
        data.booking && typeof data.booking === "object"
          ? (data.booking as Record<string, unknown>)
          : {};
      const payment =
        data.payment && typeof data.payment === "object"
          ? (data.payment as Record<string, unknown>)
          : {};
      const metadata =
        data.metadata && typeof data.metadata === "object"
          ? (data.metadata as Record<string, unknown>)
          : {};
      const firstItem =
        Array.isArray(data.items) &&
        data.items[0] &&
        typeof data.items[0] === "object"
          ? (data.items[0] as Record<string, unknown>)
          : {};
      const serviceId =
        pickString(data, ["serviceId"]) ??
        pickString(booking, ["serviceId"]) ??
        pickString(metadata, ["serviceId", "slotId", "itemId"]) ??
        pickString(firstItem, ["serviceId", "slotId", "itemId", "item_id"]) ??
        "—";
      const snapshotA =
        data.pricingSnapshot && typeof data.pricingSnapshot === "object"
          ? (data.pricingSnapshot as Record<string, unknown>)
          : {};
      const snapshotB =
        data.pricing_snapshot && typeof data.pricing_snapshot === "object"
          ? (data.pricing_snapshot as Record<string, unknown>)
          : {};
      const pickSnapshotName = (snapshot: Record<string, unknown>) => {
        const items = snapshot.items;
        if (
          !Array.isArray(items) ||
          !items.length ||
          typeof items[0] !== "object" ||
          !items[0]
        )
          return null;
        const first = items[0] as Record<string, unknown>;
        return typeof first.name === "string" && first.name.trim()
          ? first.name.trim()
          : null;
      };
      const serviceName =
        pickString(data, [
          "serviceName",
          "internalServiceName",
          "itemName",
          "productName",
        ]) ??
        pickString(booking, ["serviceName"]) ??
        pickString(nestedData, ["serviceName", "itemName"]) ??
        pickString(metadata, ["serviceName", "itemName"]) ??
        pickString(firstItem, ["serviceName", "name", "itemName"]) ??
        pickSnapshotName(snapshotA) ??
        pickSnapshotName(snapshotB) ??
        serviceMap.get(serviceId) ??
        "Service not named";

      return {
        id,
        serviceId,
        serviceName,
        bookingDate:
          pickString(data, ["bookingDate", "date"]) ??
          pickString(booking, ["preferredDate", "date"]) ??
          pickString(metadata, ["bookingDate", "eventDate"]),
        bookingTime:
          pickString(data, ["bookingTime", "time"]) ??
          pickString(booking, ["preferredTime", "time"]),
        preferredBranch: pickString(data, [
          "preferredBranch",
          "branch",
          "branchLocationName",
          "location",
        ]) ?? pickString(metadata, ["preferredBranch", "branchLocationName"]),
        paymentAmount:
          pickString(data, ["paymentAmount", "amount", "total", "price"]) ??
          pickString(payment, ["amount"]),
        paymentMethod:
          pickString(data, ["paymentMethod", "payment_method"]) ??
          pickString(payment, ["method", "paymentMethod", "payment_method"]) ??
          pickString(metadata, ["paymentMethod", "payment_method"]),
        paymentCollectionMode:
          pickString(data, [
            "paymentCollectionMode",
            "payment_collection_mode",
            "paymentOption",
            "payment_option",
          ]) ??
          pickString(payment, [
            "collectionMode",
            "collection_mode",
            "paymentCollectionMode",
            "payment_collection_mode",
          ]) ??
          pickString(metadata, [
            "paymentCollectionMode",
            "payment_collection_mode",
            "paymentOption",
            "payment_option",
          ]),
        bookingStatus: normalizeStatus(data.bookingStatus ?? data.status),
        status: normalizeStatus(data.status),
        syncStatus: normalizeStatus(
          data.syncStatus ?? data.sync_status,
          "not_ready",
        ),
        paymentStatus:
          payment.confirmed === true
            ? "paid"
            : normalizePaymentStatus(
                data.paymentStatus ?? data.payment_status ?? payment.status,
              ),
        customerName:
          pickString(data, ["customerName", "name"]) ??
          pickString(customer, ["name"]),
        customerPhone:
          pickString(data, ["customerPhone", "phone"]) ??
          pickString(customer, ["phone"]),
        customerEmail:
          pickString(data, ["customerEmail", "email"]) ??
          pickString(customer, ["email"]),
        createdAt: pickTimestamp(data, [
          "createdAt",
          "createdAtServer",
          "updatedAt",
          "syncRequestedAt",
        ]),
        updatedAt: pickTimestamp(data, ["updatedAt"]),
        sourceLabel: normalizeSource(
          data.sourceChannel ??
            data.source_channel ??
            data.source ??
            data.channel,
        ),
        reference:
          pickString(data, ["reference"]) ?? pickString(payment, ["reference"]),
        bookingId: pickString(data, ["bookingId"]),
        paymentReference:
          pickString(data, ["paymentReference"]) ??
          pickString(payment, ["reference"]),
        duplicateMerged: false,
        sourcePath,
        payment,
      } satisfies BookingRecord;
    },
    [],
  );

  const loadBookings = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const serviceMap = new Map<string, string>();
      for (const collectionName of [
        "services",
        "integrationServices",
        "integrationAvailabilitySlots",
      ]) {
        const servicesSnapshot = await getDocs(
          collection(db, "stores", storeId, collectionName),
        );
        servicesSnapshot.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const name = pickString(data, ["name", "title", "serviceName"]);
          if (name) {
            serviceMap.set(docSnap.id, name);
            const serviceId = pickString(data, ["serviceId"]);
            if (serviceId) serviceMap.set(serviceId, name);
          }
        });
      }
      const [
        storeSnapshot,
        rootSnapshot,
        storeOrderSnapshot,
        rootOrderSnapshot,
      ] = await Promise.all([
        getDocs(collection(db, "stores", storeId, "integrationBookings")),
        getDocs(
          query(
            collection(db, "integrationBookings"),
            where("storeId", "==", storeId),
          ),
        ),
        getDocs(collection(db, "stores", storeId, "integrationOrders")),
        getDocs(
          query(
            collection(db, "integrationOrders"),
            where("storeId", "==", storeId),
          ),
        ),
      ]);
      const merged = new Map<string, BookingRecord>();
      const makeKey = (b: BookingRecord) =>
        b.bookingId ||
        b.reference ||
        b.paymentReference ||
        `${(b.customerPhone || b.customerEmail || "unknown").toLowerCase()}|${b.serviceId}|${b.bookingDate || ""}|${b.bookingTime || ""}`;

      storeSnapshot.forEach((docSnap) => {
        const booking = hydrateBooking(
          docSnap.id,
          docSnap.data() as Record<string, unknown>,
          serviceMap,
          "store",
        );
        merged.set(makeKey(booking), booking);
      });
      rootSnapshot.forEach((docSnap) => {
        const booking = hydrateBooking(
          docSnap.id,
          docSnap.data() as Record<string, unknown>,
          serviceMap,
          "root",
        );
        const key = makeKey(booking);
        if (merged.has(key)) {
          const kept = merged.get(key);
          if (kept) merged.set(key, { ...kept, duplicateMerged: true });
          return;
        }
        merged.set(key, booking);
      });

      const mergeOrderBooking = (id: string, data: Record<string, unknown>) => {
        const recordType = normalizeStatus(
          data.recordType ?? data.orderType ?? data.order_type,
          "",
        );
        const metadata =
          data.metadata && typeof data.metadata === "object"
            ? (data.metadata as Record<string, unknown>)
            : {};
        const accountingType = normalizeStatus(
          data.accountingType ??
            data.accounting_type ??
            metadata.accountingType,
          "",
        );
        const quickPayType = pickString(metadata, [
          "quickPayType",
          "itemType",
        ])?.toLowerCase();
        if (
          recordType !== "service_booking" &&
          accountingType !== "booking" &&
          quickPayType !== "booking"
        )
          return;
        const booking = hydrateBooking(id, data, serviceMap, "order");
        const key = makeKey(booking);
        if (merged.has(key)) {
          const kept = merged.get(key);
          if (kept) merged.set(key, { ...kept, duplicateMerged: true });
          return;
        }
        merged.set(key, booking);
      };
      storeOrderSnapshot.forEach((docSnap) =>
        mergeOrderBooking(
          docSnap.id,
          docSnap.data() as Record<string, unknown>,
        ),
      );
      rootOrderSnapshot.forEach((docSnap) =>
        mergeOrderBooking(
          docSnap.id,
          docSnap.data() as Record<string, unknown>,
        ),
      );

      setBookings(
        Array.from(merged.values()).sort(
          (a, b) =>
            (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
        ),
      );
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to load bookings right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [hydrateBooking, storeId]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    if (!storeId) return;
    try {
      const saved = localStorage.getItem(`${BOOKING_VIEW_KEY_PREFIX}${storeId}`);
      if (saved === "needs_attention" || saved === "confirmed" || saved === "all") {
        setActiveTab(saved);
      }
    } catch (error) {
      console.warn("[bookings] Unable to load view preference", error);
    }
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    try {
      localStorage.setItem(`${BOOKING_VIEW_KEY_PREFIX}${storeId}`, activeTab);
    } catch (error) {
      console.warn("[bookings] Unable to save view preference", error);
    }
  }, [activeTab, storeId]);

  const needsAttention = useCallback((booking: BookingRecord) => {
    if (["cancelled", "deleted", "completed"].includes(booking.bookingStatus || booking.status)) return false;
    const directPaymentNeedsReview =
      isDirectPaymentBooking(booking) &&
      ["pending", "payment_pending", "manual_review"].includes(booking.paymentStatus);
    const paidNeedsConfirmation =
      booking.paymentStatus === "paid" && booking.bookingStatus !== "confirmed";
    return directPaymentNeedsReview || paidNeedsConfirmation || booking.bookingStatus === "pending_approval";
  }, []);

  const summary = {
    needsAttention: bookings.filter(needsAttention).length,
    confirmed: bookings.filter((booking) => booking.bookingStatus === "confirmed").length,
    all: bookings.filter((booking) => !["deleted"].includes(booking.status)).length,
  };

  const visible = useMemo(
    () =>
      bookings.filter((booking) => {
        if (activeTab === "needs_attention") return needsAttention(booking);
        if (activeTab === "confirmed") return booking.bookingStatus === "confirmed";
        return !["deleted"].includes(booking.status);
      }),
    [activeTab, bookings, needsAttention],
  );

  const deleteBookingRecords = useCallback(
    async (booking: BookingRecord) => {
      if (!storeId) return;
      const collectionName =
        booking.sourcePath === "order"
          ? "integrationOrders"
          : "integrationBookings";
      await Promise.all([
        deleteDoc(doc(db, "stores", storeId, collectionName, booking.id)),
        deleteDoc(doc(db, collectionName, booking.id)),
      ]);
    },
    [storeId],
  );

  const handleDeleteBooking = useCallback(
    async (booking: BookingRecord) => {
      const label = booking.serviceName || booking.reference || "this booking";
      if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

      setDeletingIds((current) => [...new Set([...current, booking.id])]);
      setErrorMessage(null);
      setSuccessMessage(null);
      try {
        await deleteBookingRecords(booking);
        setBookings((current) =>
          current.filter((item) => item.id !== booking.id),
        );
        setSelectedIds((current) => current.filter((id) => id !== booking.id));
        setSuccessMessage("Booking deleted successfully.");
      } catch (error) {
        console.error(error);
        setErrorMessage("Unable to delete booking right now. Please try again.");
      } finally {
        setDeletingIds((current) => current.filter((id) => id !== booking.id));
      }
    },
    [deleteBookingRecords],
  );

  const handleBulkDelete = useCallback(async () => {
    const selected = bookings.filter((booking) =>
      selectedIds.includes(booking.id),
    );
    if (!selected.length) return;
    if (
      !window.confirm(
        `Delete ${selected.length} selected booking${
          selected.length === 1 ? "" : "s"
        }? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingIds((current) => [
      ...new Set([...current, ...selected.map((booking) => booking.id)]),
    ]);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await Promise.all(
        selected.map((booking) => deleteBookingRecords(booking)),
      );
      setBookings((current) =>
        current.filter((booking) => !selectedIds.includes(booking.id)),
      );
      setSelectedIds([]);
      setSuccessMessage(
        `${selected.length} booking${
          selected.length === 1 ? "" : "s"
        } deleted successfully.`,
      );
    } catch (error) {
      console.error(error);
      setErrorMessage(
        "Unable to delete selected bookings right now. Please try again.",
      );
    } finally {
      setDeletingIds((current) =>
        current.filter((id) => !selected.some((booking) => booking.id === id)),
      );
    }
  }, [bookings, deleteBookingRecords, selectedIds]);

  return (
    <main className="page bookings-page">
      <section className="card stack gap-4 bookings-board">
        <header className="bookings-page__header">
          <div className="stack gap-2">
            <h1>Bookings</h1>
            <p className="bookings-page__intro">
              Focus first on bookings that need confirmation or payment review.
            </p>
          </div>
          <div className="bookings-page__header-actions">
            <Link to="/bookings/new" className="btn btn-primary">+ Add booking</Link>
            <Link to="/reports/bookings" className="btn btn-secondary">Open report</Link>
          </div>
        </header>

        <div className="bookings-page__tabs" role="tablist" aria-label="Booking views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "needs_attention"}
            className={`bookings-page__tab ${activeTab === "needs_attention" ? "is-active" : ""}`}
            onClick={() => setActiveTab("needs_attention")}
          >
            Needs attention ({summary.needsAttention})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "confirmed"}
            className={`bookings-page__tab ${activeTab === "confirmed" ? "is-active" : ""}`}
            onClick={() => setActiveTab("confirmed")}
          >
            Confirmed ({summary.confirmed})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            className={`bookings-page__tab ${activeTab === "all" ? "is-active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All ({summary.all})
          </button>
        </div>

        {!loading && !errorMessage ? (
          <div className="bookings-page__bulk-actions">
            <span>{selectedIds.length} selected</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setSelectedIds(visible.map((booking) => booking.id))
              }
              disabled={!visible.length}
            >
              Select visible
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSelectedIds([])}
              disabled={!selectedIds.length}
            >
              Clear selection
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void handleBulkDelete()}
              disabled={!selectedIds.length || deletingIds.length > 0}
            >
              {deletingIds.length > 0 ? "Deleting…" : "Delete selected"}
            </button>
          </div>
        ) : null}

        {successMessage ? (
          <p className="form__success">{successMessage}</p>
        ) : null}

        {loading ? (
          <p>Loading bookings…</p>
        ) : errorMessage ? (
          <p className="form__error">{errorMessage}</p>
        ) : visible.length === 0 ? (
          <div className="empty-state bookings-page__empty">
            <h3 className="empty-state__title">
              {activeTab === "needs_attention" ? "Nothing needs attention" : activeTab === "confirmed" ? "No confirmed bookings yet" : "No bookings yet"}
            </h3>
            <p>{activeTab === "needs_attention" ? "Bookings needing review or confirmation will appear here." : "New bookings will appear here when they are created."}</p>
            {activeTab === "all" ? <Link to="/bookings/new" className="btn btn-primary">+ Add booking</Link> : null}
          </div>
        ) : (
          <div className="bookings-table-wrap">
            <table className="table bookings-table">
              <thead>
                <tr>
                  <th className="bookings-table__select">
                    <input
                      type="checkbox"
                      aria-label="Select all visible bookings"
                      checked={
                        visible.length > 0 &&
                        visible.every((booking) =>
                          selectedIds.includes(booking.id),
                        )
                      }
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked
                            ? Array.from(
                                new Set([
                                  ...selectedIds,
                                  ...visible.map((booking) => booking.id),
                                ]),
                              )
                            : selectedIds.filter(
                                (id) =>
                                  !visible.some((booking) => booking.id === id),
                              ),
                        )
                      }
                    />
                  </th>
                  <th>Booking</th>
                  <th>Customer</th>
                  <th>Schedule</th>
                  <th>Source</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => {
                  return (
                    <tr key={b.id}>
                      <td className="bookings-table__select">
                        <input
                          type="checkbox"
                          aria-label={`Select ${b.serviceName}`}
                          checked={selectedIds.includes(b.id)}
                          onChange={(event) =>
                            setSelectedIds((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, b.id]))
                                : current.filter((id) => id !== b.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>{b.serviceName}</strong>
                        <small>
                          {b.reference || b.bookingId || "No reference"}
                        </small>
                        {b.serviceName === "Service not named" ? (
                          <small className="muted">
                            Service ID: {b.serviceId}
                          </small>
                        ) : null}
                        {b.duplicateMerged ? (
                          <span className="bookings-badge">
                            Duplicate records merged
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <strong>{b.customerName || "Customer"}</strong>
                        <small>
                          {b.customerPhone || b.customerEmail || "No contact"}
                        </small>
                      </td>
                      <td>
                        <strong>{b.bookingDate || "Date not set"}</strong>
                        <small>{b.bookingTime || "Time not set"}</small>
                        <small>{b.preferredBranch || "Main branch"}</small>
                      </td>
                      <td>
                        <span className="bookings-badge">{b.sourceLabel}</span>
                        <small>
                          {b.sourcePath === "order"
                            ? "Payment order"
                            : b.sourcePath === "root"
                              ? "Root booking"
                              : "Store booking"}
                        </small>
                      </td>
                      <td>
                        <strong>{b.paymentAmount || "—"}</strong>
                        <small>{paymentLabel(b.paymentStatus)}</small>
                        <small>{b.paymentMethod || b.paymentCollectionMode || "Method not set"}</small>
                      </td>
                      <td>
                        <span
                          className={`bookings-page__status bookings-page__status--${b.bookingStatus}`}
                        >
                          {statusLabel(b.bookingStatus)}
                        </span>
                        <small>
                          {b.paymentStatus === "paid" &&
                          b.bookingStatus !== "confirmed"
                            ? "Paid - waiting for store confirmation"
                            : ""}
                        </small>
                        <small>
                          {b.syncStatus === "pending"
                            ? "Sync pending"
                            : b.syncStatus === "synced"
                              ? "Synced"
                              : ""}
                        </small>
                      </td>
                      <td>
                        <div className="bookings-page__row-actions">
                          <Link
                            className="btn btn-secondary"
                            to={`/bookings/${b.id}`}
                          >
                            Open
                          </Link>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => void handleDeleteBooking(b)}
                            disabled={deletingIds.includes(b.id)}
                          >
                            {deletingIds.includes(b.id)
                              ? "Deleting…"
                              : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="bookings-cards">
              {visible.map((b) => (
                <article key={`${b.id}-card`} className="bookings-card">
                  <h3>{b.serviceName}</h3>
                  <p>
                    {b.customerName || "Customer"} •{" "}
                    {b.bookingDate || "Date not set"} {b.bookingTime || ""}
                  </p>
                  <p>
                    {statusLabel(b.status)} • {paymentLabel(b.paymentStatus)}
                  </p>
                  <label className="bookings-card__select">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(b.id)}
                      onChange={(event) =>
                        setSelectedIds((current) =>
                          event.target.checked
                            ? Array.from(new Set([...current, b.id]))
                            : current.filter((id) => id !== b.id),
                        )
                      }
                    />
                    Select
                  </label>
                  <div className="bookings-page__row-actions">
                    <Link
                      className="btn btn-secondary"
                      to={`/bookings/${b.id}`}
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void handleDeleteBooking(b)}
                      disabled={deletingIds.includes(b.id)}
                    >
                      {deletingIds.includes(b.id) ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
