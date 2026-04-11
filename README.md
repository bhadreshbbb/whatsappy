# WhatsWay Pro

Full-stack Node.js + React platform for automated WhatsApp marketing with live visitor tracking, abandoned cart recovery, smart segmentation, and multi-language campaigns.

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- PostgreSQL 14+

### 1. Create Database
```sql
CREATE DATABASE whatscart;
```

### 2. Install Dependencies
```bash
npm run setup
```

### 3. Run Migrations
```bash
npm run migrate
```

### 4. Start Development
```bash
npm run dev
```

This starts:
- **Backend API**: http://localhost:3001
- **Frontend Dashboard**: http://localhost:3000

## Project Structure

```
whatsway-pro/
├── client/                    # React 18 + Vite frontend
│   ├── src/
│   │   ├── pages/           # Dashboard, Visitors, Campaigns, etc.
│   │   ├── components/      # Sidebar, Header
│   │   ├── api.js          # API client
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── public/
│   │   └── tracker.js       # Website tracking script
│   └── package.json
│
├── server/                    # Node.js + TypeScript backend
│   ├── src/
│   │   ├── routes/         # Express routes
│   │   ├── controllers/    # Route handlers
│   │   ├── services/       # Database, Geo, WhatsApp
│   │   ├── jobs/           # Cron jobs
│   │   ├── middleware/     # Error handling
│   │   └── index.ts       # App entry
│   ├── database/
│   │   └── migrations/     # SQL migrations
│   └── package.json
│
├── shared/                    # Shared types/schemas
│
├── package.json               # Root scripts
└── README.md
```

## Features

- 📍 Live visitor tracking with IP geolocation
- 🛒 Abandoned cart recovery automation
- 🤖 WhatsApp Business API integration
- ⏱ Smart scheduling (15min - 72h delays)
- 🌐 Multi-language support (Hindi, Gujarati, Tamil, etc.)
- 📝 Visual WhatsApp template editor
- 📊 Analytics dashboard with charts

## Website Integration

Add this to your website's `<head>`:

```html
<script>
  window.WhatswayConfig = {
    channelId: "demo",
    baseUrl: "http://localhost:3001",
  };
</script>
<script src="http://localhost:3001/tracker.js" async></script>
```

Then track user actions:
```javascript
WhatsWay.identify({ phone: "919876543210", name: "Customer" });
WhatsWay.trackAddToCart({ cartId: "cart_123", products: [...], totalAmount: 999 });
WhatsWay.trackCheckout({ eventType: "checkout_completed", orderId: "ORD-123" });
```

## API Endpoints

### Tracking
- `POST /api/tracking/visitor` - Track new visitor
- `POST /api/tracking/identify` - Identify user by phone
- `POST /api/tracking/cart` - Track add to cart
- `POST /api/tracking/checkout` - Track checkout

### Visitors
- `GET /api/visitors` - List all visitors
- `GET /api/visitors/stats` - Get visitor statistics

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `POST /api/campaigns/:id/send` - Send campaign manually

### Templates
- `GET /api/templates` - List templates
- `POST /api/templates` - Create template

### Analytics
- `GET /api/analytics/dashboard` - Dashboard stats
- `GET /api/analytics` - Detailed analytics
