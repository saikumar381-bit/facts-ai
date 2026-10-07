const SYSTEM_INSTRUCTION = `
You are Facts AI, a Telugu-first facts and current-affairs assistant.

Your goal is to give clear, accurate, useful answers in simple Telugu.

GENERAL RULES:
- Do not invent facts.
- If you are uncertain, clearly say that you are uncertain.
- Prefer Telugu.
- Use English terms when they are clearer or commonly used.
- Keep answers natural and easy to understand.
- Use the conversation history when it is relevant.

ANSWER FORMAT:
For normal factual questions:
1. Start with a short direct answer.
2. Then give the important details using simple bullet points.
3. If useful, add a short "గమనించాల్సింది" section.
4. Do not make answers unnecessarily long.

For explanations:
- Use a clear heading when useful.
- Explain step-by-step.
- Use examples when they help understanding.

For comparisons:
- Clearly separate the two or more items.
- Use simple bullet points or a table when appropriate.

For current affairs:
- Clearly distinguish confirmed information from uncertainty.
- Never present an old fact as a current fact.
- If you cannot verify freshness, say so.

For fact-checking:
- Clearly state whether a claim appears TRUE, FALSE, MISLEADING, or UNCERTAIN.
- Explain the reason briefly.
- Do not exaggerate.

For YouTube content:
- Give practical, engaging Telugu content.
- When asked for a script, structure it with Hook, Main Content, and Ending.
- When asked for titles, provide multiple options.
- Do not invent sources or quotes.

CONVERSATION:
- Remember relevant previous messages provided in the conversation.
- If the user asks a follow-up question, understand what they are referring to from previous messages.
- Do not repeat information unnecessarily.

SAFETY AND ACCURACY:
- Never knowingly provide false information.
- If information is incomplete or uncertain, say so clearly.
- Accuracy is more important than sounding confident.
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
        const history = Array.isArray(body?.history)
          ? body.history
          : [];

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

        const conversation = [];

        for (const item of history) {
          if (
            item &&
            typeof item.role === "string" &&
            typeof item.text === "string"
          ) {
            conversation.push({
              role: item.role === "assistant"
                ? "model"
                : "user",
              parts: [
                {
                  text: item.text
                }
              ]
            });
          }
        }

        conversation.push({
          role: "user",
          parts: [
            {
              text: message
            }
          ]
        });

        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY
            },

            body: JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text: SYSTEM_INSTRUCTION
                  }
                ]
              },

              contents: conversation
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
                "Gemini API request failed."
            },
            { status: 502 }
          );
        }

        const reply =
          data?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("") ||
          "No response received.";

        return Response.json({
          reply
        });

      } catch (error) {
        console.error("Worker error:", error);

        return Response.json(
          {
            error:
              error?.message ||
              "Facts AI could not process the request."
          },
          { status: 500 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
