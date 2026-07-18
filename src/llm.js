import OpenAI from "openai";
import { llm_base_url, model } from "./constant.js";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: llm_base_url,
});

async function callLLM(prompt, systemPrompt) {
  const completion = await client.chat.completions.create({
    model: model,
    temperature: 0,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  return JSON.parse(completion.choices[0].message.content);
}

export { callLLM };
