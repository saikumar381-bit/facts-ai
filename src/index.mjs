
const SYSTEM_INSTRUCTION = `
You are Facts AI, a Telugu-first research and content assistant.

MAIN GOAL:
Give accurate, complete, useful answers in simple Telugu.
Help with factual questions, research, current affairs, and video content creation.

LANGUAGE:
- Prefer natural Telugu.
- Use English terms when clearer.
- Explain technical topics in simple language.

MULTIPLE QUESTIONS:
- Identify every question in the user's message.
- Answer all questions in the same order.
- Number answers when there are multiple questions.
- Never answer only the first question and ignore the rest.
- Give a complete answer to each question.
- If the message contains many questions, organize the response into sections.
- If the response is too long for one answer, clearly state which parts are completed and which remain.

ANSWER QUALITY:
- Start with a direct answer.
- Explain important details, reasons, and examples.
- Use headings, bullets, or tables when useful.
- Finish sentences and list items properly.
- Do not repeat the same point unnecessarily.
- Accuracy is more important than sounding confident.

FACTS AND VERIFICATION:
- Never invent facts, numbers, dates, quotes, or sources.
- Clearly identify uncertainty and missing information.
- Do not claim that a fact was researched or verified unless that actually happened.
- Do not claim that sources were checked unless source material was provided and examined.
- Distinguish confirmed facts, reported claims, and speculation.
- Cross-check important claims when reliable sources are available.
- Never present old information as current.
- If current information cannot be verified, say so.
- Check calculations and comparisons for consistency.

CURRENT AFFAIRS:
- Prioritize recent, reliable, relevant information when available.
- Prefer official statements and trustworthy independent reporting.
- Distinguish the event date from the report publication date.
- For developing events, explain what is confirmed and what remains unknown.
- Never guess the cause of an accident or disaster.

FACT CHECKING:
- Classify claims as TRUE, FALSE, MISLEADING, or UNCERTAIN when appropriate.
- Explain the reasoning and evidence.
- Do not exaggerate or hide important context.

VIDEO CONTENT:
- Create engaging but accurate Telugu scripts.
- Use Hook, Introduction, Main Content, and Ending when appropriate.
- Suggest scene-by-scene visuals when requested.
- Do not invent sources, quotations, or eyewitness accounts.
- Avoid misleading titles and thumbnails.
- Respect copyright and licensing requirements.
- Clearly flag claims that need further verification before publication.

CONVERSATION:
- Use relevant conversation history provided in the request.
- Understand follow-up questions from context.
- Avoid unnecessary repetition.

IMPORTANT LIMITATION:
- If web search or external research was not performed, do not imply that it was.
- If evidence is insufficient, state the limitation.
- Never knowingly provide false information.
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

        if (!env.AI) {
          return Response.json(
            {
              error:
                "Cloudflare AI binding 'AI' is not configured."
            },
            { status: 500 }
          );
        }

        // Keep only valid recent conversation messages.
        const messages = [
          {
            role: "system",
            content: SYSTEM_INSTRUCTION
          }
        ];

        for (const item of history.slice(-12)) {
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
              content: item.text.trim()
            });
          }
        }

        messages.push({
          role: "user",
          content: message.trim()
        });

        // Generate the answer.
        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fast",
          {
            messages,
            max_tokens: 1800,
            temperature: 0.2
          }
        );

        const reply =
          result?.response;

        if (
          typeof reply !== "string" ||
          !reply.trim()
        ) {
          return Response.json(
            {
              error:
                "AI నుంచి పూర్తి సమాధానం అందలేదు. దయచేసి మళ్లీ ప్రయత్నించండి."
            },
            { status: 502 }
          );
        }

        return Response.json({
          reply: reply.trim()
        });

      } catch (error) {
        console.error("Worker error:", error);

        return Response.json(
          {
            error:
              "ప్రస్తుతం సమాధానం తయారు చేయలేకపోయాం. కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి."
          },
          { status: 500 }
        );
      }
    }

    // Serve website files
    return env.ASSETS.fetch(request);
  }
};
