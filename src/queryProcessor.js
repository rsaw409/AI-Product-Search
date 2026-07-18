import { getAllCategories } from "./vectorStore.js";
import { callLLM } from "./llm.js";
import { filter_instruction } from "./constant.js";

const buildSystemPrompt = (availableCategories) => {
  return filter_instruction.replace(
    "{{availableCategories}}",
    JSON.stringify(availableCategories, null, 2),
  );
};

/**
 * @param {string} query
 * @param {string[]} availableCategories - distinct categories present in the catalog
 * @returns {Promise<{
 *    minPrice: number|null, maxPrice: number|null, category: string[] ,
 * }>}
 */
async function queryProcessor(query) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY not set, cannot call LLM. Set it in .env ");
  }

  try {
    const availableCategories = getAllCategories();
    const systemPrompt = buildSystemPrompt(availableCategories);
    const raw = await callLLM(query, systemPrompt);
    const category = Array.isArray(raw.category)
      ? raw.category.filter((c) => availableCategories.includes(c)) // defensively drop hallucinated categories
      : [];
    const minPrice = typeof raw.minPrice === "number" ? raw.minPrice : null;
    const maxPrice = typeof raw.maxPrice === "number" ? raw.maxPrice : null;

    return { minPrice, maxPrice, category };
  } catch (err) {
    console.error(`LLM filter extraction failed (${err.message})`);
    throw err;
  }
}

export { queryProcessor };
