const { GoogleGenerativeAI } = require('@google/generative-ai');

function getGenerativeModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const client = new GoogleGenerativeAI(apiKey);
  return client.getGenerativeModel({ model: modelName });
}

/**
 * @param {{ system?: string, user: string, temperature?: number }} input
 * @returns {Promise<string>}
 */
async function generateText(input) {
  const model = getGenerativeModel();
  const prompt = input.system
    ? `System:\n${input.system}\n\nUser:\n${input.user}`
    : input.user;
  const generationConfig = {
    temperature: typeof input.temperature === 'number' ? input.temperature : 0.35,
  };
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  });
  const text = result.response.text();
  return typeof text === 'string' ? text.trim() : '';
}

module.exports = {
  getGenerativeModel,
  generateText,
};
