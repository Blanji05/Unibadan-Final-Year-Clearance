# University of Ibadan Student Clearance Management System

A full-stack web application that digitizes the final-year clearance process at the University of Ibadan. Built with React, Node.js, Express, and MySQL.

**Project by:** Osunlana Anjoolaoluwa Victor (230922)  
**Department:** Computer Science, Faculty of Computing  
**Supervisor:** Mr. EA George  
**Academic Year:** 2025/2026

---

## Features

- **Prerequisite-gated workflow** — students cannot skip stages; dependencies are enforced
- **Real-time status tracking** — students see which stages are pending, approved, or rejected
- **Document vault** — upload once, reuse across multiple stages
- **Officer-managed checklists** — each section decides which documents it asks for, and students see the change immediately
- **Admin-configurable workflow** — sections, their order and their dependencies are edited in the UI, not the database
- **Integrated payments** — Remita integration (or simulated mode for demos)
- **Auto-generated PDF certificates** — issued when all stages are approved
- **Notifications that reach people** — every decision lands in an in-app inbox and goes out by email and SMS (console-logged when no provider is configured)
- **Receipts, timeline and reminders** — students download PDF payment receipts, see a clearance timeline, and get deadline reminders
- **Admin CSV import and exports** — bulk-create students from a CSV (accounts are admin-created only; there is no self-registration) and export students/payments to CSV
- **Faster officer reviews** — bulk approve/reject and rejection-reason templates
- **Forgot / reset password** — emailed one-time link (console-logged when SMTP is not configured)
- **Three user roles:** Student, Section Officer, Admin
- **10 real UI clearance stages** — Library, Hall, Jaja Clinic, Alumni, Department, Sports, Faculty, Lodgings, Bursar, Student Affairs

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 (Vite) |
| **Backend** | Node.js + Express.js |
| **Database** | MySQL 8.0 |
| **Authentication** | JWT (JSON Web Tokens) |
| **File Storage** | Cloudinary (or local disk fallback) |
| **Payments** | Remita (or simulated mode) |
| **SMS** | Termii (or console logging) |
| **PDF Generation** | PDFKit |

---

## Project Structure

```
clearance-management-system/
├── client/              # React frontend (Vite)
├── server/              # Node/Express backend
│   ├── config/         # Database, environment, integrations
│   ├── controllers/    # Request handlers
│   ├── middleware/     # Auth, upload, validation, error handling
│   ├── routes/         # API endpoints
│   ├── services/       # Business logic (prerequisite gating lives here)
│   ├── scripts/        # DB initialization and seeding
│   ├── utils/          # PDF generation, SMS, responses
│   ├── server.js       # Express app entry point
│   ├── .env.example    # Environment template
│   └── package.json
├── database/
│   └── schema.sql      # MySQL schema + 10 stages + prerequisites
├── .gitignore
└── README.md
```

---

## Running on localhost

Once set up (see **Getting Started** below for first-time steps), start everything
with one command from the project root:

```bash
start.bat
```

That frees ports 5000/5173, starts the API and the Vite frontend, prints
`/api/health`, and opens http://localhost:5173 in your browser. Log in with any
seeded account below — for example `anjoola@student.ui.edu.ng` / `Password123!`.

Both services run in minimised windows titled **cms-server** and **cms-client**;
close those windows to stop them. To restart only the API after changing
server code or `.env`, use `restart-server.bat` — it leaves the frontend running.

If you prefer two terminals:

```bash
cd server && npm start     # API  -> http://localhost:5000
cd client && npm run dev   # web  -> http://localhost:5173
```

You need **both**. The React app holds no data of its own, so opening it without
the API gives a page that renders but cannot log in.

**MySQL must be running first** — the API needs it to serve even the login
request. If you see `ECONNREFUSED` on startup, start the MySQL service and check
`DB_PASSWORD` in `server/.env`.

---

## Getting Started

### Prerequisites

1. **Node.js** (v18 or higher) — check with `node --version`
2. **MySQL 8.0** — service must be running
3. **Git** (for version control)

### Installation

#### 1. Clone/navigate to the project

```bash
cd C:\Users\DELL\Desktop\clearance-management-system
```

#### 2. Install server dependencies

```bash
cd server
npm install
```

#### 3. Configure environment

Copy `.env.example` to `.env` and fill in your settings:

```bash
copy .env.example .env
```

**Minimal `.env` for local testing:**

```env
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=clearance_db

# Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your_generated_secret_here

# Leave these blank for local-disk/simulated mode:
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
REMITA_MERCHANT_ID=
REMITA_SERVICE_TYPE_ID=
REMITA_API_KEY=
REMITA_ENV=demo
TERMII_API_KEY=

# Email: leave SMTP_* blank to log emails to the console instead of sending
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=UI Clearance <no-reply@clearance.ui.edu.ng>

SEED_PASSWORD=Password123!
```

#### 4. Initialize the database

```bash
npm run db:init
npm run db:seed
```

This creates the `clearance_db` database, applies the schema (12 tables), seeds the 10 stages, and creates demo accounts.

#### 5. Start the backend

```bash
npm start
```

The server runs at **http://localhost:5000**. Test it:

```bash
curl http://localhost:5000/api/health
```

You should see:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "environment": "development",
    "storage": "local-disk",
    "payments": "simulated",
    "sms": "simulated",
    "email": "simulated"
  }
}
```

---

## Demo Accounts

All accounts use `SEED_PASSWORD` from `.env` (default: **Password123!**).

| Role | Email | Section |
|---|---|---|
| **Admin** | admin@ui.edu.ng | — |
| **Officer** | library@ui.edu.ng | Library |
| **Officer** | hall@ui.edu.ng | Hall & Caution |
| **Officer** | clinic@ui.edu.ng | Jaja Clinic |
| **Officer** | alumni@ui.edu.ng | Alumni |
| **Officer** | department@ui.edu.ng | Department |
| **Officer** | sports@ui.edu.ng | Sports |
| **Officer** | faculty@ui.edu.ng | Faculty |
| **Officer** | lodgings@ui.edu.ng | Lodgings |
| **Officer** | bursar@ui.edu.ng | Bursar |
| **Officer** | student_affairs@ui.edu.ng | Student Affairs |
| **Student** | anjoola@student.ui.edu.ng | 230922, Computer Science |
| **Student** | folake@student.ui.edu.ng | 230451, Computer Science |
| **Student** | emeka@student.ui.edu.ng | 230777, Statistics |

---

## API Endpoints

### Authentication

- `POST /api/auth/login` — log in (any role)
- `GET /api/auth/me` — get current user
- `POST /api/auth/forgot-password` — email a reset link (always answers the same, whether or not the account exists)
- `POST /api/auth/reset-password` — set a new password with the emailed token

There is no public registration endpoint: student accounts are created by an admin (one by one or via CSV import).

### Student

- `GET /api/student/clearance-status` — fetch all stages + progress
- `GET /api/student/documents` — list document vault
- `GET /api/student/requirements` — every document the sections ask for, de-duplicated
- `POST /api/student/documents` — upload a document (multipart/form-data)
- `DELETE /api/student/documents/:documentId` — remove a document
- `POST /api/student/submit/:stageId` — submit documents for a stage (prerequisite-gated)
- `POST /api/student/pay/:stageId` — initiate payment
- `GET /api/student/payments` — payment history
- `GET /api/student/payments/:paymentId/receipt` — download a PDF receipt for a successful payment
- `GET /api/student/timeline` — history of events, the deadline and current reminders
- `GET /api/student/certificate` — fetch/generate clearance certificate

### Officer

- `GET /api/officer/pending-requests` — submissions awaiting review (filtered by section)
- `GET /api/officer/history` — recent approvals/rejections
- `PATCH /api/officer/review/:studentId/:stageId` — approve or reject
- `POST /api/officer/review-bulk` — approve/reject several students at once (`student_ids`, `decision`, `remarks`)
- `GET /api/officer/requirements` — the document checklist for the officer's own section
- `POST /api/officer/requirements` — request a document (add/update; idempotent)
- `DELETE /api/officer/requirements/:documentTypeId` — stop requesting a document
- `POST /api/officer/document-types` — define a new document type and request it

### Admin

- `GET /api/admin/analytics` — system-wide statistics
- `GET /api/admin/activity` — audit log feed
- `GET /api/admin/stages` — list all stages + prerequisites

Sections (the clearance workflow itself):

- `GET /api/admin/sections` — sections with officer counts and deletion safety
- `POST /api/admin/sections` — add a section (appended last, backfilled to all students)
- `PATCH /api/admin/sections/:stageId` — rename / edit details
- `PATCH /api/admin/sections/reorder` — reorder the whole workflow
- `PATCH /api/admin/sections/:stageId/status` — activate/deactivate
- `PUT /api/admin/sections/:stageId/prerequisites` — set dependencies (cycles rejected)
- `DELETE /api/admin/sections/:stageId` — delete, refused if it holds history or staff

Students:

- `GET /api/admin/students` — all students + progress summary
- `GET /api/admin/students/:studentId` — single student record
- `POST /api/admin/students` — create a student (clearance rows initialised)
- `POST /api/admin/students/import` — bulk-create students from CSV text (max 300 rows; returns per-row failures and a one-time credentials CSV)
- `PATCH /api/admin/students/:studentId` — correct student details
- `DELETE /api/admin/students/:studentId` — remove a student
- `GET /api/admin/students/:studentId/clearance` — detailed stage view
- `PATCH /api/admin/override/:studentId/:stageId` — manually set stage status
- `POST /api/admin/generate-certificate/:studentId` — issue certificate (fully cleared only)

Accounts:

- `GET /api/admin/users` — all accounts
- `POST /api/admin/officers` — create a section officer
- `PATCH /api/admin/users/:userId/status` — activate/deactivate an account
- `PATCH /api/admin/users/:userId/section` — reassign an officer to another section
- `POST /api/admin/users/:userId/reset-password` — set a new password

Reports and reminders:

- `GET /api/admin/export/students.csv` — students and their progress
- `GET /api/admin/export/payments.csv` — payment records
- `GET /api/admin/settings` / `PUT /api/admin/settings/deadline` — read / set the clearance deadline
- `POST /api/admin/send-reminders` — notify students who have not finished


### Payment

- `GET /api/payment/verify/:reference` — verify Remita callback (by order reference or RRR)
- `POST /api/payment/webhook` — Remita notification (each RRR re-verified with Remita)
- `GET /api/payment/verify-certificate/:code` — public certificate verification

### Notifications

- `GET /api/notifications` — the signed-in user's inbox (in-app rows) + unread count; pass `?channel=sms|email` to read the delivery audit instead
- `PATCH /api/notifications/:id/read` — mark one as read
- `PATCH /api/notifications/read-all` — mark everything read

---

## Database Schema

**12 tables:**

1. `users` — students, officers, admins
2. `clearance_stages` — the 10 real stages (seeded from schema.sql)
3. `stage_prerequisites` — prerequisite edges (DAG)
4. `document_types` — taxonomy for the document vault
5. `stage_requirements` — which doc types each stage demands
6. `documents` — student document vault
7. `clearance_status` — one row per student per stage
8. `submission_documents` — links vault docs to a submission
9. `payments` — Paystack transactions
10. `certificates` — final PDF certificates
11. `notifications` — in-app + SMS
12. `audit_logs` — admin overrides, officer decisions

**Key design decisions:**

- **Prerequisite gating:** The `stage_prerequisites` table is checked server-side before every submission. Stages 1–5 have no prerequisites; stages 6–10 form a strict dependency chain. This addresses the "no sequential enforcement" gap found in prior work.
- **Document vault:** Students upload documents once (with ownership checks) and reference them by ID when submitting stages, avoiding redundant uploads.
- **Atomic registration:** Student creation and clearance-status initialization happen in a single transaction.

---

## Development Notes

### Restarting the API server

```bash
restart-server.bat
```

Stops whatever is listening on port 5000 and starts a fresh instance, then prints
`/api/health` so you can confirm which mode it came up in. It targets the port
rather than killing every `node.exe`, so the Vite dev server keeps running.

### Resetting the database

```bash
npm run db:reset
```

This drops and recreates `clearance_db`, reapplies the schema, and reseeds demo accounts.

### Running without Cloudinary/Remita/Termii

The system is designed to run fully offline:

- **Storage:** Files go to `server/uploads/` and are served at `/uploads/:filename`
- **Payments:** Alumni stage payment is recorded as `success` immediately with a simulated reference
- **SMS:** Notifications are logged to the console (check the server terminal)
- **Email:** Notification emails are logged to the console in the same way

Add real credentials to `.env` when deploying.

### Email notifications

Every notification is written to the `notifications` table once per channel it
touches: an `in_app` row (what the bell in the topbar reads) plus `sms` and
`email` rows recording each dispatch attempt. Without SMTP credentials the
emails are logged to the console (`[email:simulated] -> address: subject`) and
recorded as delivered, so the whole flow is demonstrable offline.

To send real email, set in `server/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=clearance@ui.edu.ng
SMTP_PASS=an-app-password
MAIL_FROM=UI Clearance <no-reply@clearance.ui.edu.ng>
```

Restart and check `/api/health` — it should report `"email": "smtp"`.

**What triggers a notification:**

| Event | Who is told | Channels |
|---|---|---|
| Stage approved / rejected by an officer | the student | in-app, email, SMS |
| Stage approved / rejected by admin override | the student | in-app, email, SMS |
| New submission awaiting review | the section's officers | in-app, email |
| Payment received / failed | the student | in-app, email, SMS |
| Certificate issued | the student | in-app, email |
| Account created by an admin | the student | in-app, email |
| Password reset by an admin | the account holder | in-app, email |
| Password reset requested (forgot password) | the account holder | email |
| Clearance reminder (admin-triggered) | students with unfinished stages | in-app, email |
| Officer reassigned to another section | the officer | in-app, email |

A failed send is logged and recorded as `failed` — it never blocks the
clearance action that triggered it.

### Enabling real Remita payments

Simulated mode is the default and settles the ₦1,000 Alumni fee instantly with a
`CS-` reference — no checkout screen appears. To use the real gateway:

1. Get your Merchant ID, Service Type ID and API key from your
   [Remita](https://remita.net) account (use the demo environment first).
2. Put them in `server/.env` (the presence of all three is what switches modes):

   ```env
   REMITA_MERCHANT_ID=your_merchant_id
   REMITA_SERVICE_TYPE_ID=your_service_type_id
   REMITA_API_KEY=your_api_key
   REMITA_ENV=demo        # use "live" for production
   ```

3. If the database predates the Remita switch, run `npm run db:migrate-remita`
   once from the `server` folder (it adds `payments.rrr`).
4. Restart the server. `GET /api/health` should now report `"payments": "remita"`.
5. Click **Pay ₦1,000** on the Alumni stage. The server generates a Remita
   Retrieval Reference (RRR) and you are sent to Remita's checkout. Remita returns
   you to `/payment/callback`, which verifies the RRR against Remita's status API
   before the stage unlocks. Payments are listed (history only) under **Payments**.

**Notification URL (recommended).** The redirect only fires if the student comes
back to the browser. Point Remita's notification URL at
`https://<your-domain>/api/payment/webhook`. Remita notifications are unsigned, so
the endpoint never trusts their contents: it re-checks each RRR with Remita
before settling anything. For local testing, tunnel it:

```bash
npx localtunnel --port 5000
```

Handy shortcuts from the `server` folder:

```bash
npm run db:migrate-remita               # add the RRR column to an existing database
npm run check:payments                  # exercise the whole flow in either mode
npm run cleanup:test-data               # clear the fee so Pay appears again
```


### Officer-managed document requirements

Each section controls its own checklist rather than inheriting a fixed list from
the schema. An officer opens **Required Documents**, ticks the documents their
section needs, and can define a new document type if nothing existing fits.

Because `stage_requirements` is the same table the submission gate reads, that
choice takes effect at once: the document appears on the student's **Required of
me** tab, and submitting to that section without it is rejected. Requirements are
keyed on `(stage_id, document_type_id)`, so re-requesting an existing document
updates the mandatory flag instead of creating a duplicate row.

Documents several sections ask for — school fee receipts, statement of result —
collapse into a single checklist entry that names every section requesting it, so
the student uploads the file once.

```bash
npm run check:requirements   # 22 assertions over the whole flow
npm run check:notifications  # 31 assertions over inbox + email + SMS delivery
npm run check:e2e            # 21 assertions over auth, gating, payments, roles
```

Both expect a running server and a seeded database.

### Admin-configurable workflow

The ten UI stages are seed data, not hard-coded, so the admin console can change
the workflow itself without a migration. From **Clearance Sections** an admin can
add a section, rename it, reorder the chain by dragging, set which stages gate it,
and take it out of service.

Two safeguards matter here, because both failure modes strand students mid-process:

- **Prerequisites are validated as a DAG.** A stage cannot depend on itself, and
  any edge that would close a loop is rejected before it is written — a cycle
  would leave every stage in it permanently unreachable.
- **Deletion is refused while a section is in use.** A stage holding approval
  history, or still staffed by an officer, can only be *deactivated*: that stops
  it appearing in new clearance runs while keeping past decisions auditable. Hard
  deletion is allowed only for a section no student has touched.

Adding a section backfills a `clearance_status` row for every existing student, so
someone already halfway through sees the new stage rather than a progress total
that silently disagrees with the workflow. Deleting one closes the gap in
`stage_order` so the sequence stays contiguous.

Admins also manage the people in the workflow — create students (clearance rows
are initialised in the same transaction, so they can start immediately), correct
records, reset passwords, reassign an officer to a different section, and
deactivate accounts. Overrides are for the cases the digital flow cannot express,
such as a student cleared in person; each one is written to `audit_logs` with the
reason. Certificates remain gated on every stage being approved, override or not.

```bash
npm run check:admin   # 64 assertions; creates and removes its own test data
```

### Student CSV import

Registration is closed: only an admin creates student accounts. On **Manage Students** an admin can upload a CSV (max 300 rows) with the header row

```
full_name,email,matric_number,department,faculty,hall,phone_number,password
```

`full_name`, `email` and `matric_number` are required; the rest are optional (a random temporary password is generated when `password` is blank). The import reports failed rows by line number and offers a one-time credentials CSV to hand out. Section officers are created from **Staff Accounts**.

### Upgrading an existing database

```bash
cd server
node scripts/migrate-remita.js     # payments.rrr + Remita gateway default
node scripts/migrate-features.js   # settings + password_resets tables
node scripts/check-features.js     # end-to-end check of the newer features (server must be running)
```

(or `npm run db:migrate-remita` / `npm run db:migrate-features`). Restart the API afterwards.
### Cleaning up after the check scripts

The check scripts each create their own fixtures and remove them on the way out.
If one is interrupted, sweep the leftovers:

```bash
npm run cleanup:test-data
```


### Testing prerequisite gating

1. Log in as `anjoola@student.ui.edu.ng`
2. Try to submit **Stage 6 (Sports)** before completing stages 1, 2, and 4
3. The API will reject with:  
   `"You must complete these stages first: Library Clearance, Hall & Caution Clearance, Alumni Clearance."`

---

## Known Limitations

1. **Certificate PDFs are basic** — no institutional logo (add via PDFKit image embedding)
2. **Remita not yet exercised against the live gateway** - the RRR generation, hosted checkout form and status check follow Remita's documented API but have not been run against a real merchant account; verify with Remita demo credentials first (`REMITA_ENV=demo`).
3. **Email and SMS need credentials to actually send** — the full notification pipeline (in-app inbox, email, SMS) runs and is audited in simulated mode; real delivery requires SMTP credentials and a Termii API key respectively

---

## Deployment Checklist

- [ ] Set strong `JWT_SECRET` in production `.env`
- [ ] Configure Cloudinary credentials
- [ ] Configure Remita credentials
- [ ] Configure Termii API key
- [ ] Set `NODE_ENV=production`
- [ ] Use a process manager (PM2) for the server
- [ ] Deploy frontend (Vite build) to a static host or serve via Express
- [ ] Use HTTPS in production
- [ ] Set up database backups

---

## Research Contribution

This system addresses three gaps identified in prior work:

1. **Sequential enforcement** — prerequisite-gating prevents students from skipping stages (prior systems allowed any order)
2. **Real-time notifications** — students are notified in-app, by email and by SMS when a stage is approved/rejected (prior systems had no alerts)
3. **Payment integration** — the Alumni stage requires online payment before submission (prior systems left payments manual)

See `230922_Osunlana_Anjoolaoluwa_Project_Proposal_Corrected.pdf` for the full literature review and methodology.

---

## License

This is an academic final-year project for the University of Ibadan, Department of Computer Science (2025/2026).

---

## Contact

**Student:** Osunlana Anjoolaoluwa Victor  
**Matric Number:** 230922  
**Email:** anjoola@student.ui.edu.ng  
**Supervisor:** Mr. EA George
