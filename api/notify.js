const BOT_TOKEN = "8701909677:AAG2DGKiKn3jz2lMCG8j7kveb0vGAVWkTPM";
const CHAT_ID = "1520352122";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    "unknown";

  const country = req.headers["x-vercel-ip-country"] || "n/a";
  let city = "n/a";
  try {
    city = decodeURIComponent(req.headers["x-vercel-ip-city"] || "n/a");
  } catch {}

  const d = req.body || {};

  const text =
`🔔 New visitor
IP: ${ip}
Location: ${city}, ${country}
Device model: ${d.deviceModel || "n/a"}
Platform: ${d.platform || "n/a"} ${d.osVersion || ""}
User agent: ${d.userAgent}
Screen: ${d.screen}
Language: ${d.language}
Timezone: ${d.timezone}
Referrer: ${d.referrer}
Page: ${d.page}
CPU cores: ${d.cores} | RAM: ${d.memoryGB || "n/a"} GB | Touch: ${d.touch}`;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: text.slice(0, 4000) }),
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
};
