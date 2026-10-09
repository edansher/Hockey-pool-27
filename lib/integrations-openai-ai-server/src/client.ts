import OpenAI from "openai";

// Independent copy: the client is created on first use, so the API server can
// start (with the daily report disabled) when no OpenAI credentials exist.
// AI_INTEGRATIONS_* are the Replit integration names; OPENAI_API_KEY and
// OPENAI_BASE_URL are accepted for a standard OpenAI account.
let client: OpenAI | undefined;

function createClient(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || undefined;
  if (!apiKey) {
    throw new Error(
      "OpenAI is not configured. Set OPENAI_API_KEY (or AI_INTEGRATIONS_OPENAI_API_KEY) to enable AI features.",
    );
  }
  return new OpenAI({ apiKey, baseURL });
}

export const openai: OpenAI = new Proxy({} as OpenAI, {
  get(_target, property) {
    client ??= createClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
