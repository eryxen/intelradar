/**
 * Ollama provider — calls local Ollama API for free/private inference.
 */
const http = require("http");

function call(model, systemPrompt, userPrompt, _apiKey, ollamaUrl) {
  const baseUrl = ollamaUrl || process.env.OLLAMA_URL || "http://localhost:11434";
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model || "llama3",
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const url = new URL("/api/chat", baseUrl);
    const req = http.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.message?.content || "");
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = { call };
