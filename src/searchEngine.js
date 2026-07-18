import { rerankWithLLM } from "./llmRerank.js";
import { generateFilter } from "./generateFilter.js";
import { queryProducts, getProductById } from "./vectorStore.js";

/**
 * @param {string} query
 * @param {{ limit?: number, sortBy?: string }} options
 */
async function search(query, options = {}) {
  const { limit = 10, sortBy } = options;

  let base = await semanticSearch(query, { limit });

  let reranked;

  switch (sortBy) {
    case "relevance": {
      reranked = await rerankWithLLM(query, base.results);
      break;
    }
    case "price": {
      reranked = [...base.results];
      reranked.sort((a, b) => a.product.price - b.product.price);
      break;
    }
    default:
      reranked = base.results;
  }

  return {
    query: base.query,
    appliedFilter: base.parsedFilter,
    resultCount: base.resultCount,
    results: reranked,
  };
}

/**
 * @param {string} query
 * @param {{ limit?: number }} options
 */
async function semanticSearch(query, options = {}) {
  const { limit = 10 } = options;

  const filter = await generateFilter(query);

  const retrieved = await queryProducts(query, filter, limit);

  const candidates = retrieved
    .map((r) => ({
      product: getProductById(r.id),
      similarity: r.similarity,
      distance: r.distance,
    }))
    .filter((c) => c.product); // defensively drop any id that doesn't resolve

  const results = candidates.map(({ product, similarity, distance }) => {
    return {
      product,
      explanation: {
        semanticScore: Number(similarity.toFixed(4)),
        distance: Number(distance.toFixed(4)),
      },
    };
  });

  return {
    query,
    parsedFilter: filter,
    resultCount: results.length,
    results: results.slice(0, limit),
  };
}

export { search };
