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

Maintain the conversation context provided by the user.
Use previous messages when they are relevant to the current question.

For current or recent information:
use available search tools when appropriate.
Do not pretend something is verified if it has not been verified.
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
