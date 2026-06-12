import SafeFirebaseImage from '../components/SafeFirebaseImage'
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { Link, useParams } from "react-router-dom";
import { db } from "../firebase";

type PublicPage =
  | "home"
  | "products"
  | "services"
  | "gallery"
  | "quick-pay"
  | "contact";
type WebsiteSettings = {
  storeId: string;
  businessName: string;
  slug: string;
  websiteType: string;
  businessType: string;
  theme: string;
  selectedTemplateId: string;
  selectedTemplateName: string;
  layoutKey: string;
  layoutTemplate: string;
  templateCategory: string;
  selectedSections: string[];
  pages: string[];
  status: "draft" | "published";
  tagline: string;
  description: string;
  brandColor: string;
  coverImageUrl: string;
  contentDrafts: {
    homepage: string;
    about: string;
    serviceDescriptions: string;
    seoTitle: string;
  };
  seoSettings: {
    title: string;
    metaDescription: string;
    keywords: string;
    socialShareImage: string;
  };
};
type StoreProfile = {
  name: string;
  logoUrl: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  openingHours: string;
};
type PublicItem = {
  id: string;
  name: string;
  price: number;
  type: "PRODUCT" | "SERVICE" | "COURSE" | "BOOKING";
  description: string;
  imageUrl: string;
  slotId?: string;
};
type GalleryItem = { id: string; url: string; alt: string; caption: string };

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const parsed = (value as { toDate: () => Date }).toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime())
      ? parsed
      : null;
  }
  return null;
}
function formatEventDate(value: unknown) {
  const parsed = parseDate(value);
  return parsed
    ? parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date to be announced";
}
function formatEventTime(startAt: unknown, endAt: unknown, fallback: unknown) {
  const fallbackText = clean(fallback, 160);
  const start = parseDate(startAt);
  const end = parseDate(endAt);
  if (start && end)
    return `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return fallbackText || "Time to be announced";
}
function money(value: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
  }).format(value);
}
function getPrice(source: Record<string, unknown>) {
  const minor = numberValue(source.priceMinor ?? source.amountMinor);
  if (minor !== null && minor >= 0) return minor / 100;
  const major = numberValue(
    source.price ??
      source.sellingPrice ??
      source.salePrice ??
      source.amount ??
      source.fee,
  );
  return major !== null && major >= 0 ? major : 0;
}
function mapItem(
  id: string,
  source: Record<string, unknown>,
  fallbackType: PublicItem["type"],
): PublicItem | null {
  const name = clean(
    source.name ??
      source.productName ??
      source.serviceName ??
      source.courseName ??
      source.title,
    220,
  );
  if (!name) return null;
  const rawType = clean(
    source.type ?? source.item_type ?? source.itemType,
    40,
  ).toUpperCase();
  const type: PublicItem["type"] =
    rawType === "SERVICE" || rawType === "COURSE" || rawType === "PRODUCT"
      ? rawType
      : fallbackType;
  return {
    id,
    name,
    type,
    price: getPrice(source),
    description: clean(source.description ?? source.shortDescription, 260),
    imageUrl: clean(
      source.imageUrl ??
        source.image_url ??
        source.image ??
        source.photoUrl ??
        source.coverImageUrl,
      900,
    ),
  };
}
function mapAvailabilitySlot(
  id: string,
  source: Record<string, unknown>,
): PublicItem | null {
  if (
    source.status === "closed" ||
    source.isPublic === false ||
    source.visibleOnWebsite === false
  )
    return null;
  const name = clean(source.serviceName ?? source.name ?? source.title, 220);
  if (!name) return null;
  const startAt = source.startAt;
  const eventDate = clean(source.eventDate, 40);
  const dateLabel =
    clean(source.displayDateText, 160) ||
    (eventDate
      ? formatEventDate(`${eventDate}T00:00:00`)
      : formatEventDate(startAt));
  const timeLabel = formatEventTime(
    startAt,
    source.endAt,
    source.displayTimeText,
  );
  const location = clean(source.location, 180);
  const descriptionParts = [
    clean(source.description, 260),
    `${dateLabel} • ${timeLabel}`,
    location ? `Location: ${location}` : "",
  ].filter(Boolean);
  const attributes = record(source.attributes);

  return {
    id,
    slotId: id,
    name,
    type: "BOOKING",
    price: getPrice(source),
    description: descriptionParts.join("\n"),
    imageUrl: clean(source.imageUrl ?? attributes.imageUrl, 900),
  };
}
function mapGallery(
  id: string,
  source: Record<string, unknown>,
): GalleryItem | null {
  const url = clean(
    source.url ??
      source.imageUrl ??
      source.image_url ??
      source.image ??
      source.photoUrl,
    900,
  );
  if (!url) return null;
  return {
    id,
    url,
    alt:
      clean(source.alt ?? source.imageAlt ?? source.caption, 140) ||
      "Gallery image",
    caption: clean(source.caption ?? source.title ?? source.description, 220),
  };
}
function themeClasses(theme: string) {
  if (theme === "luxury") return "from-stone-950 via-amber-950 to-slate-950";
  if (theme === "bold") return "from-indigo-950 via-fuchsia-950 to-slate-950";
  if (theme === "clean") return "from-slate-900 via-slate-800 to-slate-950";
  return "from-slate-950 via-indigo-950 to-slate-900";
}
function normalizePage(value?: string): PublicPage {
  const page = (value || "home").toLowerCase().replace(/\s+/g, "-");
  if (
    page.includes("product") ||
    page.includes("categor") ||
    page.includes("cart") ||
    page.includes("checkout")
  )
    return "products";
  if (
    page.includes("service") ||
    page.includes("booking") ||
    page.includes("course") ||
    page.includes("class")
  )
    return "services";
  if (page.includes("gallery")) return "gallery";
  if (page.includes("quick") || page.includes("pay")) return "quick-pay";
  if (page.includes("contact")) return "contact";
  return "home";
}
function pagePath(slug: string, page: PublicPage) {
  return page === "home" ? `/sites/${slug}` : `/sites/${slug}/${page}`;
}
function pageLabel(page: PublicPage) {
  return page === "quick-pay"
    ? "Quick Pay"
    : page.charAt(0).toUpperCase() + page.slice(1);
}
function pageFromLabel(label: string): PublicPage | null {
  const value = label.toLowerCase();
  if (value.includes("home")) return "home";
  if (
    value.includes("product") ||
    value.includes("categor") ||
    value.includes("cart") ||
    value.includes("checkout")
  )
    return "products";
  if (
    value.includes("service") ||
    value.includes("booking") ||
    value.includes("course") ||
    value.includes("class")
  )
    return "services";
  if (value.includes("gallery")) return "gallery";
  if (value.includes("quick") || value.includes("pay")) return "quick-pay";
  if (value.includes("contact")) return "contact";
  return null;
}
function uniquePages(labels: string[]): PublicPage[] {
  const pages: PublicPage[] = ["home"];
  labels.forEach((label) => {
    const page = pageFromLabel(label);
    if (page && !pages.includes(page)) pages.push(page);
  });
  if (!pages.includes("contact")) pages.push("contact");
  return pages;
}

const TEMPLATE_LAYOUTS = new Set([
  "shop-classic",
  "travel-visa-consultancy",
  "beauty-booking",
  "ngo-impact",
  "school-academy",
  "services-booking",
  "restaurant-menu",
]);

function resolveTemplateLayout(settings: WebsiteSettings) {
  return (
    settings.layoutTemplate || settings.selectedTemplateId || settings.layoutKey
  );
}

function buildItemCheckoutUrl(storeId: string, item: PublicItem) {
  const params = new URLSearchParams({
    mode: item.type === "BOOKING" ? "booking" : "item",
    itemId: item.id,
    itemType: item.type,
    name: item.name,
    qty: "1",
  });
  if (item.slotId) params.set("slotId", item.slotId);
  return `https://pay.sedifex.com/s/${encodeURIComponent(storeId)}?${params.toString()}`;
}

function templatePublicCopy(layout: string, settings: WebsiteSettings) {
  const copy: Record<
    string,
    {
      eyebrow: string;
      primary: string;
      secondary: string;
      sections: string[];
      itemTitle: string;
    }
  > = {
    "shop-classic": {
      eyebrow: "Classic storefront",
      primary: "Shop products",
      secondary: "Pay securely",
      sections: ["Featured products", "Categories", "Checkout"],
      itemTitle: "Featured products",
    },
    "travel-visa-consultancy": {
      eyebrow: "Visa & travel consultancy",
      primary: "Request consultation",
      secondary: "Check services",
      sections: ["Visa support", "Travel packages", "Document checks"],
      itemTitle: "Travel and visa services",
    },
    "beauty-booking": {
      eyebrow: "Beauty booking studio",
      primary: "Book appointment",
      secondary: "View services",
      sections: ["Treatments", "Bookings", "Gallery"],
      itemTitle: "Beauty services",
    },
    "ngo-impact": {
      eyebrow: "Mission • Impact • Community",
      primary: "Donate now",
      secondary: "Volunteer",
      sections: ["Mission", "Impact", "Programs", "Donate", "Volunteer"],
      itemTitle: "Programs and support",
    },
    "school-academy": {
      eyebrow: "School academy",
      primary: "Register now",
      secondary: "View courses",
      sections: ["Courses", "Admissions", "Student payments"],
      itemTitle: "Courses and classes",
    },
    "services-booking": {
      eyebrow: "Service booking",
      primary: "Book service",
      secondary: "Request quote",
      sections: ["Services", "Booking", "Quick Pay"],
      itemTitle: "Services and bookings",
    },
    "restaurant-menu": {
      eyebrow: "Restaurant menu",
      primary: "View menu",
      secondary: "Order and pay",
      sections: ["Menu", "Specials", "Ordering"],
      itemTitle: "Menu highlights",
    },
  };
  return (
    copy[layout] || {
      eyebrow: settings.businessType || "Sedifex website",
      primary: "Contact us",
      secondary: "Quick Pay",
      sections: ["About", "Products", "Services"],
      itemTitle: "Featured items",
    }
  );
}

function TemplateHome({
  settings,
  profile,
  items,
  gallery,
  quickPayUrl,
  slug,
}: {
  settings: WebsiteSettings;
  profile: StoreProfile;
  items: PublicItem[];
  gallery: GalleryItem[];
  quickPayUrl: string;
  slug: string;
}) {
  const layout = resolveTemplateLayout(settings);
  const copy = templatePublicCopy(layout, settings);
  const isNgo = layout === "ngo-impact";
  const isRestaurant = layout === "restaurant-menu";
  const displayItems = isNgo
    ? items.filter((item) => item.type !== "PRODUCT")
    : items;
  const heroStyle = settings.coverImageUrl
    ? {
        backgroundImage: `linear-gradient(135deg, rgba(6, 78, 59, .9), rgba(15, 23, 42, .48)), url(${settings.coverImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;
  const whatsapp = profile.whatsapp || profile.phone;
  return (
    <>
      <section
        className={`${isNgo ? "bg-gradient-to-br from-emerald-950 via-teal-900 to-lime-800" : isRestaurant ? "bg-gradient-to-br from-stone-950 via-orange-950 to-amber-800" : "bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900"} px-4 py-24 text-white sm:px-6 lg:px-8`}
        style={heroStyle}
      >
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-100">
              {copy.eyebrow}
            </p>
            <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-7xl">
              {settings.tagline ||
                (isNgo ? `${profile.name} impact foundation` : profile.name)}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/85">
              {settings.description ||
                settings.contentDrafts.homepage ||
                (isNgo
                  ? "Explore our mission, active programs, donation needs, volunteer opportunities, and community impact."
                  : "Explore our website, services, products, gallery, contact details, and secure payment actions.")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="rounded-2xl bg-white px-6 py-3 font-semibold text-slate-950 no-underline"
                href={
                  isNgo
                    ? quickPayUrl
                    : pagePath(
                        slug,
                        displayItems.some((i) => i.type === "PRODUCT")
                          ? "products"
                          : "services",
                      )
                }
              >
                {copy.primary}
              </a>
              {whatsapp ? (
                <a
                  className="rounded-2xl border border-white/25 px-6 py-3 font-semibold text-white no-underline"
                  href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}`}
                >
                  WhatsApp
                </a>
              ) : (
                <Link
                  className="rounded-2xl border border-white/25 px-6 py-3 font-semibold text-white no-underline"
                  to={pagePath(slug, "contact")}
                >
                  {copy.secondary}
                </Link>
              )}
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-black">
              {isNgo ? "Impact pathways" : "Explore"}
            </h2>
            <div className="mt-5 grid gap-3 text-sm text-white/90">
              {copy.sections.map((section) => (
                <div
                  key={section}
                  className="rounded-2xl bg-white/10 p-4 font-semibold"
                >
                  {section}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      {isNgo ? (
        <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
            <ImpactCard
              title="Mission"
              body={
                settings.contentDrafts.about ||
                "Share the communities served, the mission, and the change this organization is building."
              }
            />
            <ImpactCard
              title="Donate"
              body="Support programs through Sedifex Quick Pay or contact the team for partnership options."
            />
            <ImpactCard
              title="Volunteer"
              body="Invite supporters to volunteer, partner, donate resources, or join community programs."
            />
          </div>
        </section>
      ) : null}
      {displayItems.length ? (
        <ServicesSection
          title={copy.itemTitle}
          items={displayItems.slice(0, isNgo ? 6 : 4)}
          quickPayUrl={quickPayUrl}
          ctaHref={pagePath(
            slug,
            displayItems.some((i) => i.type === "PRODUCT")
              ? "products"
              : "services",
          )}
          storeId={settings.storeId}
        />
      ) : (
        <section className="px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <EmptyState
              title={isNgo ? "No programs added yet" : "No items added yet"}
            />
          </div>
        </section>
      )}
      {gallery.length ? (
        <GallerySection
          gallery={gallery.slice(0, 6)}
          ctaHref={pagePath(slug, "gallery")}
        />
      ) : null}
      <QuickPayBlock quickPayUrl={quickPayUrl} />
      <ContactSection
        profile={profile}
        brandColor={settings.brandColor}
        quickPayUrl={quickPayUrl}
      />
    </>
  );
}

function ImpactCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-700">
        {title}
      </p>
      <p className="mt-3 text-slate-700">{body}</p>
    </article>
  );
}

export default function PublicWebsiteEngine() {
  const { slug = "", pageSlug } = useParams();
  const activePage = normalizePage(pageSlug);
  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [items, setItems] = useState<PublicItem[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadWebsite() {
      try {
        setLoading(true);
        setError(null);
        const websiteSnap = await getDocs(
          query(
            collection(db, "storeSettings"),
            where("websiteBuilder.slug", "==", slug),
            where("websiteBuilder.status", "==", "published"),
            limit(1),
          ),
        );
        if (websiteSnap.empty) {
          if (mounted) setError("This website is not published yet.");
          return;
        }
        const settingsDoc = websiteSnap.docs[0];
        const website = record(settingsDoc.data().websiteBuilder);
        const storeId = clean(website.storeId, 180) || settingsDoc.id;
        const storeSnap = await getDoc(doc(db, "stores", storeId));
        const storeData = storeSnap.exists() ? record(storeSnap.data()) : {};
        const publicProfile = record(storeData.publicProfile);
        const profileData: StoreProfile = {
          name:
            clean(
              publicProfile.displayName ??
                website.businessName ??
                storeData.businessName ??
                storeData.storeName ??
                storeData.name,
              220,
            ) || slug,
          logoUrl: clean(
            publicProfile.logoUrl ??
              website.businessLogoUrl ??
              storeData.logoUrl ??
              storeData.logo ??
              storeData.photoUrl,
            900,
          ),
          phone: clean(
            publicProfile.publicPhone ??
              website.phone ??
              storeData.phone ??
              storeData.businessPhone ??
              storeData.phoneNumber,
            80,
          ),
          whatsapp: clean(
            publicProfile.whatsappNumber ??
              website.whatsapp ??
              storeData.whatsapp ??
              storeData.whatsappNumber,
            80,
          ),
          email: clean(
            publicProfile.publicEmail ??
              website.email ??
              storeData.email ??
              storeData.businessEmail,
            220,
          ),
          address: clean(
            publicProfile.addressLine1 ??
              website.location ??
              storeData.address ??
              storeData.addressLine1 ??
              storeData.town ??
              storeData.city,
            260,
          ),
          openingHours: clean(
            publicProfile.openingHours ??
              website.openingHours ??
              storeData.openingHours,
            120,
          ),
        };
        const specs: Array<{ path: string; type: PublicItem["type"] }> = [
          { path: `stores/${storeId}/products`, type: "PRODUCT" },
          { path: `stores/${storeId}/services`, type: "SERVICE" },
          { path: `stores/${storeId}/courses`, type: "COURSE" },
        ];
        const itemGroups = await Promise.all(
          specs.map(async (spec) => {
            const snap = await getDocs(
              query(collection(db, spec.path), limit(40)),
            );
            return snap.docs
              .map((itemDoc) =>
                mapItem(
                  itemDoc.id,
                  itemDoc.data() as Record<string, unknown>,
                  spec.type,
                ),
              )
              .filter((item): item is PublicItem => Boolean(item));
          }),
        );
        const availabilitySnap = await getDocs(
          query(
            collection(db, "stores", storeId, "integrationAvailabilitySlots"),
            limit(80),
          ),
        );
        const availabilityItems = availabilitySnap.docs
          .map((slotDoc) =>
            mapAvailabilitySlot(
              slotDoc.id,
              slotDoc.data() as Record<string, unknown>,
            ),
          )
          .filter((item): item is PublicItem => Boolean(item));
        const gallerySnap = await getDocs(
          query(collection(db, "stores", storeId, "promoGallery"), limit(40)),
        );
        const galleryItems = gallerySnap.docs
          .map((itemDoc) =>
            mapGallery(itemDoc.id, itemDoc.data() as Record<string, unknown>),
          )
          .filter((item): item is GalleryItem => Boolean(item));
        if (!mounted) return;
        const contentDrafts = record(website.contentDrafts);
        const seoSettings = record(website.seoSettings);
        setSettings({
          storeId,
          businessName: profileData.name,
          slug,
          websiteType: clean(website.websiteType, 40) || "shop",
          businessType: clean(website.businessType, 80),
          theme: clean(website.theme, 40) || "modern",
          selectedTemplateId: clean(website.selectedTemplateId, 120),
          selectedTemplateName: clean(website.selectedTemplateName, 160),
          layoutKey: clean(
            website.layoutKey ?? website.layoutTemplate ?? website.templateKey,
            160,
          ),
          layoutTemplate: clean(
            website.layoutTemplate ??
              website.selectedTemplateId ??
              website.layoutKey,
            160,
          ),
          templateCategory: clean(
            website.templateCategory ?? website.businessType,
            160,
          ),
          selectedSections: Array.isArray(website.selectedSections)
            ? website.selectedSections.filter(
                (section): section is string => typeof section === "string",
              )
            : [],
          pages: Array.isArray(website.pages)
            ? website.pages.filter(
                (page): page is string => typeof page === "string",
              )
            : [
                "Home",
                "Products",
                "Services",
                "Gallery",
                "Contact",
                "Quick Pay",
              ],
          status: "published",
          tagline: clean(
            publicProfile.tagline ?? website.tagline ?? storeData.tagline,
            180,
          ),
          description: clean(
            publicProfile.businessDescription ??
              website.description ??
              contentDrafts.homepage ??
              storeData.description,
            600,
          ),
          brandColor: /^#[0-9a-f]{6}$/i.test(
            String(
              website.brandColor ||
                publicProfile.brandColor ||
                storeData.brandColor ||
                "",
            ),
          )
            ? String(
                website.brandColor ||
                  publicProfile.brandColor ||
                  storeData.brandColor,
              )
            : "#4f46e5",
          coverImageUrl: clean(
            publicProfile.coverImageUrl ??
              website.coverImageUrl ??
              storeData.coverImageUrl ??
              storeData.bannerImageUrl,
            900,
          ),
          contentDrafts: {
            homepage: clean(contentDrafts.homepage, 700),
            about: clean(contentDrafts.about, 700),
            serviceDescriptions: clean(contentDrafts.serviceDescriptions, 700),
            seoTitle: clean(contentDrafts.seoTitle, 220),
          },
          seoSettings: {
            title: clean(seoSettings.title, 220),
            metaDescription: clean(seoSettings.metaDescription, 320),
            keywords: clean(seoSettings.keywords, 320),
            socialShareImage: clean(seoSettings.socialShareImage, 900),
          },
        });
        setProfile(profileData);
        setItems([...itemGroups.flat(), ...availabilityItems]);
        setGallery(galleryItems);
      } catch (loadError) {
        console.error("[public-website] Unable to load website", loadError);
        if (mounted) setError("Unable to load this website.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadWebsite();
    return () => {
      mounted = false;
    };
  }, [slug]);

  const availablePages = useMemo(
    () => uniquePages(settings?.pages ?? []),
    [settings?.pages],
  );

  useEffect(() => {
    if (!settings || !profile) return;

    const siteName = profile.name || settings.businessName || "Sedifex website";
    const pageLabelText = pageLabel(activePage);
    const templateSeoTitle =
      settings.seoSettings.title || settings.contentDrafts.seoTitle;
    const pageTitle =
      activePage === "home"
        ? templateSeoTitle || siteName
        : `${siteName} | ${pageLabelText}`;
    const pageDescription =
      settings.seoSettings.metaDescription ||
      settings.description ||
      settings.contentDrafts.homepage ||
      `Explore ${siteName} — products, services, gallery, and secure payments.`;
    const pageUrl = typeof window !== "undefined" ? window.location.href : "";
    const imageUrl =
      settings.seoSettings.socialShareImage ||
      settings.coverImageUrl ||
      profile.logoUrl;

    document.title = pageTitle;

    const setMeta = (
      selector: string,
      attr: "name" | "property",
      value: string,
    ) => {
      let element = document.head.querySelector(selector);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(
          attr,
          selector.match(/=['\"]([^'\"]+)['\"]/)?.[1] || "",
        );
        document.head.appendChild(element);
      }
      element.setAttribute("content", value);
    };

    setMeta("meta[name='description']", "name", pageDescription);
    setMeta("meta[property='og:title']", "property", pageTitle);
    setMeta("meta[property='og:description']", "property", pageDescription);
    setMeta("meta[property='og:type']", "property", "website");
    if (pageUrl) setMeta("meta[property='og:url']", "property", pageUrl);
    if (imageUrl) setMeta("meta[property='og:image']", "property", imageUrl);
    setMeta(
      "meta[name='twitter:card']",
      "name",
      imageUrl ? "summary_large_image" : "summary",
    );
    setMeta("meta[name='twitter:title']", "name", pageTitle);
    setMeta("meta[name='twitter:description']", "name", pageDescription);
    if (imageUrl) setMeta("meta[name='twitter:image']", "name", imageUrl);
  }, [activePage, profile, settings]);

  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading website…
      </main>
    );
  if (error || !settings || !profile)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-white">
        <div className="max-w-lg rounded-3xl border border-white/10 bg-white/10 p-8">
          <h1 className="text-3xl font-black">Website unavailable</h1>
          <p className="mt-3 text-slate-300">
            {error ?? "This Sedifex website could not be found."}
          </p>
          <Link
            className="mt-6 inline-block rounded-2xl bg-white px-5 py-3 font-semibold text-slate-950"
            to="/"
          >
            Go home
          </Link>
        </div>
      </main>
    );

  const productItems = items.filter((item) => item.type === "PRODUCT");
  const serviceItems = items.filter((item) => item.type !== "PRODUCT");
  const quickPayUrl = `https://pay.sedifex.com/s/${encodeURIComponent(settings.storeId)}?mode=store`;

  const resolvedLayout = resolveTemplateLayout(settings);
  const usesTemplateLayout = TEMPLATE_LAYOUTS.has(resolvedLayout);

  const heroStyle = settings.coverImageUrl
    ? {
        backgroundImage: `linear-gradient(135deg, rgba(2, 6, 23, .88), rgba(15, 23, 42, .48)), url(${settings.coverImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 text-white backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link
            to={pagePath(slug, "home")}
            className="flex items-center gap-3 text-white no-underline"
          >
            {profile.logoUrl ? (
              <SafeFirebaseImage
                src={profile.logoUrl}
                alt={`${profile.name} logo`}
                className="h-11 w-11 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 font-black">
                {profile.name.slice(0, 1)}
              </div>
            )}
            <span className="font-black">{profile.name}</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {availablePages.map((page) => (
              <Link
                key={page}
                className={`rounded-full px-4 py-2 font-semibold no-underline ${activePage === page ? "bg-white text-slate-950" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
                to={pagePath(slug, page)}
              >
                {pageLabel(page)}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {activePage === "home" && usesTemplateLayout ? (
        <TemplateHome
          settings={settings}
          profile={profile}
          items={items}
          gallery={gallery}
          quickPayUrl={quickPayUrl}
          slug={slug}
        />
      ) : null}
      {activePage === "home" && !usesTemplateLayout ? (
        <>
          <section
            className={`bg-gradient-to-br ${themeClasses(settings.theme)} px-4 py-24 text-white sm:px-6 lg:px-8`}
            style={heroStyle}
          >
            <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">
                  {settings.businessType || settings.websiteType + " website"}
                </p>
                <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-7xl">
                  {settings.tagline || profile.name}
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-200">
                  {settings.description ||
                    settings.contentDrafts.homepage ||
                    "Discover our products, services, bookings, and secure payments — powered by Sedifex."}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    className="rounded-2xl bg-white px-6 py-3 font-semibold text-slate-950 no-underline"
                    to={pagePath(slug, "products")}
                  >
                    View products
                  </Link>
                  <Link
                    className="rounded-2xl border border-white/20 px-6 py-3 font-semibold text-white no-underline"
                    to={pagePath(slug, "contact")}
                  >
                    Contact us
                  </Link>
                </div>
              </div>
              <div className="rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
                <h2 className="text-2xl font-black">Explore this website</h2>
                <div className="mt-5 grid gap-3 text-sm text-slate-200">
                  {availablePages.map((page) => (
                    <Link
                      key={page}
                      to={pagePath(slug, page)}
                      className="rounded-2xl bg-white/10 p-4 font-semibold text-white no-underline hover:bg-white/20"
                    >
                      {pageLabel(page)}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
          {productItems.length ? (
            <ProductsSection
              title="Featured products"
              items={productItems.slice(0, 4)}
              quickPayUrl={quickPayUrl}
              ctaHref={pagePath(slug, "products")}
              storeId={settings.storeId}
            />
          ) : null}
          {serviceItems.length ? (
            <ServicesSection
              title="Featured services"
              items={serviceItems.slice(0, 3)}
              quickPayUrl={quickPayUrl}
              ctaHref={pagePath(slug, "services")}
              storeId={settings.storeId}
            />
          ) : null}
          {gallery.length ? (
            <GallerySection
              gallery={gallery.slice(0, 6)}
              ctaHref={pagePath(slug, "gallery")}
            />
          ) : null}
          <QuickPayBlock quickPayUrl={quickPayUrl} />
        </>
      ) : null}
      {activePage === "products" ? (
        <ProductsSection
          title="Products"
          items={productItems}
          quickPayUrl={quickPayUrl}
          storeId={settings.storeId}
        />
      ) : null}
      {activePage === "services" ? (
        <ServicesSection
          title="Services, courses & bookings"
          items={serviceItems}
          quickPayUrl={quickPayUrl}
          storeId={settings.storeId}
        />
      ) : null}
      {activePage === "gallery" ? <GallerySection gallery={gallery} /> : null}
      {activePage === "quick-pay" ? (
        <QuickPayBlock quickPayUrl={quickPayUrl} large />
      ) : null}
      {activePage === "contact" ? (
        <ContactSection
          profile={profile}
          brandColor={settings.brandColor}
          quickPayUrl={quickPayUrl}
        />
      ) : null}
      <footer className="bg-slate-950 px-4 py-8 text-center text-sm text-slate-400">
        Powered by Sedifex
      </footer>
    </main>
  );
}

function ProductsSection({
  title,
  items,
  quickPayUrl,
  ctaHref,
  storeId,
}: {
  title: string;
  items: PublicItem[];
  quickPayUrl: string;
  ctaHref?: string;
  storeId: string;
}) {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">
              Products
            </p>
            <h2 className="mt-3 text-4xl font-black">{title}</h2>
          </div>
          {ctaHref ? (
            <Link
              className="rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white no-underline"
              to={ctaHref}
            >
              View all
            </Link>
          ) : null}
        </div>
        {items.length ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                quickPayUrl={quickPayUrl}
                itemCheckoutUrl={buildItemCheckoutUrl(storeId, item)}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No products yet" />
        )}
      </div>
    </section>
  );
}
function ServicesSection({
  title,
  items,
  quickPayUrl,
  ctaHref,
  storeId,
}: {
  title: string;
  items: PublicItem[];
  quickPayUrl: string;
  ctaHref?: string;
  storeId: string;
}) {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">
              Services
            </p>
            <h2 className="mt-3 text-4xl font-black">{title}</h2>
          </div>
          {ctaHref ? (
            <Link
              className="rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white no-underline"
              to={ctaHref}
            >
              View all
            </Link>
          ) : null}
        </div>
        {items.length ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                quickPayUrl={quickPayUrl}
                itemCheckoutUrl={buildItemCheckoutUrl(storeId, item)}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No services yet" />
        )}
      </div>
    </section>
  );
}
function GallerySection({
  gallery,
  ctaHref,
}: {
  gallery: GalleryItem[];
  ctaHref?: string;
}) {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">
              Gallery
            </p>
            <h2 className="mt-3 text-4xl font-black">Photos & highlights</h2>
          </div>
          {ctaHref ? (
            <Link
              className="rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white no-underline"
              to={ctaHref}
            >
              Open gallery
            </Link>
          ) : null}
        </div>
        {gallery.length ? (
          <div className="mt-8 grid auto-rows-[220px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((item, index) => (
              <figure
                key={item.id}
                className={`group overflow-hidden rounded-[2rem] bg-slate-200 shadow-sm ${index === 0 ? "lg:col-span-2 lg:row-span-2" : ""}`}
              >
                <SafeFirebaseImage
                  src={item.url}
                  alt={item.alt}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                {item.caption ? (
                  <figcaption className="-mt-16 bg-gradient-to-t from-slate-950/80 to-transparent p-4 text-sm font-semibold text-white">
                    {item.caption}
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        ) : (
          <EmptyState title="No gallery images yet" />
        )}
      </div>
    </section>
  );
}
function QuickPayBlock({
  quickPayUrl,
  large = false,
}: {
  quickPayUrl: string;
  large?: boolean;
}) {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <div
        className={`mx-auto flex max-w-5xl flex-col items-center rounded-[2rem] bg-slate-950 p-8 text-center text-white shadow-2xl ${large ? "min-h-[420px] justify-center" : ""}`}
      >
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">
          Quick Pay
        </p>
        <h2 className="mt-3 text-4xl font-black">Search and pay securely</h2>
        <p className="mt-4 max-w-2xl text-slate-300">
          Use Sedifex Quick Pay for products, services, courses, or custom
          requests.
        </p>
        <a
          className="mt-6 rounded-2xl bg-white px-6 py-3 font-semibold text-slate-950 no-underline"
          href={quickPayUrl}
        >
          Open Quick Pay
        </a>
      </div>
    </section>
  );
}
function ContactSection({
  profile,
  brandColor,
  quickPayUrl,
}: {
  profile: StoreProfile;
  brandColor: string;
  quickPayUrl: string;
}) {
  const whatsapp = profile.whatsapp || profile.phone;
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 rounded-[2rem] bg-white p-8 shadow-sm lg:grid-cols-[1fr_0.8fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">
            Contact
          </p>
          <h1 className="mt-3 text-5xl font-black">Reach {profile.name}</h1>
          <p className="mt-4 text-slate-600">
            Contact us for enquiries, bookings, payments, and business support.
          </p>
          <div className="mt-8 grid gap-4 text-slate-700 sm:grid-cols-2">
            <p>
              <strong>Phone</strong>
              <br />
              {profile.phone || "Not added yet"}
            </p>
            <p>
              <strong>Email</strong>
              <br />
              {profile.email || "Not added yet"}
            </p>
            <p>
              <strong>Location</strong>
              <br />
              {profile.address || "Not added yet"}
            </p>
            <p>
              <strong>Opening hours</strong>
              <br />
              {profile.openingHours || "Not added yet"}
            </p>
          </div>
        </div>
        <div className="rounded-[2rem] bg-slate-50 p-6">
          <h2 className="text-2xl font-black">Quick actions</h2>
          <div className="mt-5 grid gap-3">
            {whatsapp ? (
              <a
                className="rounded-2xl px-5 py-3 text-center font-semibold text-white no-underline"
                style={{ backgroundColor: brandColor }}
                href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}`}
              >
                Chat on WhatsApp
              </a>
            ) : null}
            <a
              className="rounded-2xl bg-slate-950 px-5 py-3 text-center font-semibold text-white no-underline"
              href={quickPayUrl}
            >
              Make payment
            </a>
            {profile.email ? (
              <a
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center font-semibold text-slate-950 no-underline"
                href={`mailto:${profile.email}`}
              >
                Send email
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
function EmptyState({ title }: { title: string }) {
  return (
    <div className="mt-8 rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
      <h3 className="text-xl font-black text-slate-900">{title}</h3>
      <p className="mt-2">The business has not published this content yet.</p>
    </div>
  );
}
function ItemCard({
  item,
  quickPayUrl,
  itemCheckoutUrl,
}: {
  item: PublicItem;
  quickPayUrl: string;
  itemCheckoutUrl: string;
}) {
  const actionLabel =
    item.type === "PRODUCT"
      ? "Buy now"
      : item.type === "COURSE"
        ? "Register"
        : item.type === "BOOKING"
          ? "Book event"
          : "Book now";

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      {item.imageUrl ? (
        <SafeFirebaseImage
          src={item.imageUrl}
          alt={item.name}
          className="h-48 w-full object-cover"
        />
      ) : (
        <div className="flex h-48 w-full items-center justify-center bg-slate-100 text-4xl font-black text-slate-300">
          {item.name.slice(0, 1)}
        </div>
      )}

      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          {item.type}
        </p>
        <h3 className="mt-2 text-lg font-black">{item.name}</h3>

        {item.description ? (
          <p className="mt-2 text-sm text-slate-600">{item.description}</p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <strong>{item.price > 0 ? money(item.price) : "Enquire"}</strong>

          <div className="flex flex-wrap justify-end gap-2">
            <a
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white no-underline"
              href={itemCheckoutUrl}
            >
              {actionLabel}
            </a>

            <a
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 no-underline"
              href={quickPayUrl}
            >
              Pay custom
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
