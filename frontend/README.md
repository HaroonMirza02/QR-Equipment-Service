# PlantOps QR Equipment Service — React Frontend

Modern React frontend for the QR Equipment Service system, built with **React**, **Vite**, **TypeScript**, **Tailwind CSS**, and **React Router**.

---

## 1. Quick Start (Local Development)

### Install Dependencies
```bash
cd frontend
npm install
```

### Start Development Server
```bash
npm run dev
```
The Vite development server will start at `http://localhost:5173`.
*Note: Make sure your Express backend is running on `http://localhost:3000` (`npm start` or `npm run dev` in the project root).*

---

## 2. API Configuration (`VITE_API_BASE_URL`)

The frontend communicates with the backend API via environment variables.

### Local Development
During local development, API requests to `/api` and `/static` are proxied automatically to `http://localhost:3000` via `vite.config.ts`.

### Production Deployment
Set the `VITE_API_BASE_URL` environment variable to your deployed Express backend URL:
```bash
VITE_API_BASE_URL=https://qr-equipment-backend.onrender.com
```

---

## 3. Building for Production

To compile TypeScript and build the optimized production assets:
```bash
npm run build
```
The static output bundle will be generated in `frontend/dist`.

---

## 4. Deploying to Vercel

1. Push your code to GitHub.
2. In Vercel, import the repository and set the **Root Directory** to `frontend`.
3. Framework Preset: **Vite**.
4. Environment Variables:
   - Add `VITE_API_BASE_URL` pointing to your Express API server (e.g. on Render, Railway, or AWS).
5. Deploy! Vercel will automatically use `vercel.json` for client-side single-page application routing.
