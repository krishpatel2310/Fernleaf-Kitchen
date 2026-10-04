# Fernleaf Kitchen — Next.js Operations Panel

Frontend web application for the Fernleaf Kitchen commercial kitchen operations admin panel.

## Features
- **Role-Based Workflows**: Dedicated dashboards and views for Admin, Kitchen Staff, Dispatchers, and Delivery Drivers.
- **Pure HTTP REST Client**: Communicates exclusively over HTTP with the NestJS API at `http://localhost:4000/api`. Zero direct database or Prisma access.
- **Real-Time Responsiveness**: Tailwind CSS v4 styling, Lucide icons, live metric calculations, and mobile-friendly layouts.

## Setup & Running
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Run development server
npm run dev

# Or build and start for production
npm run build
npm run start
```
