import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import PageSection from "../layout/PageSection";
import { db } from "../firebase";
import { useActiveStore } from "../hooks/useActiveStore";

type PreviewMode = "desktop" | "mobile";
type WebsiteType =
  | "shop"
  | "beauty"
  | "school"
  | "travel"
  | "ngo"
  | "restaurant"
  | "service";
type WebsiteTheme = "modern" | "luxury" | "clean" | "bold";
type DomainConnectionStatus =
  | "not-connected"
  | "pending"
  | "connected"
  | "needs-attention";

type SocialLinks = {
  facebook: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  linkedin: string;
  x: string;
  website: string;
};

type ContentDrafts = {
  homepage: string;
  about: string;
  serviceDescriptions: string;
  seoTitle: string;
};

type SeoSettings = {
  title: string;
  metaDescription: string;
  keywords: string;
  socialShareImage: string;
};

type DomainSettings = {
  customDomain: string;
  connectionStatus: DomainConnectionStatus;
  sslStatus: string;
  dnsTarget: string;
  verificationToken: string;
};

type WebsitePreviewSettings = {
  slug: string;
  websiteType: WebsiteType;
  businessType: string;
  theme: WebsiteTheme;
  selectedTemplateId: string;
  selectedTemplateName: string;
  layoutKey: string;
  selectedSections: string[];
  pages: string[];
  status: "draft" | "published";
  businessName: string;
  tagline: string;
  description: string;
  phone: string;
  whatsapp: string;
  email: string;
  location: string;
  openingHours: string;
  businessLogoUrl: string;
  coverImageUrl: string;
  brandColor: string;
  socialLinks: SocialLinks;
  contentDrafts: ContentDrafts;
  seoSettings: SeoSettings;
  domainSettings: DomainSettings;
};

type ThemeOption = {
  id: WebsiteTheme;
  previewClassName: string;
  textClassName: string;
  surfaceClassName: string;
  mutedSurfaceClassName: string;
};

type PreviewProfile = {
  icon: string;
  eyebrow: string;
  headline: string;
  body: string;
  cta: string;
  cards: string[];
};

const DEFAULT_SOCIAL_LINKS: SocialLinks = {
  facebook: "",
  instagram: "",
  tiktok: "",
  youtube: "",
  linkedin: "",
  x: "",
  website: "",
};

const DEFAULT_CONTENT_DRAFTS: ContentDrafts = {
  homepage: "",
  about: "",
  serviceDescriptions: "",
  seoTitle: "",
};

const DEFAULT_SEO_SETTINGS: SeoSettings = {
  title: "",
  metaDescription: "",
  keywords: "",
  socialShareImage: "",
};

const DEFAULT_DOMAIN_SETTINGS: DomainSettings = {
  customDomain: "",
  connectionStatus: "not-connected",
  sslStatus: "not-started",
  dnsTarget: "sites.sedifex.com",
  verificationToken: "",
};

const THEME_OPTIONS: Record<WebsiteTheme, ThemeOption> = {
  modern: {
    id: "modern",
    previewClassName: "from-indigo-500 via-blue-500 to-cyan-400",
    textClassName: "text-white",
    surfaceClassName: "bg-white text-slate-950",
    mutedSurfaceClassName: "bg-white/15 text-white",
  },
  luxury: {
    id: "luxury",
    previewClassName: "from-slate-950 via-stone-800 to-amber-600",
    textClassName: "text-amber-50",
    surfaceClassName: "bg-stone-950 text-amber-50",
    mutedSurfaceClassName: "bg-amber-100/15 text-amber-50",
  },
  clean: {
    id: "clean",
    previewClassName: "from-slate-100 via-white to-blue-100",
    textClassName: "text-slate-950",
    surfaceClassName: "bg-white text-slate-950",
    mutedSurfaceClassName: "bg-slate-900/5 text-slate-700",
  },
  bold: {
    id: "bold",
    previewClassName: "from-rose-500 via-orange-400 to-yellow-300",
    textClassName: "text-white",
    surfaceClassName: "bg-white text-slate-950",
    mutedSurfaceClassName: "bg-white/20 text-white",
  },
};

const PREVIEW_PROFILES: Record<WebsiteType, PreviewProfile> = {
  shop: {
    icon: "🛍️",
    eyebrow: "Online shop",
    headline: "Shop products and pay safely online.",
    body: "Show products, categories, checkout, and Quick Pay from one public website.",
    cta: "Shop now",
    cards: ["Products", "Categories", "Checkout"],
  },
  beauty: {
    icon: "✨",
    eyebrow: "Beauty studio",
    headline: "Book beauty services with confidence.",
    body: "Display services, gallery, bookings, client reviews, and payments in one place.",
    cta: "Book appointment",
    cards: ["Services", "Gallery", "Reviews"],
  },
  school: {
    icon: "🎓",
    eyebrow: "School website",
    headline: "Courses, registration, and student payments.",
    body: "Promote classes, accept registrations, and connect student payments to Sedifex.",
    cta: "Register now",
    cards: ["Courses", "Classes", "Payments"],
  },
  travel: {
    icon: "✈️",
    eyebrow: "Travel agency",
    headline: "Turn travel enquiries into bookings.",
    body: "Show packages, destinations, consultation requests, bookings, and travel content.",
    cta: "Send enquiry",
    cards: ["Packages", "Destinations", "Bookings"],
  },
  ngo: {
    icon: "🤝",
    eyebrow: "Impact website",
    headline: "Share your mission and collect support.",
    body: "Highlight programs, donations, volunteer forms, blog posts, and impact stories.",
    cta: "Donate now",
    cards: ["Programs", "Donate", "Volunteers"],
  },
  restaurant: {
    icon: "🍽️",
    eyebrow: "Restaurant website",
    headline: "Show your menu and receive orders.",
    body: "Publish menu items, online ordering, reservations, table QR, and customer payments.",
    cta: "View menu",
    cards: ["Menu", "Ordering", "Reservations"],
  },
  service: {
    icon: "🧰",
    eyebrow: "Service business",
    headline: "Sell services and receive bookings online.",
    body: "Show service packages, accept bookings, issue invoices, and collect Quick Pay.",
    cta: "Request service",
    cards: ["Services", "Bookings", "Invoices"],
  },
};

const SOCIAL_LABELS: Array<{ id: keyof SocialLinks; label: string }> = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
];

function defaultSettings(): WebsitePreviewSettings {
  return {
    slug: "",
    websiteType: "shop",
    businessType: "Shop website",
    theme: "modern",
    selectedTemplateId: "",
    selectedTemplateName: "",
    layoutKey: "modern-storefront-grid",
    selectedSections: ["hero", "featured-products", "quick-pay", "contact"],
    pages: [
      "Home",
      "Products",
      "Categories",
      "Cart / Checkout",
      "Quick Pay",
      "Contact",
    ],
    status: "draft",
    businessName: "My business",
    tagline: "",
    description: "",
    phone: "",
    whatsapp: "",
    email: "",
    location: "",
    openingHours: "",
    businessLogoUrl: "",
    coverImageUrl: "",
    brandColor: "#4f46e5",
    socialLinks: { ...DEFAULT_SOCIAL_LINKS },
    contentDrafts: { ...DEFAULT_CONTENT_DRAFTS },
    seoSettings: { ...DEFAULT_SEO_SETTINGS },
    domainSettings: { ...DEFAULT_DOMAIN_SETTINGS },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : fallback;
}

function normalizeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : "#4f46e5";
}

function isWebsiteType(value: unknown): value is WebsiteType {
  return [
    "shop",
    "beauty",
    "school",
    "travel",
    "ngo",
    "restaurant",
    "service",
  ].includes(String(value));
}

function isWebsiteTheme(value: unknown): value is WebsiteTheme {
  return ["modern", "luxury", "clean", "bold"].includes(String(value));
}

function previewDraftStorageKey(storeId: string | null) {
  return `sedifex:website-builder-preview-draft:${storeId || "active"}`;
}

function readStoredPreviewDraft(
  storeId: string | null,
): WebsitePreviewSettings | null {
  if (typeof window === "undefined") return null;
  const keys = [previewDraftStorageKey(storeId), previewDraftStorageKey(null)];
  for (const storage of [window.sessionStorage, window.localStorage]) {
    for (const key of keys) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { savedAt?: unknown; data?: unknown };
        const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
        if (Date.now() - savedAt > PREVIEW_CACHE_TTL_MS) continue;
        const data = record(parsed.data);
        return normalizePreviewSettings(data, defaultSettings());
      } catch (storageError) {
        console.info(
          "[website-preview] Unable to read local preview draft",
          storageError,
        );
      }
    }
  }
  return null;
}

function normalizePreviewSettings(
  source: Record<string, unknown>,
  defaults: WebsitePreviewSettings,
): WebsitePreviewSettings {
  const websiteType = isWebsiteType(source.websiteType)
    ? source.websiteType
    : defaults.websiteType;
  return {
    ...defaults,
    slug: stringValue(source.slug, defaults.slug),
    websiteType,
    businessType: stringValue(source.businessType, `${websiteType} website`),
    theme: isWebsiteTheme(source.theme) ? source.theme : defaults.theme,
    selectedTemplateId: stringValue(source.selectedTemplateId),
    selectedTemplateName: stringValue(source.selectedTemplateName),
    layoutKey: stringValue(
      source.layoutKey,
      stringValue(source.templateKey, defaults.layoutKey),
    ),
    selectedSections: stringArray(
      source.selectedSections,
      defaults.selectedSections,
    ),
    pages: stringArray(source.pages, defaults.pages),
    status: source.status === "published" ? "published" : "draft",
    businessName: stringValue(source.businessName, defaults.businessName),
    tagline: stringValue(source.tagline, defaults.tagline),
    description: stringValue(source.description, defaults.description),
    phone: stringValue(source.phone, defaults.phone),
    whatsapp: stringValue(source.whatsapp, defaults.whatsapp),
    email: stringValue(source.email, defaults.email),
    location: stringValue(source.location, defaults.location),
    openingHours: stringValue(source.openingHours, defaults.openingHours),
    businessLogoUrl: stringValue(
      source.businessLogoUrl,
      defaults.businessLogoUrl,
    ),
    coverImageUrl: stringValue(source.coverImageUrl, defaults.coverImageUrl),
    brandColor: normalizeColor(source.brandColor),
    socialLinks: {
      ...DEFAULT_SOCIAL_LINKS,
      ...record(source.socialLinks),
    } as SocialLinks,
    contentDrafts: {
      ...DEFAULT_CONTENT_DRAFTS,
      ...record(source.contentDrafts),
    } as ContentDrafts,
    seoSettings: {
      ...DEFAULT_SEO_SETTINGS,
      ...record(source.seoSettings),
    } as SeoSettings,
    domainSettings: {
      ...DEFAULT_DOMAIN_SETTINGS,
      ...record(source.domainSettings),
    } as DomainSettings,
  };
}

function publicUrl(settings: WebsitePreviewSettings) {
  if (
    settings.domainSettings.connectionStatus === "connected" &&
    settings.domainSettings.customDomain
  )
    return `https://${settings.domainSettings.customDomain}`;
  return `https://sites.sedifex.com/${settings.slug || "your-business"}`;
}

function qrCodeUrl(url: string, size = 320) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=png&data=${encodeURIComponent(url)}`;
}

function previewText(value: string, fallback: string) {
  const clean = value.trim();
  if (!clean) return fallback;
  return clean.length > 220 ? `${clean.slice(0, 217)}…` : clean;
}

const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const previewSettingsCache = new Map<
  string,
  { savedAt: number; data: WebsitePreviewSettings }
>();

export default function WebsiteBuilderPreview() {
  const { storeId, isLoading } = useActiveStore();
  const [settings, setSettings] = useState<WebsitePreviewSettings>(() =>
    defaultSettings(),
  );
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [shouldLoadPreview, setShouldLoadPreview] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [showShareTools, setShowShareTools] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [coverLoadFailed, setCoverLoadFailed] = useState(false);
  const [shareImageLoadFailed, setShareImageLoadFailed] = useState(false);
  const url = publicUrl(settings);
  const profile = PREVIEW_PROFILES[settings.websiteType];
  const theme = THEME_OPTIONS[settings.theme];
  const activeSocialLinks = SOCIAL_LABELS.filter(
    (item) => settings.socialLinks[item.id],
  );
  const visiblePages = settings.pages.length
    ? settings.pages.slice(0, 7)
    : ["Home"];
  const statusClass =
    settings.status === "published"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  const shareText = `Visit ${settings.businessName || "our business"} online: ${url}`;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const instagramCaption = `${settings.businessName || "Our business"} is online. Visit ${url} to explore our services and offers. #Sedifex #BusinessWebsite`;
  const seoTitle =
    settings.seoSettings.title ||
    settings.contentDrafts.seoTitle ||
    `${settings.businessName} | ${profile.cta}`;
  const seoDescription =
    settings.seoSettings.metaDescription ||
    settings.description ||
    profile.body;
  const shareImage =
    settings.seoSettings.socialShareImage ||
    settings.coverImageUrl ||
    settings.businessLogoUrl;

  useEffect(() => {
    if (!storeId) return;
    const localDraft = readStoredPreviewDraft(storeId);
    if (!localDraft) return;
    setSettings(localDraft);
    setShouldLoadPreview(true);
  }, [storeId]);

  useEffect(() => {
    if (!shouldLoadPreview) return;
    let mounted = true;

    async function loadPreview() {
      if (!storeId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const forceRefresh = reloadTick > 0;
        const localDraft = !forceRefresh
          ? readStoredPreviewDraft(storeId)
          : null;
        if (localDraft) {
          setSettings(localDraft);
          previewSettingsCache.set(storeId, {
            savedAt: Date.now(),
            data: localDraft,
          });
          return;
        }
        const cached = previewSettingsCache.get(storeId);
        if (
          !forceRefresh &&
          cached &&
          Date.now() - cached.savedAt < PREVIEW_CACHE_TTL_MS
        ) {
          setSettings(cached.data);
          return;
        }

        const [settingsSnap, storeSnap] = await Promise.all([
          getDoc(doc(db, "storeSettings", storeId)),
          getDoc(doc(db, "stores", storeId)),
        ]);

        if (!mounted) return;

        const settingsData = settingsSnap.exists()
          ? record(settingsSnap.data().websiteBuilder)
          : {};
        const storeData = storeSnap.exists() ? record(storeSnap.data()) : {};
        const defaults = defaultSettings();
        const socialLinks = {
          ...DEFAULT_SOCIAL_LINKS,
          ...record(storeData.socialLinks),
          ...record(settingsData.socialLinks),
        } as SocialLinks;
        const contentDrafts = {
          ...DEFAULT_CONTENT_DRAFTS,
          ...record(settingsData.contentDrafts),
        } as ContentDrafts;
        const seoSettings = {
          ...DEFAULT_SEO_SETTINGS,
          ...record(settingsData.seoSettings),
        } as SeoSettings;
        const domainSettings = {
          ...DEFAULT_DOMAIN_SETTINGS,
          ...record(settingsData.domainSettings),
        } as DomainSettings;
        const businessName = stringValue(
          settingsData.businessName,
          stringValue(
            storeData.businessName,
            stringValue(
              storeData.storeName,
              stringValue(storeData.name, defaults.businessName),
            ),
          ),
        );

        const nextSettings: WebsitePreviewSettings = {
          ...normalizePreviewSettings(settingsData, defaults),
          slug: stringValue(
            settingsData.slug,
            businessName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, ""),
          ),
          pages: stringArray(settingsData.pages, defaults.pages),
          businessName,
          tagline: stringValue(
            settingsData.tagline,
            stringValue(storeData.tagline),
          ),
          description: stringValue(
            settingsData.description,
            stringValue(storeData.description),
          ),
          phone: stringValue(
            settingsData.phone,
            stringValue(storeData.phone, stringValue(storeData.phoneNumber)),
          ),
          whatsapp: stringValue(
            settingsData.whatsapp,
            stringValue(
              storeData.whatsapp,
              stringValue(storeData.whatsappNumber),
            ),
          ),
          email: stringValue(
            settingsData.email,
            stringValue(storeData.email, stringValue(storeData.businessEmail)),
          ),
          location: stringValue(
            settingsData.location,
            stringValue(storeData.location, stringValue(storeData.address)),
          ),
          openingHours: stringValue(
            settingsData.openingHours,
            stringValue(storeData.openingHours),
          ),
          businessLogoUrl: stringValue(
            settingsData.businessLogoUrl,
            stringValue(
              storeData.businessLogoUrl,
              stringValue(storeData.logoUrl),
            ),
          ),
          coverImageUrl: stringValue(
            settingsData.coverImageUrl,
            stringValue(
              storeData.coverImageUrl,
              stringValue(storeData.bannerImageUrl),
            ),
          ),
          brandColor: normalizeColor(
            settingsData.brandColor || storeData.brandColor,
          ),
          socialLinks,
          contentDrafts,
          seoSettings,
          domainSettings,
        };
        setSettings(nextSettings);
        previewSettingsCache.set(storeId, {
          savedAt: Date.now(),
          data: nextSettings,
        });
      } catch (error) {
        console.error("[website-preview] Unable to load preview", error);
        setLoadError(
          "Unable to load website preview right now. Please try again.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadPreview();
    return () => {
      mounted = false;
    };
  }, [storeId, shouldLoadPreview, reloadTick]);

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(message);
    } catch (error) {
      console.error("[website-preview] Unable to copy", error);
      setCopyFeedback("Could not copy. Please copy manually.");
    }
    window.setTimeout(() => setCopyFeedback(null), 2500);
  }

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [settings.businessLogoUrl]);

  useEffect(() => {
    setCoverLoadFailed(false);
  }, [settings.coverImageUrl]);

  useEffect(() => {
    setShareImageLoadFailed(false);
  }, [shareImage]);

  const hasServiceContent = Boolean(
    settings.contentDrafts.serviceDescriptions.trim(),
  );

  if (isLoading) {
    return (
      <PageSection
        title="Website Preview"
        subtitle="Loading your website preview…"
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600">
          Preparing preview…
        </div>
      </PageSection>
    );
  }

  if (!shouldLoadPreview) {
    return (
      <PageSection
        title="Website Preview"
        subtitle="Load the latest saved Website Builder data when you are ready."
      >
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">
            Load preview on demand
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            To keep this page fast, preview data is loaded only when requested.
          </p>
          <button
            type="button"
            className="button button--primary mt-4"
            onClick={() => setShouldLoadPreview(true)}
          >
            Load website preview
          </button>
        </section>
      </PageSection>
    );
  }

  if (loading) {
    return (
      <PageSection
        title="Website Preview"
        subtitle="Loading your website preview…"
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600">
          Preparing preview…
        </div>
      </PageSection>
    );
  }

  return (
    <PageSection
      title="Website Preview"
      subtitle="Preview the draft or published website in desktop and mobile mode before opening the public site."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full border px-3 py-2 text-sm font-bold capitalize ${statusClass}`}
          >
            {settings.status}
          </span>
          <Link className="button button--ghost" to="/website-builder">
            Back to editor
          </Link>
          <a
            className="button button--primary"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            Open public site ↗
          </a>
        </div>
      }
      cardClassName="bg-transparent border-0 shadow-none p-0"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-indigo-600">
                Live visual preview
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                {settings.businessName}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                This preview uses the saved Website Builder data. Save draft in
                the editor, then refresh this page to see the latest changes.
              </p>
            </div>
            <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-sm font-semibold md:w-80">
              <button
                type="button"
                className={`rounded-xl px-3 py-2 transition ${previewMode === "mobile" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                onClick={() => setPreviewMode("mobile")}
              >
                Mobile
              </button>
              <button
                type="button"
                className={`rounded-xl px-3 py-2 transition ${previewMode === "desktop" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                onClick={() => setPreviewMode("desktop")}
              >
                Desktop
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-100 p-3">
            <div
              className={`${previewMode === "mobile" ? "mx-auto max-w-[360px]" : "w-full"} overflow-hidden rounded-[1.75rem] border border-slate-900/10 bg-white shadow-sm`}
            >
              <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                <span className="ml-2 truncate rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
                  {url}
                </span>
              </div>

              {settings.coverImageUrl && !coverLoadFailed ? (
                <img
                  src={settings.coverImageUrl}
                  alt=""
                  className="hidden"
                  onError={() => setCoverLoadFailed(true)}
                />
              ) : null}
              <div
                className={`bg-gradient-to-br ${theme.previewClassName} p-5 md:p-7 ${theme.textClassName}`}
                style={
                  settings.coverImageUrl && !coverLoadFailed
                    ? {
                        backgroundImage: `linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.25)), url(${settings.coverImageUrl})`,
                        backgroundPosition: "center",
                        backgroundSize: "cover",
                      }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {settings.businessLogoUrl && !logoLoadFailed ? (
                      <img
                        src={settings.businessLogoUrl}
                        alt="Business logo"
                        className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-1 ring-white/40"
                        onError={() => setLogoLoadFailed(true)}
                      />
                    ) : (
                      <span className="flex h-12 min-w-[3rem] shrink-0 items-center justify-center rounded-2xl bg-white/20 px-2 text-center text-[10px] font-bold ring-1 ring-white/30">
                        {settings.businessName || profile.icon}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-base font-black">
                        {settings.businessName}
                      </p>
                      <p className="truncate text-xs opacity-75">
                        {settings.tagline || profile.eyebrow}
                      </p>
                    </div>
                  </div>
                  <span
                    className="rounded-full px-4 py-2 text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: settings.brandColor }}
                  >
                    Pay
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                  {visiblePages.map((page) => (
                    <span
                      key={page}
                      className={`rounded-full px-3 py-1.5 ${theme.mutedSurfaceClassName}`}
                    >
                      {page}
                    </span>
                  ))}
                </div>

                <div
                  className={`${previewMode === "mobile" ? "grid gap-5" : "grid gap-7 lg:grid-cols-[1.15fr_0.85fr]"} mt-8 items-center`}
                >
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.28em] opacity-80">
                      {profile.eyebrow}
                    </p>
                    <h1
                      className={`${previewMode === "mobile" ? "text-3xl" : "text-5xl"} mt-3 font-black leading-tight tracking-tight`}
                    >
                      {settings.tagline || profile.headline}
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-7 opacity-90 md:text-base">
                      {previewText(
                        settings.contentDrafts.homepage || settings.description,
                        profile.body,
                      )}
                    </p>
                    <button
                      type="button"
                      className="mt-5 rounded-full px-5 py-3 text-sm font-bold text-white shadow-sm"
                      style={{ backgroundColor: settings.brandColor }}
                    >
                      {profile.cta}
                    </button>
                  </div>
                  <div
                    className={`rounded-3xl p-4 shadow-sm ${theme.surfaceClassName}`}
                  >
                    <div className="h-40 rounded-2xl bg-slate-200/80" />
                    <div className="mt-4 space-y-2 text-sm">
                      <p className="font-bold">Contact</p>
                      <p className="truncate opacity-70">
                        {settings.phone ||
                          settings.whatsapp ||
                          "Phone / WhatsApp"}
                      </p>
                      {settings.location ? (
                        <p className="truncate opacity-70">
                          {settings.location}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 bg-white p-5 sm:grid-cols-3">
                {hasServiceContent ? (
                  profile.cards.map((card) => (
                    <div
                      key={card}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div
                        className="h-10 w-10 rounded-xl"
                        style={{ backgroundColor: `${settings.brandColor}22` }}
                      />
                      <p className="mt-4 text-sm font-bold text-slate-900">
                        {card}
                      </p>
                      <div className="mt-3 h-2 w-20 rounded-full bg-slate-200" />
                    </div>
                  ))
                ) : (
                  <div className="sm:col-span-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    Products/services are not added yet. Add them in the builder
                    to populate this section.
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap gap-2">
                  {settings.openingHours ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {settings.openingHours}
                    </span>
                  ) : null}
                  {activeSocialLinks.map((item) => (
                    <span
                      key={item.id}
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                    >
                      {item.label}
                    </span>
                  ))}
                  {settings.seoSettings.title ||
                  settings.contentDrafts.seoTitle ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      SEO ready
                    </span>
                  ) : null}
                  {settings.domainSettings.customDomain ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      Domain:{" "}
                      {settings.domainSettings.connectionStatus.replace(
                        "-",
                        " ",
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-indigo-600">
              Website actions
            </p>
            {loadError ? (
              <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                {loadError}
              </p>
            ) : null}
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
                onClick={() => setReloadTick((current) => current + 1)}
              >
                Refresh preview data
              </button>
              <button
                type="button"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
                onClick={() => void copyText(url, "Website link copied.")}
              >
                Copy link
              </button>
              <button
                type="button"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
                onClick={() => setShowShareTools((current) => !current)}
              >
                {showShareTools ? "Hide share tools" : "Show share tools"}
              </button>
              {showShareTools ? (
                <>
                  <a
                    className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white"
                    href={whatsappShareUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Share to WhatsApp
                  </a>
                  <a
                    className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white"
                    href={facebookShareUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Share to Facebook
                  </a>
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
                    onClick={() =>
                      void copyText(
                        instagramCaption,
                        "Instagram caption copied.",
                      )
                    }
                  >
                    Copy Instagram caption
                  </button>
                </>
              ) : null}
            </div>
            {copyFeedback ? (
              <p className="mt-3 rounded-2xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-700">
                {copyFeedback}
              </p>
            ) : null}
          </section>

          {showShareTools ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 text-center shadow-sm">
              <p className="text-sm font-bold uppercase tracking-wide text-indigo-600">
                QR code
              </p>
              <img
                src={qrCodeUrl(url)}
                alt="Website QR code"
                className="mx-auto mt-4 h-56 w-56 rounded-2xl"
              />
              <p className="mt-3 break-all text-xs font-semibold text-slate-500">
                {url}
              </p>
            </section>
          ) : null}

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Google preview
            </p>
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <p className="truncate text-sm text-slate-600">{url}</p>
              <h3 className="mt-1 text-lg font-semibold leading-snug text-blue-700">
                {seoTitle}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {seoDescription}
              </p>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Facebook / WhatsApp preview
            </p>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {shareImage && !shareImageLoadFailed ? (
                <img
                  src={shareImage}
                  alt="Social share preview"
                  className="h-40 w-full object-cover"
                  onError={() => setShareImageLoadFailed(true)}
                />
              ) : (
                <div className="flex h-40 items-center justify-center bg-slate-100 text-sm font-semibold text-slate-400">
                  Social share image
                </div>
              )}
              <div className="p-4">
                <p className="truncate text-xs uppercase tracking-wide text-slate-500">
                  {settings.domainSettings.customDomain || "sites.sedifex.com"}
                </p>
                <h3 className="mt-1 text-base font-bold text-slate-950">
                  {seoTitle}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{seoDescription}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </PageSection>
  );
}
