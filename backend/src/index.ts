import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";

app.use(
  cors({
    origin: allowedOrigin,
  }),
);
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    service: "bookwise-backend",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/books", (_request, response) => {
  response.json({
    items: [
      {
        id: "sample-book",
        title: "Sample Uploaded Book",
        format: "pdf",
        language: "en",
        status: "prototype",
      },
    ],
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`bookwise-backend listening on ${port}`);
});
