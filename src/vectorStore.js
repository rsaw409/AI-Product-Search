/**
 * vectorStore.js
 *
 * ChromaDB: stores an EMBEDDING of just title+description per
 * product (semantic content), with price and category as METADATA used
 * for hard filtering (not embedded — numeric/categorical constraints
 * don't belong in a semantic vector, same reasoning as the regex
 * fallback's price extraction).
 *
 * Uses Chroma's DEFAULT embedding function (Xenova/all-MiniLM-L6-v2 via
 * @chroma-core/default-embed / @xenova/transformers under the hood) —
 * we don't compute embeddings ourselves; Chroma embeds both the documents
 * we add and the query text we search with, consistently, using the same
 * model.
 */

import { ChromaClient } from "chromadb";

import products from "../data/products.json" with { type: "json" };

const COLLECTION_NAME = "products";
const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";

function parseChromaUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port) || 8000,
    ssl: u.protocol === "https:",
  };
}

/**
 * Builds a Chroma `where` clause from a structured filter.
 * { minPrice, maxPrice, category } -> Chroma metadata filter
 */
function buildWhereClause({ minPrice, maxPrice, category }) {
  const conditions = [];

  if (minPrice != null) conditions.push({ price: { $gte: minPrice } });
  if (maxPrice != null) conditions.push({ price: { $lte: maxPrice } });
  if (category && category.length > 0)
    conditions.push({ category: { $in: category } });

  if (conditions.length === 0) return undefined; // no filter -> match everything
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}

/**
 * Connects to Chroma, verifies it's reachable, and gets/creates the
 * products collection. Throws if Chroma isn't running
 */
async function connect() {
  const client = new ChromaClient(parseChromaUrl(CHROMA_URL));
  await client.heartbeat();
  const collection = await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    // HNSW (Hierarchical Navigable Small World) is the index structure.
    // It makes nearest-neighbor search much faster than comparing the query against every stored vector.
    // cosine measure angle between vectors.
    configuration: { hnsw: { space: "cosine" } },
  });
  return { client, collection };
}

/**
 * Retrieves products relevant to `queryText`, filtered by the structured
 * filter, ranked by embedding similarity.
 *
 * @param {string} queryText - full raw query, embedded by Chroma's default fn
 * @param {{ minPrice: number|null, maxPrice: number|null, category: string[] }} filter
 * @param {number} nResults
 * @returns {Promise<Array<{ id: string, price: number, category: string, distance: number, similarity: number }>>}
 */
async function queryProducts(queryText, filter, nResults) {
  const { collection } = await connect();
  const where = buildWhereClause(filter);

  const result = await collection.query({
    queryTexts: [queryText],
    nResults,
    where,
    include: ["distances", "metadatas"],
  });

  const ids = result.ids[0] || [];
  const distances = result.distances[0] || [];
  const metadatas = result.metadatas[0] || [];

  return ids.map((id, i) => ({
    id,
    price: metadatas[i]?.price,
    category: metadatas[i]?.category,
    distance: distances[i],
    similarity: 1 - distances[i],
  }));
}

/**
 * Upserts all products data in Vector DB
 */
async function upsertProducts() {
  try {
    console.log("[startup] Connecting to Chroma...");
    const { collection } = await connect();
    console.log(
      "[startup] Connected. Upserting product catalog (embeds via Chroma's default MiniLM function)...",
    );
    await collection.upsert({
      ids: products.map((p) => p.id),
      documents: products.map((p) => `${p.title}. ${p.description}`),
      metadatas: products.map((p) => ({
        price: p.price,
        category: p.category,
      })),
    });
    const count = await collection.count();
    console.log(
      `[startup] Upsert complete. DB Collection contains ${count} products.`,
    );
  } catch (err) {
    console.error("make sure you started DB: npm run startDB");
    throw err;
  }
}

/**
 *
 * @param {*} id
 * @returns
 */
const getProductById = (id) => products.find((p) => p.id === id);

/**
 * Returns all valid categories
 * @returns {string[]}
 */
const getAllCategories = () => [...new Set(products.map((p) => p.category))];

export { queryProducts, upsertProducts, getProductById, getAllCategories };
