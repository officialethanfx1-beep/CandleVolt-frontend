const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/calendar?impact=high
router.get("/", (req, res) => {
  const { impact } = req.query;
  const events = db.getCalendarEvents(impact);
  res.json({ events });
});

module.exports = router;
