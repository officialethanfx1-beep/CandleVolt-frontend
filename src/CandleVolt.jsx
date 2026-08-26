import React, { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { createChart, ColorType } from "lightweight-charts";
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Crown,
  ChevronRight,
  Radio,
  Wallet,
  Users,
  ShieldCheck,
  Lock,
  Copy,
  Check,
  X,
  QrCode,
  CreditCard,
  WifiOff,
  Menu,
  LayoutDashboard,
  Newspaper,
  CalendarClock,
  Sparkles,
  UserCircle,
  BarChart3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Design tokens
// bg-void:   #0A0D12   deep charcoal-navy, not pure black
// bg-panel:  #12161F   card surface
// bg-raised: #1A2030   raised surface / hover
// line:      #232A3B   hairline borders
// gold:      #E3A64B   bullish / buy / primary accent
// rose:      #E2555A   bearish / sell
// text-hi:   #EDEFF3
// text-mid:  #9AA3B5
// text-lo:   #5C6478
// ---------------------------------------------------------------------------

// >>> Point this at your deployed backend (see candlevolt-backend/README.md).
const BACKEND_URL = "https://candlevolt-backend-qsyr.onrender.com";

const ASSETS = {
  crypto: [
    { symbol: "BTC/USDT", base: 64200, vol: 180 },
    { symbol: "ETH/USDT", base: 3120, vol: 14 },
    { symbol: "SOL/USDT", base: 148, vol: 2.4 },
    { symbol: "BNB/USDT", base: 588, vol: 4.1 },
  ],
  meme: [
    { symbol: "DOGE/USDT", base: 0.14, vol: 0.003 },
    { symbol: "SHIB/USDT", base: 0.000021, vol: 0.0000006 },
    { symbol: "PEPE/USDT", base: 0.0000091, vol: 0.0000003 },
    { symbol: "WIF/USDT", base: 2.31, vol: 0.08 },
  ],
  forex: [
    { symbol: "EUR/USD", base: 1.0842, vol: 0.0009 },
    { symbol: "GBP/USD", base: 1.2695, vol: 0.0011 },
    { symbol: "USD/JPY", base: 151.32, vol: 0.14 },
    { symbol: "USD/INR", base: 83.42, vol: 0.03 },
  ],
  commodities: [
    { symbol: "XAU/USD", base: 2384, vol: 3.2 },
    { symbol: "XAG/USD", base: 28.4, vol: 0.18 },
    { symbol: "WTI/USD", base: 78.6, vol: 0.6 },
  ],
};

const MARKET_LABELS = {
  crypto: "Crypto",
  meme: "Memecoins",
  forex: "Forex",
  commodities: "Commodities",
};

const HISTORY_LEN = 40;
const POLL_MS = 5000;

function seedSeries(base) {
  return new Array(HISTORY_LEN).fill(base);
}

function fmtPrice(v, symbol) {
  if (v == null || Number.isNaN(v)) return "—";
  if (symbol.includes("JPY") || symbol.includes("INR")) return v.toFixed(2);
  if (v > 100) return v.toFixed(2);
  if (v > 1) return v.toFixed(3);
  if (v > 0.001) return v.toFixed(5);
  return v.toFixed(8);
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}

function fmtCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// simple per-session id
function makeSessionId() {
  return `sess-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

// Real localStorage is fine here — this is a real deployed website.
const LS_TOKEN = "candlevolt_token";
const LS_USERID = "candlevolt_userid";
const LS_EMAIL = "candlevolt_email";

function loadStoredAuth() {
  try {
    const token = localStorage.getItem(LS_TOKEN);
    const userId = localStorage.getItem(LS_USERID);
    const email = localStorage.getItem(LS_EMAIL);
    if (token && userId) return { token, userId, email };
  } catch {
    // storage may be unavailable
  }
  return null;
}

function saveStoredAuth({ token, userId, email }) {
  try {
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_USERID, userId);
    if (email) localStorage.setItem(LS_EMAIL, email);
  } catch {
    // ignore
  }
}

function clearStoredAuth() {
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USERID);
    localStorage.removeItem(LS_EMAIL);
  } catch {
    // ignore
  }
}

// Manual timeout wrapper
function fetchWithTimeout(url, ms = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() =>
    clearTimeout(id)
  );
}

// ---------------------------------------------------------------------------

function Sparkline({ data, positive }) {
  const points = data.map((v, i) => ({ i, v }));
  const color = positive ? "#E3A64B" : "#E2555A";

  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={points}>
        <YAxis domain={["dataMin", "dataMax"]} hide />
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.6}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Real OHLC candlestick chart
function CandlestickChart({ symbol, interval, height = 220 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let raf = requestAnimationFrame(() => {
      if (!containerRef.current) return;

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: {
            type: ColorType.Solid,
            color: "#0D1017",
          },
          textColor: "#9AA3B5",
          fontFamily: "IBM Plex Mono, monospace",
        },
        grid: {
          vertLines: { color: "#1B2130" },
          horzLines: { color: "#1B2130" },
        },
        timeScale: {
          borderColor: "#232A3B",
          timeVisible: true,
        },
        rightPriceScale: {
          borderColor: "#232A3B",
        },
        crosshair: {
          mode: 0,
        },
      });

      const series = chart.addCandlestickSeries({
        upColor: "#E3A64B",
                downColor: "#E2555A",
        borderVisible: false,
        wickUpColor: "#E3A64B",
        wickDownColor: "#E2555A",
      });

      chartRef.current = chart;
      seriesRef.current = series;
    });

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && chartRef.current) {
        chartRef.current.applyOptions({
          width: Math.floor(entry.contentRect.width),
        });
      }
    });

    ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetchWithTimeout(
          `${BACKEND_URL}/api/candles?symbol=${encodeURIComponent(
            symbol
          )}&interval=${interval}&limit=200`
        );

        if (!res.ok) return;

        const data = await res.json();

        if (cancelled || !seriesRef.current) return;

        const candles = (data.candles || []).map((c) => ({
          time: c.t,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        }));

        if (candles.length) {
          seriesRef.current.setData(candles);
        }
      } catch {
        // keep showing the last known candles
      }
    };

    poll();

    const id = setInterval(poll, 8000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, interval]);

  return <div ref={containerRef} className="candle-chart-box" />;
}

const TIMEFRAMES = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1D",
  "1w",
  "1M",
];

function TimeframeBar({ value, onChange }) {
  return (
    <div className="tf-bar">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          className={`tf-btn ${value === tf ? "active" : ""}`}
          onClick={() => onChange(tf)}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}

function timeAgoShort(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);

  if (s < 60) return "just now";

  const m = Math.floor(s / 60);

  if (m < 60) return `${m}m ago`;

  const h = Math.floor(m / 60);

  if (h < 24) return `${h}h ago`;

  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Live news
// ---------------------------------------------------------------------------

function NewsPanel({ market }) {
  const [items, setItems] = useState([]);

  const category =
    market === "forex" || market === "commodities"
      ? "forex"
      : "crypto";

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetchWithTimeout(
          `${BACKEND_URL}/api/news?category=${category}&limit=12`
        );

        if (!res.ok) return;

        const data = await res.json();

        if (!cancelled) {
          setItems(
            Array.isArray(data?.news)
              ? data.news
              : []
          );
        }
      } catch {
        // keep whatever headlines we already have
      }
    };

    poll();

    const id = setInterval(poll, 60000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [category]);

  return (
    <div className="panel">
      <div className="panel-title">
        <Radio
          size={12}
          style={{
            display: "inline",
            marginRight: 6,
            verticalAlign: -2,
          }}
        />

        Market News —{" "}
        {category === "forex"
          ? "Forex & Commodities"
          : "Crypto"}
      </div>

      <div className="news-feed">
        {items.length === 0 && (
          <div className="empty-state">
            Fetching the latest headlines…
          </div>
        )}

        {items.map((n) => (
          <a
            key={n.id}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="news-item"
          >
            <div className="news-title">
              {n.title}
            </div>

            <div className="news-meta">
              <span className="news-source">
                {n.source}
              </span>

              <span className="news-time">
                {timeAgoShort(n.publishedAt)}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function Ticker({ tickerData }) {
  const row = [...tickerData, ...tickerData];

  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {row.map((t, idx) => (
          <span
            key={idx}
            className="ticker-item"
          >
            <span className="ticker-sym">
              {t.symbol}
            </span>

            <span
              className={
                t.up
                  ? "ticker-up"
                  : "ticker-down"
              }
            >
              {fmtPrice(t.price, t.symbol)}
            </span>

            <span
              className={
                t.up
                  ? "ticker-up"
                  : "ticker-down"
              }
            >
              {t.price == null
                ? ""
                : `${t.up ? "▲" : "▼"} ${Math.abs(
                    t.pct
                  ).toFixed(2)}%`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SignalCard({
  sig,
  locked,
  remainingMs,
}) {
  const isBuy = sig.direction === "BUY";

  if (locked) {
    return (
      <div
        className={`sig-card sig-locked ${
          isBuy ? "sig-buy" : "sig-sell"
        }`}
      >
        <div className="sig-top">
          <div className="sig-dir">
            {isBuy ? (
              <TrendingUp
                size={15}
                strokeWidth={2.4}
              />
            ) : (
              <TrendingDown
                size={15}
                strokeWidth={2.4}
              />
            )}

            <span>{sig.direction}</span>
          </div>

          <span className="sig-market">
            {sig.marketKey?.toUpperCase()}
          </span>
        </div>

        <div className="sig-symbol blurred">
          {sig.symbol}
        </div>

        <div className="lock-overlay">
          <Lock size={14} />

          <span>
            Unlocks in {fmtCountdown(remainingMs)}
          </span>

          <span className="lock-sub">
            Upgrade to Pro for real-time signals
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`sig-card ${
        isBuy ? "sig-buy" : "sig-sell"
      }`}
    >
      <div className="sig-top">
        <div className="sig-dir">
          {isBuy ? (
            <TrendingUp
              size={15}
              strokeWidth={2.4}
            />
          ) : (
            <TrendingDown
              size={15}
              strokeWidth={2.4}
            />
          )}

          <span>{sig.direction}</span>
        </div>

        <span className="sig-market">
          {sig.marketKey?.toUpperCase()}
        </span>
      </div>

      <div className="sig-symbol">
        {sig.symbol}
      </div>

      <div className="sig-grid">
        <div>
          <div className="sig-label">
            Entry
          </div>

          <div className="sig-val">
            {fmtPrice(
              sig.entry,
              sig.symbol
            )}
          </div>
        </div>

        <div>
          <div className="sig-label">
            Target
          </div>

          <div className="sig-val sig-val-up">
            {fmtPrice(
              sig.target,
              sig.symbol
            )}
          </div>
        </div>

        <div>
          <div className="sig-label">
            Stop
          </div>

          <div className="sig-val sig-val-down">
            {fmtPrice(
              sig.stop,
              sig.symbol
            )}
          </div>
        </div>
      </div>

      <div className="sig-conf-row">
        <div className="sig-conf-track">
          <div
            className="sig-conf-fill"
            style={{
              width: `${sig.confidence}%`,
              background: isBuy
                ? "#E3A64B"
                : "#E2555A",
            }}
          />
        </div>

        <span className="sig-conf-num">
          {sig.confidence}%
        </span>
      </div>

      <div className="sig-foot">
        <span>{sig.reason}</span>

        <span className="sig-time">
          {timeAgo(sig.ts)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    key: "chart",
    label: "Chart",
    icon: BarChart3,
  },
  {
    key: "news",
    label: "News",
    icon: Newspaper,
  },
  {
    key: "calendar",
    label: "Market Calendar",
    icon: CalendarClock,
  },
  {
    key: "analysis",
    label: "Daily Analysis",
    icon: Sparkles,
  },
  {
    key: "account",
    label: "Account",
    icon: UserCircle,
  },
];

function SideMenu({
  open,
  activeView,
  onSelect,
  onClose,
}) {
  return (
    <>
      <div
        className={`menu-scrim ${
          open ? "menu-scrim-open" : ""
        }`}
        onClick={onClose}
      />

      <div
        className={`side-menu ${
          open ? "side-menu-open" : ""
        }`}
      >
        <div className="side-menu-head">
          <div className="brand-mark">
            <Zap
              size={16}
              strokeWidth={2.6}
            />
          </div>

          CandleVolt
        </div>

        <div className="side-menu-items">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.key}
                className={`side-menu-item ${
                  activeView === item.key
                    ? "active"
                    : ""
                }`}
                onClick={() => {
                  onSelect(item.key);
                  onClose();
                }}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
function CalendarView() {
  const [events, setEvents] = useState([]);
  const [impact, setImpact] = useState("all");

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetchWithTimeout(
          `${BACKEND_URL}/api/calendar?limit=50`
        );

        if (!res.ok) return;

        const data = await res.json();

        if (!cancelled) {
          setEvents(
            Array.isArray(data?.events)
              ? data.events
              : []
          );
        }
      } catch {
        // keep existing events
      }
    };

    poll();

    const id = setInterval(poll, 300000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered =
    impact === "all"
      ? events
      : events.filter(
          (e) =>
            String(e.impact || "").toLowerCase() ===
            impact
        );

  return (
    <div className="view-wrap">
      <div className="view-head">
        <div>
          <div className="eyebrow">
            ECONOMIC EVENTS
          </div>

          <h2>Market Calendar</h2>

          <p className="view-sub">
            Upcoming macro events that may move
            global markets.
          </p>
        </div>

        <div className="impact-tabs">
          {["all", "high", "medium", "low"].map(
            (level) => (
              <button
                key={level}
                className={`impact-btn ${
                  impact === level ? "active" : ""
                }`}
                onClick={() => setImpact(level)}
              >
                {level}
              </button>
            )
          )}
        </div>
      </div>

      <div className="panel calendar-panel">
        <div className="calendar-head">
          <span>EVENT</span>
          <span>TIME</span>
          <span>IMPACT</span>
          <span>FORECAST</span>
          <span>PREVIOUS</span>
          <span>ACTUAL</span>
        </div>

        {filtered.length === 0 && (
          <div className="empty-state calendar-empty">
            No calendar events available.
          </div>
        )}

        {filtered.map((event, index) => {
          const level = String(
            event.impact || "low"
          ).toLowerCase();

          return (
            <div
              className="calendar-row"
              key={
                event.id ||
                `${event.title}-${event.time}-${index}`
              }
            >
              <div className="calendar-event">
                <div className="calendar-country">
                  {event.country || "GLOBAL"}
                </div>

                <div className="calendar-title">
                  {event.title || "Unnamed event"}
                </div>
              </div>

              <div className="calendar-time">
                {event.time
                  ? new Date(event.time).toLocaleString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )
                  : "—"}
              </div>

              <div>
                <span
                  className={`impact-pill impact-${level}`}
                >
                  {level}
                </span>
              </div>

              <div className="calendar-value">
                {event.forecast ?? "—"}
              </div>

              <div className="calendar-value">
                {event.previous ?? "—"}
              </div>

              <div className="calendar-value actual">
                {event.actual ?? "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily AI analysis
// ---------------------------------------------------------------------------

function AnalysisView() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetchWithTimeout(
          `${BACKEND_URL}/api/daily-analysis`
        );

        if (!res.ok) return;

        const data = await res.json();

        if (!cancelled) {
          setAnalysis(data?.analysis || null);
        }
      } catch {
        // no analysis available
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    poll();

    const id = setInterval(poll, 300000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="view-wrap">
      <div className="view-head">
        <div>
          <div className="eyebrow">
            MARKET INTELLIGENCE
          </div>

          <h2>Daily Analysis</h2>

          <p className="view-sub">
            AI-assisted market briefing generated
            from current market conditions.
          </p>
        </div>
      </div>

      <div className="analysis-grid">
        {loading && (
          <div className="panel analysis-loading">
            <Sparkles size={18} />
            Loading today's briefing…
          </div>
        )}

        {!loading && !analysis && (
          <div className="panel analysis-empty">
            <Sparkles size={22} />

            <div>
              <div className="analysis-empty-title">
                Daily analysis unavailable
              </div>

              <div className="analysis-empty-sub">
                No live briefing was returned by the
                backend.
              </div>
            </div>
          </div>
        )}

        {!loading && analysis && (
          <>
            <div className="panel analysis-main">
              <div className="analysis-label">
                TODAY'S BRIEFING
              </div>

              <h3>
                {analysis.title ||
                  "Market Overview"}
              </h3>

              <div className="analysis-text">
                {analysis.summary ||
                  analysis.text ||
                  ""}
              </div>

              {Array.isArray(
                analysis.highlights
              ) &&
                analysis.highlights.length > 0 && (
                  <div className="analysis-highlights">
                    {analysis.highlights.map(
                      (item, index) => (
                        <div
                          className="analysis-highlight"
                          key={index}
                        >
                          <div className="analysis-dot">
                            <Zap size={11} />
                          </div>

                          <span>{item}</span>
                        </div>
                      )
                    )}
                  </div>
                )}
            </div>

            <div className="panel analysis-side">
              <div className="analysis-label">
                MARKET BIAS
              </div>

              <div
                className={`analysis-bias ${
                  String(
                    analysis.bias || ""
                  ).toLowerCase()
                }`}
              >
                {analysis.bias || "NEUTRAL"}
              </div>

              {analysis.risk && (
                <>
                  <div className="analysis-label">
                    RISK
                  </div>

                  <div className="analysis-risk">
                    {analysis.risk}
                  </div>
                </>
              )}

              {analysis.updatedAt && (
                <div className="analysis-updated">
                  Updated{" "}
                  {new Date(
                    analysis.updatedAt
                  ).toLocaleString()}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="analysis-disclaimer">
        AI-generated market analysis is for
        informational purposes only and is not a
        guaranteed prediction or financial advice.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart view
// ---------------------------------------------------------------------------

function ChartView({
  market,
  selectedAsset,
  onAssetChange,
}) {
  const [interval, setIntervalValue] =
    useState("1h");

  const assets =
    ASSETS[market] || ASSETS.crypto;

  const selected =
    assets.find(
      (a) => a.symbol === selectedAsset
    ) || assets[0];

  return (
    <div className="view-wrap">
      <div className="view-head chart-view-head">
        <div>
          <div className="eyebrow">
            TECHNICAL CHART
          </div>

          <h2>{selected.symbol}</h2>

          <p className="view-sub">
            Live market structure and price action.
          </p>
        </div>

        <select
          className="asset-select"
          value={selected.symbol}
          onChange={(e) =>
            onAssetChange(e.target.value)
          }
        >
          {assets.map((asset) => (
            <option
              key={asset.symbol}
              value={asset.symbol}
            >
              {asset.symbol}
            </option>
          ))}
        </select>
      </div>

      <div className="panel chart-panel">
        <div className="chart-toolbar">
          <div className="chart-symbol">
            <BarChart3 size={15} />

            {selected.symbol}
          </div>

          <TimeframeBar
            value={interval}
            onChange={setIntervalValue}
          />
        </div>

        <CandlestickChart
          symbol={selected.symbol}
          interval={interval}
          height={430}
        />
      </div>
    </div>
  );
}
function DashboardView({
  market,
  setMarket,
  tickerData,
  signals,
  plan,
  onUpgrade,
}) {
  const [selectedAsset, setSelectedAsset] =
    useState(
      ASSETS[market]?.[0]?.symbol || ""
    );

  const [selectedSignal, setSelectedSignal] =
    useState(null);

  const [remainingMs, setRemainingMs] =
    useState(0);

  useEffect(() => {
    const first =
      ASSETS[market]?.[0]?.symbol || "";

    setSelectedAsset(first);
  }, [market]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!selectedSignal?.unlockAt) {
        setRemainingMs(0);
        return;
      }

      setRemainingMs(
        Math.max(
          0,
          new Date(
            selectedSignal.unlockAt
          ).getTime() - Date.now()
        )
      );
    }, 1000);

    return () => clearInterval(id);
  }, [selectedSignal]);

  const marketSignals = signals.filter(
    (s) =>
      !s.marketKey ||
      s.marketKey === market
  );

  const visibleSignals =
    marketSignals.length > 0
      ? marketSignals
      : [];

  return (
    <div className="view-wrap dashboard-view">
      <div className="dashboard-top">
        <div>
          <div className="eyebrow">
            LIVE MARKET TERMINAL
          </div>

          <h2>Dashboard</h2>

          <p className="view-sub">
            Real-time prices, signals and market
            intelligence.
          </p>
        </div>

        <div className="market-tabs">
          {Object.keys(MARKET_LABELS).map(
            (key) => (
              <button
                key={key}
                className={`market-tab ${
                  market === key
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setMarket(key)
                }
              >
                {MARKET_LABELS[key]}
              </button>
            )
          )}
        </div>
      </div>

      <Ticker tickerData={tickerData} />

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <div className="section-head">
            <div>
              <div className="section-kicker">
                MARKET WATCH
              </div>

              <h3>
                {MARKET_LABELS[market]}
              </h3>
            </div>

            <div className="live-status">
              <span className="live-dot" />
              LIVE
            </div>
          </div>

          <div className="asset-grid">
            {(
              ASSETS[market] || []
            ).map((asset) => {
              const ticker = tickerData.find(
                (t) =>
                  t.symbol === asset.symbol
              );

              const price =
                ticker?.price ?? asset.base;

              const pct =
                ticker?.pct ?? 0;

              const up =
                ticker?.up ?? pct >= 0;

              const selected =
                selectedAsset ===
                asset.symbol;

              return (
                <button
                  key={asset.symbol}
                  className={`asset-card ${
                    selected
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setSelectedAsset(
                      asset.symbol
                    )
                  }
                >
                  <div className="asset-card-top">
                    <span className="asset-symbol">
                      {asset.symbol}
                    </span>

                    <span
                      className={
                        up
                          ? "pct-up"
                          : "pct-down"
                      }
                    >
                      {up ? "+" : ""}
                      {pct.toFixed(2)}%
                    </span>
                  </div>

                  <div className="asset-price">
                    {fmtPrice(
                      price,
                      asset.symbol
                    )}
                  </div>

                  <Sparkline
                    data={
                      ticker?.history ||
                      seedSeries(
                        asset.base
                      )
                    }
                    positive={up}
                  />
                </button>
              );
            })}
          </div>

          <div className="section-head signal-section-head">
            <div>
              <div className="section-kicker">
                TRADE SIGNALS
              </div>

              <h3>
                Latest Signals
              </h3>
            </div>

            <div className="signal-count">
              {visibleSignals.length} signals
            </div>
          </div>

          <div className="signals-grid">
            {visibleSignals.length === 0 && (
              <div className="panel empty-signals">
                <Radio size={18} />

                <span>
                  Waiting for live signals…
                </span>
              </div>
            )}

            {visibleSignals.map(
              (sig, index) => {
                const locked =
                  plan === "free" &&
                  index >= 3;

                return (
                  <div
                    key={
                      sig.id ||
                      `${sig.symbol}-${sig.ts}-${index}`
                    }
                    onClick={() => {
                      if (locked) {
                        setSelectedSignal(
                          sig
                        );
                      }
                    }}
                  >
                    <SignalCard
                      sig={sig}
                      locked={locked}
                      remainingMs={
                        remainingMs
                      }
                    />
                  </div>
                );
              }
            )}
          </div>
        </div>

        <aside className="dashboard-side">
          <NewsPanel market={market} />

          <div className="panel upgrade-panel">
            <div className="upgrade-icon">
              <Crown size={18} />
            </div>

            <div className="upgrade-title">
              Unlock full signals
            </div>

            <div className="upgrade-text">
              Get real-time signals, entry,
              target, stop and higher confidence
              scoring.
            </div>

            <button
              className="gold-btn"
              onClick={onUpgrade}
            >
              Upgrade Plan
              <ChevronRight size={14} />
            </button>
          </div>
        </aside>
      </div>

      {selectedSignal && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setSelectedSignal(null)
          }
        >
          <div
            className="modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <button
              className="modal-close"
              onClick={() =>
                setSelectedSignal(null)
              }
            >
              <X size={17} />
            </button>

            <div className="modal-icon">
              <Lock size={18} />
            </div>

            <h3>
              Signal locked
            </h3>

            <p>
              Free accounts receive limited
              delayed signals. Upgrade to
              unlock real-time trade signals.
            </p>

            <button
              className="gold-btn modal-action"
              onClick={() => {
                setSelectedSignal(null);
                onUpgrade();
              }}
            >
              View Plans
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live market data hook
// ---------------------------------------------------------------------------

function useMarketData() {
  const [marketData, setMarketData] =
    useState({});

  const [backendOnline, setBackendOnline] =
    useState(false);

  const [lastUpdate, setLastUpdate] =
    useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(
        `${BACKEND_URL}/api/markets`,
        10000
      );

      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}`
        );
      }

      const data = await res.json();

      const incoming =
        data?.markets ||
        data?.data ||
        data;

      if (
        incoming &&
        typeof incoming === "object"
      ) {
        setMarketData(incoming);
      }

      setBackendOnline(true);
      setLastUpdate(Date.now());
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    load();

    const id = setInterval(
      load,
      POLL_MS
    );

    return () => clearInterval(id);
  }, [load]);

  return {
    marketData,
    backendOnline,
    lastUpdate,
  };
}

// ---------------------------------------------------------------------------
// Convert backend market response into ticker rows
// ---------------------------------------------------------------------------

function buildTickerData(marketData) {
  const allAssets = [
    ...ASSETS.crypto,
    ...ASSETS.meme,
    ...ASSETS.forex,
    ...ASSETS.commodities,
  ];

  return allAssets.map((asset) => {
    const raw =
      marketData?.[asset.symbol] ||
      marketData?.[
        asset.symbol.replace("/", "")
      ];

    const price = Number(
      raw?.price ??
        raw?.last ??
        raw?.close ??
        asset.base
    );

    const pct = Number(
      raw?.pct ??
        raw?.changePercent ??
        raw?.change_pct ??
        0
    );

    const history = Array.isArray(
      raw?.history
    )
      ? raw.history.map(Number)
      : seedSeries(price);

    return {
      symbol: asset.symbol,
      price,
      pct,
      up: pct >= 0,
      history:
        history.length > 0
          ? history
          : seedSeries(price),
    };
  });
}

// ---------------------------------------------------------------------------
// Signals hook
// ---------------------------------------------------------------------------

function useSignals() {
  const [signals, setSignals] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(
        `${BACKEND_URL}/api/signals`,
        12000
      );

      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}`
        );
      }

      const data = await res.json();

      const incoming =
        Array.isArray(data)
          ? data
          : Array.isArray(data?.signals)
          ? data.signals
          : [];

      setSignals(
        incoming.map((s, index) => ({
          id:
            s.id ||
            `signal-${index}-${s.symbol}`,
          symbol:
            s.symbol || "UNKNOWN",
          direction:
            String(
              s.direction ||
                s.side ||
                "BUY"
            ).toUpperCase(),
          entry: Number(
            s.entry ?? s.entryPrice ?? 0
          ),
          target: Number(
            s.target ??
              s.takeProfit ??
              s.tp ??
              0
          ),
          stop: Number(
            s.stop ??
              s.stopLoss ??
              s.sl ??
              0
          ),
          confidence: Number(
            s.confidence ?? 0
          ),
          reason:
            s.reason ||
            s.description ||
            "Market structure signal",
          marketKey:
            s.marketKey ||
            s.market ||
            "crypto",
          ts:
            s.ts ||
            s.timestamp ||
            Date.now(),
          unlockAt:
            s.unlockAt ||
            null,
        }))
      );
    } catch {
      // keep previous signals
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    const id = setInterval(
      load,
      POLL_MS
    );

    return () => clearInterval(id);
  }, [load]);

  return {
    signals,
    loading,
  };
}
function LoginView({ onLogin, onGuest }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requestOtp = async (e) => {
    e.preventDefault();

    setError("");

    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError(
        "Please enter a valid email address."
      );
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/auth/request-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: cleanEmail,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.message ||
            "Unable to send OTP."
        );
      }

      setStep("otp");
    } catch (err) {
      setError(
        err?.message ||
          "Unable to send OTP."
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();

    setError("");

    if (!otp.trim()) {
      setError("Enter the OTP.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/auth/verify-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            otp: otp.trim(),
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.message ||
            "Invalid OTP."
        );
      }

      const auth = {
        token:
          data?.token ||
          data?.accessToken ||
          "",
        userId:
          data?.userId ||
          data?.user?.id ||
          "",
        email:
          data?.email ||
          email.trim().toLowerCase(),
      };

      if (!auth.token || !auth.userId) {
        throw new Error(
          "Authentication response is incomplete."
        );
      }

      saveStoredAuth(auth);

      onLogin({
        ...auth,
        user:
          data?.user ||
          null,
      });
    } catch (err) {
      setError(
        err?.message ||
          "OTP verification failed."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-glow" />

      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark large">
            <Zap size={20} />
          </div>

          <div className="brand-name">
            CandleVolt
          </div>
        </div>

        <div className="auth-eyebrow">
          MARKET INTELLIGENCE
        </div>

        <h1>
          {step === "email"
            ? "Welcome back"
            : "Verify your email"}
        </h1>

        <p className="auth-sub">
          {step === "email"
            ? "Sign in to access your trading dashboard."
            : `Enter the OTP sent to ${email}.`}
        </p>

        {step === "email" ? (
          <form
            className="auth-form"
            onSubmit={requestOtp}
          >
            <label>
              Email address
            </label>

            <input
              type="email"
              value={email}
              placeholder="you@example.com"
              onChange={(e) =>
                setEmail(e.target.value)
              }
              autoComplete="email"
            />

            {error && (
              <div className="auth-error">
                {error}
              </div>
            )}

            <button
              className="gold-btn auth-submit"
              disabled={loading}
              type="submit"
            >
              {loading
                ? "Sending…"
                : "Continue"}
              <ChevronRight size={15} />
            </button>
          </form>
        ) : (
          <form
            className="auth-form"
            onSubmit={verifyOtp}
          >
            <label>
              One-time password
            </label>

            <input
              type="text"
              value={otp}
              placeholder="Enter OTP"
              inputMode="numeric"
              maxLength={8}
              onChange={(e) =>
                setOtp(
                  e.target.value.replace(
                    /\D/g,
                    ""
                  )
                )
              }
              autoComplete="one-time-code"
            />

            {error && (
              <div className="auth-error">
                {error}
              </div>
            )}

            <button
              className="gold-btn auth-submit"
              disabled={loading}
              type="submit"
            >
              {loading
                ? "Verifying…"
                : "Verify & Sign In"}
              <Check size={15} />
            </button>

            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError("");
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        <div className="auth-divider">
          <span />
          OR
          <span />
        </div>

        <button
          className="guest-btn"
          onClick={onGuest}
        >
          Continue as Guest
        </button>

        <div className="auth-note">
          By continuing, you agree to use
          CandleVolt for informational and
          market-analysis purposes.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account / profile
// ---------------------------------------------------------------------------

function AccountView({
  user,
  plan,
  onLogout,
  onUpgrade,
}) {
  const [profile, setProfile] =
    useState({
      name:
        user?.name ||
        user?.username ||
        "",
      username:
        user?.username || "",
      country:
        user?.country || "",
      bio:
        user?.bio || "",
    });

  const [saving, setSaving] =
    useState(false);

  const [saved, setSaved] =
    useState(false);

  useEffect(() => {
    setProfile({
      name:
        user?.name ||
        user?.username ||
        "",
      username:
        user?.username || "",
      country:
        user?.country || "",
      bio:
        user?.bio || "",
    });
  }, [user]);

  const updateField = (
    field,
    value
  ) => {
    setProfile((prev) => ({
      ...prev,
      [field]: value,
    }));

    setSaved(false);
  };

  const saveProfile = async () => {
    const auth = loadStoredAuth();

    if (!auth?.token) return;

    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify(profile),
        }
      );

      if (!res.ok) {
        throw new Error(
          "Profile update failed."
        );
      }

      setSaved(true);
    } catch {
      // keep local form state
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view-wrap">
      <div className="view-head">
        <div>
          <div className="eyebrow">
            YOUR ACCOUNT
          </div>

          <h2>Account</h2>

          <p className="view-sub">
            Manage your profile and
            subscription.
          </p>
        </div>
      </div>

      <div className="account-grid">
        <div className="panel profile-panel">
          <div className="profile-head">
            <div className="avatar">
              {(
                profile.name ||
                profile.username ||
                "C"
              )
                .charAt(0)
                .toUpperCase()}
            </div>

            <div>
              <div className="profile-name">
                {profile.name ||
                  profile.username ||
                  "CandleVolt User"}
              </div>

              <div className="profile-email">
                {user?.email || "Guest"}
              </div>
            </div>
          </div>

          <div className="profile-form">
            <div className="form-field">
              <label>
                Name
              </label>

              <input
                value={profile.name}
                onChange={(e) =>
                  updateField(
                    "name",
                    e.target.value
                  )
                }
                placeholder="Your name"
              />
            </div>

            <div className="form-field">
              <label>
                Username
              </label>

              <input
                value={profile.username}
                onChange={(e) =>
                  updateField(
                    "username",
                    e.target.value
                  )
                }
                placeholder="Username"
              />
            </div>

            <div className="form-field">
              <label>
                Country
              </label>

              <input
                value={profile.country}
                onChange={(e) =>
                  updateField(
                    "country",
                    e.target.value
                  )
                }
                placeholder="Country"
              />
            </div>

            <div className="form-field">
              <label>
                Bio
              </label>

              <textarea
                value={profile.bio}
                onChange={(e) =>
                  updateField(
                    "bio",
                    e.target.value
                  )
                }
                placeholder="Tell us about yourself"
                rows={4}
              />
            </div>

            <div className="profile-actions">
              <button
                className="gold-btn"
                onClick={saveProfile}
                disabled={saving}
              >
                {saving
                  ? "Saving…"
                  : saved
                  ? "Saved"
                  : "Save Profile"}

                {saved ? (
                  <Check size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="account-side">
          <div className="panel plan-panel">
            <div className="plan-head">
              <div>
                <div className="eyebrow">
                  CURRENT PLAN
                </div>

                <div className="plan-name">
                  {String(plan)
                    .charAt(0)
                    .toUpperCase() +
                    String(plan).slice(1)}
                </div>
              </div>

              <div className="plan-icon">
                <Crown size={18} />
              </div>
            </div>

            <div className="plan-status">
              {plan === "free"
                ? "Free access"
                : "Premium access enabled"}
            </div>

            {plan === "free" && (
              <button
                className="gold-btn"
                onClick={onUpgrade}
              >
                Upgrade
                <ChevronRight size={14} />
              </button>
            )}
          </div>

          <div className="panel security-panel">
            <div className="panel-title">
              <ShieldCheck
                size={14}
              />
              Account Security
            </div>

            <div className="security-row">
              <span>
                Email verification
              </span>

              <span className="security-good">
                Verified
              </span>
            </div>

            <div className="security-row">
              <span>
                Authentication
              </span>

              <span>
                OTP
              </span>
            </div>
          </div>

          <button
            className="logout-btn"
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
  }
function PlansModal({
  currentPlan,
  onClose,
  onSelectPlan,
}) {
  const plans = [
    {
      key: "free",
      name: "Free",
      price: "₹0",
      period: "/month",
      description:
        "Get started with essential market signals.",
      features: [
        "3 signals per day",
        "2–3 minute signal delay",
        "Crypto markets",
      ],
    },
    {
      key: "pro",
      name: "Pro",
      price: "₹999",
      period: "/month",
      description:
        "For active traders who need real-time signals.",
      features: [
        "Unlimited signals",
        "Real-time signal delivery",
        "Crypto + Forex + Commodities",
        "Entry / Target / Stop levels",
      ],
    },
    {
      key: "elite",
      name: "Elite",
      price: "₹2,499",
      period: "/month",
      description:
        "Maximum access and advanced signal intelligence.",
      features: [
        "Everything in Pro",
        "Memecoin signals",
        "Confidence scoring",
        "Priority signal queue",
      ],
    },
  ];

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        className="plans-modal"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <button
          className="modal-close"
          onClick={onClose}
        >
          <X size={17} />
        </button>

        <div className="plans-heading">
          <div className="eyebrow">
            CANDLEVOLT ACCESS
          </div>

          <h2>Choose your plan</h2>

          <p>
            Upgrade your market intelligence
            access whenever you're ready.
          </p>
        </div>

        <div className="plans-grid">
          {plans.map((plan) => {
            const isCurrent =
              currentPlan === plan.key;

            return (
              <div
                key={plan.key}
                className={`plan-card ${
                  plan.key === "pro"
                    ? "featured"
                    : ""
                } ${
                  isCurrent
                    ? "current"
                    : ""
                }`}
              >
                {plan.key === "pro" && (
                  <div className="popular-badge">
                    MOST POPULAR
                  </div>
                )}

                <div className="plan-card-head">
                  <div className="plan-card-name">
                    {plan.name}
                  </div>

                  {plan.key !== "free" && (
                    <Crown size={16} />
                  )}
                </div>

                <div className="plan-price">
                  {plan.price}
                  <span>
                    {plan.period}
                  </span>
                </div>

                <div className="plan-description">
                  {plan.description}
                </div>

                <div className="plan-features">
                  {plan.features.map(
                    (feature) => (
                      <div
                        className="plan-feature"
                        key={feature}
                      >
                        <Check size={13} />
                        <span>
                          {feature}
                        </span>
                      </div>
                    )
                  )}
                </div>

                <button
                  className={
                    isCurrent
                      ? "plan-current-btn"
                      : "gold-btn plan-select-btn"
                  }
                  disabled={isCurrent}
                  onClick={() =>
                    onSelectPlan(
                      plan.key
                    )
                  }
                >
                  {isCurrent
                    ? "Current Plan"
                    : plan.key === "free"
                    ? "Continue Free"
                    : `Choose ${plan.name}`}

                  {!isCurrent &&
                    plan.key !== "free" && (
                      <ChevronRight
                        size={14}
                      />
                    )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="plans-note">
          Payments are processed through the
          available payment methods. Subscription
          activation is confirmed by the backend.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payment modal
// ---------------------------------------------------------------------------

function PaymentModal({
  plan,
  onClose,
  onSuccess,
}) {
  const [method, setMethod] =
    useState("razorpay");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [cryptoOrder, setCryptoOrder] =
    useState(null);

  const prices = {
    pro: 999,
    elite: 2499,
  };

  const amount =
    prices[plan] || 999;

  const createRazorpayOrder =
    async () => {
      setError("");
      setLoading(true);

      try {
        const auth =
          loadStoredAuth();

        if (!auth?.token) {
          throw new Error(
            "Please sign in before purchasing a plan."
          );
        }

        const res = await fetch(
          `${BACKEND_URL}/api/payments/razorpay/order`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({
              plan,
            }),
          }
        );

        const data =
          await res.json();

        if (!res.ok) {
          throw new Error(
            data?.message ||
              "Unable to create payment order."
          );
        }

        if (
          typeof window ===
            "undefined" ||
          !window.Razorpay
        ) {
          throw new Error(
            "Razorpay checkout is not loaded."
          );
        }

        const options = {
          key:
            data.key ||
            data.keyId,

          amount:
            data.amount ||
            amount * 100,

          currency:
            data.currency || "INR",

          name: "CandleVolt",

          description:
            `${plan.toUpperCase()} subscription`,

          order_id:
            data.orderId ||
            data.id,

          handler: async (
            response
          ) => {
            try {
              const verify =
                await fetch(
                  `${BACKEND_URL}/api/payments/razorpay/verify`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type":
                        "application/json",
                      Authorization: `Bearer ${auth.token}`,
                    },
                    body: JSON.stringify({
                      plan,
                      ...response,
                    }),
                  }
                );

              const verifyData =
                await verify.json();

              if (!verify.ok) {
                throw new Error(
                  verifyData?.message ||
                    "Payment verification failed."
                );
              }

              onSuccess(
                plan,
                verifyData
              );
            } catch (err) {
              setError(
                err?.message ||
                  "Unable to verify payment."
              );
            }
          },

          prefill: {
            email:
              auth.email || "",
          },

          theme: {
            color: "#E3A64B",
          },

          modal: {
            ondismiss: () => {
              setLoading(false);
            },
          },
        };

        const razorpay =
          new window.Razorpay(
            options
          );

        razorpay.on(
          "payment.failed",
          (response) => {
            setError(
              response?.error
                ?.description ||
                "Payment failed."
            );

            setLoading(false);
          }
        );

        razorpay.open();
      } catch (err) {
        setError(
          err?.message ||
            "Unable to start payment."
        );
      } finally {
        setLoading(false);
      }
    };

  const createCryptoOrder =
    async () => {
      setError("");
      setLoading(true);

      try {
        const auth =
          loadStoredAuth();

        if (!auth?.token) {
          throw new Error(
            "Please sign in before purchasing a plan."
          );
        }

        const res = await fetch(
          `${BACKEND_URL}/api/payments/crypto/order`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({
              plan,
              currency: "USDT",
              network: "TRC20",
            }),
          }
        );

        const data =
          await res.json();

        if (!res.ok) {
          throw new Error(
            data?.message ||
              "Unable to create crypto order."
          );
        }

        setCryptoOrder(data);
      } catch (err) {
        setError(
          err?.message ||
            "Unable to create crypto payment."
        );
      } finally {
        setLoading(false);
      }
    };

  const startPayment = () => {
    if (method === "razorpay") {
      createRazorpayOrder();
    } else {
      createCryptoOrder();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        className="payment-modal"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <button
          className="modal-close"
          onClick={onClose}
        >
          <X size={17} />
        </button>

        {!cryptoOrder ? (
          <>
            <div className="payment-heading">
              <div className="eyebrow">
                CHECKOUT
              </div>

              <h2>
                {plan === "elite"
                  ? "Elite"
                  : "Pro"}{" "}
                subscription
              </h2>

              <div className="checkout-price">
                ₹{amount}
                <span>/month</span>
              </div>
            </div>

            <div className="payment-methods">
              <button
                className={`payment-method ${
                  method === "razorpay"
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setMethod(
                    "razorpay"
                  )
                }
              >
                <CreditCard
                  size={17}
                />

                <div>
                  <div>
                    Card / UPI / Netbanking
                  </div>

                  <small>
                    Pay securely with Razorpay
                  </small>
                </div>

                {method ===
                  "razorpay" && (
                  <Check size={14} />
                )}
              </button>

              <button
                className={`payment-method ${
                  method === "crypto"
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setMethod("crypto")
                }
              >
                <Wallet size={17} />

                <div>
                  <div>
                    USDT
                  </div>

                  <small>
                    USDT-TRC20 only
                  </small>
                </div>

                {method ===
                  "crypto" && (
                  <Check size={14} />
                )}
              </button>
            </div>

            {error && (
              <div className="payment-error">
                {error}
              </div>
            )}

            <button
              className="gold-btn payment-submit"
              disabled={loading}
              onClick={startPayment}
            >
              {loading
                ? "Preparing payment…"
                : `Pay ₹${amount}`}

              <ChevronRight
                size={14}
              />
            </button>

            <div className="payment-secure">
              <ShieldCheck size={13} />

              Secure payment processing
            </div>
          </>
        ) : (
          <CryptoPayment
            order={cryptoOrder}
            onClose={onClose}
            onSuccess={onSuccess}
            plan={plan}
          />
        )}
      </div>
    </div>
  );
                  }
function CryptoPayment({
  order,
  onClose,
  onSuccess,
  plan,
}) {
  const [copied, setCopied] =
    useState(false);

  const [status, setStatus] =
    useState("pending");

  const [error, setError] =
    useState("");

  const address =
    order?.address ||
    order?.walletAddress ||
    "";

  const amount =
    order?.amount ||
    order?.cryptoAmount ||
    "";

  const currency =
    order?.currency ||
    "USDT";

  const network =
    order?.network ||
    "TRC20";

  const orderId =
    order?.orderId ||
    order?.id ||
    "";

  const copyAddress = async () => {
    if (!address) return;

    try {
      await navigator.clipboard.writeText(
        address
      );

      setCopied(true);

      setTimeout(
        () => setCopied(false),
        1800
      );
    } catch {
      // clipboard unavailable
    }
  };

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    const checkStatus = async () => {
      try {
        const auth =
          loadStoredAuth();

        if (!auth?.token) return;

        const res = await fetch(
          `${BACKEND_URL}/api/payments/crypto/status/${encodeURIComponent(
            orderId
          )}`,
          {
            headers: {
              Authorization: `Bearer ${auth.token}`,
            },
          }
        );

        if (!res.ok) return;

        const data =
          await res.json();

        if (cancelled) return;

        const nextStatus = String(
          data?.status ||
            data?.paymentStatus ||
            "pending"
        ).toLowerCase();

        setStatus(nextStatus);

        if (
          nextStatus === "paid" ||
          nextStatus === "confirmed" ||
          nextStatus === "success" ||
          nextStatus === "completed"
        ) {
          onSuccess(
            plan,
            data
          );
        }
      } catch {
        // keep polling
      }
    };

    checkStatus();

    const id = setInterval(
      checkStatus,
      5000
    );

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [orderId, plan, onSuccess]);

  return (
    <div className="crypto-payment">
      <div className="payment-heading">
        <div className="eyebrow">
          CRYPTO CHECKOUT
        </div>

        <h2>
          Pay with {currency}
        </h2>

        <p>
          Send the exact amount to the
          wallet below using the specified
          network.
        </p>
      </div>

      <div className="crypto-network">
        <span>Network</span>

        <strong>
          {network}
        </strong>
      </div>

      <div className="crypto-amount">
        <div className="crypto-amount-label">
          Amount to send
        </div>

        <div className="crypto-amount-value">
          {amount} {currency}
        </div>
      </div>

      {order?.qrCode ||
      order?.qr ||
      order?.qrCodeUrl ? (
        <div className="qr-wrap">
          <img
            src={
              order.qrCode ||
              order.qr ||
              order.qrCodeUrl
            }
            alt="Crypto payment QR code"
          />
        </div>
      ) : (
        <div className="qr-placeholder">
          <QrCode size={34} />

          <span>
            QR code unavailable
          </span>
        </div>
      )}

      <div className="wallet-label">
        Wallet address
      </div>

      <div className="wallet-box">
        <span>
          {address || "Wallet address unavailable"}
        </span>

        <button
          onClick={copyAddress}
          disabled={!address}
          title="Copy wallet address"
        >
          {copied ? (
            <Check size={15} />
          ) : (
            <Copy size={15} />
          )}
        </button>
      </div>

      {error && (
        <div className="payment-error">
          {error}
        </div>
      )}

      <div
        className={`crypto-status ${
          status
        }`}
      >
        {status === "paid" ||
        status === "confirmed" ||
        status === "success" ||
        status === "completed" ? (
          <>
            <Check size={15} />
            Payment confirmed
          </>
        ) : (
          <>
            <Radio size={15} />
            Waiting for payment confirmation…
          </>
        )}
      </div>

      <div className="crypto-warning">
        <ShieldCheck size={13} />

        Send only {currency} on the{" "}
        {network} network. Sending assets
        through another network may result in
        permanent loss.
      </div>

      <button
        className="guest-btn"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

function AppShell({
  user,
  plan,
  onLogout,
  onUpgrade,
}) {
  const [activeView, setActiveView] =
    useState("dashboard");

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [market, setMarket] =
    useState("crypto");

  const [selectedAsset, setSelectedAsset] =
    useState(
      ASSETS.crypto?.[0]?.symbol ||
        ""
    );

  const {
    marketData,
    backendOnline,
    lastUpdate,
  } = useMarketData();

  const {
    signals,
  } = useSignals();

  const tickerData =
    buildTickerData(marketData);

  const handleView = (view) => {
    setActiveView(view);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="menu-btn"
            onClick={() =>
              setMenuOpen(true)
            }
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <button
            className="top-brand"
            onClick={() =>
              handleView(
                "dashboard"
              )
            }
          >
            <span className="brand-mark">
              <Zap size={15} />
            </span>

            <span>
              CandleVolt
            </span>
          </button>
        </div>

        <div className="topbar-right">
          <div className="connection-status">
            <span
              className={
                backendOnline
                  ? "status-dot online"
                  : "status-dot offline"
              }
            />

            {backendOnline
              ? "LIVE"
              : "OFFLINE"}
          </div>

          {lastUpdate && (
            <div className="last-update">
              {timeAgo(lastUpdate)}
            </div>
          )}

          <button
            className="top-account"
            onClick={() =>
              handleView(
                "account"
              )
            }
          >
            <UserCircle size={18} />

            <span className="top-plan">
              {String(plan)
                .toUpperCase()}
            </span>
          </button>
        </div>
      </header>

      <SideMenu
        open={menuOpen}
        activeView={activeView}
        onSelect={handleView}
        onClose={() =>
          setMenuOpen(false)
        }
      />

      <main className="main-content">
        {activeView ===
          "dashboard" && (
          <DashboardView
            market={market}
            setMarket={setMarket}
            tickerData={tickerData}
            signals={signals}
            plan={plan}
            onUpgrade={onUpgrade}
          />
        )}

        {activeView === "chart" && (
          <ChartView
            market={market}
            selectedAsset={
              selectedAsset
            }
            onAssetChange={
              setSelectedAsset
            }
          />
        )}

        {activeView === "news" && (
          <div className="view-wrap">
            <div className="view-head">
              <div>
                <div className="eyebrow">
                  LIVE HEADLINES
                </div>

                <h2>
                  Market News
                </h2>

                <p className="view-sub">
                  Latest headlines across
                  the markets.
                </p>
              </div>
            </div>

            <NewsPanel
              market={market}
            />
          </div>
        )}

        {activeView ===
          "calendar" && (
          <CalendarView />
        )}

        {activeView ===
          "analysis" && (
          <AnalysisView />
        )}

        {activeView ===
          "account" && (
          <AccountView
            user={user}
            plan={plan}
            onLogout={onLogout}
            onUpgrade={onUpgrade}
          />
        )}
      </main>
    </div>
  );
            }
function App() {
  const [auth, setAuth] =
    useState(() => loadStoredAuth());

  const [user, setUser] =
    useState(null);

  const [plan, setPlan] =
    useState("free");

  const [showPlans, setShowPlans] =
    useState(false);

  const [paymentPlan, setPaymentPlan] =
    useState(null);

  const [loadingUser, setLoadingUser] =
    useState(Boolean(auth));

  // ---------------------------------------------------------
  // Load the authenticated user's profile
  // ---------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      if (!auth?.token) {
        setLoadingUser(false);
        return;
      }

      try {
        const res = await fetch(
          `${BACKEND_URL}/api/me`,
          {
            headers: {
              Authorization: `Bearer ${auth.token}`,
            },
          }
        );

        if (!res.ok) {
          throw new Error(
            "Authentication expired."
          );
        }

        const data =
          await res.json();

        if (cancelled) return;

        const nextUser =
          data?.user ||
          data;

        setUser(nextUser);

        const nextPlan =
          nextUser?.plan ||
          data?.plan ||
          "free";

        setPlan(
          String(nextPlan).toLowerCase()
        );
      } catch {
        if (cancelled) return;

        clearStoredAuth();
        setAuth(null);
        setUser(null);
        setPlan("free");
      } finally {
        if (!cancelled) {
          setLoadingUser(false);
        }
      }
    };

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [auth]);

  // ---------------------------------------------------------
  // Login
  // ---------------------------------------------------------

  const handleLogin = useCallback(
    (nextAuth) => {
      saveStoredAuth(nextAuth);

      setAuth({
        token: nextAuth.token,
        userId: nextAuth.userId,
        email: nextAuth.email,
      });

      setUser(
        nextAuth.user ||
          {
            id: nextAuth.userId,
            email: nextAuth.email,
          }
      );

      setPlan(
        String(
          nextAuth?.user?.plan ||
            "free"
        ).toLowerCase()
      );
    },
    []
  );

  // ---------------------------------------------------------
  // Logout
  // ---------------------------------------------------------

  const handleLogout = useCallback(() => {
    clearStoredAuth();

    setAuth(null);
    setUser(null);
    setPlan("free");
    setShowPlans(false);
    setPaymentPlan(null);
  }, []);

  // ---------------------------------------------------------
  // Open subscription plans
  // ---------------------------------------------------------

  const handleUpgrade = useCallback(() => {
    setShowPlans(true);
  }, []);

  // ---------------------------------------------------------
  // Select subscription plan
  // ---------------------------------------------------------

  const handleSelectPlan =
    useCallback(
      (selectedPlan) => {
        if (
          selectedPlan ===
          "free"
        ) {
          setShowPlans(false);
          return;
        }

        if (!auth?.token) {
          setShowPlans(false);
          return;
        }

        setShowPlans(false);
        setPaymentPlan(
          selectedPlan
        );
      },
      [auth]
    );

  // ---------------------------------------------------------
  // Payment success
  // ---------------------------------------------------------

  const handlePaymentSuccess =
    useCallback(
      async (
        purchasedPlan,
        paymentData
      ) => {
        setPaymentPlan(null);

        setPlan(
          String(
            purchasedPlan
          ).toLowerCase()
        );

        try {
          const stored =
            loadStoredAuth();

          if (!stored?.token) {
            return;
          }

          const res = await fetch(
            `${BACKEND_URL}/api/me`,
            {
              headers: {
                Authorization: `Bearer ${stored.token}`,
              },
            }
          );

          if (!res.ok) return;

          const data =
            await res.json();

          const nextUser =
            data?.user ||
            data;

          if (nextUser) {
            setUser(nextUser);

            setPlan(
              String(
                nextUser.plan ||
                  purchasedPlan
              ).toLowerCase()
            );
          }
        } catch {
          // Payment was already confirmed.
          // Keep the selected plan locally.
        }
      },
      []
    );

  // ---------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------

  if (loadingUser) {
    return (
      <div className="boot-screen">
        <div className="boot-brand">
          <div className="brand-mark large">
            <Zap size={20} />
          </div>

          <div>
            <div className="boot-title">
              CandleVolt
            </div>

            <div className="boot-sub">
              Loading market terminal…
            </div>
          </div>
        </div>

        <div className="boot-loader">
          <span />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // Authentication gate
  // ---------------------------------------------------------

  if (!auth?.token) {
    return (
      <LoginView
        onLogin={handleLogin}
        onGuest={() => {
          setAuth({
            token: "guest",
            userId: "guest",
            email: "",
          });

          setUser({
            id: "guest",
            email: "",
            name: "Guest",
            plan: "free",
          });

          setPlan("free");
        }}
      />
    );
  }

  // ---------------------------------------------------------
  // Main application
  // ---------------------------------------------------------

  return (
    <>
      <AppShell
        user={user}
        plan={plan}
        onLogout={handleLogout}
        onUpgrade={handleUpgrade}
      />

      {showPlans && (
        <PlansModal
          currentPlan={plan}
          onClose={() =>
            setShowPlans(false)
          }
          onSelectPlan={
            handleSelectPlan
          }
        />
      )}

      {paymentPlan && (
        <PaymentModal
          plan={paymentPlan}
          onClose={() =>
            setPaymentPlan(null)
          }
          onSuccess={
            handlePaymentSuccess
          }
        />
      )}
    </>
  );
}

export default App;
/* CandleVolt.css */

:root {
  --bg-void: #0a0d12;
  --bg-panel: #12161f;
  --bg-raised: #1a2030;
  --line: #232a3b;

  --gold: #e3a64b;
  --rose: #e2555a;

  --text-hi: #edeff3;
  --text-mid: #9aa3b5;
  --text-lo: #5c6478;

  --radius: 10px;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
  width: 100%;
}

body {
  background: var(--bg-void);
  color: var(--text-hi);
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

a {
  color: inherit;
  text-decoration: none;
}

/* ---------------------------------------------------------
   Generic
--------------------------------------------------------- */

.panel {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.view-wrap {
  width: 100%;
  max-width: 1500px;
  margin: 0 auto;
  padding: 28px;
}

.view-head,
.dashboard-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  margin-bottom: 24px;
}

.eyebrow,
.section-kicker,
.analysis-label {
  color: var(--text-lo);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

.view-head h2,
.dashboard-top h2 {
  margin: 5px 0 6px;
  font-size: 26px;
  letter-spacing: -0.03em;
}

.view-sub {
  margin: 0;
  color: var(--text-mid);
  font-size: 13px;
}

/* ---------------------------------------------------------
   Brand
--------------------------------------------------------- */

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(227, 166, 75, 0.35);
  border-radius: 8px;
  color: var(--gold);
  background: rgba(227, 166, 75, 0.08);
}

.brand-mark.large {
  width: 42px;
  height: 42px;
}

.brand-name {
  font-size: 18px;
  font-weight: 700;
}

/* ---------------------------------------------------------
   Topbar
--------------------------------------------------------- */

.app-shell {
  min-height: 100vh;
  background: var(--bg-void);
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 50;

  display: flex;
  align-items: center;
  justify-content: space-between;

  height: 58px;
  padding: 0 20px;

  background: rgba(10, 13, 18, 0.96);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(12px);
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.top-brand,
.top-account,
.menu-btn {
  border: 0;
  background: transparent;
  color: var(--text-hi);
}

.top-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 700;
}

.menu-btn {
  display: inline-flex;
  padding: 7px;
  color: var(--text-mid);
}

.menu-btn:hover,
.top-account:hover {
  color: var(--text-hi);
}

.top-account {
  display: flex;
  align-items: center;
  gap: 7px;
}

.top-plan {
  color: var(--gold);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-mid);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.status-dot,
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot.online,
.live-dot {
  background: var(--gold);
  box-shadow: 0 0 10px rgba(227, 166, 75, 0.55);
}

.status-dot.offline {
  background: var(--rose);
}

.last-update {
  color: var(--text-lo);
  font-size: 10px;
}

/* ---------------------------------------------------------
   Side menu
--------------------------------------------------------- */

.menu-scrim {
  position: fixed;
  inset: 0;
  z-index: 80;

  background: rgba(0, 0, 0, 0.45);

  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.menu-scrim-open {
  opacity: 1;
  pointer-events: auto;
}

.side-menu {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 90;

  width: 250px;
  padding: 20px;

  background: #0f131b;
  border-right: 1px solid var(--line);

  transform: translateX(-100%);
  transition: transform 0.22s ease;
}

.side-menu-open {
  transform: translateX(0);
}

.side-menu-head {
  display: flex;
  align-items: center;
  gap: 10px;

  padding-bottom: 24px;

  font-size: 17px;
  font-weight: 700;
}

.side-menu-items {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.side-menu-item {
  display: flex;
  align-items: center;
  gap: 11px;

  width: 100%;
  padding: 11px 12px;

  border: 1px solid transparent;
  border-radius: 7px;

  background: transparent;
  color: var(--text-mid);

  text-align: left;
  font-size: 12px;
}

.side-menu-item:hover,
.side-menu-item.active {
  background: var(--bg-raised);
  border-color: var(--line);
  color: var(--text-hi);
}

.side-menu-item.active {
  color: var(--gold);
}

/* ---------------------------------------------------------
   Ticker
--------------------------------------------------------- */

.ticker-wrap {
  overflow: hidden;
  width: 100%;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: #0d1017;
}

.ticker-track {
  display: flex;
  width: max-content;
  animation: tickerMove 42s linear infinite;
}

.ticker-item {
  display: flex;
  gap: 8px;
  padding: 10px 24px;

  border-right: 1px solid var(--line);

  font-family:
    "IBM Plex Mono",
    "Courier New",
    monospace;

  font-size: 10px;
}

.ticker-sym {
  color: var(--text-mid);
}

.ticker-up {
  color: var(--gold);
}

.ticker-down {
  color: var(--rose);
}

@keyframes tickerMove {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(-50%);
  }
}

/* ---------------------------------------------------------
   Market tabs
--------------------------------------------------------- */

.market-tabs,
.impact-tabs {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.market-tab,
.impact-btn,
.tf-btn {
  border: 1px solid var(--line);
  border-radius: 6px;

  background: var(--bg-panel);
  color: var(--text-mid);

  padding: 7px 10px;
  font-size: 10px;
}

.market-tab:hover,
.market-tab.active,
.impact-btn:hover,
.impact-btn.active,
.tf-btn:hover,
.tf-btn.active {
  color: var(--gold);
  border-color: rgba(227, 166, 75, 0.35);
  background: rgba(227, 166, 75, 0.06);
}

/* ---------------------------------------------------------
   Dashboard
--------------------------------------------------------- */

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 20px;
}

.dashboard-main {
  min-width: 0;
}

.dashboard-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin: 24px 0 12px;
}

.section-head h3 {
  margin: 4px 0 0;
  font-size: 16px;
}

.live-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--gold);
  font-size: 9px;
  font-weight: 700;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.asset-card {
  min-width: 0;
  padding: 14px;

  border: 1px solid var(--line);
  border-radius: 9px;

  background: var(--bg-panel);
  color: var(--text-hi);

  text-align: left;
}

.asset-card:hover,
.asset-card.selected {
  border-color: rgba(227, 166, 75, 0.4);
  background: #151a24;
}

.asset-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.asset-symbol {
  overflow: hidden;
  color: var(--text-mid);
  font-size: 10px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-price {
  margin: 8px 0 4px;

  font-family:
    "IBM Plex Mono",
    "Courier New",
    monospace;

  font-size: 17px;
  font-weight: 600;
}

.pct-up,
.sig-val-up {
  color: var(--gold);
}

.pct-down,
.sig-val-down {
  color: var(--rose);
}

/* ---------------------------------------------------------
   Signals
--------------------------------------------------------- */

.signals-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.sig-card {
  position: relative;
  min-width: 0;

  padding: 14px;

  border: 1px solid var(--line);
  border-radius: 9px;

  background: var(--bg-panel);
}

.sig-buy {
  border-left: 2px solid var(--gold);
}

.sig-sell {
  border-left: 2px solid var(--rose);
}

.sig-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.sig-dir {
  display: flex;
  align-items: center;
  gap: 6px;

  font-size: 11px;
  font-weight: 800;
}

.sig-buy .sig-dir {
  color: var(--gold);
}

.sig-sell .sig-dir {
  color: var(--rose);
}

.sig-market {
  color: var(--text-lo);
  font-size: 8px;
  letter-spacing: 0.08em;
}

.sig-symbol {
  margin: 13px 0;

  font-family:
    "IBM Plex Mono",
    "Courier New",
    monospace;

  font-size: 14px;
  font-weight: 700;
}

.sig-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.sig-label {
  margin-bottom: 4px;
  color: var(--text-lo);
  font-size: 8px;
  text-transform: uppercase;
}

.sig-val {
  font-family:
    "IBM Plex Mono",
    "Courier New",
    monospace;
  font-size: 11px;
}

.sig-conf-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.sig-conf-track {
  flex: 1;
  height: 3px;
  overflow: hidden;
  border-radius: 3px;
  background: #252b38;
}

.sig-conf-fill {
  height: 100%;
}

.sig-conf-num {
  color: var(--text-mid);
  font-size: 9px;
}

.sig-foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;

  margin-top: 12px;

  color: var(--text-lo);
  font-size: 8px;
}

.sig-time {
  white-space: nowrap;
}

.sig-locked {
  overflow: hidden;
}

.blurred {
  filter: blur(4px);
  user-select: none;
}

.lock-overlay {
  position: absolute;
  inset: 0;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;

  background: rgba(10, 13, 18, 0.72);

  color: var(--gold);
  font-size: 10px;
  font-weight: 700;
}

.lock-sub {
  color: var(--text-mid);
  font-size: 8px;
  font-weight: 400;
}

.empty-signals {
  grid-column: 1 / -1;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;

  padding: 30px;

  color: var(--text-mid);
  font-size: 11px;
}

/* ---------------------------------------------------------
   News
--------------------------------------------------------- */

.panel-title {
  display: flex;
  align-items: center;
  gap: 5px;

  padding: 14px;

  border-bottom: 1px solid var(--line);

  color: var(--text-hi);
  font-size: 11px;
  font-weight: 700;
}

.news-feed {
  max-height: 500px;
  overflow-y: auto;
}

.news-item {
  display: block;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(35, 42, 59, 0.65);
}

.news-item:hover {
  background: var(--bg-raised);
}

.news-title {
  color: var(--text-hi);
  font-size: 11px;
  line-height: 1.45;
}

.news-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 7px;

  color: var(--text-lo);
  font-size: 8px;
}

.news-source {
  color: var(--gold);
}

.empty-state {
  padding: 25px;
  color: var(--text-lo);
  font-size: 11px;
  text-align: center;
}

/* ---------------------------------------------------------
   Upgrade
--------------------------------------------------------- */

.upgrade-panel {
  padding: 18px;
}

.upgrade-icon {
  display: flex;
  align-items: center;
  justify-content: center;

  width: 34px;
  height: 34px;
  margin-bottom: 12px;

  border-radius: 8px;
  background: rgba(227, 166, 75, 0.08);
  color: var(--gold);
}

.upgrade-title {
  font-size: 14px;
  font-weight: 700;
}

.upgrade-text {
  margin: 7px 0 15px;

  color: var(--text-mid);
  font-size: 10px;
  line-height: 1.55;
}

.gold-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;

  border: 1px solid rgba(227, 166, 75, 0.5);
  border-radius: 6px;

  padding: 9px 13px;

  background: var(--gold);
  color: #111;

  font-size: 10px;
  font-weight: 800;
}

.gold-btn:hover {
  filter: brightness(1.08);
}

/* ---------------------------------------------------------
   Chart
--------------------------------------------------------- */

.chart-panel {
  overflow: hidden;
}

.chart-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;

  padding: 12px 14px;

  border-bottom: 1px solid var(--line);
}

.chart-symbol {
  display: flex;
  align-items: center;
  gap: 7px;

  color: var(--text-hi);
  font-family:
    "IBM Plex Mono",
    "Courier New",
    monospace;

  font-size: 11px;
  font-weight: 700;
}

.tf-bar {
  display: flex;
  gap: 4px;
}

.candle-chart-box {
  width: 100%;
}

.asset-select {
  min-width: 130px;

  border: 1px solid var(--line);
  border-radius: 6px;

  padding: 8px 10px;

  background: var(--bg-panel);
  color: var(--text-hi);

  font-size: 10px;
}

/* ---------------------------------------------------------
   Calendar
--------------------------------------------------------- */

.calendar-panel {
  overflow: hidden;
}

.calendar-head,
.calendar-row {
  display: grid;
  grid-template-columns:
    minmax(180px, 2fr)
    minmax(130px, 1fr)
    90px
    100px
    100px
    100px;

  align-items: center;
  gap: 10px;
}

.calendar-head {
  padding: 11px 14px;

  border-bottom: 1px solid var(--line);

  color: var(--text-lo);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.calendar-row {
  min-height: 65px;
  padding: 10px 14px;

  border-bottom: 1px solid rgba(35, 42, 59, 0.65);
}

.calendar-event {
  min-width: 0;
}

.calendar-country {
  margin-bottom: 3px;
  color: var(--gold);
  font-size: 8px;
  font-weight: 700;
}

.calendar-title {
  overflow: hidden;
  color: var(--text-hi);
  font-size: 10px;
  text-overflow: ellipsis;
}

.calendar-time,
.calendar-value {
  color: var(--text-mid);
  font-size: 9px;
}

.calendar-value.actual {
  color: var(--text-hi);
  font-weight: 700;
}

.impact-pill {
  display: inline-block;

  padding: 4px 7px;

  border-radius: 5px;

  font-size: 7px;
  font-weight: 800;
  text-transform: uppercase;
}

.impact-high {
  background: rgba(226, 85, 90, 0.12);
  color: var(--rose);
}

.impact-medium {
  background: rgba(227, 166, 75, 0.12);
  color: var(--gold);
}

.impact-low {
  background: rgba(154, 163, 181, 0.1);
  color: var(--text-mid);
}

.calendar-empty {
  padding: 50px;
}

/* ---------------------------------------------------------
   Analysis
--------------------------------------------------------- */

.analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
}

.analysis-main,
.analysis-side {
  padding: 20px;
}

.analysis-main h3 {
  margin: 8px 0 14px;
  font-size: 20px;
}

.analysis-text {
  color: var(--text-mid);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.analysis-highlights {
  margin-top: 20px;
}

.analysis-highlight {
  display: flex;
  align-items: flex-start;
  gap: 9px;

  padding: 10px 0;

  border-top: 1px solid var(--line);

  color: var(--text-mid);
  font-size: 11px;
  line-height: 1.5;
}

.analysis-dot {
  flex: 0 0 auto;
  color: var(--gold);
}

.analysis-bias {
  margin: 8px 0 25px;

  font-size: 24px;
  font-weight: 800;
}

.analysis-bias.bullish,
.analysis-bias.buy {
  color: var(--gold);
}

.analysis-bias.bearish,
.analysis-bias.sell {
  color: var(--rose);
}

.analysis-bias.neutral {
  color: var(--text-mid);
}

.analysis-risk {
  color: var(--text-mid);
  font-size: 11px;
  line-height: 1.5;
}

.analysis-updated {
  margin-top: 25px;
  color: var(--text-lo);
  font-size: 8px;
}

.analysis-loading,
.analysis-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 30px;
  color: var(--text-mid);
}

.analysis-empty-title {
  color: var(--text-hi);
  font-size: 12px;
  font-weight: 700;
}

.analysis-empty-sub {
  margin-top: 4px;
  color: var(--text-lo);
  font-size: 9px;
}

.analysis-disclaimer {
  margin-top: 12px;
  color: var(--text-lo);
  font-size: 8px;
}

/* ---------------------------------------------------------
   Account
--------------------------------------------------------- */

.account-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 18px;
}

.profile-panel {
  padding: 20px;
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 12px;

  padding-bottom: 20px;
  margin-bottom: 20px;

  border-bottom: 1px solid var(--line);
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;

  width: 44px;
  height: 44px;

  border-radius: 50%;

  background: var(--bg-raised);
  color: var(--gold);

  font-size: 16px;
  font-weight: 800;
}

.profile-name {
  font-size: 14px;
  font-weight: 700;
}

.profile-email {
  margin-top: 4px;
  color: var(--text-lo);
  font-size: 9px;
}

.profile-form {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field:last-of-type {
  grid-column: 1 / -1;
}

.form-field label {
  color: var(--text-lo);
  font-size: 9px;
}

.form-field input,
.form-field textarea,
.auth-form input {
  width: 100%;

  border: 1px solid var(--line);
  border-radius: 6px;

  outline: none;

  padding: 10px;

  background: #0e1219;
  color: var(--text-hi);

  font-size: 11px;
}

.form-field input:focus,
.form-field textarea:focus,
.auth-form input:focus {
  border-color: rgba(227, 166, 75, 0.45);
}

.form-field textarea {
  resize: vertical;
}

.profile-actions {
  grid-column: 1 / -1;
}

.account-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.plan-panel,
.security-panel {
  padding: 17px;
}

.plan-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.plan-name {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 800;
}

.plan-icon {
  color: var(--gold);
}

.plan-status {
  margin: 8px 0 15px;
  color: var(--text-mid);
  font-size: 10px;
}

.security-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;

  padding: 10px 0;

  border-bottom: 1px solid var(--line);

  color: var(--text-mid);
  font-size: 10px;
}

.security-good {
  color: var(--gold);
}

.logout-btn {
  border: 1px solid rgba(226, 85, 90, 0.3);
  border-radius: 6px;

  padding: 10px;

  background: transparent;
  color: var(--rose);

  font-size: 10px;
}

/* ---------------------------------------------------------
   Auth
--------------------------------------------------------- */

.auth-page {
  position: relative;

  display: flex;
  align-items: center;
  justify-content: center;

  min-height: 100vh;
  padding: 20px;

  background: var(--bg-void);
}

.auth-glow {
  position: fixed;
  width: 500px;
  height: 500px;

  border-radius: 50%;

  background: rgba(227, 166, 75, 0.04);

  filter: blur(80px);
  pointer-events: none;
}

.auth-card {
  position: relative;
  z-index: 1;

  width: min(420px, 100%);
  padding: 32px;

  border: 1px solid var(--line);
  border-radius: 12px;

  background: var(--bg-panel);
  box-shadow: 0 30px 100px rgba(0, 0, 0, 0.35);
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 10px;

  margin-bottom: 35px;
}

.auth-eyebrow {
  color: var(--gold);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.auth-card h1 {
  margin: 7px 0 8px;
  font-size: 25px;
}

.auth-sub {
  color: var(--text-mid);
  font-size: 11px;
  line-height: 1.5;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 22px;
}

.auth-form label {
  color: var(--text-mid);
  font-size: 9px;
}

.auth-submit {
  width: 100%;
  margin-top: 7px;
}

.auth-error,
.payment-error {
  padding: 9px;

  border: 1px solid rgba(226, 85, 90, 0.25);
  border-radius: 5px;

  background: rgba(226, 85, 90, 0.06);
  color: var(--rose);

  font-size: 9px;
}
.auth-divider {
  display: flex;
  align-items: center;
  gap: 10px;

  margin: 22px 0;

  color: var(--text-lo);
  font-size: 8px;
}

.auth-divider span {
  flex: 1;
  height: 1px;
  background: var(--line);
}

.guest-btn,
.text-btn {
  border: 1px solid var(--line);
  border-radius: 6px;

  padding: 9px;

  background: transparent;
  color: var(--text-mid);

  font-size: 10px;
}

.guest-btn {
  width: 100%;
}

.guest-btn:hover,
.text-btn:hover {
  color: var(--text-hi);
  background: var(--bg-raised);
}

.text-btn {
  border: 0;
  padding: 7px;
}
.auth-note {
  margin-top: 18px;
  color: var(--text-lo);
  font-size: 8px;
  line-height: 1.5;
  text-align: center;
}

/* ---------------------------------------------------------
   Modals
--------------------------------------------------------- */

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 20px;

  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(5px);
}

.modal,
.plans-modal,
.payment-modal {
  position: relative;

  width: min(430px, 100%);
  max-height: calc(100vh - 40px);
  overflow-y: auto;

  padding: 25px;

  border: 1px solid var(--line);
  border-radius: 12px;

  background: var(--bg-panel);
  box-shadow: 0 30px 100px rgba(0, 0, 0, 0.5);
}

.plans-modal {
  width: min(1050px, 100%);
}

.modal-close {
  position: absolute;
  top: 13px;
  right: 13px;

  display: flex;

  border: 0;
  background: transparent;
  color: var(--text-lo);
}

.modal-close:hover {
  color: var(--text-hi);
}

.modal-icon {
  display: flex;
  align-items: center;
  justify-content: center;

  width: 36px;
  height: 36px;
  margin-bottom: 13px;

  border-radius: 8px;

  background: rgba(227, 166, 75, 0.08);
  color: var(--gold);
}
  .modal h3 {
  margin-bottom: 8px;
}

.modal p {
  color: var(--text-mid);
  font-size: 11px;
  line-height: 1.6;
}

.modal-action {
  width: 100%;
}

/* ---------------------------------------------------------
   Plans
--------------------------------------------------------- */

.plans-heading {
  margin-bottom: 22px;
}

.plans-heading h2 {
  margin: 6px 0;
}

.plans-heading p {
  color: var(--text-mid);
  font-size: 11px;
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.plan-card {
  position: relative;

  display: flex;
  flex-direction: column;

  padding: 18px;

  border: 1px solid var(--line);
  border-radius: 9px;

  background: #0f131b;
}

.plan-card.featured {
  border-color: rgba(227, 166, 75, 0.45);
}

.plan-card.current {
  opacity: 0.7;
}

.popular-badge {
  position: absolute;
  top: -9px;
  right: 12px;

  padding: 4px 7px;

  border-radius: 4px;

  background: var(--gold);
  color: #111;

  font-size: 7px;
  font-weight: 800;
}

.plan-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;

  color: var(--gold);
}

.plan-card-name {
  color: var(--text-hi);
  font-size: 14px;
  font-weight: 700;
}

.plan-price {
  margin: 15px 0 6px;

  font-size: 26px;
  font-weight: 800;
}

.plan-price span {
  color: var(--text-lo);
  font-size: 9px;
  font-weight: 400;
}

.plan-description {
  min-height: 40px;

  color: var(--text-mid);
  font-size: 9px;
  line-height: 1.5;
}

.plan-features {
  margin: 18px 0;
}
  .plan-feature {
  display: flex;
  gap: 7px;

  padding: 6px 0;

  color: var(--text-mid);
  font-size: 9px;
}

.plan-feature svg {
  flex: 0 0 auto;
  color: var(--gold);
}

.plan-select-btn,
.plan-current-btn {
  width: 100%;
  margin-top: auto;
}

.plan-current-btn {
  border: 1px solid var(--line);
  border-radius: 6px;

  padding: 9px;

  background: transparent;
  color: var(--text-lo);

  font-size: 10px;
}

.plans-note {
  margin-top: 16px;
  color: var(--text-lo);
  font-size: 8px;
}

/* ---------------------------------------------------------
   Payment
--------------------------------------------------------- */

.payment-heading {
  margin-bottom: 20px;
}

.payment-heading h2 {
  margin: 6px 0;
}

.checkout-price {
  color: var(--gold);
  font-size: 25px;
  font-weight: 800;
}

.checkout-price span {
  margin-left: 3px;
  color: var(--text-lo);
  font-size: 9px;
  font-weight: 400;
}

.payment-methods {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.payment-method {
  display: flex;
  align-items: center;
  gap: 10px;

  width: 100%;
  padding: 12px;

  border: 1px solid var(--line);
  border-radius: 7px;

  background: transparent;
  color: var(--text-mid);

  text-align: left;
}

.payment-method:hover,
.payment-method.active {
  border-color: rgba(227, 166, 75, 0.4);
  background: rgba(227, 166, 75, 0.05);
  color: var(--text-hi);
}

.payment-method > div {
  flex: 1;
}

.payment-method small {
  display: block;
  margin-top: 3px;
  color: var(--text-lo);
  font-size: 8px;
}

.payment-submit {
  width: 100%;
  margin-top: 14px;
}
.payment-secure {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;

  margin-top: 12px;

  color: var(--text-lo);
  font-size: 8px;
}

.crypto-payment {
  text-align: center;
}

.crypto-payment .payment-heading p {
  color: var(--text-mid);
  font-size: 10px;
  line-height: 1.5;
}

.crypto-network {
  display: flex;
  justify-content: space-between;

  padding: 9px 11px;
  margin-bottom: 10px;

  border: 1px solid var(--line);
  border-radius: 6px;

  color: var(--text-mid);
  font-size: 9px;
}

.crypto-network strong {
  color: var(--gold);
}

.crypto-amount {
  margin: 12px 0;
}

.crypto-amount-label,
.wallet-label {
  margin-bottom: 5px;
  color: var(--text-lo);
  font-size: 8px;
  text-align: left;
}

.crypto-amount-value {
  color: var(--gold);
  font-family:
    "IBM Plex Mono",
    "Courier New",
    monospace;
  font-size: 18px;
  font-weight: 800;
}

.qr-wrap {
  display: flex;
  justify-content: center;
  margin: 14px 0;
}

.qr-wrap img {
  width: 170px;
  height: 170px;
  padding: 8px;
  border-radius: 7px;
  background: white;
}

.qr-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;

  width: 170px;
  height: 170px;
  margin: 14px auto;

  border: 1px dashed var(--line);
  border-radius: 7px;

  color: var(--text-lo);
  font-size: 9px;
}

.wallet-box {
  display: flex;
  align-items: center;
  gap: 8px;

  padding: 9px;

  border: 1px solid var(--line);
  border-radius: 6px;

  background: #0e1219;
}

.wallet-box span {
  flex: 1;

  overflow: hidden;

  color: var(--text-mid);

  font-family:
    "IBM Plex Mono",
    "Courier New",
    monospace;

  font-size: 8px;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.wallet-box button {
  display: flex;

  border: 0;
  background: transparent;
  color: var(--gold);
  }
  .crypto-status {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;

  margin: 14px 0;

  color: var(--gold);
  font-size: 9px;
  font-weight: 700;
}

.crypto-warning {
  display: flex;
  gap: 6px;

  padding: 9px;

  border: 1px solid var(--line);
  border-radius: 6px;

  color: var(--text-lo);

  font-size: 8px;
  line-height: 1.5;
  text-align: left;
}

/* ---------------------------------------------------------
   Boot
--------------------------------------------------------- */

.boot-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  min-height: 100vh;

  background: var(--bg-void);
}

.boot-brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.boot-title {
  font-size: 17px;
  font-weight: 700;
}

.boot-sub {
  margin-top: 4px;
  color: var(--text-lo);
  font-size: 9px;
}

.boot-loader {
  width: 170px;
  height: 2px;
  overflow: hidden;
  margin-top: 22px;
  background: var(--line);
}

.boot-loader span {
  display: block;
  width: 45%;
  height: 100%;
  background: var(--gold);
  animation: bootLoad 1.2s ease-in-out infinite;
}

@keyframes bootLoad {
  0% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(340%);
  }
}

/* ---------------------------------------------------------
   Responsive
--------------------------------------------------------- */

@media (max-width: 1100px) {
  .dashboard-grid,
  .account-grid {
    grid-template-columns: 1fr;
}
    @media (max-width: 1100px) {
  .dashboard-grid,
  .account-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-side {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .asset-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .analysis-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .view-wrap {
    padding: 18px 12px;
  }

  .view-head,
  .dashboard-top {
    align-items: flex-start;
    flex-direction: column;
  }

  .topbar {
    padding: 0 12px;
  }

  .last-update {
    display: none;
  }

  .top-account .top-plan {
    display: none;
  }

  .dashboard-side {
    display: flex;
  }

  .signals-grid {
    grid-template-columns: 1fr;
  }

  .asset-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .calendar-panel {
    overflow-x: auto;
  }

  .calendar-head,
  .calendar-row {
    min-width: 760px;
  }

  .plans-grid {
    grid-template-columns: 1fr;
  }

  .profile-form {
    grid-template-columns: 1fr;
  }

  .form-field:last-of-type,
  .profile-actions {
    grid-column: auto;
  }

  .chart-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .tf-bar {
    overflow-x: auto;
    width: 100%;
  }
      }
    @media (max-width: 480px) {
  .auth-card {
    padding: 23px;
  }

  .asset-grid {
    grid-template-columns: 1fr;
  }

  .market-tabs {
    width: 100%;
  }

  .market-tab {
    flex: 1;
  }

  .top-brand > span:last-child {
    display: none;
  }
  }
