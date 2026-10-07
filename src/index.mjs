const SYSTEM_INSTRUCTION = `
You are Facts AI, a Telugu-first facts and current-affairs assistant.

Answer clearly, accurately, and naturally.
Do not invent facts.
If you are uncertain, clearly say that you are uncertain.
Prefer Telugu, but use English terms when they are clearer.

Help with facts, current affairs, fact-checking, research,
explanations, YouTube scripts, titles, descriptions, and content ideas.

For current or recent information, use Google Search when appropriate.
Always prioritize accuracy and freshness.
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

              input: message,

              tools: [
                {
                  type: "google_search"
                }
              ],

              system_instruction: SYSTEM_INSTRUCTION
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("Gemini API error:", data);

          return Response.json(
            {
              error:
                data?.error?.message ||
                `Gemini API error (${response.status})`
            },
            { status: 502 }
          );
        }

        const reply =
          data?.output_text ||
          data?.steps
            ?.filter((step) => step?.type === "model_output")
            ?.flatMap((step) => step?.content || [])
            ?.filter((content) => content?.type === "text")
            ?.map((content) => content.text)
            ?.join("") ||
          "No response received.";

        return Response.json({ reply });

      } catch (error) {
        console.error("Worker error:", error);

        return Response.json(
          {
            error: error?.message || "Facts AI could not process the request."
          },
          { status: 500 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
