import React, { useMemo, useState } from "react";

type WebsiteType =
  | "shop"
  | "beauty"
  | "school"
  | "travel"
  | "ngo"
  | "restaurant"
  | "service";
type WebsiteTheme = "modern" | "luxury" | "clean" | "bold";

type ContentDrafts = {
  homepage: string;
  about: string;
  serviceDescriptions: string;
  seoTitle: string;
};
type SeoTemplateSettings = {
  title: string;
  metaDescription: string;
  keywords: string;
};

type TemplatePreset = {
  id: string;
  name: string;
  websiteType: WebsiteType;
  businessType: string;
  theme: WebsiteTheme;
  layoutKey: string;
  brandColor: string;
  pages: string[];
  selectedSections: string[];
  tagline: string;
  description: string;
  contentDrafts: ContentDrafts;
  seoSettings: SeoTemplateSettings;
};

type TemplateSelection = TemplatePreset;

type Props = {
  selectedTemplateId: string | null;
  selectedTemplateName: string | null;
  onApplyTemplate: (template: TemplateSelection) => void;
  onPreviewWithMyData: () => void;
};

const TEMPLATES: TemplatePreset[] = [
  {
    id: "beauty-booking",
    name: "Beauty Booking",
    websiteType: "beauty",
    businessType: "Beauty / salon website",
    theme: "luxury",
    layoutKey: "beauty-booking",
    brandColor: "#a855f7",
    pages: [
      "Home",
      "Services",
      "Bookings",
      "Gallery",
      "Client reviews",
      "Quick Pay",
      "Contact",
    ],
    selectedSections: [
      "hero",
      "services",
      "bookings",
      "gallery",
      "reviews",
      "quick-pay",
      "contact",
    ],
    tagline: "Beauty services designed around confidence and care",
    description:
      "A polished salon website focused on premium services, simple appointment requests, client trust, and secure Quick Pay.",
    contentDrafts: {
      homepage:
        "Welcome clients with your signature beauty services, easy booking options, real gallery highlights, and secure payment actions in one elegant website.",
      about:
        "Share the care, standards, and experience behind your beauty business so clients know what to expect before they book.",
      serviceDescriptions:
        "Describe your treatments, packages, consultation options, appointment process, and after-care support in a clear premium style.",
      seoTitle: "Beauty Services, Salon Bookings & Quick Pay",
    },
    seoSettings: {
      title: "Beauty Services, Salon Bookings & Quick Pay",
      metaDescription:
        "Book beauty and wellness services, explore salon packages, view gallery highlights, and pay securely online.",
      keywords: "beauty services, salon bookings, wellness, gallery, quick pay",
    },
  },
  {
    id: "shop-classic",
    name: "Shop Classic",
    websiteType: "shop",
    businessType: "Shop website",
    theme: "modern",
    layoutKey: "shop-classic",
    brandColor: "#4f46e5",
    pages: [
      "Home",
      "Products",
      "Categories",
      "Cart / Checkout",
      "Quick Pay",
      "Contact",
    ],
    selectedSections: [
      "hero",
      "featured-products",
      "categories",
      "checkout",
      "quick-pay",
      "contact",
    ],
    tagline: "Shop quality products with easy online payment",
    description:
      "A clean storefront layout for products, categories, checkout actions, Quick Pay, and customer enquiries.",
    contentDrafts: {
      homepage:
        "Show customers your best products, highlight trusted categories, and guide them from discovery to checkout or Quick Pay without friction.",
      about:
        "Tell shoppers what makes your store reliable, how you source or prepare products, and how customers can buy with confidence.",
      serviceDescriptions:
        "Organize product categories, featured items, delivery or pickup notes, checkout steps, and payment instructions.",
      seoTitle: "Online Store, Products & Secure Checkout",
    },
    seoSettings: {
      title: "Online Store, Products & Secure Checkout",
      metaDescription:
        "Shop products, browse categories, contact the store, and complete secure checkout or Quick Pay online.",
      keywords: "online shop, products, categories, checkout, quick pay",
    },
  },
  {
    id: "school-academy",
    name: "School Academy",
    websiteType: "school",
    businessType: "School website",
    theme: "clean",
    layoutKey: "school-academy",
    brandColor: "#2563eb",
    pages: [
      "Home",
      "Courses",
      "Registration",
      "Classes",
      "Student payments",
      "Contact",
    ],
    selectedSections: [
      "hero",
      "courses",
      "registration",
      "classes",
      "student-payments",
      "contact",
    ],
    tagline: "Learn, register, and manage classes with ease",
    description:
      "A structured school website for courses, registration, class information, student payments, and parent enquiries.",
    contentDrafts: {
      homepage:
        "Help students and parents understand your courses, registration steps, class updates, and payment options from a simple school website.",
      about:
        "Introduce your learning approach, student support, class structure, and the values that make your school trusted.",
      serviceDescriptions:
        "Describe courses, registration requirements, class schedules, student payment steps, and how families can contact the school.",
      seoTitle: "Courses, Registration & Student Payments",
    },
    seoSettings: {
      title: "Courses, Registration & Student Payments",
      metaDescription:
        "Explore courses and classes, register students, contact the school, and manage student payments online.",
      keywords: "courses, registration, classes, school, student payments",
    },
  },
  {
    id: "travel-visa-consultancy",
    name: "Travel Visa Consultancy",
    websiteType: "travel",
    businessType: "Travel / visa consultancy website",
    theme: "modern",
    layoutKey: "travel-visa-consultancy",
    brandColor: "#0891b2",
    pages: ["Home", "Services", "Bookings", "Gallery", "Blog", "Quick Pay", "Contact"],
    selectedSections: ["hero", "destinations", "visa-services", "consultation", "gallery", "quick-pay", "contact"],
    tagline: "Visa, travel, and consultation support made simple",
    description: "A consultation-led travel layout for visa services, packages, enquiry actions, documents guidance, and Quick Pay.",
    contentDrafts: {
      homepage: "Guide travellers from enquiry to consultation with clear visa services, destinations, documents support, and secure Sedifex payment actions.",
      about: "Share your travel expertise, consultation process, destination knowledge, and customer support standards.",
      serviceDescriptions: "List visa support, travel packages, ticketing, hotel support, document checks, consultations, and booking requirements.",
      seoTitle: "Visa Consultancy, Travel Services & Bookings",
    },
    seoSettings: {
      title: "Visa Consultancy, Travel Services & Bookings",
      metaDescription: "Get visa support, travel consultation, destination guidance, bookings, and secure online payments.",
      keywords: "visa consultancy, travel agency, bookings, destinations, quick pay",
    },
  },
  {
    id: "ngo-impact",
    name: "NGO Impact",
    websiteType: "ngo",
    businessType: "NGO / foundation website",
    theme: "clean",
    layoutKey: "ngo-impact",
    brandColor: "#16a34a",
    pages: ["Home", "Programs", "Donate", "Volunteer", "Blog", "Gallery", "Contact", "Quick Pay"],
    selectedSections: ["hero", "mission", "impact", "programs", "donation", "volunteer", "gallery", "quick-pay", "contact"],
    tagline: "Mobilizing people and resources for measurable impact",
    description: "An impact-first NGO layout for mission, programs, donations, volunteers, stories, gallery, contact, and Quick Pay.",
    contentDrafts: {
      homepage: "Show your mission, active programs, community impact, donation options, volunteer calls, and transparent contact actions in one trustworthy website.",
      about: "Explain the purpose, communities served, program model, accountability, and change your organization is building.",
      serviceDescriptions: "Present programs, beneficiary support, campaigns, volunteer roles, donation needs, events, and partner opportunities.",
      seoTitle: "NGO Programs, Donations & Volunteer Support",
    },
    seoSettings: {
      title: "NGO Programs, Donations & Volunteer Support",
      metaDescription: "Support community programs, donate securely, volunteer, read impact stories, and contact the foundation.",
      keywords: "NGO, foundation, charity, donations, volunteer, community impact",
    },
  },
  {
    id: "services-booking",
    name: "Services Booking",
    websiteType: "service",
    businessType: "Services / appointments website",
    theme: "bold",
    layoutKey: "services-booking",
    brandColor: "#7c3aed",
    pages: ["Home", "Services", "Bookings", "Quick Pay", "Gallery", "Contact"],
    selectedSections: ["hero", "services", "booking", "process", "quick-pay", "contact"],
    tagline: "Book trusted services and pay securely",
    description: "A booking-focused layout for service packages, appointment requests, trust points, Quick Pay, and contact actions.",
    contentDrafts: {
      homepage: "Help customers understand your services, choose the right package, request a booking, chat on WhatsApp, and pay securely.",
      about: "Show your experience, response times, customer care, and service standards.",
      serviceDescriptions: "Describe service packages, booking requirements, availability, quote requests, deposits, and payment steps.",
      seoTitle: "Professional Services, Bookings & Quick Pay",
    },
    seoSettings: { title: "Professional Services, Bookings & Quick Pay", metaDescription: "Book services, request quotes, contact the business, and pay securely online.", keywords: "services, booking, appointments, quotes, quick pay" },
  },
  {
    id: "restaurant-menu",
    name: "Restaurant Menu",
    websiteType: "restaurant",
    businessType: "Restaurant / menu website",
    theme: "luxury",
    layoutKey: "restaurant-menu",
    brandColor: "#ea580c",
    pages: ["Home", "Menu", "Ordering", "Gallery", "Quick Pay", "Contact"],
    selectedSections: ["hero", "menu", "ordering", "specials", "gallery", "quick-pay", "contact"],
    tagline: "Explore the menu, order, and pay with ease",
    description: "A food-first layout for menu highlights, ordering actions, specials, photos, opening hours, and Quick Pay.",
    contentDrafts: {
      homepage: "Make customers hungry with menu highlights, specials, food gallery, order actions, contact details, and secure payments.",
      about: "Share your cuisine, kitchen story, dining style, and service promise.",
      serviceDescriptions: "List menu categories, signature meals, ordering options, delivery or pickup notes, reservations, and payment steps.",
      seoTitle: "Restaurant Menu, Ordering & Quick Pay",
    },
    seoSettings: { title: "Restaurant Menu, Ordering & Quick Pay", metaDescription: "View menu items, order food, see gallery highlights, contact the restaurant, and pay online.", keywords: "restaurant, menu, food ordering, reservations, quick pay" },
  },
];

export default function WebsiteBuilderAssistantPanel({
  selectedTemplateId,
  selectedTemplateName,
  onApplyTemplate,
  onPreviewWithMyData,
}: Props) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const activeTemplateLabel = selectedTemplateName
    ? `Current template: ${selectedTemplateName}`
    : "No template selected yet";

  const templateCards = useMemo(
    () =>
      TEMPLATES.map((template) => {
        const isActive = selectedTemplateId === template.id;
        return (
          <article
            key={template.id}
            className={`rounded-2xl border p-4 ${isActive ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}
          >
            <h4 className="text-base font-semibold text-slate-950">
              {template.name}
            </h4>
            <p className="mt-1 text-sm text-slate-600">
              Type: {template.businessType} • Theme: {template.theme}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {template.pages.join(" • ")}
            </p>
            <button
              type="button"
              className={`mt-4 rounded-xl px-3 py-2 text-sm font-bold ${isActive ? "bg-emerald-600 text-white" : "bg-slate-900 text-white"}`}
              onClick={() => {
                onApplyTemplate(template);
                setStatusMessage(`${template.name} template applied. Preview now uses this design.`);
                window.setTimeout(() => setStatusMessage(null), 2500);
              }}
            >
              {isActive ? `Now using ${template.name}` : "Use template"}
            </button>
          </article>
        );
      }),
    [onApplyTemplate, selectedTemplateId],
  );

  return (
    <section className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-indigo-800">
          {activeTemplateLabel}
        </p>
        {selectedTemplateName ? (
          <button
            type="button"
            className="text-xs font-semibold text-indigo-700 underline"
            onClick={() => setStatusMessage("Choose another template below.")}
          >
            Change template
          </button>
        ) : null}
      </div>
      {statusMessage ? (
        <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {statusMessage || "Template applied successfully."}
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">{templateCards}</div>
      {selectedTemplateId ? (
        <button
          type="button"
          onClick={onPreviewWithMyData}
          className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white"
        >
          Preview with my data
        </button>
      ) : null}
    </section>
  );
}
