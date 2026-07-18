# AI Product Search Engine

A RAG-pattern based product search API: an LLM turns free text into structured filters, ChromaDB retrieves semantically relevant products (embedded via its default local MiniLM model) filtered by those constraints, and an optional final LLM pass re-ranks if user sort via relevance.

## Architecture

```text
                    ┌─────────────────────────────────────────┐
                    │  1. UNDERSTAND                          │
  User Query  ───▶  │  The LLM interprets the user's intent   │
                    │  and extracts structured filters, e.g.: │
                    │  { minPrice, maxPrice, category[] }     │
                    └─────────────────┬───────────────────────┘
                                      ▼
                    ┌─────────────────────────────────────────┐
                    │  2. RETRIEVE                            │
                    │  ChromaDB embeds the query using its    │
                    │  default MiniLM embedding model and     │
                    │  performs semantic search. Results are  │
                    │  filtered using metadata (price,        │
                    │  category, etc.) and ranked by cosine   │
                    │  similarity.                            │
                    └─────────────────┬───────────────────────┘
                                      ▼
                    ┌─────────────────────────────────────────┐
                    │  3. GENERATE (Optional)                 │
                    │  The top-N retrieved products are       │
                    │  re-ranked by the LLM based on the      │
                    │  selected ranking strategy (relevance   │
                    │  or price). The LLM may also provide a  │
                    │  brief justification for each result.   │
                    └─────────────────┬───────────────────────┘
                                      ▼
                                Ranked Results
```

## Design Decision

### Why price/category are metadata, not embedded text

Only **title + description** get embedded into Chroma — price and category are stored as **metadata** and used for hard filtering via Chroma's `where` clause (`{ price: { $gte, $lte }, category: { $in } }`).

This is deliberate: a numeric constraint like "under ₹5000" is not a semantic concept — embedding it alongside product text would blur the vector with something a similarity search can't reason about precisely.
Keeping it as structured metadata makes it an exact, reliable filter instead of a fuzzy nudge.

### Why an LLM extracts the filter instead of rule based regex

`queryProcessor.js` sends the query plus the actual list of categories that exist in the catalog to LLM, and asks for structured JSON back.
This generalizes far better than a hand-maintained keyword dictionary — it understands category names it's never seen hardcoded, handles **phrasing variation**, and can reason about which categories are _plausibly_ relevant to an **ambiguous query**.

### Why ChromaDB instead of computing embeddings ourselves

Chroma's JS client defaults to `Xenova/all-MiniLM-L6-v2` (via `@chroma-core/default-embed` / `@xenova/transformers`) for both documents and queries — the same well-known local embedding model, but Chroma additionally gives us:

- **Storage + fast retrieval** (HNSW index) — the actual "vector database" value-add, which matters once a catalog grows past what brute-force cosine similarity can handle cheaply.
- **Metadata filtering built into the query itself** (`where` clause) rather than a separate filtering pass in application code.
- **Idempotent upserts** — the catalog can be re-synced on every app startup without duplicating records.

## Quick start

Make Sure GROQ_API_KEY is in `.env` file, Generate a new key in free tier if required at [https://console.groq.com/keys](https://console.groq.com/keys).

```

GROQ_API_KEY=gsk_********************************

```

If you have dataset of products, you can place that json file in `data/products.json`. On startup, node.js will re-sync data from this particular file. we always consider this dataset as **source of truth**. Ideally this data should be in Relational DB, but for simplicity we are maintaining JSON file here.

```json
[
  { "id": "P001", "title": "Redragon K552 Mechanical Gaming Keyboard", "description": "Compact 87-key mechanical keyboard with red switches, RGB backlight, built for fast-paced gaming.", "category": "Gaming Keyboards", "price": 3499 },
  { "id": "P002", "title": "Logitech G213 Prodigy Gaming Keyboard", "description": "Membrane gaming keyboard with customizable RGB lighting and spill-resistant design.", "category": "Gaming Keyboards", "price": 4299 },
  ....
]
```

Installing npm dependency

```bash
npm install
```

Starting Vector DB locally : this will start DB server and attach data in disk at `chroma_data/`

```bash

# Terminal 1 — start the vector database on localhost:8000
npm run startDB
```

Starting Server locally

```bash

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

There are three ranking strategies available:

1. **Default Ranking** _(no `sortBy` parameter provided)_
   Products are ranked based on **semantic similarity** to the user's query using **cosine similarity**, which measures the angle between the query and product embedding vectors.

2. **Relevance Ranking** _(`sortBy: "relevance"`)_
   The semantically similar products are passed to an LLM along with the user's query. The LLM re-ranks the results based on overall relevance and user intent, ensuring that the most relevant products appear at the top rather than simply those with the highest semantic similarity score.

3. **Price-Based Ranking**
   Products are first retrieved using semantic search and then sorted in **ascending order of price**.

## AI prompts used

All prompts are in [src/contants.js](https://github.com/rsaw409/AI-Product-Search/blob/main/src/constant.js)

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

### Sample Request with Response

Example Request 1

```
curl --location 'http://localhost:3000/v1/search' \
--header 'Content-Type: application/json' \
--data '{
    "query": "wireless earphone under 5000",
    "limit": 5,
    "sortBy": "price"
}'
```

```json
{
  "query": "wireless earphone under 5000",
  "appliedFilter": {
    "minPrice": null,
    "maxPrice": 5000,
    "category": ["Audio", "Gaming Audio"]
  },
  "resultCount": 3,
  "results": [
    {
      "product": {
        "id": "P014",
        "title": "boAt Airdopes 141 True Wireless Earbuds",
        "description": "Bluetooth earbuds with ASAP charge, 42 hours playback, and IPX4 sweat resistance.",
        "category": "Audio",
        "price": 1299
      },
      "explanation": {
        "semanticScore": 0.5625,
        "distance": 0.4375
      }
    },
    {
      "product": {
        "id": "P026",
        "title": "boAt Rockerz 450 Bluetooth Headphones",
        "description": "On-ear wireless headphones with 15-hour battery and punchy bass.",
        "category": "Audio",
        "price": 1399
      },
      "explanation": {
        "semanticScore": 0.5027,
        "distance": 0.4973
      }
    },
    {
      "product": {
        "id": "P016",
        "title": "JBL Quantum 100 Gaming Headset",
        "description": "Wired over-ear gaming headset with flip-up mic, designed for immersive gameplay audio.",
        "category": "Gaming Audio",
        "price": 1799
      },
      "explanation": {
        "semanticScore": 0.4247,
        "distance": 0.5753
      }
    }
  ]
}
```

Example request 2

```
curl --location 'http://localhost:3000/v1/search' \
--header 'Content-Type: application/json' \
--data '{
"query": "Budget keyboard",
"limit": 5
}'
```

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
    {
      "product": {
        "id": "P003",
        "title": "Ant Esports MK1400 Pro Mechanical Keyboard",
        "description": "Budget mechanical keyboard with blue switches, anti-ghosting, and durable keycaps for everyday typing and gaming.",
        "category": "Mechanical Keyboards",
        "price": 1999
      },
      "explanation": {
        "semanticScore": 0.6374,
        "distance": 0.3626
      }
    },
    {
      "product": {
        "id": "P029",
        "title": "Corsair K70 RGB Pro Mechanical Keyboard",
        "description": "High-end mechanical keyboard with Cherry MX switches and aircraft-grade aluminum frame.",
        "category": "Gaming Keyboards",
        "price": 14999
      },
      "explanation": {
        "semanticScore": 0.6319,
        "distance": 0.3681
      }
    }
  ]
}
```

Example Request 3

```bash
curl --location 'http://localhost:3000/v1/search' \
--header 'Content-Type: application/json' \
--data '{
    "query": "Gift cards which should not cost more than 5000",
    "limit": 2,
    "sortBy" : "relevance"
}'

```

```json
{
  "query": "Gift cards which should not cost more than 5000",
  "appliedFilter": {
    "minPrice": null,
    "maxPrice": 5000,
    "category": ["Gift Cards"]
  },
  "resultCount": 2,
  "results": [
    {
      "product": {
        "id": "P032",
        "title": "Apple Gift Card ₹2000",
        "description": "Digital gift card for App Store, iTunes, and Apple services purchases.",
        "category": "Gift Cards",
        "price": 2000
      },
      "explanation": {
        "semanticScore": 0.6429,
        "distance": 0.3571,
        "relevancyReason": "This Apple Gift Card is a good fit because it is within the budget and can be used for various Apple services."
      }
    },
    {
      "product": {
        "id": "P008",
        "title": "PlayStation Store Gift Card ₹2000",
        "description": "Digital top-up card for PS Store wallet, redeemable for games and DLC.",
        "category": "Gift Cards",
        "price": 2000
      },
      "explanation": {
        "semanticScore": 0.6055,
        "distance": 0.3945,
        "relevancyReason": "This PlayStation Store Gift Card is also a good option because it is within the budget and can be used for gaming purposes."
      }
    }
  ]
}
```

Example Request 4 :- Negative Test where product does not exists

```bash
curl --location 'http://localhost:3000/v1/search' \
--header 'Content-Type: application/json' \
--data '{
    "query": "SunGlasses",
    "limit": 5,
    "sortBy": "relevance"
}'
```

```json
{
  "query": "SunGlasses",
  "appliedFilter": {
    "minPrice": null,
    "maxPrice": null,
    "category": []
  },
  "resultCount": 3,
  "results": [
    {
      "product": {
        "id": "P033",
        "title": "Fire-Boltt Phoenix Smart Watch",
        "description": "Fitness smartwatch with heart rate monitor, SpO2 tracking, and multiple sport modes.",
        "category": "Wearables",
        "price": 1999
      },
      "explanation": {
        "semanticScore": 0.1893,
        "distance": 0.8107,
        "relevancyReason": "This product is ranked first because it has a name similar to a brand that also makes sunglasses, although it is actually a smartwatch."
      }
    },
    {
      "product": {
        "id": "P017",
        "title": "Logitech G102 Lightsync Gaming Mouse",
        "description": "Lightweight gaming mouse with customizable RGB and 8000 DPI optical sensor.",
        "category": "Gaming Accessories",
        "price": 1399
      },
      "explanation": {
        "semanticScore": 0.186,
        "distance": 0.814,
        "relevancyReason": "This product is ranked second because it has no relation to sunglasses, but is a gaming accessory with no overlap with the search term."
      }
    },
    {
      "product": {
        "id": "P026",
        "title": "boAt Rockerz 450 Bluetooth Headphones",
        "description": "On-ear wireless headphones with 15-hour battery and punchy bass.",
        "category": "Audio",
        "price": 1399
      },
      "explanation": {
        "semanticScore": 0.1988,
        "distance": 0.8012,
        "relevancyReason": "This product is ranked third because it is an audio device with no relation to sunglasses or any similar use case."
      }
    }
  ]
}
```
