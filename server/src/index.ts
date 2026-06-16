import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import placesRouter from "./routes/places.js";

dotenv.config({ path: "../.env" });
dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());
app.use("/api/places", placesRouter);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.listen(port, () => {
  console.log(`FoodFinder server listening on http://localhost:${port}`);
});
