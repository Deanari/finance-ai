import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { doc } from "./_shared/db.js";
import { add, json, parseISO } from "./_shared/helpers.js";

const TABLE = process.env.TABLE_NAME;

async function scanTransactions({ from, to }) {
  const names = { "#t": "type", "#d": "date", "#a": "amount" };
  const values = { ":income": "income", ":expense": "expense" };

  let filter =
    "attribute_exists(#d) AND attribute_exists(#t) AND (#t = :income OR #t = :expense)";
  if (from) {
    filter += " AND #d >= :from";
    values[":from"] = from; // YYYY-MM-DD 
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
    ProjectionExpression: "#d, #a, #t",
  };

  const items = [];
  let LastEvaluatedKey;
  do {
    const out = await doc.send(new ScanCommand({ ...base, ExclusiveStartKey: LastEvaluatedKey }));
    if (out.Items?.length) items.push(...out.Items);
    LastEvaluatedKey = out.LastEvaluatedKey;
  } while (LastEvaluatedKey);

  return items;
}

export const handler = async (event) => {
  try {
    const qs = event?.queryStringParameters || {};
    const fromISO = parseISO(qs.from);
    const toISO   = parseISO(qs.to);

    const rows = await scanTransactions({ from: fromISO, to: toISO });

    const byDay = new Map(); // key: YYYY-MM-DD
    for (const it of rows) {
      const day = parseISO(it.date);
      if (!day) continue;

      const amtAbs = Math.abs(Number(it.amount) || 0);
      const isIncome = String(it.type).toLowerCase() === "income";

      const prev = byDay.get(day) || { date: day, income: 0, expense: 0 };
      if (isIncome) prev.income = add(prev.income, amtAbs);
      else          prev.expense = add(prev.expense, amtAbs);
      byDay.set(day, prev);
    }

    const series = [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    let runningNet = 0;
    const points = series.map((p) => {
      runningNet = add(runningNet, add(p.income, -p.expense));
      return {
        date: p.date,
        income: Number(p.income),
        expense: Number(p.expense),
        net: Number(runningNet),
      };
    });

    return json(
      200,
      {
        period: { from: fromISO, to: toISO },
        points,
        count: rows.length,
      },
      event
    );
  } catch (err) {
    console.error("timeline error:", err);
    return json(500, { error: err?.message || "internal_error" }, event);
  }
};
