
const SYSTEM_INSTRUCTION = `
You are Facts AI, a Telugu-first facts and current-affairs assistant.

Your goal is to give clear, accurate, useful answers in simple Telugu.

GENERAL RULES:
- Do not invent facts.
- If you are uncertain, clearly say that you are uncertain.
- Prefer Telugu.
- Use English terms when they are clearer or commonly used.
- Keep answers natural and easy to understand.
- Use conversation history when relevant.

ANSWER FORMAT:
For normal factual questions:
1. Start with a short direct answer.
2. Give important details using simple bullet points.
3. Add a short "గమనించాల్సింది" section when useful.
4. Keep answers concise.

For explanations:
- Use clear headings when useful.
- Explain step-by-step.
- Give examples when helpful.

For comparisons:
- Clearly separate the items.
- Use bullets or tables when appropriate.

For current affairs:
- Distinguish confirmed information from uncertainty.
- Never present old information as current.
- If freshness cannot be verified, say so.

For fact-checking:
- Classify claims as TRUE, FALSE, MISLEADING, or UNCERTAIN.
- Explain the reason briefly.
- Do not exaggerate.

For YouTube content:
- Give practical, engaging Telugu content.
- Structure scripts with Hook, Main Content, and Ending.
- Give multiple title options when asked.
- Do not invent sources or quotes.

CONVERSATION:
- Use relevant previous messages provided in the conversation.
- Understand follow-up questions from context.
- Avoid unnecessary repetition.

SAFETY AND ACCURACY:
- Never guess numerical facts or measurements.
- Check that comparisons and calculations are internally consistent.
- When the user requests a specific number of facts, provide exactly that many complete points.
- Finish every sentence and list item before ending the response.
- If uncertain, clearly state the uncertainty instead of guessing.
- Never knowingly provide false information.
- Clearly state when information is incomplete or uncertain.
- Accuracy is more important than sounding confident.
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/api/health") {
      return Response.json({
        status: "ok",
        service: "Facts AI"
      });
    }

    // Chat API
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

        if (
          typeof message !== "string" ||
          !message.trim()
        ) {
          return Response.json(
            { error: "Message is required" },
            { status: 400 }
          );
        }

        // Convert conversation history
        const messages = [
          {
            role: "system",
            content: SYSTEM_INSTRUCTION
          }
        ];

        for (const item of history) {
          if (
            item &&
            typeof item.text === "string" &&
            item.text.trim()
          ) {
            messages.push({
              role:
                item.role === "assistant"
                  ? "assistant"
                  : "user",
              content: item.text
            });
          }
        }

        messages.push({
          role: "user",
          content: message.trim()
        });

        // Check Cloudflare Workers AI binding
        if (!env.AI) {
          return Response.json(
            {
              error:
                "Cloudflare AI binding 'AI' is not configured."
            },
            { status: 500 }
          );
        }

        // Generate AI response
        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fast",
          {
            messages
          }
        );

        const reply =
          result?.response ||
          "క్షమించండి, ప్రస్తుతం సమాధానం అందలేదు.";

        return Response.json({ reply });

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

    // Serve website files
    return env.ASSETS.fetch(request);
  }
};
