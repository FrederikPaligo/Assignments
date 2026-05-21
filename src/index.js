require("dotenv").config();
const express = require("express");
const PaligoClient = require("./paligo-client");
const ChainHandler = require("./chain-handler");

const required = ["PALIGO_INSTANCE", "PALIGO_EMAIL", "PALIGO_API_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const paligo = new PaligoClient({
  instance: process.env.PALIGO_INSTANCE,
  email: process.env.PALIGO_EMAIL,
  apiKey: process.env.PALIGO_API_KEY,
});

const chainHandler = new ChainHandler(paligo);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post("/webhooks/review-approved", async (req, res) => {
  console.log(`[webhook] Incoming at ${new Date().toISOString()}`);
  console.log(`[webhook] Payload:`, JSON.stringify(req.body, null, 2));

  try {
    const result = await chainHandler.handleWebhook(req.body);

    if (result) {
      console.log(`[webhook] Action taken`);
      res.status(200).json({ status: "action_taken", result });
    } else {
      console.log(`[webhook] No action needed`);
      res.status(200).json({ status: "no_action" });
    }
  } catch (error) {
    console.error("[webhook] Error:", error.message);
    res.status(200).json({ status: "error", message: error.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "paligo-review-chain" });
});

app.listen(PORT, () => {
  console.log(`Paligo Review Chain service running on port ${PORT}`);
});
