import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
import { doc as ddb } from "./_shared/db.js";
import { json, parseISO } from "./_shared/helpers.js";

const TABLE = process.env.TABLE_NAME;
const SQS_URL = process.env.ADVICE_QUEUE_URL;
const REGION = process.env.AWS_REGION || "us-east-1";

const sqs = new SQSClient({ region: REGION });

// ---------------------------------------------------------------------------
// GET /api/advice/payload
// ---------------------------------------------------------------------------
export const payloadHandler = async (event) => {
  try {
    const qs = event?.queryStringParameters || {};
    const body = safeJson(event?.body);

    const from    = parseISO(first(qs.from, body?.from));   // YYYY-MM-DD or null
    const to      = parseISO(first(qs.to,   body?.to));     // YYYY-MM-DD or null
    const topN    = clampTopN(first(qs.topN, body?.topN));  // 1..20 (default 5)
    const exclude = normalizeExclude(first(qs.exclude, body?.exclude)); // Set<string> (lc)

    const agg = {
      expensesTotalAll: 0,
      expensesTotal: 0,
      byCat: new Map(),
      topN,
      exclude
    };

    await scanOnlyExpensesAndAggregate({ from, to, agg });
    const payload = finalizePayload(agg);

    return json(200, {
      filters: { from, to, topN, exclude: Array.from(exclude.values()) },
      payload
    });
  } catch (err) {
    console.error("advice payload error:", err);
    return json(500, { error: "internal_error" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/advice  -> job SQS -> 202 { jobId }
// ---------------------------------------------------------------------------
export const requestHandler = async (event) => {
  try {
    if (!TABLE) {
      console.error("TABLE_NAME missing");
      return json(500, { error: "missing_table_env" }, event);
    }
    if (!SQS_URL || !/^https?:\/\//.test(SQS_URL)) {
      console.error("ADVICE_QUEUE_URL missing or not URL:", SQS_URL);
      return json(500, { error: "invalid_queue_url" }, event);
    }

    const qs = event?.queryStringParameters || {};
    const body = safeJson(event?.body);

    const from    = parseISO(first(qs.from, body?.from));
    const to      = parseISO(first(qs.to,   body?.to));
    const topN    = clampTopN(first(qs.topN, body?.topN));
    const exclude = normalizeExclude(first(qs.exclude, body?.exclude));
    const force   = toBool(first(qs.force, body?.force));  // NUEVO

    const idStr = JSON.stringify({ from, to, topN, exclude: [...exclude].sort() });
    const jobId = crypto.createHash("sha1").update(idStr).digest("hex").slice(0, 16);
    const key   = { pk: `adviceJob#${jobId}`, sk: "meta" };

    console.log("STEP1 make job", { jobId, from, to, topN, exclude: [...exclude], force });

    const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: key }));

    if (existing.Item && existing.Item.status === 'done') {
      return json(202, {
        jobId,
        status: 'done',
        advice: existing.Item.advice
      });
    }

    if (existing.Item) {
      const st = existing.Item.status;
      const createdAt  = existing.Item.createdAt;
      const startedAt  = existing.Item.startedAt;
      const finishedAt = existing.Item.finishedAt;
      const staleSec   = 300; // 5 min
      const isStale = olderThan(startedAt || createdAt, staleSec);

      console.log("STEP2 existing job", { status: st, isStale, createdAt, startedAt, finishedAt });

      if (st === "done")   return json(202, { jobId, status: "done" });
      if (st === "error")  return requeue();
      if (st === "queued") return isStale || force ? requeue(true) : json(202, { jobId, status: "queued" });
      if (st === "running")return isStale || force ? requeue(true) : json(202, { jobId, status: "running" });

      return requeue(true);
    }

    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...key,
        status: "queued",
        createdAt: new Date().toISOString(),
        enqueueCount: 1,
        filters: { from, to, topN, exclude: [...exclude] }
      },
      ConditionExpression: "attribute_not_exists(pk)"
    }));
    console.log("STEP3 put queued OK", { pk: key.pk });

    await sendSqs({ jobId, from, to, topN, exclude: [...exclude] });
    console.log("STEP4 sendMessage OK", { jobId });

    return json(202, { jobId, status: "queued" });

    async function requeue(markQueued = false) {
      if (markQueued) {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: key,
          UpdateExpression: "SET #st = :q, enqueueCount = if_not_exists(enqueueCount, :zero) + :one, lastRequeuedAt = :now REMOVE #err",
          ExpressionAttributeNames: { "#st": "status", "#err": "error" },
          ExpressionAttributeValues: { ":q": "queued", ":zero": 0, ":one": 1, ":now": new Date().toISOString() }
        }));
        console.log("STEP3b requeued -> queued", { pk: key.pk });
      }
      await sendSqs({ jobId, from, to, topN, exclude: [...exclude] });
      console.log("STEP4b sendMessage OK", { jobId, requeue: true });
      return json(202, { jobId, status: "queued", requeued: true });
    }

    async function sendSqs(msg) {
      await sqs.send(new SendMessageCommand({
        QueueUrl: SQS_URL,
        MessageBody: JSON.stringify(msg)
      }));
    }
  } catch (err) {
    console.error("advice request error:", err);
    if (err?.name === "ConditionalCheckFailedException") {
      const qs = event?.queryStringParameters || {};
      const body = safeJson(event?.body);
      const from    = parseISO(first(qs.from, body?.from));
      const to      = parseISO(first(qs.to,   body?.to));
      const topN    = clampTopN(first(qs.topN, body?.topN));
      const exclude = normalizeExclude(first(qs.exclude, body?.exclude));
      const idStr = JSON.stringify({ from, to, topN, exclude: [...exclude].sort() });
      const jobId = crypto.createHash("sha1").update(idStr).digest("hex").slice(0, 16);
      return json(202, { jobId, status: "queued" });
    }
    return json(500, { error: err?.message || "internal_error" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/advice/status?jobId=...  -> {status, advice?}
// ---------------------------------------------------------------------------

function stripReasoning(s = "") {
  return String(s).replace(/<reasoning>[\s\S]*?<\/reasoning>\s*/gi, "").trim();
}
export const statusHandler = async (event) => {
  try {
    const jobId = event?.queryStringParameters?.jobId;
    if (!jobId) return json(400, { error: "missing_jobId" }, event);

    const { Item: meta } = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { pk: `adviceJob#${jobId}`, sk: "meta" },
      })
    );

    if (!meta) return json(404, { error: "not_found" }, event);

    const res = { jobId, status: meta.status };

    if (meta.status === "done") {
      const rawText = meta?.advice?.text ?? "";
      const cleanText = stripReasoning(rawText);
      res.advice = { ...(meta.advice || {}), text: cleanText };
    } else if (meta.status === "error") {
      res.error = meta.error || "unknown";
    }

    return json(200, res, event);
  } catch (err) {
    console.error("advice status error:", err);
    return json(500, { error: err?.message || "internal_error" }, event);
  }
};

// ---------------------------------------------------------------------------
// DynamoDB scan — Expenses only (server-side filter)
// ---------------------------------------------------------------------------
async function scanOnlyExpensesAndAggregate({ from, to, agg }) {
  const names = { "#t": "type", "#d": "date", "#a": "amount", "#c": "category", "#desc": "description" };
  const values = { ":expense": "expense" };
  let filter = "#t = :expense";

  if (from) {
    filter += " AND #d >= :from";
    values[":from"] = from;
  }
  if (to) {
    filter += " AND #d <= :to";
    values[":to"] = to;
  }

  const base = {
    TableName: TABLE,
    FilterExpression: filter,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ProjectionExpression: "#d, #a, #c, #desc, #t"
  };

  let LastEvaluatedKey;
  do {
    const out = await ddb.send(new ScanCommand({ ...base, ExclusiveStartKey: LastEvaluatedKey }));
    const page = out.Items || [];

    for (const it of page) {
      const date = parseISO(it.date) || "";
      const rawAmount = toNumber(it.amount);
      const amount = Math.abs(rawAmount);
      const categoryOriginal = (it.category ?? "Others").toString().trim() || "Others";
      const categoryLc = categoryOriginal.toLowerCase();
      const description = (it.description ?? "").toString();

      agg.expensesTotalAll += amount;
      if (agg.exclude.has(categoryLc)) continue;

      agg.expensesTotal += amount;

      let cat = agg.byCat.get(categoryOriginal);
      if (!cat) {
        cat = { name: categoryOriginal, total: 0, descMap: new Map() };
        agg.byCat.set(categoryOriginal, cat);
      }
      cat.total += amount;

      const descKey = description.toLowerCase();
      const cur = cat.descMap.get(descKey) || { description, amount: 0, lastDate: "", count: 0 };
      cur.amount += amount;
      cur.count += 1;
      if (!cur.lastDate || date > cur.lastDate) cur.lastDate = date;
      cat.descMap.set(descKey, cur);
    }

    LastEvaluatedKey = out.LastEvaluatedKey;
  } while (LastEvaluatedKey);
}

// ---------------------------------------------------------------------------
// Build final payload
// ---------------------------------------------------------------------------
function finalizePayload(agg) {
  const { expensesTotal, expensesTotalAll, byCat, topN } = agg;

  const categories = Array.from(byCat.values()).map((c) => ({
    name: c.name,
    total: c.total,
    share: expensesTotal > 0 ? c.total / expensesTotal : 0,
    _descMap: c.descMap
  }));

  categories.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const aMax = maxGroupedAmount(a._descMap);
    const bMax = maxGroupedAmount(b._descMap);
    if (bMax !== aMax) return bMax - aMax;
    return a.name.localeCompare(b.name);
  });

  let topCategory = null;
  if (categories.length) {
    const leader = categories[0];

    const grouped = Array.from(leader._descMap.values()).sort((x, y) => {
      if (y.amount !== x.amount) return y.amount - x.amount;
      if (y.lastDate !== x.lastDate) return y.lastDate.localeCompare(x.lastDate);
      return x.description.localeCompare(y.description);
    });

    const topExpenses = grouped.slice(0, topN).map(({ description, amount, lastDate }) => ({
      date: lastDate,
      amount,
      description
    }));

    topCategory = {
      name: leader.name,
      total: leader.total,
      share: leader.share,
      topExpenses
    };
  }

  const categoriesClean = categories.map(({ _descMap, ...rest }) => rest);

  return {
    expensesTotal,
    expensesTotalAll,
    categories: categoriesClean,
    topCategory
  };
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
function first(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return undefined;
}
function safeJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
function toNumber(n) {
  const x = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(x) ? x : 0;
}
function clampTopN(n) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return 5;
  return Math.min(20, Math.max(1, x));
}
function normalizeExclude(input) {
  const set = new Set();
  if (!input) return set;
  const arr = Array.isArray(input) ? input : String(input).split(",");
  for (const raw of arr) {
    const s = String(raw || "").trim();
    if (s) set.add(s.toLowerCase());
  }
  return set;
}
function maxGroupedAmount(descMap) {
  let max = 0;
  for (const v of descMap.values()) if (v.amount > max) max = v.amount;
  return max;
}
function toBool(v) {
  if (v === true || v === "true" || v === "1" || v === 1) return true;
  return false;
}
function olderThan(iso, seconds) {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  return (Date.now() - t) / 1000 > seconds;
}

// Exports unit tests / worker reuse
export { finalizePayload, scanOnlyExpensesAndAggregate };
