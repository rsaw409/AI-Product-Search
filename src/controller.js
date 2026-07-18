import { search } from "./searchEngine.js";

const healthCheck = (req, res) => {
  res.json({
    status: "ok",
  });
};

const searchController = async (req, res) => {
  try {
    const { query, limit = 10, sortBy } = req.body || {};

    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({
        error: "Request body must include a non-empty 'query' string.",
      });
    }
    const validSortBy = ["relevance", "price"];

    if (sortBy && !validSortBy.includes(sortBy)) {
      return res
        .status(400)
        .json({ error: "Order must be either relevance or price based" });
    }

    const result = await search(query, { limit, sortBy });
    res.status(200).send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ mesage: error.message });
  }
};

export { healthCheck, searchController };
