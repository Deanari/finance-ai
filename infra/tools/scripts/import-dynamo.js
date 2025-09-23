import { DynamoDBClient, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import fs from "fs";
import path from "path";

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE_NAME = process.env.TABLE_NAME;

if (!TABLE_NAME) {
  console.error("❌ Missing TABLE_NAME env var");
  process.exit(1);
}

const client = new DynamoDBClient({ region: REGION });

// ---- Load data.json ----
const filePath = path.resolve("./mock_expense_and_income.json"); 
if (!fs.existsSync(filePath)) {
  console.error("❌ data.json not found at", filePath);
  process.exit(1);
}
const raw = fs.readFileSync(filePath, "utf-8");
const items = JSON.parse(raw);

// ---- Helpers ----
function buildKeys(item, idx) {
  // pk = TXN#2025-09-23
  const pk = `TXN#${item.date}`;
  // sk = TYPE#expense#CAT#food
  const sk = `TYPE#${item.type}#CAT#${item.category || "uncat"}#${idx}`;
  return { pk, sk };
}

function toPutRequest(item, idx) {
  const { pk, sk } = buildKeys(item, idx);
  return {
    PutRequest: {
      Item: {
        pk: { S: pk },
        sk: { S: sk },
        date: { S: item.date },
        amount: { N: String(item.amount) },
        category: { S: item.category },
        description: { S: item.description },
        type: { S: item.type },
      },
    },
  };
}

// ---- Batch write in chunks of 25 ----
async function main() {
  const requests = items.map(toPutRequest);
  const chunks = [];
  for (let i = 0; i < requests.length; i += 25) {
    chunks.push(requests.slice(i, i + 25));
  }

  for (const [i, chunk] of chunks.entries()) {
    console.log(`▶️ Writing batch ${i + 1}/${chunks.length}`);
    const cmd = new BatchWriteItemCommand({
      RequestItems: { [TABLE_NAME]: chunk },
    });
    await client.send(cmd);
  }

  console.log(`✅ Imported ${items.length} items into ${TABLE_NAME}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});