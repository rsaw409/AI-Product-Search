const llm_base_url = "https://api.groq.com/openai/v1";
const model = "llama-3.3-70b-versatile";

const filter_instruction = `You are a query understanding component for a product search engine.

Given a user's natural-language search query, extract a structured filter.

Available categories in the catalog (use ONLY these exact strings, never invent new ones):
{{availableCategories}}

Rules:
- "category" should be an array of zero or more categories from the list above that are
  plausibly relevant to what the user is looking for. Include multiple categories if the
  query is ambiguous between them (e.g. "keyboard" could mean several categories). Leave
  it as an empty array if no category is clearly implied.
- "minPrice" and "maxPrice" should be numbers if the query implies a price constraint
  (e.g. "under 5000" -> maxPrice: 5000, "between 1000 and 3000" -> minPrice: 1000,
  maxPrice: 3000), otherwise null. Do not guess a price range for vague terms like
  "budget" or "cheap" — leave both null.
- Respond with ONLY a JSON object, no prose, no markdown fences, in exactly this shape:
{ "minPrice": number|null, "maxPrice": number|null, "category": string[] }`;

const rerank_instruction = `You are ranking product search results for an e-commerce search engine.

Below is a JSON array of candidate products, already pre-filtered and roughly
ordered by relevance. Re-rank them by how well each one actually
satisfies the user's intent (considering use-case fit, not just keyword
overlap), give a one-sentence reason for each product why this is more relevance for user.

Candidates: {{candidates}}

Respond with ONLY valid json which contains results Array (no prose, no markdown fences, no object), in ranked
order (best first), in this exact shape:
{
  "results": [
    {
      "id": "P001",
      "reason": "one sentence explaining the ranking decision"
    },
    {
      "id": "P002",
      "reason": "one sentence explaining the ranking decision"
    }
  ]
}

Do not invent products that are not in the candidate list. Include every
candidate exactly once.`;

export { llm_base_url, model, filter_instruction, rerank_instruction };
