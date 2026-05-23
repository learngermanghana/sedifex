import React from 'react'
import DocsPageLayout from '../../components/docs/DocsPageLayout'

export default function StudentRegistrationIntegrationPage() {
  return (
    <DocsPageLayout
      title="Student Registration Integration"
      subtitle="Map training school, academy, course, and apprentice registration forms into Sedifex without losing detailed fields."
    >
      <section>
        <h2>Endpoint</h2>
        <p>
          Use this endpoint when a client website needs to send student, apprentice, training, academy, or course
          registration data into Sedifex.
        </p>
        <pre><code>{`POST https://us-central1-sedifex-web.cloudfunctions.net/v1IntegrationStudentRegistrations?storeId=<STORE_ID>
Authorization: Bearer <INTEGRATION_API_KEY>
x-api-key: <INTEGRATION_API_KEY>
X-Sedifex-Contract-Version: 2026-04-13
Content-Type: application/json`}</code></pre>
        <p>
          The same endpoint also supports <code>GET</code> to fetch recent registrations for the store, using the same
          <code> storeId</code> and authentication headers.
        </p>
      </section>

      <section>
        <h2>Minimum required fields</h2>
        <ul>
          <li><code>customer.name</code> or <code>name</code>: student or apprentice full name.</li>
          <li><code>customer.phone</code>, <code>customer.email</code>, <code>phone</code>, or <code>email</code>: at least one contact is required.</li>
          <li><code>data.course</code> or <code>course</code>: selected course or program.</li>
        </ul>
      </section>

      <section>
        <h2>Canonical payload shape</h2>
        <p>
          Keep simple fields at the top of <code>data</code>, and put detailed academy-specific fields inside
          <code> data.apprentice</code>, <code>data.guarantor</code>, and <code>data.healthComplications</code>. Sedifex will
          keep these nested fields and the Student Registration dashboard can display/edit them.
        </p>
        <pre><code>{`{
  "source": "website_training_registration",
  "sourceChannel": "client_website",
  "customer": {
    "name": "Nana Asamoah",
    "phone": "0245022743",
    "email": "student@example.com"
  },
  "data": {
    "course": "Lashes",
    "program": "Lashes",
    "duration": "Two (2) Weeks Training",
    "preferredClassTime": "Morning",
    "branch": "Spintex",
    "location": "Spintex",
    "notes": "Student prefers weekend practicals.",
    "apprentice": {
      "full_name": "Nana Asamoah",
      "date_of_birth": "2000-04-21",
      "place_of_birth": "Accra",
      "nationality": "Ghanaian",
      "religion": "Christian",
      "marital_status": "Single",
      "children_count": "0",
      "hometown": "Cape Coast",
      "residence": "Spintex",
      "contact": "0245022743",
      "email": "student@example.com",
      "education": "SHS",
      "qualification_year": "2022",
      "school_name": "Example SHS",
      "age": "24",
      "preferred_class_time": "Morning",
      "branch": "Spintex",
      "apprentice_sign_date": "2026-05-23"
    },
    "guarantor": {
      "guarantor_full_name": "Ama Asamoah",
      "guarantor_relationship": "Parent",
      "guarantor_residence": "Tema",
      "guarantor_contact": "0244000000",
      "guarantor_sign_date": "2026-05-23"
    },
    "healthComplications": ["Blood Pressure"]
  },
  "payment": {
    "mode": "online_checkout",
    "status": "checkout_created",
    "amount": 1000,
    "totalFee": 1000,
    "amountPaid": 0,
    "balance": 1000,
    "currency": "GHS",
    "reference": "REG-OPTIONAL"
  },
  "attributes": {
    "courseDuration": "Two (2) Weeks Training",
    "sourcePage": "training"
  }
}`}</code></pre>
      </section>

      <section>
        <h2>Field mapping guide</h2>
        <table>
          <thead>
            <tr><th>Website form field</th><th>Send to Sedifex key</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>Full Name</td><td><code>customer.name</code> and <code>data.apprentice.full_name</code></td><td>Keep both for dashboard and raw academy profile.</td></tr>
            <tr><td>Contact</td><td><code>customer.phone</code> and <code>data.apprentice.contact</code></td><td>Use digits/WhatsApp-ready phone where possible.</td></tr>
            <tr><td>Email</td><td><code>customer.email</code> and <code>data.apprentice.email</code></td><td>Lowercase before sending.</td></tr>
            <tr><td>Course</td><td><code>data.course</code> and <code>data.program</code></td><td>Use the exact course name selected by the student.</td></tr>
            <tr><td>Training Duration</td><td><code>data.duration</code></td><td>Example: Two (2) Weeks Training.</td></tr>
            <tr><td>Preferred Class Time</td><td><code>data.preferredClassTime</code> and <code>data.apprentice.preferred_class_time</code></td><td>Use dropdown values like Morning, Afternoon, Evening, Weekend.</td></tr>
            <tr><td>Preferred Branch</td><td><code>data.branch</code>, <code>data.location</code>, and <code>data.apprentice.branch</code></td><td>Use a stable branch label.</td></tr>
            <tr><td>Date of Birth</td><td><code>data.apprentice.date_of_birth</code></td><td>Prefer ISO date format: YYYY-MM-DD.</td></tr>
            <tr><td>Place of Birth</td><td><code>data.apprentice.place_of_birth</code></td><td>Free text is fine.</td></tr>
            <tr><td>Nationality</td><td><code>data.apprentice.nationality</code></td><td>Use dropdown values where possible.</td></tr>
            <tr><td>Religion</td><td><code>data.apprentice.religion</code></td><td>Use dropdown values where possible.</td></tr>
            <tr><td>Marital Status</td><td><code>data.apprentice.marital_status</code></td><td>Use Single, Married, Divorced, Widowed, or similar.</td></tr>
            <tr><td>Number of Children</td><td><code>data.apprentice.children_count</code></td><td>Send as string or number; Sedifex stores it as profile data.</td></tr>
            <tr><td>Hometown</td><td><code>data.apprentice.hometown</code></td><td>Optional.</td></tr>
            <tr><td>Residence</td><td><code>data.apprentice.residence</code></td><td>Useful for academy reporting.</td></tr>
            <tr><td>Highest Education</td><td><code>data.apprentice.education</code></td><td>Use dropdown values like JHS, SHS, TVET, Diploma, Degree.</td></tr>
            <tr><td>Year Qualification</td><td><code>data.apprentice.qualification_year</code></td><td>Use a numeric year.</td></tr>
            <tr><td>Name of School</td><td><code>data.apprentice.school_name</code></td><td>Optional.</td></tr>
            <tr><td>Age</td><td><code>data.apprentice.age</code></td><td>Can be calculated from date of birth on the website.</td></tr>
            <tr><td>Apprentice Sign Date</td><td><code>data.apprentice.apprentice_sign_date</code></td><td>Prefer YYYY-MM-DD.</td></tr>
            <tr><td>Health Complications</td><td><code>data.healthComplications</code></td><td>Send an array of selected strings.</td></tr>
            <tr><td>Guarantor Full Name</td><td><code>data.guarantor.guarantor_full_name</code></td><td>Optional but recommended for training schools.</td></tr>
            <tr><td>Guarantor Relationship</td><td><code>data.guarantor.guarantor_relationship</code></td><td>Use dropdown values like Parent, Guardian, Spouse.</td></tr>
            <tr><td>Guarantor Residence</td><td><code>data.guarantor.guarantor_residence</code></td><td>Optional.</td></tr>
            <tr><td>Guarantor Contact</td><td><code>data.guarantor.guarantor_contact</code></td><td>Validate phone number before submitting.</td></tr>
            <tr><td>Guarantor Sign Date</td><td><code>data.guarantor.guarantor_sign_date</code></td><td>Prefer YYYY-MM-DD.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Payment and part-payment mapping</h2>
        <p>
          For online checkout, use <code>payment.status = "checkout_created"</code>. For manual or part-payment flows,
          include <code>totalFee</code>, <code>amountPaid</code>, and <code>balance</code> so Sedifex can show paid,
          part-paid, unpaid, and balance filters correctly.
        </p>
        <pre><code>{`"payment": {
  "mode": "manual",
  "status": "part_paid",
  "amount": 800,
  "totalFee": 2000,
  "amountPaid": 800,
  "balance": 1200,
  "currency": "GHS",
  "reference": "REG-ABC123"
}`}</code></pre>
      </section>

      <section>
        <h2>Recommended form controls</h2>
        <ul>
          <li>Use dropdowns for course, class time, branch, nationality, religion, marital status, education, and guarantor relationship.</li>
          <li>Use date inputs for date of birth and sign dates.</li>
          <li>Auto-calculate age from date of birth instead of asking students to type it manually.</li>
          <li>Validate phone numbers before sending the request.</li>
          <li>Send health complications as an array, not as one long sentence.</li>
        </ul>
      </section>

      <section>
        <h2>Response shape</h2>
        <p>A successful request returns the generated registration id and reference.</p>
        <pre><code>{`{
  "ok": true,
  "storeId": "<STORE_ID>",
  "registrationId": "abc123",
  "reference": "REG-ABC123",
  "registration": { "...": "full saved registration record" }
}`}</code></pre>
      </section>
    </DocsPageLayout>
  )
}
