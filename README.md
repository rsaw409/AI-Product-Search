# AI Product Search Engine

A RAG-pattern product search API: an LLM turns free text into structured filters, ChromaDB retrieves semantically relevant products (embedded via its default local MiniLM model) filtered by those constraints, and an
optional final LLM pass re-ranks if user sort via relevance.

## Architecture — RAG pattern

```
                    ┌─────────────────────────────────────────┐
                    │  1. UNDERSTAND                          │
  User query   ───▶ │  LLM extracts structured filter:        │
                    │  { minPrice, maxPrice, category[] }     |
                    │                                         │
                    └─────────────────┬───────────────────────┘
                                      ▼
                    ┌─────────────────────────────────────────┐
                    │  2. RETRIEVE                            │
                    │  ChromaDB: query text embedded via its  │
                    │  default MiniLM model, results filtered │
                    │  by price/category METADATA, ranked by  │
                    │  similarity                             |
                    └─────────────────┬───────────────────────┘
                                      ▼
                    ┌─────────────────────────────────────────┐
                    │  3. GENERATE                            │
                    │  re-ranks the top-N retrieved items     │
                    │  by user intent either by price or      |
                    |  relevancy (one-line justification per  |
                    |  item )                                 │
                    └─────────────────┬───────────────────────┘
                                       ▼
                                 Ranked results
```

## Design Design

### Why price/category are metadata, not embedded text

Only **title + description** get embedded into Chroma — price and category are stored as **metadata** and used for hard filtering via Chroma's `where` clause (`{ price: { $gte, $lte }, category: { $in } }`).

This is deliberate: a numeric constraint like "under ₹5000" is not a semantic concept — embedding it alongside product text would blur the vector with something a similarity search can't reason about precisely.
Keeping it as structured metadata makes it an exact, reliable filter instead of a fuzzy nudge.

### Why an LLM extracts the filter instead of regex

`generateFilter.js` sends the query plus the actual list of categories that exist in the catalog to LLM, and asks for structured JSON back.
This generalizes far better than a hand-maintained keyword dictionary — it understands category names it's never seen hardcoded, handles **phrasing variation**, and can reason about which categories are _plausibly_ relevant to an **ambiguous query**.

### Why ChromaDB instead of computing embeddings ourselves

Chroma's JS client defaults to `Xenova/all-MiniLM-L6-v2` (via `@chroma-core/default-embed` / `@xenova/transformers`) for both documents and queries — the same well-known local embedding model, but Chroma additionally gives us:

- **Storage + fast retrieval** (HNSW index) — the actual "vector database" value-add, which matters once a catalog grows past what brute-force cosine similarity can handle cheaply.
- **Metadata filtering built into the query itself** (`where` clause) rather than a separate filtering pass in application code.
- **Idempotent upserts** — the catalog can be re-synced on every app startup without duplicating records.

## Quick start

Make Sure GROQ_API_KEY is in `.env` file, Generate new key if required at `https://console.groq.com/keys`

```
GROQ_API_KEY=gsk_*******************************
```

If you have dataset of products, you can place that json file in `data/products.json`. On starup, node.js will re-sync data from this particular file.

```json
[
  { "id": "P001", "title": "Redragon K552 Mechanical Gaming Keyboard", "description": "Compact 87-key mechanical keyboard with red switches, RGB backlight, built for fast-paced gaming.", "category": "Gaming Keyboards", "price": 3499 },
  { "id": "P002", "title": "Logitech G213 Prodigy Gaming Keyboard", "description": "Membrane gaming keyboard with customizable RGB lighting and spill-resistant design.", "category": "Gaming Keyboards", "price": 4299 },
  ....
  ....
]
```

Installating npm dependency

```bash
npm install
```

Staring DB and Server locally

```bash

# Terminal 1 — start the vector database on localhost:8000
npm run startDB

# Terminal 2 - start the API on http://localhost:3000
npm start
```

Check server health:

```bash
curl http://localhost:3000/health
# { "status": "ok" }
```

Try a search:

```bash
curl -X POST http://localhost:3000/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Budget keyboard between 4000 and 5000", "limit": 5, "sortBy": "relevance"}'
```

## Ranking explanation

Every result includes an `explanation` object, and the top-level response includes `appliedFilter` so the whole pipeline is auditable end to end:

there are three type of ranking possible

1. Default Ranking (No sortBy parameter in request) :- Semantic Similarity with query, here we use cosine similarity which measure angle between vectors.
2. Relevance (sortBy: relevance):- Semantic similar results are passed again to LLM with user's query to reorder based on user's relevant factor. most relevant should come to top (Idea here is top result should be most relevance to user instead of similarity score)
3. Price based :- Semantic results sorted by ascending price

## AI prompts used

All prompts are in `src/contants.js`

### Example Request:

```

curl --location 'http://localhost:3000/v1/search' \
--header 'Content-Type: application/json' \
--data '{
"query": "Budget keyboard",
"limit": 5
}'

curl --location 'http://localhost:3000/v1/search' \
--header 'Content-Type: application/json' \
--data '{
    "query": "Budget keyboard under 10000",
    "limit": 5,
    "sortBy" : "relevance"
}'

curl --location 'http://localhost:3000/v1/search' \
--header 'Content-Type: application/json' \
--data '{
    "query": "Gift cards for PlayStation between 1000 and 5000",
    "limit": 5,
    "sortBy" : "relevance"
}'

curl --location 'http://localhost:3000/v1/search' \
--header 'Content-Type: application/json' \
--data '{
    "query": "Gift cards which should not cost more than 5000",
    "limit": 5,
    "sortBy" : "relevance"
}'


```

### Response

```json
{
  "query": "Budget keyboard",
  "appliedFilter": {
    "minPrice": null,
    "maxPrice": null,
    "category": ["Gaming Keyboards", "Mechanical Keyboards"]
  },
  "resultCount": 5,
  "results": [
    {
      "product": {
        "id": "P005",
        "title": "HP K500F Wired Gaming Keyboard",
        "description": "Membrane keyboard with spill resistance and quiet keys, suited for casual gaming and office work.",
        "category": "Gaming Keyboards",
        "price": 999
      },
      "explanation": {
        "semanticScore": 0.6626,
        "distance": 0.3374
      }
    },
    {
      "product": {
        "id": "P004",
        "title": "Cosmic Byte CB-GK-16 Firebolt Mechanical Keyboard",
        "description": "Affordable mechanical gaming keyboard with outemu blue switches and rainbow backlighting.",
        "category": "Gaming Keyboards",
        "price": 2199
      },
      "explanation": {
        "semanticScore": 0.6535,
        "distance": 0.3465
      }
    },
    {
      "product": {
        "id": "P030",
        "title": "iBall Wired Gaming Keyboard",
        "description": "Basic wired membrane keyboard with backlighting, targeted at budget-conscious gamers.",
        "category": "Gaming Keyboards",
        "price": 699
      },
      "explanation": {
        "semanticScore": 0.646,
        "distance": 0.354
      }
    },
    ...
    ...
  ]
}
```

```

```
