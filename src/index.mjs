const SYSTEM_INSTRUCTION = `
You are Facts AI, a Telugu-first research and content assistant.

LANGUAGE:
- Prefer simple, natural Telugu.
- Answer every question in the user's message.
- Explain technical topics clearly.

ACCURACY:
- Never invent facts, numbers, dates, sources, or URLs.
- Do not claim research was completed unless it actually happened.
- Distinguish facts, reported claims, and uncertainty.
- If evidence is insufficient, say so.
- Accuracy is more important than speed.

CURRENT NEWS:
- Use supplied web search results for current news.
- Never present old news as today's news.
- Do not invent publication dates.
- A last-modified date is not necessarily a publication date.
- Include source links only when supplied by search results.
- Do not claim an article was opened or fully verified unless it was.
- If search fails, clearly say current news could not be verified.
- Group duplicate reports about the same event.
- Do not invent breaking news.

FACT CHECKING:
- Use TRUE, FALSE, MISLEADING, or UNCERTAIN when appropriate.
- Explain the evidence and relevant context.

VIDEO CONTENT:
- Create engaging, accurate Telugu scripts.
- Use Hook, Introduction, Main Content, and Ending when appropriate.
- Do not invent sources or quotations.
- Flag important claims needing further verification.

CONVERSATION:
- Use relevant conversation history.
- Answer follow-up questions in context.
- Avoid unnecessary repetition.
`;

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

function getIndiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function isNewsRequest(message) {
  return (
    /\b(news|headlines|breaking news|latest news|current affairs|today'?s news|today news|recent news)\b/i.test(message) ||
    /వార్తలు|వార్త|నేటి వార్తలు|ఈరోజు వార్తలు|తాజా వార్తలు|ముఖ్యమైన వార్తలు|బ్రేకింగ్ న్యూస్|ప్రస్తుత వార్తలు/i.test(message)
  );
}

function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (
        /^utm_/i.test(key) ||
        ["fbclid", "gclid"].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getDateInfo(item) {
  const publicationFields = [
    "publishedDate",
    "published_date",
    "publicationDate",
    "publication_date",
    "datePublished",
    "date_published"
  ];

  for (const field of publicationFields) {
    const value = item?.[field];

    if (typeof value !== "string") {
      continue;
    }

    const match = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);

    if (!match) {
      continue;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return {
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        type: "Publication date"
      };
    }
  }

  const modifiedFields = [
    "lastModifiedDate",
    "last_modified_date",
    "lastModified",
    "last_modified"
  ];

  for (const field of modifiedFields) {
    const value = item?.[field];

    if (typeof value !== "string") {
      continue;
    }

    const match = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);

    if (match) {
      return {
        date: `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`,
        type: "Last-modified date, not confirmed publication date"
      };
    }
  }

  return null;
}

function prepareSearchResults(data) {
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.results)
      ? data.results
      : [];

  const seenUrls = new Set();
  const seenTitles = new Set();
  const results = [];

  for (const item of items) {
    const title = String(item?.title || "").trim();
    const rawUrl = item?.url || item?.link;
    const url = normalizeUrl(rawUrl);
    const description = String(
      item?.description || item?.snippet || ""
    ).trim();

    if (!title || !url) {
      continue;
    }

    const normalizedTitle = normalizeTitle(title);

    if (
      seenUrls.has(url) ||
      (normalizedTitle && seenTitles.has(normalizedTitle))
    ) {
      continue;
    }

    seenUrls.add(url);

    if (normalizedTitle) {
      seenTitles.add(normalizedTitle);
    }

    const dateInfo = getDateInfo(item);

    results.push({
      title,
      url,
      description: description.slice(0, 1200),
      date: dateInfo?.date || null,
      dateType: dateInfo?.type || "Date unavailable"
    });
  }

  return results.slice(0, 8);
}

function buildResearchContext(results, searchStatus, newsMode) {
  if (searchStatus === "failed") {
    return `
WEB SEARCH STATUS: FAILED

The web search request failed.
Do not invent news, results, dates, or source links.

${newsMode
  ? "Tell the user in Telugu that current news could not be verified because web search failed."
  : "Answer using available knowledge, clearly explaining when current information cannot be verified."}
`;
  }

  if (!results.length) {
    return `
WEB SEARCH STATUS: NO USABLE RESULTS

No usable search results were returned.
Do not invent search results or URLs.

${newsMode
  ? "Tell the user in Telugu that no usable current news results were found."
  : "Answer cautiously and explain any limitations."}
`;
  }

  return `
WEB SEARCH STATUS: SUCCESS
India date: ${getIndiaDate()}
Current news request: ${newsMode ? "YES" : "NO"}

Rules:
- These are search results, not independently verified articles.
- Use only the source URLs supplied below.
- Never invent publication dates.
- If a date is unavailable, say so.
- Do not present old or undated results as confirmed today's news.
- A last-modified date is not necessarily a publication date.
- Avoid repeating identical headlines.
- Multiple reports about one event may still describe the same story.
- Search snippets alone do not prove every claim is true.
- Answer in simple Telugu.

SEARCH RESULTS:

${results.map((item, index) => `
Result ${index + 1}
Title: ${item.title}
URL: ${item.url}
Date: ${item.date || "Unavailable"}
Date type: ${item.dateType}
Description: ${item.description || "No description provided"}
`).join("\n")}
`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/api/health") {
      return Response.json({
        status: "ok",
        service: "Facts AI",
        date: getIndiaDate()
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
              error: "Cloudflare AI binding 'AI' is not configured."
            },
            { status: 500 }
          );
        }

        const cleanMessage = message.trim();
        const newsMode = isNewsRequest(cleanMessage);

        let searchStatus = "failed";
        let searchResults = [];

        try {
          const searchQuery = newsMode
            ? `${cleanMessage} latest news India publication date ${getIndiaDate()}`
            : cleanMessage;

          const searchResponse = await env.AI.websearch({
            gatewayId: "default",
            query: searchQuery.slice(0, 1024),
            provider: "exa",
            limit: 10
          });

          if (!searchResponse || !searchResponse.ok) {
            throw new Error(
              `Web Search request failed: HTTP ${searchResponse?.status ?? "unknown"}`
            );
          }

          const searchData = await searchResponse.json();

          searchResults = prepareSearchResults(searchData);
          searchStatus = "success";

          console.log("Web Search completed", {
            resultCount: searchResults.length,
            newsMode
          });
        } catch (error) {
          console.error(
            "Web Search error:",
            error?.message || String(error)
          );
        }

        const researchContext = buildResearchContext(
          searchResults,
          searchStatus,
          newsMode
        );

        const messages = [
          {
            role: "system",
            content: SYSTEM_INSTRUCTION
          },
          {
            role: "system",
            content: researchContext
          }
        ];

        for (const item of history.slice(-12)) {
          if (
            item &&
            typeof item.text === "string" &&
            item.text.trim()
          ) {
            messages.push({
              role: item.role === "assistant"
                ? "assistant"
                : "user",
              content: item.text.trim().slice(0, 6000)
            });
          }
        }

        messages.push({
          role: "user",
          content: cleanMessage
        });

        const result = await env.AI.run(MODEL, {
          messages,
          max_tokens: 1800,
          temperature: 0.2
        });

        const reply = result?.response;

        if (
          typeof reply !== "string" ||
          !reply.trim()
        ) {
          return Response.json(
            {
              error: "AI నుంచి పూర్తి సమాధానం అందలేదు. మళ్లీ ప్రయత్నించండి."
            },
            { status: 502 }
          );
        }

        return Response.json({
          reply: reply.trim(),
          research: {
            attempted: true,
            searchSucceeded: searchStatus === "success",
            resultCount: searchResults.length,
            currentNewsRequest: newsMode
          }
        });
      } catch (error) {
        console.error(
          "Worker error:",
          error?.stack || error?.message || String(error)
        );

        return Response.json(
          {
            error: "ప్రస్తుతం సమాధానం తయారు చేయలేకపోయాం. కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి."
          },
          { status: 500 }
        );
      }
    }

    // Serve website files safely.
    if (
      env.ASSETS &&
      typeof env.ASSETS.fetch === "function"
    ) {
      return env.ASSETS.fetch(request);
    }

    return new Response(
      "Facts AI: Static asset binding ASSETS is unavailable in this environment.",
      {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      }
    );
  }
};
