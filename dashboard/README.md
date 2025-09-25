# Finance AI — Frontend (Stori Challenge)

This is the **React + Vite** frontend for the Finance AI challenge.  
It consumes the backend REST APIs (`/api/summary`, `/api/timeline`, `/api/advice`) to display spending summaries, a timeline of income and expenses, and AI-powered financial advice.

---

## 🚀 Tech Stack

- **React 19**
- **Vite** (dev server & build tool)
- **TypeScript**
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- ESLint + Prettier (linting & formatting)

---

## 📦 Project Setup

### Create .env file
```
VITE_API_BASE_URL=<your_api_base_url_here>
```

### Install dependencies
```bash
pnpm install
# or npm install / yarn install
```

### Development server
`npm run dev`

> Runs the Vite dev server. The app will be available at http://localhost:5173


### Build for production
`npm run build`

Generates a production-ready build in the dist/ folder.

### Preview production build
`npm run preview`


## Features

- Summary chart: Spending by category
- Timeline chart: Daily income vs. expenses (with optional net balance view)
- Advice card: Placeholder for AI-driven financial guidance
- Responsive design: Mobile-friendly, clean layout
- Tips and recomendations from your AI assistant (Powered by bedrock)

## Backend Integration

The frontend expects a running backend with the following endpoints:

- GET /api/summary
- GET /api/timeline
- POST /api/advice

The API base URL should be set via environment variable VITE_API_BASE_URL.