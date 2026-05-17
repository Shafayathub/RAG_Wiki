import express, { Express, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env";
import { ingestRouter } from "./modules/ingest/ingest.router";
import { errorHandler } from "./middleware/errorHandler";

const app: Express = express();

app.use(helmet());
app.use(
  cors({
    origin:
      config.nodeEnv === "production"
        ? (process.env["FRONTEND_URL"] ?? "https://domain.com")
        : "http://localhost:5173",
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json({ limit: "1mb" }));

app.use("/api/v1/ingest", ingestRouter);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(errorHandler);

export default app;
