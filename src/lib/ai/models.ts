import { openai } from "@ai-sdk/openai";

// One setting per feature (PRD section 10): the model for each job is chosen here, not scattered in routes.
// The cheapest current model handles chat; a stronger one is picked for posts and briefings after the week-1 test.
export const MODEL_IDS = {
  chat: process.env.OPENAI_MODEL_CHAT || "gpt-6-luna",
  briefing: process.env.OPENAI_MODEL_BRIEFING || process.env.OPENAI_MODEL_CHAT || "gpt-6-luna",
  // Speech to text for voice messages. gpt-6-luna cannot transcribe; gpt-transcribe is the current model
  // (whisper-1 and gpt-4o-transcribe shut down 2027-02-26 and were worse for Burmese in our test).
  transcribe: process.env.OPENAI_MODEL_TRANSCRIBE || "gpt-transcribe",
} as const;

export const chatModel = () => openai(MODEL_IDS.chat);
export const briefingModel = () => openai(MODEL_IDS.briefing);

export const hasOpenAIKey = () => Boolean(process.env.OPENAI_API_KEY);
