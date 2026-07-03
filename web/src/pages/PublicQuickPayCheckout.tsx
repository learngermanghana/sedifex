import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import "./PublicQuickPayCheckout.css";

type QuickPayItemType =
  | "PRODUCT"
  | "SERVICE"
  | "COURSE"
  | "DONATION"
  | "STUDENT_REGISTRATION"
  | "BOOKING"
  | "MANUAL";

type ManualPaymentType = Exclude<QuickPayItemType, "MANUAL">;
type QuickPayPaymentMethod = "ONLINE" | "CASH";

type QuickPayItem = {
  id: string;
  name: string;
  type: QuickPayItemType;
  price: number;
  priceMinor?: number;
  description?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  slotId?: string | null;
  bookingDate?: string | null;
  bookingTime?: string | null;
};

type CustomerDetails = {
  name: string;
  email: string;
  phone: string;
};

const FUNCTION_BASE_URL =
  import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL ||
  import.meta.env.VITE_SEDIFEX_FUNCTIONS_BASE_URL ||
  "https://us-central1-sedifex-web.cloudfunctions.net";

const CONTRACT_VERSION =
  import.meta.env.VITE_SEDIFEX_INTEGRATION_CONTRACT_VERSION || "2026-04-13";
const DEFAULT_PAYSTACK_PROCESSING_FEE_PERCENT = 1.95;

const MANUAL_PAYMENT_TYPES: ManualPaymentType[] = [
  "SERVICE",
  "PRODUCT",
  "COURSE",
  "BOOKING",
  "STUDENT_REGISTRATION",
  "DONATION",
];

const MANUAL_ITEM: QuickPayItem = {
  id: "manual-service",
  name: "Manual payment request",
  type: "MANUAL",
  price: 0,
  description:
    "Enter the exact service, item, registration, booking, donation, or course manually.",
};

function money(value: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
  }).format(value);
}

function calculateCustomerProcessingFee(
  baseAmount: number,
  feePercent = DEFAULT_PAYSTACK_PROCESSING_FEE_PERCENT,
) {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return 0;
  if (!Number.isFinite(feePercent) || feePercent <= 0) return 0;

  const rate = feePercent / 100;
  if (rate >= 1) return 0;

  const baseMinor = Math.round(baseAmount * 100);
  return (Math.max(0, Math.ceil(baseMinor / (1 - rate)) - baseMinor)) / 100;
}

function normalizeCheckoutItemType(type: QuickPayItemType) {
  return type === "PRODUCT" ? "PRODUCT" : "SERVICE";
}

function getAccountingType(type: QuickPayItemType) {
  if (type === "DONATION") return "donation";
  if (type === "STUDENT_REGISTRATION") return "student_registration";
  if (type === "BOOKING") return "booking";
  if (type === "COURSE") return "course";
  if (type === "SERVICE") return "service";
  if (type === "PRODUCT") return "product";
  return "manual_quick_sale";
}

function getItemIcon(type: QuickPayItemType) {
  if (type === "SERVICE") return "S";
  if (type === "COURSE") return "C";
  if (type === "DONATION") return "D";
  if (type === "STUDENT_REGISTRATION") return "R";
  if (type === "BOOKING") return "B";
  if (type === "MANUAL") return "M";
  return "P";
}

function getTypeLabel(type: QuickPayItemType) {
  if (type === "STUDENT_REGISTRATION") return "Student registration";
  if (type === "MANUAL") return "Manual payment";
  return type.toLowerCase();
}

function getManualPaymentName(type: ManualPaymentType) {
  return `Manual ${getTypeLabel(type)} payment`;
}

function makeFallbackEmail(reference: string) {
  const safeReference =
    reference
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `quickpay-${Date.now()}`;
  return `quickpay-${safeReference}@sedifex.com`;
}

export default function PublicQuickPayCheckout() {
  const { storeId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") || "store";
  const requestedItemId =
    searchParams.get("itemId") || searchParams.get("slotId") || "";
  const requestedSlotId = searchParams.get("slotId") || "";
  const paymentReturnStatus = searchParams.get("status");
  const paymentReference =
    searchParams.get("reference") || searchParams.get("trxref") || "";
  const returnedPaymentMethod =
    searchParams.get("paymentMethod") ||
    searchParams.get("payment_method") ||
    "";
  const isCashReturn =
    returnedPaymentMethod.toLowerCase() === "cash" ||
    paymentReturnStatus === "cash_pending";
  const shouldShowSuccess =
    paymentReturnStatus === "success" ||
    paymentReturnStatus === "returning" ||
    paymentReturnStatus === "cash_pending" ||
    Boolean(paymentReference);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<QuickPayItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<QuickPayItem | null>(
    initialMode === "manual" ? MANUAL_ITEM : null,
  );
  const [manualPaymentType, setManualPaymentType] =
    useState<ManualPaymentType>("SERVICE");
  const [manualPaymentName, setManualPaymentName] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<QuickPayPaymentMethod>("CASH");
  const [quantity, setQuantity] = useState(1);
  const [customAmount, setCustomAmount] = useState("");
  const [customer, setCustomer] = useState<CustomerDetails>({
    name: "",
    email: "",
    phone: "",
  });
  const [status, setStatus] = useState<string | null>(
    "Loading store items…",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    return items.filter((item) => {
      const haystack =
        `${item.name} ${item.description ?? ""} ${item.category ?? ""} ${item.type}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [items, query]);

  const hasSearch = query.trim().length > 0;
  const unitAmount = selectedItem?.price ?? 0;
  const sanitizedManualPaymentName = manualPaymentName.trim();
  const effectiveQuickPayType: QuickPayItemType | null = selectedItem
    ? selectedItem.type === "MANUAL"
      ? manualPaymentType
      : selectedItem.type
    : null;
  const effectiveAccountingType = effectiveQuickPayType
    ? getAccountingType(effectiveQuickPayType)
    : "manual_quick_sale";
  const effectiveItemName =
    selectedItem?.type === "MANUAL"
      ? sanitizedManualPaymentName || getManualPaymentName(manualPaymentType)
      : (selectedItem?.name ?? "");
  const effectiveQuantity = selectedItem?.type === "MANUAL" ? 1 : quantity;
  const finalAmount =
    selectedItem?.type === "MANUAL"
      ? Number(customAmount || 0)
      : unitAmount * quantity;
  const processingFee =
    paymentMethod === "ONLINE"
      ? calculateCustomerProcessingFee(finalAmount)
      : 0;
  const onlineTotalAmount = finalAmount + processingFee;

  useEffect(() => {
    const existingViewport = document.querySelector('meta[name="viewport"]');
    if (existingViewport) {
      existingViewport.setAttribute(
        "content",
        "width=device-width, initial-scale=1.0",
      );
      return;
    }

    const meta = document.createElement("meta");
    meta.name = "viewport";
    meta.content = "width=device-width, initial-scale=1.0";
    document.head.appendChild(meta);

    return () => {
      meta.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCatalog() {
      if (!storeId) {
        setError("Missing store ID.");
        setStatus(null);
        return;
      }

      try {
        const response = await fetch(
          `${FUNCTION_BASE_URL}/publicQuickPayCatalog?storeId=${encodeURIComponent(storeId)}`,
        );
        if (!response.ok) {
          throw new Error(`Catalog request failed (${response.status})`);
        }

        const payload = (await response.json()) as { items?: QuickPayItem[] };
        if (!isMounted) return;

        const loadedItems = Array.isArray(payload.items) ? payload.items : [];
        setItems(loadedItems);

        const requestedItem = requestedItemId
          ? loadedItems.find(
              (item) =>
                item.id === requestedItemId || item.slotId === requestedItemId,
            )
          : null;
        if (requestedItem) setSelectedItem(requestedItem);

        setStatus(
          loadedItems.length === 0
            ? "No store items are available yet. You can enter the payment manually."
            : null,
        );
      } catch (catalogError) {
        if (!isMounted) return;
        console.warn("[quick-pay] Catalog load failed", catalogError);
        setItems([]);
        setStatus(
          "Store items could not be loaded. You can still enter the payment manually.",
        );
      }
    }

    if (!shouldShowSuccess) void loadCatalog();

    return () => {
      isMounted = false;
    };
  }, [requestedItemId, storeId, shouldShowSuccess]);

  function scrollToCheckout() {
    document
      .getElementById("quick-pay-checkout-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function useManualInput() {
    setSelectedItem(MANUAL_ITEM);
    setQuery("");
    setError(null);
    window.setTimeout(scrollToCheckout, 100);
  }

  function selectStoreItem(item: QuickPayItem) {
    setSelectedItem(item);
    setQuantity(1);
    setError(null);
    window.setTimeout(scrollToCheckout, 100);
  }

  async function createCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanCustomer: CustomerDetails = {
      name: customer.name.trim(),
      email: customer.email.trim().toLowerCase(),
      phone: customer.phone.trim(),
    };

    if (!selectedItem || !effectiveQuickPayType) {
      return setError("Search for an item or choose manual entry first.");
    }
    if (selectedItem.type === "MANUAL" && !sanitizedManualPaymentName) {
      return setError("Enter the service or item name.");
    }
    if (!cleanCustomer.email && !cleanCustomer.phone) {
      return setError("Enter customer phone number. Email is optional.");
    }
    if (!finalAmount || finalAmount <= 0) {
      return setError("Enter a valid amount.");
    }

    setIsSubmitting(true);
    setStatus(
      paymentMethod === "CASH"
        ? "Saving cash order…"
        : "Preparing secure payment…",
    );

    try {
      const reference = `qp_${storeId}_${Date.now()}`;
      const checkoutEmail =
        cleanCustomer.email ||
        (paymentMethod === "ONLINE" ? makeFallbackEmail(reference) : "");
      const checkoutCustomer = { ...cleanCustomer, email: checkoutEmail };
      const returnStatus =
        paymentMethod === "CASH" ? "cash_pending" : "success";
      const returnUrl = `${window.location.origin}/s/${encodeURIComponent(storeId)}?mode=${encodeURIComponent(initialMode)}&status=${encodeURIComponent(returnStatus)}&reference=${encodeURIComponent(reference)}&paymentMethod=${encodeURIComponent(paymentMethod.toLowerCase())}`;
      const accountingType = effectiveAccountingType;
      const manualPaymentCategory =
        selectedItem.type === "MANUAL" ? getTypeLabel(manualPaymentType) : null;

      const body = {
        storeId,
        merchantId: storeId,
        reference,
        clientOrderId: reference,
        amount: finalAmount,
        currency: "GHS",
        customer: checkoutCustomer,
        customerEmail: checkoutEmail,
        customerName: cleanCustomer.name,
        customerPhone: cleanCustomer.phone,
        returnUrl,
        sourceChannel:
          paymentMethod === "CASH" ? "quick_pay_cash" : "quick_pay_qr",
        sourceLabel:
          paymentMethod === "CASH"
            ? "Sedifex Quick Pay Cash"
            : "Sedifex Quick Pay",
        paymentMethod,
        payment_method: paymentMethod,
        paymentProvider: paymentMethod === "CASH" ? "cash" : "paystack",
        payment_provider: paymentMethod === "CASH" ? "cash" : "paystack",
        paymentCollectionMode:
          paymentMethod === "CASH" ? "cash" : "online_checkout",
        payment_collection_mode:
          paymentMethod === "CASH" ? "cash" : "online_checkout",
        quickPayType: effectiveQuickPayType,
        accountingType,
        orderType: accountingType,
        items: [
          {
            item_id: selectedItem.id,
            itemId: selectedItem.id,
            slotId: selectedItem.slotId || requestedSlotId || null,
            bookingDate: selectedItem.bookingDate || null,
            bookingTime: selectedItem.bookingTime || null,
            name: effectiveItemName,
            category: manualPaymentCategory || selectedItem.category || null,
            type: normalizeCheckoutItemType(effectiveQuickPayType),
            item_type: normalizeCheckoutItemType(effectiveQuickPayType),
            quickPayType: effectiveQuickPayType,
            originalQuickPayType: selectedItem.type,
            accountingType,
            qty: effectiveQuantity,
            quantity: effectiveQuantity,
          },
        ],
        pricing_snapshot: {
          pricing_version: "quick-pay-public-page-v2",
          currency: "GHS",
          subtotal: Math.round(finalAmount * 100),
          tax_total: 0,
          final_total: Math.round(finalAmount * 100),
          items: [
            {
              item_id: selectedItem.id,
              slotId: selectedItem.slotId || requestedSlotId || null,
              name: effectiveItemName,
              category: manualPaymentCategory || selectedItem.category || null,
              qty: effectiveQuantity,
              unit_price:
                selectedItem.type === "MANUAL"
                  ? Math.round(finalAmount * 100)
                  : Math.round(unitAmount * 100),
              line_total: Math.round(finalAmount * 100),
              type: normalizeCheckoutItemType(effectiveQuickPayType),
              quickPayType: effectiveQuickPayType,
              originalQuickPayType: selectedItem.type,
              accountingType,
            },
          ],
        },
        metadata: {
          quickPay: true,
          baseAmount: finalAmount,
          displayedProcessingFee: processingFee,
          displayedTotalToPay: onlineTotalAmount,
          storeId,
          itemId: selectedItem.id,
          slotId: selectedItem.slotId || requestedSlotId || null,
          bookingDate: selectedItem.bookingDate || null,
          bookingTime: selectedItem.bookingTime || null,
          itemName: effectiveItemName,
          originalItemName: selectedItem.name,
          itemType: effectiveQuickPayType,
          originalItemType: selectedItem.type,
          quickPayType: effectiveQuickPayType,
          originalQuickPayType: selectedItem.type,
          manualPayment: selectedItem.type === "MANUAL",
          manualPaymentName:
            selectedItem.type === "MANUAL"
              ? sanitizedManualPaymentName
              : undefined,
          manualPaymentCategory,
          paymentMethod,
          paymentCollectionMode:
            paymentMethod === "CASH" ? "cash" : "online_checkout",
          cashCheckout: paymentMethod === "CASH",
          customerEmailProvided: Boolean(cleanCustomer.email),
          generatedCustomerEmail:
            !cleanCustomer.email && checkoutEmail ? checkoutEmail : undefined,
          accountingType,
          quantity: effectiveQuantity,
        },
      };

      const endpoint =
        paymentMethod === "CASH"
          ? "integrationCashCheckoutCreate"
          : "integrationCheckoutCreate";
      const response = await fetch(`${FUNCTION_BASE_URL}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sedifex-Contract-Version": CONTRACT_VERSION,
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as {
        authorizationUrl?: string;
        checkoutUrl?: string;
        error?: string;
        cashCheckout?: boolean;
      } | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || `Checkout failed (${response.status})`);
      }

      if (paymentMethod === "CASH" || payload.cashCheckout) {
        window.location.href = returnUrl;
        return;
      }

      const checkoutUrl = payload.authorizationUrl || payload.checkoutUrl;
      if (!checkoutUrl) throw new Error("Checkout URL was not returned.");
      window.location.href = checkoutUrl;
    } catch (checkoutError) {
      console.error("[quick-pay] Checkout failed", checkoutError);
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to create checkout.",
      );
      setStatus(null);
      setIsSubmitting(false);
    }
  }

  if (shouldShowSuccess) {
    return (
      <main className="qp-checkout-root">
        <div className="qp-success-shell">
          <section className="qp-success-card">
            <div className="qp-success-icon">✓</div>
            <p className="qp-eyebrow qp-success-eyebrow">Sedifex Quick Pay</p>
            <h1 className="qp-success-title">
              {isCashReturn
                ? "Cash order sent to the store"
                : "Thank you for your payment"}
            </h1>
            <p className="qp-success-copy">
              {isCashReturn
                ? "Your cash payment request has been recorded. Please pay the store directly. The store will confirm cash received in Sedifex."
                : "Your payment has been received or is being confirmed. The business will receive your order in Sedifex."}
            </p>
            {paymentReference ? (
              <div className="qp-success-reference">
                <span>
                  {isCashReturn ? "Cash order reference" : "Payment reference"}
                </span>
                <strong>{paymentReference}</strong>
              </div>
            ) : null}
            <div className="qp-success-actions">
              <Link
                className="qp-success-primary"
                to={`/s/${encodeURIComponent(storeId)}?mode=store`}
              >
                Pay for another item
              </Link>
              <Link className="qp-success-secondary" to="/">
                Find another business
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="qp-checkout-root">
      <div className="qp-checkout-shell">
        <section className="qp-checkout-hero">
          <p className="qp-eyebrow">Sedifex Quick Pay</p>
          <h1 className="qp-title">Quick payment</h1>
          <p className="qp-copy">
            Start by searching the store for the product or service. If it is not
            listed, you can enter the payment manually.
          </p>

          <div className="qp-hero-search">
            <label className="qp-hero-label" htmlFor="quick-pay-search">
              What is the customer paying for?
            </label>
            <div className="qp-hero-input-shell">
              <span className="qp-hero-search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                id="quick-pay-search"
                type="search"
                placeholder="Search product, service, booking, course..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="qp-hero-input"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  className="qp-clear-search"
                  onClick={() => setQuery("")}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <p className="qp-hero-help">
              Search by name. Matching store items will appear below for you to
              select.
            </p>
          </div>

          <div className="qp-manual-fallback">
            <div>
              <strong>Cannot find the item?</strong>
              <span>Enter the name and amount yourself.</span>
            </div>
            <button
              type="button"
              className="qp-hero-manual-button"
              onClick={useManualInput}
            >
              Enter payment manually
            </button>
          </div>

          <div className="qp-trust-row">
            <span>♢ Store recorded</span>
            <span>◇ Cash supported</span>
            <span>▯ Mobile money &amp; card supported</span>
          </div>
        </section>

        <div className="qp-grid">
          <section className="qp-panel qp-search-panel">
            <div className="qp-panel-heading">
              <div>
                <p className="qp-step-label">Step 1</p>
                <h2>Choose an item</h2>
              </div>
              {selectedItem ? (
                <span className="qp-selection-badge">Selected</span>
              ) : null}
            </div>

            {status ? <p className="qp-status">{status}</p> : null}

            {hasSearch ? (
              <div className="qp-items-grid">
                {filteredItems.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`qp-item-card ${isSelected ? "qp-item-card-selected" : ""}`}
                      onClick={() => selectStoreItem(item)}
                      aria-pressed={isSelected}
                    >
                      <div className="qp-item-top">
                        <div className="qp-item-icon">
                          {getItemIcon(item.type)}
                        </div>
                        <div className="qp-item-main">
                          <h3 className="qp-item-name">{item.name}</h3>
                          <div className="qp-item-meta">
                            <span className="qp-badge">
                              {getTypeLabel(item.type)}
                            </span>
                            {item.category ? (
                              <span className="qp-badge">{item.category}</span>
                            ) : null}
                          </div>
                        </div>
                        <strong className="qp-price">
                          {item.price > 0 ? money(item.price) : "Custom"}
                        </strong>
                      </div>
                      {item.description ? (
                        <p className="qp-description">{item.description}</p>
                      ) : null}
                    </button>
                  );
                })}

                {filteredItems.length === 0 ? (
                  <div className="qp-empty">
                    <strong>No item matched “{query.trim()}”.</strong>
                    <span>You can still record this payment manually.</span>
                    <button type="button" onClick={useManualInput}>
                      Enter payment manually
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="qp-choice-grid">
                <div className="qp-choice-card qp-choice-card-primary">
                  <span className="qp-choice-number">1</span>
                  <div>
                    <h3>Search the store first</h3>
                    <p>
                      Use the search box above and select the correct product,
                      service, booking, course, or registration.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="qp-choice-card qp-choice-card-button"
                  onClick={useManualInput}
                >
                  <span className="qp-choice-number">2</span>
                  <div>
                    <h3>Item is not listed?</h3>
                    <p>Enter the item name and amount manually.</p>
                    <strong>Enter payment manually →</strong>
                  </div>
                </button>
              </div>
            )}
          </section>

          <form
            id="quick-pay-checkout-panel"
            onSubmit={createCheckout}
            className="qp-panel qp-payment-panel"
          >
            <div className="qp-panel-heading">
              <div>
                <p className="qp-step-label">Step 2</p>
                <h2>Payment details</h2>
              </div>
            </div>

            {!selectedItem ? (
              <div className="qp-payment-placeholder">
                <span aria-hidden="true">⌕</span>
                <strong>Choose what the customer is paying for</strong>
                <p>
                  Search and select a store item, or choose manual entry from the
                  left.
                </p>
              </div>
            ) : (
              <>
                <div className="qp-selected-header">
                  <span>{getTypeLabel(selectedItem.type)}</span>
                  <strong>{effectiveItemName}</strong>
                </div>

                {selectedItem.type === "MANUAL" ? (
                  <p className="qp-manual-note">
                    Type exactly what the customer is paying for.
                  </p>
                ) : null}

                <div className="qp-summary">
                  {selectedItem.type === "MANUAL" ? (
                    <>
                      <label className="qp-field-label">
                        Category
                        <select
                          value={manualPaymentType}
                          onChange={(event) =>
                            setManualPaymentType(
                              event.target.value as ManualPaymentType,
                            )
                          }
                          className="qp-field"
                        >
                          {MANUAL_PAYMENT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {getTypeLabel(type)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="qp-field-label">
                        Service / item name
                        <input
                          type="text"
                          value={manualPaymentName}
                          onChange={(event) =>
                            setManualPaymentName(event.target.value)
                          }
                          className="qp-field"
                          placeholder="E.g. Facial treatment, delivery fee"
                          required
                        />
                      </label>

                      <label className="qp-field-label">
                        Amount to pay
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          value={customAmount}
                          onChange={(event) =>
                            setCustomAmount(event.target.value)
                          }
                          className="qp-field"
                          placeholder="Enter amount"
                          required
                        />
                      </label>
                    </>
                  ) : (
                    <label className="qp-field-label">
                      Quantity
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(event) =>
                          setQuantity(
                            Math.max(1, Number(event.target.value) || 1),
                          )
                        }
                        className="qp-field"
                      />
                    </label>
                  )}

                  <div className="qp-total-row">
                    <span className="qp-total-label">Items / services</span>
                    <strong className="qp-total-value">
                      {money(finalAmount || 0)}
                    </strong>
                  </div>
                  {paymentMethod === "ONLINE" ? (
                    <div className="qp-total-row">
                      <span className="qp-total-label">Processing fee</span>
                      <strong className="qp-total-value">
                        {money(processingFee || 0)}
                      </strong>
                    </div>
                  ) : null}
                  <div className="qp-total-row qp-total-row-final">
                    <span className="qp-total-label">Total to pay</span>
                    <strong className="qp-total-value">
                      {money(
                        paymentMethod === "ONLINE"
                          ? onlineTotalAmount || 0
                          : finalAmount || 0,
                      )}
                    </strong>
                  </div>
                </div>

                <fieldset className="qp-payment-methods">
                  <legend>How will the customer pay?</legend>
                  <div
                    className="qp-payment-option-grid"
                    role="radiogroup"
                    aria-label="Payment method"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={paymentMethod === "CASH"}
                      className={`qp-payment-option ${paymentMethod === "CASH" ? "qp-payment-option-active" : ""}`}
                      onClick={() => setPaymentMethod("CASH")}
                    >
                      <span className="qp-payment-option-icon">₵</span>
                      <span className="qp-payment-option-copy">
                        <strong>Pay by Cash</strong>
                        <small>Store confirms cash received</small>
                      </span>
                      <span className="qp-payment-option-check">✓</span>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={paymentMethod === "ONLINE"}
                      className={`qp-payment-option ${paymentMethod === "ONLINE" ? "qp-payment-option-active" : ""}`}
                      onClick={() => setPaymentMethod("ONLINE")}
                    >
                      <span className="qp-payment-option-icon">M</span>
                      <span className="qp-payment-option-copy">
                        <strong>Pay by MoMo / Card</strong>
                        <small>Secure online checkout</small>
                      </span>
                      <span className="qp-payment-option-check">✓</span>
                    </button>
                  </div>
                </fieldset>

                {paymentMethod === "CASH" ? (
                  <p className="qp-payment-help">
                    Sedifex saves this as a pending cash order until the store
                    confirms the money was received.
                  </p>
                ) : (
                  <p className="qp-payment-help">
                    The customer will continue to Paystack to pay with Mobile
                    Money or card.
                  </p>
                )}

                <div className="qp-form-fields">
                  <input
                    type="text"
                    placeholder="Customer name"
                    value={customer.name}
                    onChange={(event) =>
                      setCustomer((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    className="qp-field"
                  />
                  <input
                    type="email"
                    placeholder="Email (optional)"
                    value={customer.email}
                    onChange={(event) =>
                      setCustomer((previous) => ({
                        ...previous,
                        email: event.target.value,
                      }))
                    }
                    className="qp-field"
                  />
                  <input
                    type="tel"
                    placeholder="Phone / WhatsApp"
                    value={customer.phone}
                    onChange={(event) =>
                      setCustomer((previous) => ({
                        ...previous,
                        phone: event.target.value,
                      }))
                    }
                    className="qp-field"
                  />
                </div>
              </>
            )}

            {error ? <p className="qp-error">{error}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting || !selectedItem}
              className="qp-pay-button"
            >
              {isSubmitting
                ? paymentMethod === "CASH"
                  ? "Saving cash order…"
                  : "Opening payment…"
                : selectedItem
                  ? paymentMethod === "CASH"
                    ? `Save cash order ${money(finalAmount || 0)}`
                    : `Pay ${money(onlineTotalAmount || 0)}`
                  : "Choose an item first"}
            </button>

            <p className="qp-powered">
              Powered by Sedifex. Cash orders are recorded for store
              confirmation.
            </p>
          </form>
        </div>
      </div>

      {selectedItem ? (
        <button
          type="button"
          className="qp-mobile-checkout-bar"
          onClick={scrollToCheckout}
        >
          <span>
            <strong>{effectiveItemName}</strong>
            <small>
              {selectedItem.type === "MANUAL"
                ? getTypeLabel(manualPaymentType)
                : `${quantity} × ${money(unitAmount || finalAmount || 0)}`}
            </small>
          </span>
          <b>
            {finalAmount > 0
              ? `${paymentMethod === "CASH" ? "Cash order" : "Checkout"} ${money(finalAmount)}`
              : "Enter amount"}
          </b>
        </button>
      ) : null}
    </main>
  );
}
