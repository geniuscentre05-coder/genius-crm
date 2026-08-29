// api/ai-proxy.js
// Универсальная функция-прокси для ИИ-помощника: понимает Gemini, DeepSeek и Claude.
// Gemini/DeepSeek — обычный чат-ответ. Claude используется как "агент" с
// инструментами (tools) — может не только отвечать, но и вызывать функции,
// которые фронтенд затем выполняет над данными CRM (добавить ученика, занятие и т.д.).
//
// Нужны переменные окружения в Vercel:
//   GEMINI_API_KEY   — бесплатный ключ с ai.google.dev
//   DEEPSEEK_API_KEY — платный ключ с platform.deepseek.com
//   CLAUDE_API_KEY   — платный ключ с console.anthropic.com (нужен только для агента)

export default async function handler(req, res) {
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

  const { messages, provider = "gemini", model, temperature = 0.7, max_tokens = 1200, tools } = req.body || {};

  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Поле 'messages' обязательно и должно быть массивом" });
    return;
  }

  try {
    if (provider === "deepseek") {
      return await handleDeepSeek(res, messages, model, temperature, max_tokens);
    }
    if (provider === "claude") {
      return await handleClaude(res, messages, model, temperature, max_tokens, tools);
    }
    return await handleGemini(res, messages, model, temperature, max_tokens);
  } catch (err) {
    res.status(502).json({ error: "Не удалось связаться с ИИ-провайдером", details: err.message });
  }
}

// ─── DEEPSEEK ─────────────────────────────────────────────────────────────
async function handleDeepSeek(res, messages, model, temperature, max_tokens) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "DEEPSEEK_API_KEY не задан в переменных окружения Vercel" });
    return;
  }

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: model || "deepseek-v4-flash", messages, temperature, max_tokens }),
  });

  const data = await response.json();

  if (!response.ok) {
    res.status(response.status).json({ error: data.error?.message || "Ошибка DeepSeek API", details: data });
    return;
  }

  // DeepSeek уже отвечает в нужном формате { choices: [...] }
  res.status(200).json(data);
}

// ─── GEMINI ───────────────────────────────────────────────────────────────
async function handleGemini(res, messages, model, temperature, max_tokens) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY не задан в переменных окружения Vercel" });
    return;
  }

  const geminiModel = model || "gemini-2.5-flash";

  const systemMsg = messages.find(m => m.role === "system");
  const conversation = messages.filter(m => m.role !== "system");
  const contents = conversation.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens: max_tokens },
  };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    res.status(response.status).json({ error: data.error?.message || "Ошибка Gemini API", details: data });
    return;
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  res.status(200).json({
    choices: [{ message: { role: "assistant", content: text } }],
  });
}

// ─── CLAUDE (агент с инструментами) ────────────────────────────────────────
async function handleClaude(res, messages, model, temperature, max_tokens, tools) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "CLAUDE_API_KEY не задан в переменных окружения Vercel" });
    return;
  }

  const systemMsg = messages.find(m => m.role === "system");
  // Anthropic messages must NOT include a "system" role entry — it's a separate top-level field.
  // content can already be Anthropic's native shape (string, or array of content blocks) —
  // the frontend builds it correctly for tool_use / tool_result turns.
  const conversation = messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));

  const body = {
    model: model || "claude-sonnet-5",
    max_tokens: max_tokens || 1500,
    temperature,
    messages: conversation,
  };
  if (systemMsg) body.system = systemMsg.content;
  if (tools && tools.length) body.tools = tools;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    res.status(response.status).json({ error: data.error?.message || "Ошибка Claude API", details: data });
    return;
  }

  // Возвращаем нативный формат Anthropic (content — массив блоков text / tool_use),
  // чтобы фронтенд мог обрабатывать вызовы инструментов.
  res.status(200).json({ provider: "claude", role: "assistant", content: data.content, stop_reason: data.stop_reason });
}
