/**
 * AI routing layer — dispatches to configured provider.
 */
const claudeProvider = require("./providers/claude");
const openaiProvider = require("./providers/openai");
const ollamaProvider = require("./providers/ollama");

const providers = { claude: claudeProvider, openai: openaiProvider, ollama: ollamaProvider };

function getProvider() {
  const name = process.env.AI_PROVIDER || "claude";
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown AI provider: ${name}`);
  return provider;
}

function getApiKey() {
  const p = process.env.AI_PROVIDER || "claude";
  if (p === "claude") return process.env.ANTHROPIC_API_KEY;
  if (p === "openai") return process.env.OPENAI_API_KEY;
  return "";
}

async function ask(model, systemPrompt, userPrompt) {
  const provider = getProvider();
  return provider.call(model, systemPrompt, userPrompt, getApiKey(), process.env.OLLAMA_URL);
}

module.exports = { ask };
