# AI Prime STUDIO - AI video & Photo Creator

A modern, high-performance AI video and photo template creation studio built with React 19, TypeScript, Tailwind CSS v4, Motion, and an Express.js backend.

## ✨ Features

- **Trending Face Swap Video Engine:** Photorealistic neural face swap mapping user portraits onto 9:16 vertical reels (Monaco GP Supercar, Cannes Gala, Cyber Samurai, Maharaja Palace, Amalfi Yacht, Paris Runway, and Viral Stage Dance).
- **Hot Instagram "Photo-to-Dance" Templates:** Transform any single portrait photo into a synchronized 60FPS dance video with realistic body mechanics and beat-drop rhythm.
- **Provider-Agnostic Architecture:** Centralized routers and adapters (`src/services/`) for AI image generation, video diffusion, face-swap, payment gateways (Cashfree & Razorpay), and media storage. Swap providers without touching UI or business logic.
- **Server-Authoritative Credit Ledger:** Instant credit reservation with automated 100% refund transactions on rendering failures.
- **iPhone-Grade Liquid Glass UI:** Double-bezel floating cards, subtle animated laser light edges, dynamic scroll-condensing navigation bar, and iOS spring tactile feedback.
- **Subscription & Top-Up System:** ₹1 Pro Pass trial with recurring autopay mandates, weekly creator passes, and quick-refill packs.

---

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Motion (`motion/react`), Lucide React icons
- **Backend:** Express.js (Node.js), TypeScript (`tsx`)
- **AI Integrations:** Google GenAI SDK (`@google/genai`) with Gemini 3.8 Flash, modular video diffusion and face-swap pipelines
- **Payment Providers:** Cashfree Payments & Razorpay neutral adapters

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ or 20+
- npm or pnpm / bun

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/backupvideoemail-create/lumina-ai-studio.git
cd lumina-ai-studio
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set the required environment variables:
- `GEMINI_API_KEY`: Your Google Gemini API Key (optional for development, high-fidelity mock renders are built-in).
- `APP_URL`: App URL (e.g. `http://localhost:3000`).

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production

```bash
npm run build
npm run start
```

---

## 📁 Project Structure

```
├── server.ts                 # Full-stack Express server with API routes & credit ledger
├── src/
│   ├── services/             # Provider-Agnostic Adapters
│   │   ├── ai/               # AI Router (generateImage, generateVideo, generateFaceSwapVideo)
│   │   ├── payments/         # Payment Router (Cashfree & Razorpay)
│   │   └── storage/          # Storage Router
│   ├── context/              # Central state management (AppContext)
│   ├── views/                # Main tabs (HomeView, TemplatesView, CreationsView, ProfileView)
│   ├── components/           # UI components, floating modals, drawers & cards
│   ├── data/                 # Seed templates, plans, top-ups, and face-swap scenes
│   └── types/                # Core TypeScript interfaces
```

---

## 🔒 Security & Privacy

No hardcoded API keys, tokens, or private credentials are stored in this repository. All sensitive credentials are read from environment variables at runtime.
