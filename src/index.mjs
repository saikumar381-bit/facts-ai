
const SYSTEM_INSTRUCTION = `
You are Facts AI, a Telugu-first research and content assistant.

ACCURACY:
- Answer in natural, simple Telugu unless the user requests another language.
- Answer every question in the user's message.
- Never invent facts, dates, quotes, links, sources, or research.
- Distinguish established facts, reported claims, and uncertainty.
- Use the supplied web search results as evidence, not as unquestionable truth.
- Do not claim you opened or verified a webpage unless you actually did.
- If evidence is insufficient, clearly say so.
- Do not treat a search result's last-modified date as its publication date.
- Never present an undated result as a confirmed current news story.

CURRENT NEWS:
- For requests about today's, latest, or recent news, use the supplied search results.
- State the publication date only when the source explicitly provides it.
- If only a last-modified date is available, label it as such.
- Prefer recent, relevant reporting from reliable outlets and official sources.
- Do not invent event dates or publication dates.
- Exclude clearly old stories from a today's-news roundup.
- If a result has no reliable date, label its date as unavailable and do not assert it is today's news.
- If search failed or returned no useful results, say that current news could not be verified.
- Do not turn an old story into breaking news by rewriting its headline.
- Group multiple reports about the same underlying event instead of repeating them.
- Include source URLs provided in the search results.
- Search snippets alone do not prove that every claim in an article is true.

FACT CHECKING:
- Use TRUE, FALSE, MISLEADING, or UNCERTAIN where appropriate.
- Explain evidence and important context.
- Never guess the cause of accidents or disasters.

VIDEO CONTENT:
- Create accurate Telugu scripts with a hook, introduction, main content, and ending when useful.
- Suggest scene-by-scene visuals when requested.
- Do not invent sources, eyewitness accounts, or quotations.
- Flag important claims that need more verification before publication.
- Respect copyright and licensing.

CONVERSATION:
- Use relevant conversation history supplied with the request.
- Avoid unnecessary repetition.
- Never imply web research occurred if it did not.
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
  return /\b(news|headlines|breaking news|latest news|current affairs|today'?s news|today news|recent news)\b|వార్తలు|వార్త|నేటి వార్తలు|ఈరోజు వార్తలు|తాజా వార్తలు|ముఖ్యమైన వార్తలు|బ్రేకింగ్ న్యూస్|ప్రస్తుత వార్తలు/i.test(
    message
  );
}

function getResultDate(item) {
  // These fields may vary by provider. Never invent a date.
  const candidates = [
    item?.publishedDate,
    item?.published_date,
    item?.publicationDate,
    item?.publication_date,
    item?.datePublished,
    item?.date_published,
    item?.lastModifiedDate,
    item?.last_modified_date,
    item?.lastModified,
    item?.last_modified
  ];

  for (const value of candidates) {
    if (typeof value !== "string") continue;

    const match = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (!match) continue;

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
        type: [
          item?.publishedDate,
          item?.published_date,
          item?.publicationDate,
          item?.publication_date,
          item?.datePublished,
          item?.date_published
        ].includes(value)
          ? "publication date reported by search provider"
          : "last-modified date; not necessarily publication date"
      };
    }
  }

  return null;
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
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
        ["fbclid", "gclid", "ref", "source"].includes(
          key.toLowerCase()
        )
      ) {
        url.searchParams.delete(key);
      }
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function prepareSearchResults(data, newsMode) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const seenUrls = new Set();
  const seenTitles = new Set();
  const results = [];
  const today = getIndiaDate();

  for (const item of items) {
    const url = normalizeUrl(item?.url);
    const title = String(item?.title || "").trim();
    const description = String(item?.description || "").trim();

    if (!url || !title) continue;

    const normalizedTitle = normalizeTitle(title);

    // Remove exact duplicate URLs and identical normalized headlines.
    if (seenUrls.has(url) || seenTitles.has(normalizedTitle)) {
      continue;
    }

    seenUrls.add(url);
    seenTitles.add(normalizedTitle);

    const dateInfo = getResultDate(item);

    let freshness = "Date unavailable; current status not confirmed.";

    if (dateInfo) {
      freshness = `${dateInfo.type}: ${dateInfo.date}.`;

      if (newsMode && dateInfo.type === "publication date reported by search provider") {
        const ageMs = Date.parse(`${today}T00:00:00Z`) -
          Date.parse(`${dateInfo.date}T00:00:00Z`);

        const ageDays = Math.floor(ageMs / 86400000);

        if (ageDays > 7) {
          freshness += " Older than 7 days; do not present as today's news.";
        } else if (ageDays < 0) {
          freshness += " Date is in the future; treat as unverified.";
        } else {
          freshness += " Within the last 7 calendar days; still verify relevance.";
        }
      }
    }

    results.push({
      title,
      url,
      description: description.slice(0, 1200),
      date: dateInfo?.date || null,
      dateType: dateInfo?.type || null,
      freshness
    });
  }

  return results.slice(0, 6);
}

function buildResearchContext(results, newsMode, searchWorked) {
  if (!searchWorked) {
    return `
WEB RESEARCH STATUS: UNAVAILABLE
The web search request failed. Do not claim you searched the web.
For current news, clearly tell the user that current information could not be verified.
Do not fabricate news headlines, dates, or URLs.
`;
  }

  if (!results.length) {
    return `
WEB RESEARCH STATUS: Search returned no usable results.
Do not invent sources or headlines.
${newsMode ? "Explain that no usable current news results were found." : ""}
`;
  }

  return `
WEB RESEARCH STATUS: Search results received.
Current India date: ${getIndiaDate()}
Request is about current news: ${newsMode ? "YES" : "NO"}

Important:
- Results below are search results, not independently verified articles.
- Only use the supplied URLs as source links.
- Never invent a publication date.
- A last-modified date is not necessarily the publication date.
- A date-unavailable result must not be called today's news.
- For current news, do not describe clearly old results as new.
- Merge reports about the same event when their underlying story is the same.
- If the evidence does not support a claim, say it remains unverified.

SEARCH RESULTS:
${results.map((item, index) => `
[${index + 1}]
Title: ${item.title}
URL: ${item.url}
Date information: ${item.freshness}
Description: ${item.description || "No description supplied."}
`).join("\n")}
`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        status: "ok",
        service: "Facts AI"
      });
    }

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

        if (typeof message !== "string" || !message.trim()) {
          return Response.json(
            { error: "Message is required" },
            { status: 400 }
          );
        }

        if (!env.AI) {
          return Response.json(
            { error: "Cloudflare AI binding 'AI' is not configured." },
            { status: 500 }
          );
        }

        const cleanMessage = message.trim();
        const newsMode = isNewsRequest(cleanMessage);

        let searchWorked = false;
        let researchContext = "";

        try {
          const searchQuery = newsMode
            ? `${cleanMessage} latest news India Telangana Andhra Pradesh publication date ${getIndiaDate()}`
            : cleanMessage;

          const searchResponse = await env.AI.websearch({
            gatewayId: "default",
            query: searchQuery.slice(0, 1024),
            provider: "exa",
            limit: 10
          });

          if (!searchResponse.ok) {
            throw new Error(
              `Web Search returned HTTP ${searchResponse.status}`
            );
          }

          const searchData = await searchResponse.json();

          if (!Array.isArray(searchData?.items)) {
            throw new Error("Unexpected Web Search response format");
          }

          searchWorked = true;

          const preparedResults = prepareSearchResults(
            searchData,
            newsMode
          );

          researchContext = buildResearchContext(
            preparedResults,
            newsMode,
            true
          );
        } catch (searchError) {
          console.error("Web Search error:", searchError);

          researchContext = buildResearchContext(
            [],
            newsMode,
            false
          );
        }

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
              role: item.role === "assistant" ? "assistant" : "user",
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

        if (typeof reply !== "string" || !reply.trim()) {
          return Response.json(
            {
              error: "AI నుంచి పూర్తి సమాధానం అందలేదు. దయచేసి మళ్లీ ప్రయత్నించండి."
            },
            { status: 502 }
          );
        }

        return Response.json({
          reply: reply.trim(),
          research: {
            attempted: true,
            searchSucceeded: searchWorked,
            currentNewsRequest: newsMode
          }
        });
      } catch (error) {
        console.error("Worker error:", error);

        return Response.json(
          {
            error: "ప్రస్తుతం సమాధానం తయారు చేయలేకపోయాం. కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి."
          },
          { status: 500 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
