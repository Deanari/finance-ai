import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { doc } from "./_shared/db.js";
import { add, json, parseISO } from "./_shared/helpers.js";
const TABLE = process.env.TABLE_NAME;

async function scanTransactions({ from, to }) {
  const names = { "#t": "type", "#d": "date", "#a": "amount", "#c": "category" };
  const values = { ":income": "income", ":expense": "expense" };

  let filter = "attribute_exists(#d) AND attribute_exists(#t) AND (#t = :income OR #t = :expense)";
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
    ProjectionExpression: "#d, #a, #c, #t"
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

    const totals = rows.reduce(
      (acc, it) => {
        const amt = Math.abs(Number(it.amount) || 0);
        const isIncome = String(it.type).toLowerCase() === "income";
        if (isIncome) acc.income = add(acc.income, amt);
        else          acc.expense = add(acc.expense, amt);
        return acc;
      },
      { income: 0, expense: 0 }
    );
    totals.net = add(totals.income, -totals.expense);

    const byCategoryMap = new Map();
    for (const it of rows) {
      const isIncome = String(it.type).toLowerCase() === "income";
      if (isIncome) continue;
      const key = it.category || "Uncategorized";
      const amtAbs = Math.abs(Number(it.amount) || 0);
      byCategoryMap.set(key, add(byCategoryMap.get(key) || 0, amtAbs));
    }

    const expensesTotal = totals.expense || 1;
    const byCategory = [...byCategoryMap.entries()]
      .map(([category, amount]) => ({
        category,
        amount,
        pct: Math.round((amount / expensesTotal) * 1000) / 10
      }))
      .sort((a, b) => b.amount - a.amount);

    const top5 = byCategory.slice(0, 5);

    return json(200, {
      period: { from: fromISO, to: toISO },
      totals,
      byCategory,
      top5,
      count: rows.length
    }, event);
  } catch (err) {
    console.error("summary error:", err);
    return json(500, { error: err?.message || "internal_error" }, event);
  }
};
