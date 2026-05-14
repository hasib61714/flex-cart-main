# FlexCart — E-Commerce Platform

A full-stack e-commerce web application with real-time features, AI-powered product recommendations, visual search, and multi-role admin panels.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vanilla CSS, Framer Motion, Socket.IO Client |
| Backend | Node.js, Express.js, Socket.IO |
| Database | PostgreSQL (Supabase) |
| Auth | JWT (Access + Refresh tokens) |
| File Uploads | Multer + Sharp |
| AI Services | Python (ResNet50 visual search, hybrid recommender) |
| Deployment | Vercel (frontend) · Railway (backend) |

---

## Features

- **Product Listings** — Search, filter by category, drag-to-cart
- **AI Recommendations** — Hybrid collaborative + content-based recommender
- **Visual Search** — Upload an image to find similar products (ResNet50)
- **Real-time Notifications** — Socket.IO powered live updates
- **Price Negotiation** — Buyers can negotiate with sellers via AI-assisted chat
- **Spin Reward** — Daily spin wheel for discount coupons
- **Company Dashboard** — Seller panel to manage products, orders, reviews
- **Multi-role Admin** — Super Admin, Staff Admin, Delivery Admin panels
- **Order Tracking** — Live delivery status with route management
- **Responsive UI** — Mobile hamburger menu, desktop sidebar, fully adaptive

---

## Project Structure

```
FlexCart-Ecommarce-main/
├── flexcart-backend/        # Express API server
│   ├── config/              # DB connection
│   ├── controllers/         # Route handlers
│   ├── middleware/          # Auth, upload, AI processor
│   ├── models/              # SQL migrations
│   ├── routes/              # API routes
│   ├── services/            # Email, real-time, delivery
│   ├── ai/                  # Python AI microservices
│   └── server.js
└── flexcart-frontend/       # React app
    └── src/
        ├── components/      # UI components
        ├── context/         # Global state (Auth, Cart, Theme)
        ├── hooks/           # Custom hooks
        └── services/        # API client services
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL (or a Supabase project)
- Python 3.10+ (optional — for AI features)

### Backend Setup

```bash
cd flexcart-backend
npm install
cp .env.example .env    # Fill in your values
npm run dev
```

**Required `.env` variables:**

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
FRONTEND_URL=http://localhost:3000
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=YourStrongPassword
```

### Frontend Setup

```bash
cd flexcart-frontend
npm install
npm start
```

Create `flexcart-frontend/.env.local`:

```env
REACT_APP_API_URL=http://localhost:5000/api
```

### AI Services (Optional)

```bash
cd flexcart-backend
python -m venv ../.venv
../.venv/Scripts/pip install -r ai/requirements.txt
npm run vs:start      # Visual search service (port 5001)
npm run rec:start     # Recommender service (port 5003)
```

---

## Deployment

### Backend → Railway
1. Connect GitHub repo to Railway
2. Set all env variables in Railway dashboard
3. Deploy — `Procfile` is already configured

### Frontend → Vercel
1. Import repo to Vercel
2. Set `REACT_APP_API_URL` to your Railway backend URL
3. Deploy

---

## API Overview

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/products` | List products |
| POST | `/api/cart` | Add to cart |
| GET | `/api/orders` | Order history |
| POST | `/api/ai/recommend` | Get recommendations |
| POST | `/api/ai/visual-search` | Image-based search |

---

## License

MIT
