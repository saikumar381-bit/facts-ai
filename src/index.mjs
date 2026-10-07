const SYSTEM_INSTRUCTION = `
You are Facts AI, a Telugu-first facts and current-affairs assistant.

Answer clearly, accurately, and naturally.
Do not invent facts.
If you are uncertain, clearly say that you are uncertain.
Prefer Telugu, but use English terms when they are clearer.
Help with facts, current affairs, fact-checking, research, explanations,
YouTube scripts, titles, and content ideas.

For current or time-sensitive claims, be careful about freshness and
do not pretend to have verified something you have not verified.
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
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: message
                    }
                  ]
                }
              ]
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("Gemini API error:", data);

          return Response.json(
            { error: "Gemini API request failed." },
            { status: 502 }
          );
        }

        const reply =
          data?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("") ||
          "No response received.";

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
// Cloudflare deployment trigger
