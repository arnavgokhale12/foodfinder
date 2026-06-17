import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import placesRouter from "./routes/places.js";

dotenv.config({ path: "../.env" });
dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);

// CORS — allow explicit allowlist plus localhost for dev
const allowedOrigins = new Set<string>(["http://localhost:5173", "http://localhost:3000"]);
const envOrigins = process.env.ALLOWED_ORIGINS ?? "";
for (const origin of envOrigins.split(",")) {
  const trimmed = origin.trim();
  if (trimmed) allowedOrigins.add(trimmed);
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin not allowed"));
      }
    }
  })
);

// Simple in-memory rate limiter: 60 req/min per IP
const rateMap = new globalThis.Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

app.use((req: Request, res: Response, next: NextFunction) => {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.ip ?? "unknown";
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }

  if (entry.count >= RATE_LIMIT) {
    res.status(429).json({ error: "Rate limit exceeded — please slow down." });
    return;
  }

  entry.count++;
  next();
});

// Prune stale rate-limit entries every 5 minutes to avoid unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now > entry.resetAt) rateMap.delete(ip);
  }
}, 5 * 60_000);

app.use(express.json());
app.use("/api/places", placesRouter);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.listen(port, () => {
  console.log(`FoodFinder server listening on http://localhost:${port}`);
});
