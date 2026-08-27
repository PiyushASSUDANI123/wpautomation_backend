const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const { Server } = require("socket.io");

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Helper to robustly get allowed origins
const getAllowedOrigins = () => {
  const envUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  // Remove trailing slash if present
  const cleanUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
  return [cleanUrl, cleanUrl + '/', "http://localhost:3000", "http://localhost:3001"];
};

// ============================================
// Socket.io Setup
// ============================================
const io = new Server(server, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ["GET", "POST"],
  },
});

// Make io accessible in routes via req.app.get('io')
app.set("io", io);

io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ============================================
// Middleware
// ============================================
app.use(
  cors({
    origin: getAllowedOrigins(),
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// Routes
// ============================================

// API routes
const apiRoutes = require("./routes/api");
const contactRoutes = require("./routes/contacts");
const messageRoutes = require("./routes/messages");
const campaignRoutes = require("./routes/campaigns");
const webhookRoutes = require("./routes/webhook");
const authRoutes = require("./routes/auth");
const contactListsRoutes = require("./routes/contact_lists");
const templateRoutes = require("./routes/templates");
const mediaRoutes = require("./routes/media");

app.use("/api", apiRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/contact_lists", contactListsRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/media", mediaRoutes);
app.use("/webhook", webhookRoutes);

// Health check route
app.get("/", (req, res) => {
  res.json({
    message: "WP Automation Backend API",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "GET /api/health",
      auth: "POST /api/auth/login",
      contact_lists: "GET/POST /api/contact_lists",
      contacts: "GET /api/contacts",
      messages: "GET /api/messages/:contactId",
      campaigns: "GET /api/campaigns",
      webhook: "GET/POST /webhook",
    },
  });
});

// ============================================
// Error Handling
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// ============================================
// Initialize Campaign Queue & Start Server
// ============================================
const { initBullMQ } = require("./services/campaignProcessor");

// Try to initialize BullMQ (will fallback to in-memory if Redis unavailable)
initBullMQ(io);

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔌 WebSocket server ready`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
