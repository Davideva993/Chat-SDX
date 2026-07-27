import express from "express";
import helmet from "helmet";
import cors from "cors";
import routes from "./routes/routes.js";

const app = express();

// Read allowed origins from env, comma-separated; default to '*' for dev
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((o) => o.trim());

// CORS middleware: allow configured origins or reflect the request origin
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

app.use(express.static("public"));
app.use(express.json());
app.use(helmet());

app.use("/api", routes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

export default app;