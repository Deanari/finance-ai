import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { doc as ddb } from "./_shared/db.js";
import { parseISO } from "./_shared/helpers.js";
import { finalizePayload, scanOnlyExpensesAndAggregate } from "./index.js";

const TABLE      = process.env.TABLE_NAME;
const REGION     = process.env.AWS_REGION || "us-east-1";
const MODEL_ID   = process.env.BEDROCK_MODEL_ID || "openai.gpt-oss-20b-1:0";
const MAX_TOKENS = parseInt(process.env.BEDROCK_MAX_TOKENS || "1024", 10);
const TEMPERATURE = Number(process.env.BEDROCK_TEMPERATURE || "0.3");

const bedrock = new BedrockRuntimeClient({ region: REGION });

export const handler = async (event) => {
  for (const record of event.Records || []) {
    let jobId, from, to, topN, exclude;
    try {
      const msg = JSON.parse(record.body);
      ({ jobId, from, to, topN, exclude } = msg);
    } catch (err) {
      console.error("Invalid SQS message:", record.body);
      continue;
    }

    // running status
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `adviceJob#${jobId}`, sk: "meta" },
      UpdateExpression: "SET #s = :running, startedAt = :ts",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":running": "running", ":ts": new Date().toISOString() }
    }));

    try {
      // 1) local aggregation (payload)
      const agg = {
        expensesTotalAll: 0,
        expensesTotal: 0,
        byCat: new Map(),
        topN: Number(topN) || 5,
        exclude: new Set(exclude || []),
      };
      await scanOnlyExpensesAndAggregate({ from: parseISO(from), to: parseISO(to), agg });
      const payload = finalizePayload(agg);

      const filters = { from, to, topN: agg.topN, exclude: [...agg.exclude] };
      const payloadSlim = slimPayload(payload);

      // 2) Prompt
      const { system, user } = composePrompt({ from, to, payload });

      // 3) Bedrock call (GPT-OSS)
      const body = {
        model: MODEL_ID,
        max_completion_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        top_p: 0.5,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };

      console.log("Invoking Bedrock", { MODEL_ID, MAX_TOKENS, TEMPERATURE });

      const res = await bedrock.send(new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(body),
      }));

      const raw = new TextDecoder().decode(res.body ?? new Uint8Array());
      let decoded;
      try { decoded = JSON.parse(raw); } catch { decoded = {}; }

      // 4) format text
      let finalText = extractBedrockText(decoded);
      if (!finalText) finalText = "(no text)";


      let structured = null;
      try {
        const m = finalText.match(/```json\s*([\s\S]*?)```/i);
        if (m) structured = JSON.parse(m[1]);
      } catch {}

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { pk: `adviceJob#${jobId}`, sk: "meta" },
        UpdateExpression: "SET #s = :done, advice = :ad, finishedAt = :ts",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":done": "done",
          ":ad": { text: finalText, structured, payloadSlim, filters },
          ":ts": new Date().toISOString(),
        },
      }));

      console.log("Job done", { jobId });
    } catch (e) {
      console.error("advice worker error:", e);
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { pk: `adviceJob#${jobId}`, sk: "meta" },
        UpdateExpression: "SET #s = :err, error = :msg, finishedAt = :ts",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":err": "error",
          ":msg": e?.message || "unknown",
          ":ts": new Date().toISOString(),
        },
      }));
    }
  }
};

// ---------------- helpers ----------------

function composePrompt({ from, to, payload }) {
  const sys =
    "You are a concise, pragmatic personal finance coach. " +
    "Speak clearly, avoid fluff, quantify impact with concrete numbers and short steps. " +
    "Only suggest responsible, general financial tips (no investment recommendations).";

  const windowStr = [from, to].filter(Boolean).join(" → ") || "all available data";
  const slim = slimPayload(payload);

  const hint = `
    Return a short recommendation, followed by a JSON:

    \`\`\`json
    {"summary":"...", "quickWins":[{"action":"...","potentialMonthlySavingsUSD":123}], "categoryTips":[{"category":"...","tip":"..."}]}
    \`\`\`
    `;

  const user =
    `Analyze this spending snapshot and give 3-5 actionable tips with concrete USD amounts.\n` +
    `SPENDING_DATA:\n${JSON.stringify({ window: windowStr, ...slim })}\n\n` +
    hint;

  return { system: sys, user };
}

function slimPayload(p) {
  return {
    totals: { expensesIncluded: p.expensesTotal, expensesAll: p.expensesTotalAll },
    topCategory: p.topCategory,
    top3Categories: p.categories.slice(0, 3).map(c => ({
      name: c.name, total: c.total, share: c.share
    })),
  };
}

function stripReasoningBlocks(s = "") {
  return String(s).replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "").trim();
}

function extractBedrockText(json) {
  // gpt-oss
  if (Array.isArray(json?.output)) {
    const parts = json.output.flatMap(o => o?.content || []);
    const text = parts.filter(p => typeof p?.text === "string").map(p => p.text).join("");
    if (text) {
      const cleaned = stripReasoningBlocks(text);
      return cleaned || onlyStripReasoningTags(text);
    }
  }
  // Anthropic
  const anth = json?.content?.find?.(c => c?.type === "text")?.text;
  if (anth) {
    const cleaned = stripReasoningBlocks(anth);
    return cleaned || onlyStripReasoningTags(anth);
  }
  // OpenAI-like
  const openai = json?.choices?.[0]?.message?.content;
  if (openai) {
    const cleaned = stripReasoningBlocks(openai);
    return cleaned || onlyStripReasoningTags(openai);
  }
  // Otros
  const out = json?.output_text || json?.response_text || json?.generation || json?.text;
  if (out) {
    const cleaned = stripReasoningBlocks(out);
    return cleaned || onlyStripReasoningTags(out);
  }
  return "";
}
