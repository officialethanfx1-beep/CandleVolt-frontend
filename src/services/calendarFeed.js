const axios = require("axios");
const cron = require("node-cron");
const db = require("../db");

const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

async function pollOnce() {
  try {
    const res = await axios.get(FEED_URL, { timeout: 10000 });
    const raw = Array.isArray(res.data) ? res.data : [];
    const events = raw.map((e) => ({
      id: `${e.title}-${e.date}-${e.country}`,
      title: e.title,
      country: e.country,
      date: e.date,
      impact: e.impact,
      forecast: e.forecast || null,
      previous: e.previous || null,
      actual: e.actual || null,
    }));
    db.setCalendarEvents(events);
    console.log(`[calendarFeed] updated ${events.length} events`);
  } catch (e) {
    console.error("[calendarFeed] poll failed:", e.message);
  }
}

function start() {
  pollOnce();
  cron.schedule("*/30 * * * *", pollOnce); // every 30 min
  console.log("[calendarFeed] polling ForexFactory calendar every 30 min");
}

module.exports = { start };
