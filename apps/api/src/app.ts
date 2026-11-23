import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { ZodError } from "zod";
import { config } from "./config.js";
import { AppError } from "./errors.js";
import { advanceProposalsRouter } from "./routes/advance-proposals.js";
import { bootstrapRouter } from "./routes/bootstrap.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: config.WEB_ORIGIN,
    methods: ["GET", "POST"],
    allowedHeaders: ["authorization", "content-type", "idempotency-key", "x-organization-id"],
  }),
);
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/api/bootstrap", bootstrapRouter);
app.use("/api/advance-proposals", advanceProposalsRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: "invalid_request", message: "Revise os dados informados.", details: error.issues },
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: { code: "internal_error", message: "Não foi possível concluir a operação." },
  });
};

app.use(errorHandler);

