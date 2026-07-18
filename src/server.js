/**
 * server.js
 *
 * Express API wrapper around the search engine.
 *
 *   GET  /health              -> liveness check
 *   POST /search               body: { "query": "...", "limit": 10 }
 */

import express from "express";
import { upsertProducts } from "./vectorStore.js";
import { healthCheck, searchController } from "./controller.js";

const PORT = process.env.PORT || 3000;

const main = async () => {
  await upsertProducts();

  const app = express();

  app.use(express.json());

  app.get("/health", healthCheck);

  app.post("/v1/search", searchController);

  app.listen(PORT, () => {
    console.log(`Product search API listening on port ${PORT}`);
  });
};

main();
