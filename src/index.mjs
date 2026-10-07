const SYSTEM_INSTRUCTION = `
You are Facts AI, a Telugu-first facts and current-affairs assistant.

Answer clearly, accurately, and naturally.

Do not invent facts.
If you are uncertain, clearly say that you are uncertain.

Prefer Telugu, but use English terms when they are clearer.

Help with:
- facts
- current affairs
- fact-checking
- research
- explanations
- YouTube scripts
- titles
- descriptions
- content ideas

For current, recent, changing, or time-sensitive questions:
- Use Google Search when it can improve freshness or accuracy.
- Prefer current and reliable information.
- Do not pretend something is verified if it has not been verified.
- If sources disagree, clearly explain the uncertainty.

For factual answers, prioritize accuracy over guessing.
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API
    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        return Response.json(
          { error: "Method not allowed" },
          { status: 405 }
        );
      }

      try {
        const body = await request.json();
        const message = body?.message;

        if (!message || typeof message !== "string") {
          return Response.json(
            { error: "Message is required" },
            { status: 400 }
          );
        }

        if (!env.GEMINI_API_KEY) {
          return Response.json(
            { error: "Gemini API key is not configured." },
            { status: 500 }
          );
        }

        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY
            },
            body: JSON.stringify({
              model: "gemini-3.8-flash",

              system_instruction: SYSTEM_INSTRUCTION,

              input: message,

              tools: [
                {
                  type: "google_search"
                }
              ]
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("Gemini API error:", data);

          return Response.json(
            {
              error: "Gemini API request failed.",
              details: data?.error?.message || "Unknown Gemini API error."
            },
            { status: 502 }
          );
        }

        let reply = "";

        // Current Interactions API response
        if (Array.isArray(data?.steps)) {
          for (const step of data.steps) {
            if (step?.type === "model_output" && Array.isArray(step.content)) {
              for (const content of step.content) {
                if (content?.type === "text" && content?.text) {
                  reply += content.text;
                }
              }
            }
          }
        }

        // Fallback
        if (!reply && data?.output_text) {
          reply = data.output_text;
        }

        if (!reply) {
          reply = "No response received.";
        }

        return Response.json({ reply });
      } catch (error) {
        console.error("Worker error:", error);

        return Response.json(
          { error: "Facts AI could not process the request." },
          { status: 500 }
        );
      }
    }

    // Website files
    return env.ASSETS.fetch(request);
  }
};
