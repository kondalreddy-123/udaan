# UDAAN — Deployment & Environment Setup Guide

## 1. Quick Evaluation Options

### Option A: Zero-Config Instant Browser Demonstrator (Recommended for Judges)
Simply open `standalone_demo.html` in any modern web browser (Chrome, Edge, Firefox, Safari).
- Runs 100% offline with zero dependencies.
- Features all 7 Learning Detective stages, 3D animated cube, bilingual toggle, offline IndexedDB sync queue, teacher command center, and model comparison.

---

## 2. Local Full-Stack Development

### Backend Setup (FastAPI + SQLAlchemy)
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   python -m pip install -r requirements.txt
   ```
3. Run the automated test suite:
   ```bash
   $env:PYTHONPATH="."
   python -m pytest tests -v
   ```
4. Start the FastAPI development server:
   ```bash
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   Interactive API documentation will be available at:
   - Swagger UI: `http://127.0.0.1:8000/docs`
   - ReDoc: `http://127.0.0.1:8000/redoc`

### Frontend Setup (React + Vite PWA)
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The application will be accessible at: `http://localhost:5173`

---

## 3. Production Deployment

### Frontend on Vercel
1. Connect your repository to Vercel.
2. Configure settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Environment Variables:
   - `VITE_API_BASE_URL`: URL of your deployed backend (e.g., `https://udaan-api.onrender.com/api`)

### Backend on Render / Railway
1. Create a new Web Service from repository.
2. Configure settings:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Environment Variables:
   - `DATABASE_URL`: PostgreSQL connection string (defaults to SQLite if omitted)
   - `SECRET_KEY`: High-entropy random secret
   - `CORS_ORIGINS`: Comma-separated allowed frontend domains
