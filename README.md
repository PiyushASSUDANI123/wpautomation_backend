# WP Automation Backend

This is the backend service for the WhatsApp Automation system. It provides a RESTful API and webhook handling for managing WhatsApp campaigns, contacts, and real-time messaging using the official WhatsApp Cloud API.

## Features

- **WhatsApp Cloud API Integration:** Sends and receives messages, media, and template messages.
- **Webhook Handling:** Listens for inbound messages, delivery statuses, and read receipts.
- **Campaign Management:** Built-in pacing logic (via BullMQ or in-memory fallback) to prevent spam blocks by Meta.
- **Database:** Supabase PostgreSQL for storing contacts, messages, and campaigns.
- **Media Uploads:** Cloudinary integration for handling inbound and outbound media.

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:** Create a `.env` file with the following variables:
   ```env
   PORT=5001
   NODE_ENV=production
   USE_REDIS=false # Set to true to enable BullMQ pacing
   DATABASE_URL=postgres://<user>:<password>@<host>:5432/postgres
   SUPABASE_URL=https://<your-supabase-url>
   SUPABASE_KEY=<your-supabase-key>
   
   # Meta WhatsApp API
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_BUSINESS_ACCOUNT_ID=...
   META_ACCESS_TOKEN=...
   META_API_VERSION=v17.0
   WEBHOOK_VERIFY_TOKEN=wpautomation
   
   REDIS_URL=redis://localhost:6379
   FRONTEND_URL=https://wpautomationfrontend.vercel.app
   CLOUDINARY_URL=cloudinary://...
   ```

3. **Start the server:**
   ```bash
   npm start
   # or for development with nodemon:
   npm run dev
   ```
