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
