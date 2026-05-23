import React, { useCallback, useState } from 'react'
import WebsiteBuilder from './WebsiteBuilder'

type SmartWebsiteCopy = {
  seoTitle: string
  homepage: string
  about: string
  serviceDescriptions: string
}

type BusinessProfile = {
  businessName: string
  location: string
  businessType: 'language_school' | 'school' | 'beauty' | 'travel' | 'ngo' | 'restaurant' | 'shop' | 'service'
}

function findButtonByText(text: string) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
  return buttons.find(button => button.textContent?.toLowerCase().includes(text.toLowerCase())) ?? null
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function pageText() {
  return normalizeText(document.body.innerText || '')
}

function findFirstUsefulMatch(patterns: RegExp[]) {
  const text = pageText()
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = normalizeText(match?.[1] || '')
    if (value && value.length <= 120) return value
  }
  return ''
}

function getInputValueNearLabel(labelText: string) {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'))
  const label = labels.find(item => item.textContent?.toLowerCase().includes(labelText.toLowerCase()))
  const input = label?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  return normalizeText(input?.value || '')
}

function inferBusinessProfile(): BusinessProfile {
  const body = pageText().toLowerCase()
  const businessName =
    getInputValueNearLabel('Business name') ||
    findFirstUsefulMatch([/Current website\s+([^\n]+?)\s+https?:/i, /Preview\s+Home page preview.*?([A-Z][^\n]{3,80})/i]) ||
    'This business'
  const location = getInputValueNearLabel('Location') || findFirstUsefulMatch([/Location\s+([^\n]{2,80})/i])
  const combined = `${businessName} ${body}`.toLowerCase()

  let businessType: BusinessProfile['businessType'] = 'service'
  if (/learn|language|german|deutsch|academy|education|school|course|class|student|training/.test(combined)) businessType = /language|german|deutsch/.test(combined) ? 'language_school' : 'school'
  else if (/beauty|spa|salon|makeup|nail|hair|lash|facial|massage/.test(combined)) businessType = 'beauty'
  else if (/travel|visa|tour|relocation|consultancy|admission|document review/.test(combined)) businessType = 'travel'
  else if (/foundation|ngo|donation|volunteer|impact|charity/.test(combined)) businessType = 'ngo'
  else if (/restaurant|food|menu|ordering|reservation/.test(combined)) businessType = 'restaurant'
  else if (/shop|store|products|checkout|inventory|market/.test(combined)) businessType = 'shop'

  return { businessName, location, businessType }
}

function locationPhrase(location: string) {
  return location ? ` in ${location}` : ''
}

function buildSmartCopy(profile: BusinessProfile): SmartWebsiteCopy {
  const name = profile.businessName || 'This business'
  const where = locationPhrase(profile.location)

  if (profile.businessType === 'language_school') {
    return {
      seoTitle: `${name} | German & Language Courses, Exam Preparation and Study Support`,
      homepage: `${name} helps students build real language confidence through clear lessons, practical speaking practice, exam preparation, and guided learning support. Whether you are starting from A1 or preparing for higher-level German exams, our classes are structured to help you understand the language, speak with confidence, and stay consistent until you reach your goal.${where ? ` We support learners${where} and beyond with flexible learning options.` : ''}`,
      about: `${name} is a language education academy focused on helping students learn German and other language skills in a practical, organized, and supportive way. Our approach combines grammar, vocabulary, speaking, listening, reading, writing, assignments, and exam guidance so students do not only memorize words, but learn how to communicate. We support beginners, continuing learners, exam candidates, and people preparing for study, work, travel, or relocation opportunities.`,
      serviceDescriptions: `German Language Courses: Structured A1, A2, B1, B2, and advanced learning paths designed to help students move step by step from beginner level to confident communication.\n\nExam Preparation: Focused support for Goethe-style speaking, writing, reading, and listening tasks, including practice prompts, corrections, feedback, and exam readiness guidance.\n\nSpeaking and Writing Practice: Practical exercises that help students form sentences, answer questions, write emails, describe situations, and speak more naturally.\n\nStudent Registration and Payments: Students can register online, select a course, receive updates, and make payments easily through the website.\n\nLearning Support: Guidance for students who need help choosing the right level, preparing documents, understanding class schedules, or staying on track with assignments.`
    }
  }

  if (profile.businessType === 'school') {
    return {
      seoTitle: `${name} | Courses, Registration, Classes and Student Payments`,
      homepage: `${name} provides practical training and organized learning programs for students who want clear instruction, simple registration, and reliable support. The website helps students explore available courses, understand class options, register online, and make payments with ease${where}.`,
      about: `${name} is built around structured learning, student support, and clear communication. We help learners choose the right program, follow class schedules, receive guidance, and complete their training with confidence. Our goal is to make education more accessible, organized, and easier to manage for both students and administrators.`,
      serviceDescriptions: `Courses and Training Programs: Clear course information, duration, fees, and learning outcomes so students know exactly what they are registering for.\n\nStudent Registration: A simple online registration flow that captures student details and sends them into Sedifex for easy management.\n\nClass Management: Organized class schedules, student records, and payment tracking for smoother school operations.\n\nStudent Payments: Online and manual payment support with receipts, balances, and student records connected in one place.`
    }
  }

  if (profile.businessType === 'beauty') {
    return {
      seoTitle: `${name} | Beauty Services, Training, Bookings and Client Care`,
      homepage: `${name} offers professional beauty, wellness, and personal care services designed to help clients look confident and feel cared for. Visitors can explore services, view training programs, book appointments, and make payments easily${where}.`,
      about: `${name} combines skill, care, and modern beauty service delivery. We serve clients who want reliable treatments, quality results, and a professional experience from booking to aftercare. For training programs, we also help students learn practical beauty skills with structured guidance.`,
      serviceDescriptions: `Beauty Services: Professional treatments designed around client confidence, hygiene, comfort, and visible results.\n\nBookings: Clients can request appointments and connect with the team quickly.\n\nTraining Courses: Practical beauty and cosmetology courses for students who want to build hands-on skills.\n\nPayments: Easy online payment and receipt support for services, courses, and bookings.`
    }
  }

  if (profile.businessType === 'travel') {
    return {
      seoTitle: `${name} | Travel, Visa, Study Abroad and Relocation Support`,
      homepage: `${name} helps clients plan travel, study, visa, and relocation steps with clearer guidance and organized support. Visitors can explore services, request consultations, send enquiries, and take the next step with confidence${where}.`,
      about: `${name} supports people who need trusted guidance for travel, education, documents, applications, and relocation planning. We focus on making the process easier to understand, helping clients avoid confusion, and guiding them toward the right pathway.`,
      serviceDescriptions: `Consultation: One-on-one guidance to understand your goals, documents, and best available pathway.\n\nAdmission and Document Review: Support with applications, document preparation, and readiness checks.\n\nVisa Readiness: Guidance to help clients prepare stronger and more organized visa applications.\n\nTravel and Relocation Support: Practical information and support from enquiry to next steps.`
    }
  }

  if (profile.businessType === 'ngo') {
    return {
      seoTitle: `${name} | Community Programs, Donations and Volunteer Support`,
      homepage: `${name} supports communities through programs, partnerships, donations, and volunteer-driven impact. The website helps visitors understand the mission, follow ongoing projects, donate, volunteer, and stay connected${where}.`,
      about: `${name} exists to create meaningful impact through practical community support. We work with people, partners, volunteers, and donors to respond to real needs and make every contribution count.`,
      serviceDescriptions: `Programs: Community initiatives designed to create practical impact.\n\nDonations: A simple way for supporters to contribute to ongoing work.\n\nVolunteers: Opportunities for people to offer time, skills, and support.\n\nImpact Updates: Stories, reports, and project updates that show how support is being used.`
    }
  }

  if (profile.businessType === 'shop') {
    return {
      seoTitle: `${name} | Products, Online Orders and Secure Payments`,
      homepage: `${name} makes it easy for customers to browse products, check availability, place orders, and pay online. The website connects product discovery, checkout, receipts, and business inventory in one smooth experience${where}.`,
      about: `${name} is focused on giving customers a simpler and more reliable shopping experience. We make it easier to see available products, contact the business, pay securely, and receive updates quickly.`,
      serviceDescriptions: `Products: Organized product listings with clear details and pricing.\n\nOnline Checkout: Customers can order and pay without long back-and-forth conversations.\n\nReceipts: Buyers receive payment confirmation and receipts.\n\nInventory Updates: Sales can connect back to Sedifex so stock records stay easier to manage.`
    }
  }

  if (profile.businessType === 'restaurant') {
    return {
      seoTitle: `${name} | Menu, Ordering, Reservations and Payments`,
      homepage: `${name} helps customers view the menu, place orders, make reservations, and connect with the restaurant faster. The website makes dining and ordering more convenient${where}.`,
      about: `${name} serves customers who want good food, clear menu options, and a smooth ordering experience. We make it easier to explore meals, contact the team, and complete orders with less stress.`,
      serviceDescriptions: `Menu: Clear food and drink options for customers to browse.\n\nOnline Ordering: A simple way to send orders and enquiries.\n\nReservations: Customers can request tables or event bookings.\n\nPayments: Easy payment options for orders, bookings, and services.`
    }
  }

  return {
    seoTitle: `${name} | Services, Bookings, Enquiries and Payments`,
    homepage: `${name} helps customers understand available services, request support, book appointments, and make payments with ease. The website brings the most important business actions into one simple place${where}.`,
    about: `${name} is built around reliable service, clear communication, and a smoother customer experience. We help visitors understand what we offer, why it matters, and how to take action without confusion.`,
    serviceDescriptions: `Services: Clear descriptions of what customers can request and how each service helps.\n\nBookings and Enquiries: Simple ways for visitors to contact the business or request support.\n\nPayments and Receipts: Easy payment options with records connected to Sedifex.\n\nCustomer Support: Better communication through phone, WhatsApp, email, and website contact actions.`
  }
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setFieldByLabel(labelText: string, value: string) {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'))
  const label = labels.find(item => item.textContent?.toLowerCase().includes(labelText.toLowerCase()))
  const field = label?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  if (!field) return false
  setNativeValue(field, value)
  return true
}

function applySmartCopy(copy: SmartWebsiteCopy) {
  setFieldByLabel('SEO title', copy.seoTitle)
  setFieldByLabel('Homepage content', copy.homepage)
  setFieldByLabel('About section', copy.about)
  setFieldByLabel('Service / product / program descriptions', copy.serviceDescriptions)
}

export default function WebsiteBuilderWithAiText() {
  const [statusMessage, setStatusMessage] = useState('')

  const generateAiText = useCallback(() => {
    setStatusMessage('Opening smarter content generator…')

    const contentStepButton = findButtonByText('Content')
    contentStepButton?.click()

    window.setTimeout(() => {
      const generateButton = findButtonByText('Generate all content')
      if (!generateButton) {
        setStatusMessage('Open the Content step, then click AI text again.')
        window.setTimeout(() => setStatusMessage(''), 3000)
        return
      }

      generateButton.click()

      window.setTimeout(() => {
        const profile = inferBusinessProfile()
        const smartCopy = buildSmartCopy(profile)
        applySmartCopy(smartCopy)
        setStatusMessage(`Smarter ${profile.businessType.replace('_', ' ')} website text generated.`)
        window.setTimeout(() => setStatusMessage(''), 3500)
      }, 220)
    }, 180)
  }, [])

  return (
    <>
      <WebsiteBuilder />
      <div className="fixed bottom-24 right-5 z-50 flex max-w-[260px] flex-col items-end gap-2 md:bottom-8">
        {statusMessage ? (
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl">
            {statusMessage}
          </div>
        ) : null}
        <button
          type="button"
          onClick={generateAiText}
          className="rounded-full bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-500 px-5 py-3 text-sm font-extrabold text-white shadow-2xl transition hover:-translate-y-0.5 hover:shadow-indigo-200 focus:outline-none focus:ring-4 focus:ring-indigo-200"
          aria-label="Generate smarter AI text for this website"
        >
          ✨ AI text
        </button>
      </div>
    </>
  )
}
