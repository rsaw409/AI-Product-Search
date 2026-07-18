import { callLLM } from "./llm.js";
import { rerank_instruction } from "./constant.js";

const buildSystemPrompt = (candidates) => {
  return rerank_instruction.replace(
    "{{candidates}}",
    JSON.stringify(
      candidates.map((c) => ({
        id: c.product.id,
        title: c.product.title,
        description: c.product.description,
        category: c.product.category,
        price: c.product.price,
      })),
      null,
      2,
    ),
  );
};

/**
 * Re-ranks a list of {product, score, explanation} results using LLM by relevancy.
 *
 * @param {string} query
 * @param {Array} retrievedResults - output of vectorDB search
 * @returns {Promise<Array>}
 */
async function rankByRelevance(query, retrievedResults) {
  if (!process.env.GROQ_API_KEY) {
    console.error(
      "No GROQ_API_KEY configured, Set it in your .env file to enable sorting by relevancy.",
    );
    throw new Error("No GROQ_API_KEY configured, Set it in your .env");
  }

  if (retrievedResults.length === 0) {
    return retrievedResults;
  }

  try {
    const systemPrompt = buildSystemPrompt(retrievedResults);
    const { results } = await callLLM(query, systemPrompt);

    const reordered = [];

    for (const { id, reason } of results) {
      const original = retrievedResults.find((r) => r.product.id === id);
      if (!original) continue; // defensively skip hallucinated ids
      reordered.push({
        ...original,
        explanation: {
          ...original.explanation,
          relevancyReason: reason,
        },
      });
    }

    return reordered;
  } catch (err) {
    console.error(err);
    throw error;
  }
}

export { rankByRelevance };
