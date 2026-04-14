// Copy this code into your Cloudflare Worker script.
// Add your secret with: wrangler secret put OPENAI_API_KEY

function getCitationList(responseData) {
  const citations = [];
  const outputs = Array.isArray(responseData.output) ? responseData.output : [];

  outputs.forEach((item) => {
    const contents = Array.isArray(item.content) ? item.content : [];

    contents.forEach((contentItem) => {
      const annotations = Array.isArray(contentItem.annotations)
        ? contentItem.annotations
        : [];

      annotations.forEach((annotation) => {
        if (annotation.type === "url_citation" && annotation.url) {
          citations.push({
            title: annotation.title || annotation.url,
            url: annotation.url,
          });
        }
      });
    });
  });

  return citations;
}

function getOutputText(responseData) {
  if (
    typeof responseData.output_text === "string" &&
    responseData.output_text.trim()
  ) {
    return responseData.output_text.trim();
  }

  const outputs = Array.isArray(responseData.output) ? responseData.output : [];
  const textParts = [];

  outputs.forEach((item) => {
    const contents = Array.isArray(item.content) ? item.content : [];

    contents.forEach((contentItem) => {
      if (
        contentItem.type === "output_text" &&
        typeof contentItem.text === "string"
      ) {
        textParts.push(contentItem.text);
      }

      if (contentItem.type === "text" && typeof contentItem.text === "string") {
        textParts.push(contentItem.text);
      }
    });
  });

  return textParts.join("\n").trim();
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST only." }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    if (!env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing OPENAI_API_KEY secret." }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    try {
      const input = await request.json();

      if (!Array.isArray(input.messages) || input.messages.length === 0) {
        return new Response(
          JSON.stringify({ error: "messages must be a non-empty array." }),
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }

      const upstreamResponse = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: input.model || "gpt-4.1",
            input: input.messages,
            temperature: input.temperature ?? 0.7,
            tools: [{ type: "web_search_preview" }],
          }),
        },
      );

      const responseData = await upstreamResponse.json();

      if (!upstreamResponse.ok) {
        return new Response(JSON.stringify(responseData), {
          status: upstreamResponse.status,
          headers: corsHeaders,
        });
      }

      const citations = getCitationList(responseData);
      let outputText = getOutputText(responseData);

      if (!outputText) {
        outputText =
          "I could not generate a complete response right now. Please try again.";
      }

      if (citations.length > 0) {
        const sourcesBlock = citations
          .map(
            (citation, index) =>
              `${index + 1}. ${citation.title}: ${citation.url}`,
          )
          .join("\n");

        outputText = `${outputText}\n\nSources:\n${sourcesBlock}`;
      }

      // Keep compatibility with existing frontend parser: data.choices[0].message.content
      const compatiblePayload = {
        choices: [
          {
            message: {
              content: outputText,
            },
          },
        ],
        citations,
        response_id: responseData.id,
      };

      return new Response(JSON.stringify(compatiblePayload), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body.",
          details: String(error),
        }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }
  },
};
