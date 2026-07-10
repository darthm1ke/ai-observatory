require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const express  = require("express");
const cors     = require("cors");
const rateLimit = require("express-rate-limit");
const path     = require("path");

const beaconRoutes     = require("./routes/beacon");
const contributeRoutes = require("./routes/contribute");
const apiRoutes        = require("./routes/api");
const siteRoutes       = require("./routes/sites");

const app  = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "64kb" }));

// Rate limiting per IP
const beaconLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
app.use("/beacon",     beaconLimiter, beaconRoutes);
app.use("/contribute", beaconLimiter, contributeRoutes);
app.use("/api",        apiLimiter,    apiRoutes);
app.use("/sites",      siteRoutes);

// Serve dashboard
app.use(express.static(path.join(__dirname, "../dashboard")));

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Catch-all → dashboard
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../dashboard/index.html"));
});

app.listen(PORT, () => {
  console.log(`AI Observatory running on http://localhost:${PORT}`);
  if (!process.env.ADMIN_KEY) {
    console.warn("⚠  ADMIN_KEY not set - site registration disabled");
  }
});
