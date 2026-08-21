// api/ai-proxy.js
// Vercel serverless function (формат отличается от Netlify: тут используется
// module.exports = async (req, res) => {...}, а не exports.handler).
//
// Ключ берётся из переменной окружения DEEPSEEK_API_KEY, которую нужно
// задать в Vercel: Project Settings → Environment Variables.

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "DEEPSEEK_API_KEY не задан в переменных окружения Vercel" });
    return;
  }

  const { messages, model = "deepseek-chat", temperature = 0.7, max_tokens = 1000 } = req.body || {};

  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Поле 'messages' обязательно и должно быть массивом" });
    return;
  }

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json({ error: data.error?.message || "Ошибка DeepSeek API", details: data });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: "Не удалось связаться с DeepSeek API", details: err.message });
  }
};
