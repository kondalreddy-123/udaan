# ✈ UDAAN — Understanding-Driven Adaptive Academic Navigator
### Judge-Feedback-Driven Prototype Upgrade (NCERT Class 8 Mathematics)

> **Core Thesis:** A wrong answer is **evidence, not proof**. UDAAN detects the pedagogical misconception behind errors, formulates and tests hypotheses with dynamic follow-ups, provides targeted multi-modal scaffolding, verifies recovery with fresh reassessment, and keeps teachers in control with explainable Action Cards.

---

## 🌟 Key Upgraded Highlights

1. **Learning Detective (Full 7-Stage Workflow):**
   - `Learn → Solve → Detect → Confirm → Targeted Support → Reassess → Update Mastery`
   - Every question links to a specific concept and its prerequisite.
   - Distractors carry explicit misconception tags and teacher-reviewed explanations.
   - Dynamic follow-up questions tailored to the suspected misconception (e.g., testing `1/2 + 1/2 = ?` vs `2/4` when numerators/denominators are added separately).
   - Diagnoses treated as **hypotheses, not facts**; clearly discriminates careless slips from persistent misconceptions.
   - Multi-modal targeted support: mathematical rule, interactive number-line visualizer, step-by-step worked example, and prerequisite link.
   - Fresh reassessment question using **new numbers** assessing the exact same underlying learning objective.

2. **Explicit, Explainable Learning Paths:**
   - Real-time rule adaptation advancing difficulty on streaks, routing to prerequisite reviews on repeated errors or heavy hints, and escalating to teachers on persistent difficulty.
   - Every path change features a human-readable explanation string in the UI.

3. **Bayesian Knowledge Tracing (BKT) & Evaluation Methodology:**
   - Documented Corbett & Anderson (1994) formulation with parameter range validation, boundary safety, and division-by-zero protection.
   - Transparent side-by-side comparison of Rule Baseline vs BKT on 8 synthetic cases with accuracy, agreement rates, and one-click CSV export.
   - Scientific honesty: clearly labels unvalidated baseline literature priors and synthetic benchmark cases.

4. **Teacher Command Center & Action Cards:**
   - Class and chapter selection.
   - Concept mastery breakdown and recurring misconception rates with explicit sample-size labels (`Sample data: n=40`).
   - Explainable Teacher Action Cards detailing evidence, triggering rule, suggested action, and reassessment outcome.
   - Full teacher agency: `Accept`, `Edit`, `Dismiss`, and `Mark Completed`.
   - Real-time configurable intervention thresholds.
   - Built-in guided onboarding walkthrough tour and interactive teacher guide.

5. **Content Authoring & Validation Gates:**
   - Bilingual question creation and editing in English and Telugu.
   - `Draft → Reviewed → Published` state machine with strict validation gates that prevent accidental publication of incomplete or untagged questions.
   - Version history preserving previous revisions and correction-reporting workflow.

6. **Offline-First PWA & Deployable Full-Stack Architecture:**
   - Client IndexedDB queue with unique attempt UUIDs for idempotent deduplication and retry resilience.
   - Service worker (`sw.js`) static asset caching.
   - FastAPI REST API backend with SQLite / PostgreSQL support, role-based JWT auth, and 23 automated tests (100% passing).
   - Zero-dependency standalone single-file demonstrator (`standalone_demo.html`) for immediate double-click judge evaluation.

---

## 📂 Project Architecture

```
udaan/
├── standalone_demo.html         # Complete zero-dependency judge demonstrator (Open directly in browser)
├── prototype_original.html      # Preserved original prototype HTML
├── index.html                   # Root entrypoint
├── backend/                     # Python + FastAPI backend
│   ├── app/
│   │   ├── main.py              # Application entrypoint & CORS
│   │   ├── config.py            # Settings & BKT priors
│   │   ├── database.py          # SQLAlchemy session engine
│   │   ├── models.py            # Database tables
│   │   ├── schemas.py           # Pydantic v2 validation models
│   │   ├── auth.py              # JWT tokens & role checking
│   │   ├── seed_data.py         # NCERT curriculum & demo accounts
│   │   ├── engine/
│   │   │   ├── bkt.py           # Bayesian Knowledge Tracing engine
│   │   │   ├── adaptive_rules.py# Explainable rule engine
│   │   │   ├── detective.py     # 7-stage Learning Detective
│   │   │   └── comparison.py    # Rule vs BKT evaluation & CSV export
│   │   └── routers/             # API routes (auth, concepts, questions, detective, attempts, teacher, comparison)
│   ├── tests/                   # Automated pytest suite (23 tests, 100% passing)
│   ├── requirements.txt         # Backend dependencies
│   └── Dockerfile               # Container deployment
├── frontend/                    # React + Vite PWA frontend
│   ├── src/
│   │   ├── App.jsx              # Main coordinator & state engine
│   │   ├── index.css            # Purple/teal design system & animations
│   │   ├── components/          # Header, 3D Cube, StudentView, Detective, TeacherDashboard, etc.
│   │   ├── services/            # API client & IndexedDB queue
│   │   └── i18n/                # English & Telugu translation dictionary
│   ├── public/                  # Manifest, service worker, favicon
│   └── package.json             # Frontend dependencies
├── docs/
│   ├── TEACHER_GUIDE.md         # Teacher classroom protocol & misconception guide
│   ├── EVALUATION_METHODOLOGY.md# Scientific framework, math equations & pilot protocol
│   ├── FEATURE_STATUS.md        # Feature matrix (Implemented vs Simulated vs Planned)
│   └── DEPLOYMENT.md            # Comprehensive local & cloud deployment guide
└── README.md
```

---

## ⚡ Quick Start for Judges

### Option 1: Instant Standalone Evaluation (0 seconds setup)
Double-click and open [`standalone_demo.html`](standalone_demo.html) in any web browser.
- Works offline immediately with zero installation.
- Experience the 3D rotating rational numbers cube, Learning Detective flow, Teacher Action Cards, threshold sliders, and synthetic comparison.

### Option 2: Running Automated Tests
```powershell
$env:PYTHONPATH="backend"
python -m pytest backend/tests -v
```
**Actual Test Results:** `23 passed in 3.62s` (100% pass rate).

### Option 3: Running the Full Stack Locally

> One-click option: double-click [`start-dev.bat`](start-dev.bat). It starts the backend
> (port 8000) and frontend (port 5173) in separate windows and skips whichever is
> already running.

**1. Start Backend** (must run from the `backend/` folder — that is where `udaan.db` lives):
```powershell
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
# View interactive API docs at http://127.0.0.1:8000/docs
```

**2. Start Frontend** (in a second terminal):
```powershell
cd frontend
cmd /c npm run dev
# Open in browser at http://localhost:5173
```

The Vite dev server proxies every `/api/*` request to `http://localhost:8000`, so the
backend **must** be running. If it is not, the browser shows
`http proxy error ... ECONNREFUSED` and the UI falls back to demo data.

---

## 🔬 Scientific & Methodological Integrity
- **Sample vs. Real Data:** All cohort statistics and class view numbers are explicitly labelled as sample data (n=40).
- **No Unproven Claims:** We make no claims of verified learning gains or clinical outcomes without multi-school empirical pilot data.
- **Teacher Primacy:** Algorithmic recommendations are suggestions presented on Action Cards; high-stakes decisions remain firmly with the teacher.

---

## 🔔 Phase 4 — Parent Notifications & Secure Parent–Teacher Communication

### What is implemented
- **Evidence-based learning alerts.** Alerts are created only from repeated, measurable
  evidence in real attempts: repeated mistakes across several questions, persistently low
  mastery after enough assessment, no improvement across sessions, or a genuine decline.
  A single wrong answer never raises an alert. Thresholds are environment-configurable.
- **Consent-aware delivery.** Parents control consent and channels (in-app, email, voice
  reading). In-app notifications always work when consent is given. Email is attempted only
  when the operator configures SMTP; otherwise the delivery status is `not_configured`.
  No SMS or WhatsApp integration is claimed because no provider is configured.
- **Localised, supportive copy.** Alert text is rendered in the parent's chosen language
  (`te`, `en`, `hi`) with plain language rather than BKT/mastery jargon.
- **Deduplication and cooldowns.** One alert per family/concept per cooldown window plus a
  per-run cap prevents duplicate or excessive notifications.
- **Secure messaging.** A verified parent can message only the teacher assigned to the
  child's class. Teachers see only threads for their own class; admins may audit. Revoking
  a guardian link immediately blocks new sends/replies and teacher access.
- **Thread features.** Categories, subject/body, timestamps, read/unread status, replies,
  recommended learning activities, meeting requests, and teacher resolution notes.
- **Teacher replies notify the parent.** Each teacher reply creates one in-app notification
  that deep-links to the conversation.

### Parent notification API
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/parent/notifications?unread_only=` | Notification history (re-evaluates evidence idempotently) |
| POST | `/api/parent/notifications/{id}/read` | Mark one notification read (ownership checked) |
| POST | `/api/parent/notifications/read-all` | Mark all read |
| GET | `/api/parent/notification-preferences` | Consent and channel settings |
| PUT | `/api/parent/notification-preferences` | Update consent/channels (revoking consent disables all) |

### Messaging API
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/parent/messages` | Parent's conversation list |
| POST | `/api/parent/messages` | Send to the verified child's assigned teacher |
| GET | `/api/parent/messages/{id}` | Open a thread (marks parent read) |
| POST | `/api/parent/messages/{id}/reply` | Parent follow-up |
| GET | `/api/teacher/messages?status_filter=&unread_only=` | Class-scoped teacher inbox |
| GET | `/api/teacher/messages/{id}` | Open a thread (marks teacher read) |
| POST | `/api/teacher/messages/{id}/reply` | Reply with optional activity/meeting |
| POST | `/api/teacher/messages/{id}/resolve` | Resolve with optional closing note |

### Configuration
Copy `.env.example` and export only the values you need. Key Phase 4 variables:
`PARENT_ALERT_*`, `PARENT_MESSAGES_MAX_PER_DAY`, `EMAIL_NOTIFICATIONS_ENABLED`, `SMTP_*`.
Set `CORS_ORIGINS` to a comma-separated allow-list in production (wildcards are rejected).
The backend intentionally does not auto-load `.env`; use your shell, process manager, or
deployment platform's secret configuration.

### Verification
Last full run:
```powershell
$env:PYTHONPATH="backend"
python -m pytest backend/tests -v
# 68 passed
```
```powershell
cd frontend
cmd /c "npm run build"
# ✓ built
```
A live authenticated smoke flow was also exercised end to end: parent message → assigned
teacher reply → localised parent notification → parent read → teacher resolution, with all
smoke-test records removed afterwards.

---

## 📊 Phase 5 — ParentConnect Weekly Progress Reports

### What is implemented
- **Student-driven setup without changing parent login.** The student dashboard offers two separate
  options: **Create Parent Account** keeps the existing invitation and teacher-verification flow,
  and **ParentConnect – Weekly Progress Reports** lets a student register a contact for an
  already-verified parent link. The student enters the parent/guardian name, chooses email or SMS,
  and the parent receives the OTP directly. No parent login is required to receive reports, and
  pending or unverified links cannot be used until a teacher verifies the relationship.
- **Verified contact without parent login.** A parent can register **either** an email address
  **or** an Indian mobile number (never both). Email is verified by OTP and SMS by OTP.
  Changing the contact resets verification. Unverified contacts never receive reports or OTPs
  beyond their own verification message.
- **Consent and opt-out.** Weekly reports are sent only when the parent has given consent,
  enabled weekly reports, and still has a `verified` parent–student relationship. Withdrawing
  consent immediately disables delivery.
- **Real activity only.** Each report is calculated from stored `Attempt` rows for the
  Saturday–Friday reporting week: questions attempted, correct answers, accuracy, learning
  time, active days, topics practised, topic accuracy, current mastery, lessons started and
  completed, distinct concept-day practice sets, hints used, strengths, improvements, weak
  areas, previous-week comparison, and AI/rule-based recommendations.
- **No fabricated inactive weeks.** When a child has no attempts in the week, the report says
  so explicitly and shows restart guidance instead of invented statistics.
- **Localised reports.** Report copy and email labels support `en`, `te`, and `hi`.
- **Professional email.** SMTP or Resend delivery with a responsive, UDAAN-branded HTML email
  plus a plain-text fallback and an optional secure detailed-report link.
- **India-compatible SMS.** MSG91 (DLT-aware flow template variables `OTP`, `LINK`, `MESSAGE`)
  or Twilio. SMS is concise, contains no marks, accuracy, or other sensitive student data, and
  includes the secure report link when appropriate.
- **Honest delivery status.** Missing provider credentials produce `not_configured`; they never
  report a message as `sent`. Delivery attempts are logged in `notification_logs`.
- **Idempotent scheduling.** Reports are unique per `(student, parent, week_start, week_end)`,
  so retries, overlapping instances, and scheduler catch-up cannot duplicate a report.
- **Secure links.** Public report links use random tokens with expiry, revocation, and rotation.
  The public viewer at `?report_token=...` is read-only and never exposes internal IDs or
  credentials.

### Report calculation rules
| Metric | Rule |
| --- | --- |
| Reporting period | Previous Saturday 00:00 through Friday 23:59:59 IST (fixed UTC+05:30) |
| Lessons started | Distinct concepts with at least one attempt in the week |
| Lessons completed | Practised concepts whose current mastery is ≥ 0.70 |
| Practice sets | Distinct `(concept, IST day)` sessions with at least one attempt |
| Accuracy | Correct attempts ÷ total attempts for the week |
| Learning time | Sum of `time_spent_sec`, displayed in minutes |
| Strengths | ≥ 2 attempts and accuracy ≥ 75%, or mastery ≥ 75% |
| Needs practice | ≥ 2 attempts and accuracy < 50%, or mastery < 50% |
| Previous week | Same metrics for the preceding Saturday–Friday period, when history exists |

### ParentConnect API
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/parent-connect/contact` | Current masked contact and verification state |
| POST | `/api/parent-connect/contact` | Register/change email **or** mobile and send an OTP |
| POST | `/api/parent-connect/contact/resend` | Resend an OTP (rate limited) |
| POST | `/api/parent-connect/contact/verify` | Verify the OTP (attempt limited) |
| GET | `/api/parent-connect/preferences` | Consent, channel, language, next run |
| PUT | `/api/parent-connect/preferences` | Update consent/channel/language |
| GET | `/api/parent-connect/reports?student_id=&limit=` | Report history (ownership enforced) |
| GET | `/api/parent-connect/reports/{id}` | Full report detail (ownership enforced) |
| POST | `/api/parent-connect/reports/generate` | Restricted manual generation for a verified child |
| POST | `/api/parent-connect/reports/{id}/resend` | Retry delivery explicitly |
| POST | `/api/parent-connect/reports/{id}/revoke-link` | Disable the public link |
| POST | `/api/parent-connect/reports/{id}/rotate-link` | Issue a fresh public link |
| GET | `/api/parent-connect/public/reports/{token}` | Unauthenticated read-only report view |
| GET | `/api/parent-connect/status` | Provider readiness, schedule, next run (no secrets) |
| GET | `/api/parent-connect/student/overview` | Student's links, contact/consent status, latest report |
| POST | `/api/parent-connect/student/contact` | Student registers a contact for a verified parent link |
| POST | `/api/parent-connect/student/contact/resend` | Resend the parent's OTP (rate limited) |
| POST | `/api/parent-connect/student/contact/verify` | Verify the parent's OTP (attempt limited) |
| PUT | `/api/parent-connect/student/preferences` | Update consent/channel/language for the verified parent link |

All routes except the public token view require authentication. Parent routes require the
`parent` role (admins may audit) and a `verified` parent-student link. The `/student/*` bridge
routes require the `student` role and operate only on a parent whose link is already `verified`;
pending, rejected, revoked, or unrelated parents receive `403`. Students still receive `403`
on the parent-only contact, preference, report, and status routes.

### Email setup
Choose one provider:

**SMTP**
```text
PARENT_CONNECT_EMAIL_PROVIDER=smtp
PARENT_CONNECT_EMAIL_FROM=UDAAN <no-reply@your-school.org>
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_USE_TLS=true
SMTP_TIMEOUT_SECONDS=8
EMAIL_TIMEOUT_SECONDS=10
```

**Resend**
```text
PARENT_CONNECT_EMAIL_PROVIDER=resend
PARENT_CONNECT_EMAIL_FROM=UDAAN <no-reply@your-verified-domain.org>
RESEND_API_KEY=...
RESEND_API_URL=https://api.resend.com/emails
EMAIL_TIMEOUT_SECONDS=10
```
If the provider is `disabled` or its required credentials are absent, the API reports
`not_configured` and the email is not claimed as sent.

> **Resend sandbox sender.** `onboarding@resend.dev` can only deliver to the email
> address that owns the Resend account. Verify a domain at
> <https://resend.com/domains>, then set `RESEND_FROM_EMAIL` /
> `PARENT_CONNECT_EMAIL_FROM` to an address on that domain to reach other parents.
>
> **Why OTPs silently failed before.** `urllib` sends the default
> `Python-urllib/x.y` User-Agent, which Cloudflare in front of `api.resend.com`
> rejects with `HTTP 403 (error code 1010)` before Resend sees the request. The
> delivery client now sends an explicit `UDAAN-ParentConnect/1.0` User-Agent.
> A `403 / 1010` in the logs therefore usually means an outdated backend build.

### SMS setup (India / DLT)
**MSG91**
```text
PARENT_CONNECT_SMS_PROVIDER=msg91
MSG91_AUTH_KEY=...
MSG91_SENDER_ID=UDAAN
MSG91_TEMPLATE_ID=...
MSG91_FLOW_URL=https://control.msg91.com/api/v5/flow/
SMS_TIMEOUT_SECONDS=10
```
The MSG91 flow template must be DLT-approved and use the variable names `OTP`, `LINK`, and
`MESSAGE` where applicable. The backend normalises Indian numbers to `+91XXXXXXXXXX` and sends
the bare 10-digit mobile to MSG91.

**Twilio**
```text
PARENT_CONNECT_SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+91...
SMS_TIMEOUT_SECONDS=10
```
DLT registration, sender IDs, and template approval are the operator's responsibility with
either provider. SMS content deliberately omits scores and other sensitive student details.

### Scheduler configuration
```text
PARENT_CONNECT_SCHEDULER_ENABLED=true
PARENT_CONNECT_SCHEDULE_HOUR=9
PARENT_CONNECT_SCHEDULE_MINUTE=0
PARENT_CONNECT_TIMEZONE_OFFSET_MINUTES=330
PARENT_CONNECT_SCHEDULER_POLL_SECONDS=60
PARENT_CONNECT_JOB_LEASE_MINUTES=30
PARENT_CONNECT_MAX_DELIVERY_RETRIES=3
PARENT_CONNECT_REPORT_LINK_DAYS=14
PARENT_CONNECT_PUBLIC_APP_URL=https://your-udaan-host
PARENT_CONNECT_OTP_EXPIRE_MINUTES=10
PARENT_CONNECT_OTP_MAX_ATTEMPTS=5
PARENT_CONNECT_OTP_RESEND_SECONDS=60
PARENT_CONNECT_OTP_LENGTH=6
```
- The scheduler starts with the FastAPI app (`startup`) and stops on `shutdown`; it is
  independent of any browser session.
- It polls, and after **Saturday 09:00 IST** runs the most recent completed Saturday–Friday
  week. A late start catches up the latest due week.
- Multiple app instances are safe: `scheduler_job_runs` is unique on
  `(job_name, run_key)` (`parent_connect_weekly`), with a heartbeat lease for crash takeover.
  Report uniqueness provides a second idempotency guard.
- Set `PARENT_CONNECT_SCHEDULER_ENABLED=false` when running a dedicated external cron or
  worker. Manual generation remains available through the authenticated API.

### Startup commands
```powershell
# Backend (PowerShell)
$env:PYTHONPATH="backend"
python -m uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
cmd /c "npm run dev"
```
Open `http://localhost:5173`, sign in as a parent and choose the **Weekly Reports** tab, or sign
in as a student and open **Option 2: ParentConnect – Weekly Progress Reports** on the dashboard.
A real report email/SMS is only sent when a provider is configured; in development the status
is shown as `not_configured` rather than pretending delivery succeeded.

### Phase 5 verification
```powershell
$env:PYTHONPATH="backend"
python -m pytest backend/tests -q
# 102 passed
```
```powershell
cd frontend
cmd /c "npm run build"
# ✓ built
```
The Phase 5 tests cover email and phone registration, OTP verification and limits, invalid
contacts, consent opt-out, unverified contacts, relationship authorization, student-driven
setup for verified links, rejection of pending/unrelated links, preference updates, last-report
status, report calculation and previous-week comparison, inactive weeks, email/SMS delivery,
Saturday scheduling, duplicate prevention, retries, public-link expiry/revocation, unauthorized
access, and existing parent login. Email and SMS providers are mocked; tests never send real
messages.

### Deployment requirements
- Set `SECRET_KEY`, `DATABASE_URL`, and a strict `CORS_ORIGINS` allow-list.
- Set `PARENT_CONNECT_PUBLIC_APP_URL` to the public frontend origin so email/SMS links resolve
  to the deployed app (`?report_token=...`).
- Configure exactly one email provider and one SMS provider, or leave them disabled.
- Keep all provider credentials in backend environment variables only; never expose them via
  the frontend or the `/status` endpoint.
- Run `init_db_schema()` (automatic at app startup) on a backed-up database. Phase 5 only adds
  tables and indexes; it never drops or recreates existing tables.
- If running multiple instances, keep the in-process scheduler enabled or use exactly one
  external scheduler; both are protected by the database job lock.
- Monitor `notification_logs` and `scheduler_job_runs` for delivery failures and completed runs.

