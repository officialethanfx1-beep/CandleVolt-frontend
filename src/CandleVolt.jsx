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
// gold:      #E3A64B   bullish / buy / primary accent (terminal-amber, not neon)
// rose:      #E2555A   bearish / sell
// text-hi:   #EDEFF3
// text-mid:  #9AA3B5
// text-lo:   #5C6478
// ---------------------------------------------------------------------------

// >>> Point this at your deployed backend (see candlevolt-backend/README.md).
// Left as localhost so it's obvious this needs changing before going live.
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

// simple per-session id — not persisted (artifacts can't use browser storage),
// so it resets on reload. Swap for real auth once you add user accounts.
function makeSessionId() {
  return `sess-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

// Real localStorage is fine here — this is a real deployed website (Vercel),
// not a claude.ai artifact sandbox, so normal browser storage APIs work.
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
    // storage may be unavailable (private mode etc.) — just skip persistence
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

// Manual timeout wrapper — avoids relying on AbortSignal.timeout(), which
// isn't available on every mobile browser/webview. Also gives Render's free
// tier enough time to wake from sleep (can take 20-40s on a cold start).
function fetchWithTimeout(url, ms = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
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

// Real OHLC candlestick chart (TradingView's lightweight-charts) — only
// meaningful for crypto/meme symbols, since that's the only feed with true
// per-minute open/high/low/close data (see backend candleStore.js).
// Real OHLC candlestick chart (TradingView's lightweight-charts) — real
// historical + live data proxied straight from Binance's public REST API
// (see backend routes/candles.js), for any supported timeframe.
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
          background: { type: ColorType.Solid, color: "#0D1017" },
          textColor: "#9AA3B5",
          fontFamily: "IBM Plex Mono, monospace",
        },
        grid: {
          vertLines: { color: "#1B2130" },
          horzLines: { color: "#1B2130" },
        },
        timeScale: { borderColor: "#232A3B", timeVisible: true },
        rightPriceScale: { borderColor: "#232A3B" },
        crosshair: { mode: 0 },
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

    // ResizeObserver tracks the actual container box (grid/flex layouts
    // often aren't settled yet on first mount) — this is what was causing
    // the chart to occasionally render wider than the viewport, forcing a
    // pinch-zoom to see the rest of the page.
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && chartRef.current) {
        chartRef.current.applyOptions({ width: Math.floor(entry.contentRect.width) });
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
          `${BACKEND_URL}/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=200`
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
        if (candles.length) seriesRef.current.setData(candles);
      } catch {
        // keep showing the last known candles rather than clearing the chart
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

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1w", "1M"];

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

// Live news, polled from free RSS feeds on the backend (see newsFeed.js) —
// updates every ~2 minutes, which is as close to real-time as a free news
// source gets without a paid data provider.
function NewsPanel({ market }) {
  const [items, setItems] = useState([]);
  const category = market === "forex" || market === "commodities" ? "forex" : "crypto";

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetchWithTimeout(
          `${BACKEND_URL}/api/news?category=${category}&limit=12`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data?.news) ? data.news : []);
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
        <Radio size={12} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
        Market News — {category === "forex" ? "Forex & Commodities" : "Crypto"}
      </div>
      <div className="news-feed">
        {items.length === 0 && (
          <div className="empty-state">Fetching the latest headlines…</div>
        )}
        {items.map((n) => (
          <a
            key={n.id}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="news-item"
          >
            <div className="news-title">{n.title}</div>
            <div className="news-meta">
              <span className="news-source">{n.source}</span>
              <span className="news-time">{timeAgoShort(n.publishedAt)}</span>
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
          <span key={idx} className="ticker-item">
            <span className="ticker-sym">{t.symbol}</span>
            <span className={t.up ? "ticker-up" : "ticker-down"}>
              {fmtPrice(t.price, t.symbol)}
            </span>
            <span className={t.up ? "ticker-up" : "ticker-down"}>
              {t.price == null ? "" : `${t.up ? "▲" : "▼"} ${Math.abs(t.pct).toFixed(2)}%`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SignalCard({ sig, locked, remainingMs }) {
  const isBuy = sig.direction === "BUY";

  if (locked) {
    return (
      <div className={`sig-card sig-locked ${isBuy ? "sig-buy" : "sig-sell"}`}>
        <div className="sig-top">
          <div className="sig-dir">
            {isBuy ? (
              <TrendingUp size={15} strokeWidth={2.4} />
            ) : (
              <TrendingDown size={15} strokeWidth={2.4} />
            )}
            <span>{sig.direction}</span>
          </div>
          <span className="sig-market">{sig.marketKey?.toUpperCase()}</span>
        </div>
        <div className="sig-symbol blurred">{sig.symbol}</div>
        <div className="lock-overlay">
          <Lock size={14} />
          <span>Unlocks in {fmtCountdown(remainingMs)}</span>
          <span className="lock-sub">Upgrade to Pro for real-time signals</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`sig-card ${isBuy ? "sig-buy" : "sig-sell"}`}>
      <div className="sig-top">
        <div className="sig-dir">
          {isBuy ? (
            <TrendingUp size={15} strokeWidth={2.4} />
          ) : (
            <TrendingDown size={15} strokeWidth={2.4} />
          )}
          <span>{sig.direction}</span>
        </div>
        <span className="sig-market">{sig.marketKey?.toUpperCase()}</span>
      </div>
      <div className="sig-symbol">{sig.symbol}</div>
      <div className="sig-grid">
        <div>
          <div className="sig-label">Entry</div>
          <div className="sig-val">{fmtPrice(sig.entry, sig.symbol)}</div>
        </div>
        <div>
          <div className="sig-label">Target</div>
          <div className="sig-val sig-val-up">
            {fmtPrice(sig.target, sig.symbol)}
          </div>
        </div>
        <div>
          <div className="sig-label">Stop</div>
          <div className="sig-val sig-val-down">
            {fmtPrice(sig.stop, sig.symbol)}
          </div>
        </div>
      </div>
      <div className="sig-conf-row">
        <div className="sig-conf-track">
          <div
            className="sig-conf-fill"
            style={{
              width: `${sig.confidence}%`,
              background: isBuy ? "#E3A64B" : "#E2555A",
            }}
          />
        </div>
        <span className="sig-conf-num">{sig.confidence}%</span>
      </div>
      <div className="sig-foot">
        <span>{sig.reason}</span>
        <span className="sig-time">{timeAgo(sig.ts)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navigation: side menu + the standalone views it switches between
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "chart", label: "Chart", icon: BarChart3 },
  { key: "news", label: "News", icon: Newspaper },
  { key: "calendar", label: "Market Calendar", icon: CalendarClock },
  { key: "analysis", label: "Daily Analysis", icon: Sparkles },
  { key: "account", label: "Account", icon: UserCircle },
];

function SideMenu({ open, activeView, onSelect, onClose }) {
  return (
    <>
      <div
        className={`menu-scrim ${open ? "menu-scrim-open" : ""}`}
        onClick={onClose}
      />
      <div className={`side-menu ${open ? "side-menu-open" : ""}`}>
        <div className="side-menu-head">
          <div className="brand-mark">
            <Zap size={16} strokeWidth={2.6} />
          </div>
          CandleVolt
        </div>
        <div className="side-menu-items">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`side-menu-item ${activeView === item.key ? "active" : ""}`}
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

// Full-page news view — both categories side by side with a toggle, more
// headlines than the compact dashboard teaser.
// Dedicated full-page chart — pick any crypto/meme symbol and timeframe,
// backed by real historical + live candles from Binance.
function ChartView() {
  const chartAssets = [...ASSETS.crypto, ...ASSETS.meme];
  const [symbol, setSymbol] = useState(chartAssets[0].symbol);
  const [interval, setIntervalTf] = useState("1m");
  const [price, setPrice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/prices?market=crypto`);
        if (!res.ok) return;
        const data = await res.json();
        const all = [...(data.crypto || []), ...(data.meme || [])];
        const found = all.find((a) => a.symbol === symbol);
        if (!cancelled && found) setPrice(found.price);
      } catch {
        // keep last known price
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  return (
    <div className="panel">
      <div className="panel-title">
        <BarChart3 size={12} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
        Chart
      </div>

      <div className="chart-symbol-picker">
        {chartAssets.map((a) => (
          <button
            key={a.symbol}
            className={`tab-btn ${symbol === a.symbol ? "active" : ""}`}
            onClick={() => setSymbol(a.symbol)}
          >
            {a.symbol}
          </button>
        ))}
      </div>

      <div className="chart-page-head">
        <span className="chart-hero-sym">{symbol}</span>
        <span className="chart-hero-price">{fmtPrice(price, symbol)}</span>
      </div>

      <TimeframeBar value={interval} onChange={setIntervalTf} />

      <CandlestickChart symbol={symbol} interval={interval} height={380} />
    </div>
  );
}

function NewsView() {
  const [category, setCategory] = useState("crypto");
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetchWithTimeout(
          `${BACKEND_URL}/api/news?category=${category}&limit=30`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data?.news) ? data.news : []);
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
      <div className="market-tabs" style={{ marginBottom: 14 }}>
        <button
          className={`tab-btn ${category === "crypto" ? "active" : ""}`}
          onClick={() => setCategory("crypto")}
        >
          Crypto
        </button>
        <button
          className={`tab-btn ${category === "forex" ? "active" : ""}`}
          onClick={() => setCategory("forex")}
        >
          Forex & Commodities
        </button>
      </div>
      <div className="news-feed" style={{ maxHeight: "none" }}>
        {items.length === 0 && (
          <div className="empty-state">Fetching the latest headlines…</div>
        )}
        {items.map((n) => (
          <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer" className="news-item">
            <div className="news-title">{n.title}</div>
            <div className="news-meta">
              <span className="news-source">{n.source}</span>
              <span className="news-time">{timeAgoShort(n.publishedAt)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// Placeholder — the real economic calendar (CPI, PPI, NFP, FOMC etc.  from a
// free ForexFactory-style feed) is next on the roadmap, not faked here.
function fmtEventTime(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString(undefined, {
weekday: "short",
month: "short",
day: "numeric",
hour: "2-digit",
minute: "2-digit",
  });
}

function CalendarView() {
  const [events, setEvents] = useState([]);
  const [impact, setImpact] = useState(&quot;all&quot;);

  useEffect(() =&gt; {
    let cancelled = false;
    const poll = async () =&gt; {
      try {
        const url =
          impact === &quot;all&quot;
            ? `${BACKEND_URL}/api/calendar`
            : `${BACKEND_URL}/api/calendar?impact=${impact}`;
        const res = await fetchWithTimeout(url);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setEvents(Array.isArray(data?.events) ? data.events : []);
      } catch {
        // keep whatever events we already have
      }
    };
    poll();
    const id = setInterval(poll,
    5 * 60000);
    return () =&gt; {
      cancelled = true;
      clearInterval(id);
    };
  }, [impact]);

  return (
    &lt;div className=&quot;panel&quot;&gt;
      &lt;div className=&quot;panel-title&quot;&gt;
        &lt;CalendarClock size={12} style={{ display: &quot;inline&quot;, marginRight: 6, verticalAlign: -2 }} /&gt;
        Market Calendar
      &lt;/div&gt;
      &lt;div className=&quot;market-tabs&quot; style={{ marginBottom: 14 }}&gt;
        {[&quot;all&quot;, &quot;High&quot;, &quot;Medium&quot;, &quot;Low&quot;].map((lvl) =&gt; (
          &lt;button
            key={lvl}
            className={`tab-btn ${impact === lvl ? &quot;active&quot; : &quot;&quot;}`}
            onClick={() =&gt; setImpact(lvl)}
          &gt;
            {lvl === &quot;all&quot; ? &quot;All&quot; : lvl}
          &lt;/button&gt;
        ))}
      &lt;/div&gt;
      &lt;div className=&quot;cal-feed&quot;&gt;
        {events.length === 0 &amp;&amp; (
          &lt;div className=&quot;empty-state&quot;&gt;Fetching this week&#x27;s economic calendar…&lt;/div&gt;
        )}
        {events.map((e) =&gt; (
          &lt;div key={e.id} className={`cal-item cal-${(e.impact || &quot;&quot;).toLowerCase()}`}&gt;
            &lt;div className=&quot;cal-top&quot;&gt;
              &lt;span className=&quot;cal-country&quot;&gt;{e.country}&lt;/span&gt;
              &lt;span className={`cal-impact cal-impact-${(e.impact || &quot;&quot;).toLowerCase()}`}&gt;
                {e.impact}
              &lt;/span&gt;
            &lt;/div&gt;
            &lt;div className=&quot;cal-title&quot;&gt;{e.title}&lt;/div&gt;
            &lt;div className=&quot;cal-time&quot;&gt;{fmtEventTime(e.date)}&lt;/div&gt;
            &lt;div className=&quot;cal-figures&quot;&gt;
              &lt;span&gt;Forecast: {e.forecast || &quot;—&quot;}&lt;/span&gt;
              &lt;span&gt;Previous: {e.previous || &quot;—&quot;}&lt;/span&gt;
              &lt;span&gt;Actual: {e.actual || &quot;—&quot;}&lt;/span&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        ))}
      &lt;/div&gt;
    &lt;/div&gt;
  );
}
// Placeholder — the real AI-generated daily market summary (built from the
// live prices/news/signals already flowing through the backend) is next on
// the roadmap. No fabricated &quot;predictions&quot; shown here in the meantime.
function AnalysisView() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() =&gt; {
    let cancelled = false;
    const poll = async () =&gt; {
      try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/analysis`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAnalysis(data);
      } catch {
        // keep whatever we already have
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    poll();
    const id = setInterval(poll, 5 * 60000);
    return () =&gt; {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    &lt;div className=&quot;panel&quot;&gt;
      &lt;div className=&quot;panel-title&quot;&gt;
        &lt;Sparkles size={12} style={{ display: &quot;inline&quot;, marginRight: 6, verticalAlign: -2 }} /&gt;
        Daily Analysis
      &lt;/div&gt;

      {loading &amp;&amp; (
        &lt;div className=&quot;empty-state&quot;&gt;Loading the latest briefing…&lt;/div&gt;
      )}

      {!loading &amp;&amp; !analysis?.text &amp;&amp; (
        &lt;div className=&quot;coming-soon&quot;&gt;
          &lt;Sparkles size={28} style={{ color: &quot;#5C6478&quot;, marginBottom: 10 }} /&gt;
          &lt;p&gt;No briefing generated yet — check back shortly.&lt;/p&gt;
        &lt;/div&gt;
      )}

      {!loading &amp;&amp; analysis?.text &amp;&amp; (
        &lt;&gt;
          &lt;div className=&quot;analysis-updated&quot;&gt;
            Last updated {timeAgoShort(analysis.generatedAt)}
          &lt;/div&gt;
          &lt;div className=&quot;analysis-text&quot;&gt;{analysis.text}&lt;/div&gt;
          &lt;div className=&quot;disclaimer&quot;&gt;
            &lt;ShieldCheck size={16} /&gt;
            &lt;span&gt;
              AI-generated read on current conditions — not a guaranteed
              prediction. Always do your own research before trading.
            &lt;/span&gt;
          &lt;/div&gt;
        &lt;/&gt;
      )}
    &lt;/div&gt;
  );
}

function AccountView({ auth, onLogout, onShowAuth, onProfileSaved, plans, currentPlan, onSubscribe }) {
  const [form, setForm] = useState({
    username: auth?.profile?.username || &quot;&quot;,
    firstName: auth?.profile?.firstName || &quot;&quot;,
    lastName: auth?.profile?.lastName || &quot;&quot;,
    country: auth?.profile?.country || &quot;&quot;,
    bio: auth?.profile?.bio || &quot;&quot;,
    avatar: auth?.profile?.avatar || null,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(&quot;&quot;);
  const fileRef = useRef(null);

  const handleAvatar = (e) =&gt; {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =&gt; {
      const img = new Image();
      img.onload = () =&gt; {
        const size = 160;
        const canvas = document.createElement(&quot;canvas&quot;);
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext(&quot;2d&quot;);
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        setForm((f) =&gt; ({ ...f, avatar: canvas.toDataURL(&quot;image/jpeg&quot;, 0.82) }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const save = async () =&gt; {
    setSaving(true);
    setSaveMsg(&quot;&quot;);
    try {
      const stored = loadStoredAuth();
      const res = await fetch(`${BACKEND_URL}/api/auth/profile`, {
        method: &quot;PUT&quot;,
        headers: {
          &quot;Content-Type&quot;: &quot;application/json&quot;,
          Authorization: `Bearer ${stored?.token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMsg(&quot;Saved.&quot;);
        onProfileSaved(data.profile);
      } else {
        setSaveMsg(data.error || &quot;Could not save.&quot;);
      }
    } catch {
      setSaveMsg(&quot;Couldn&#x27;t reach the server.&quot;);
    } finally {
      setSaving(false);
    }
  };
return (
    &lt;&gt;
      &lt;div className=&quot;panel&quot;&gt;
        &lt;div className=&quot;panel-title&quot;&gt;
          &lt;UserCircle size={12} style={{ display: &quot;inline&quot;, marginRight: 6, verticalAlign: -2 }} /&gt;
          Profile
        &lt;/div&gt;
        {auth?.guest ? (
          &lt;div className=&quot;account-guest-box&quot;&gt;
            &lt;p&gt;You&#x27;re browsing as a guest — sign in to save your profile and plan.&lt;/p&gt;
            &lt;button className=&quot;rzp-btn&quot; onClick={onShowAuth}&gt;
              Sign in
            &lt;/button&gt;
          &lt;/div&gt;
        ) : (
          &lt;&gt;
            &lt;div className=&quot;profile-avatar-row&quot;&gt;
              &lt;div className=&quot;profile-avatar&quot; onClick={() =&gt; fileRef.current?.click()}&gt;
                {form.avatar ? &lt;img src={form.avatar} alt=&quot;avatar&quot; /&gt; : &lt;UserCircle size={36} /&gt;}
              &lt;/div&gt;
              &lt;input
                ref={fileRef}
                type=&quot;file&quot;
                accept=&quot;image/*&quot;
                style={{ display: &quot;none&quot; }}
                onChange={handleAvatar}
              /&gt;
              &lt;div&gt;
                &lt;div className=&quot;account-email&quot;&gt;{auth?.email}&lt;/div&gt;
                &lt;div className=&quot;account-plan-label&quot;&gt;Current plan: {currentPlan}&lt;/div&gt;
              &lt;/div&gt;
            &lt;/div&gt;

            &lt;input
              className=&quot;auth-input&quot;
              placeholder=&quot;Username&quot;
              value={form.username}
              onChange={(e) =&gt; setForm({ ...form, username: e.target.value })}
            /&gt;
            &lt;div style={{ display: &quot;flex&quot;, gap: 8 }}&gt;
              &lt;input
                className=&quot;auth-input&quot;
                placeholder=&quot;First name&quot;
                value={form.firstName}
                onChange={(e) =&gt; setForm({ ...form, firstName: e.target.value })}
              /&gt;
              &lt;input
                className=&quot;auth-input&quot;
                placeholder=&quot;Last name&quot;
                value={form.lastName}
                onChange={(e) =&gt; setForm({ ...form, lastName: e.target.value })}
              /&gt;
            &lt;/div&gt;
            &lt;input
              className=&quot;auth-input&quot;
              placeholder=&quot;Country&quot;
              value={form.country}
              onChange={(e) =&gt; setForm({ ...form, country: e.target.value })}
            /&gt;
            &lt;textarea
              className=&quot;auth-input profile-bio&quot;
              placeholder=&quot;Bio&quot;
              rows={3}
              value={form.bio}
              onChange={(e) =&gt; setForm({ ...form, bio: e.target.value })}
            /&gt;

            &lt;button className=&quot;rzp-btn&quot; onClick={save} disabled={saving}&gt;
              {saving ? &quot;Saving…&quot; : &quot;Save profile&quot;}
            &lt;/button&gt;
            {saveMsg &amp;&amp; &lt;div className=&quot;profile-save-msg&quot;&gt;{saveMsg}&lt;/div&gt;}

            &lt;button className=&quot;auth-badge-btn&quot; style={{ marginTop: 12 }} onClick={onLogout}&gt;
              Log out
            &lt;/button&gt;
          &lt;/&gt;
        )}
      &lt;/div&gt;
              &lt;div className=&quot;panel&quot; style={{ marginTop: 20 }}&gt;
        &lt;div className=&quot;panel-title&quot;&gt;
          &lt;Crown size={12} style={{ display: &quot;inline&quot;, marginRight: 6, verticalAlign: -2 }} /&gt;
          Subscription Plans
        &lt;/div&gt;
        &lt;div className=&quot;plans-row&quot;&gt;
          {plans.map((p) =&gt; (
            &lt;div
              key={p.name}
              className={`plan-card ${p.highlight ? &quot;highlight&quot; : &quot;&quot;} ${
                currentPlan === p.name ? &quot;active&quot; : &quot;&quot;
              }`}
            &gt;
              &lt;div className=&quot;plan-head&quot;&gt;
                &lt;span className=&quot;plan-name&quot;&gt;
                  {p.name === &quot;Elite&quot; &amp;&amp; &lt;Crown size={13} /&gt;}
                  {p.name}
                &lt;/span&gt;
                &lt;span className=&quot;plan-price&quot;&gt;
                  {p.price}
                  &lt;span&gt;{p.period}&lt;/span&gt;
                &lt;/span&gt;
              &lt;/div&gt;
              &lt;div className=&quot;plan-feats&quot;&gt;
                {p.features.map((f) =&gt; (
                  &lt;div key={f} style={{ display: &quot;flex&quot;, gap: 6, alignItems: &quot;center&quot; }}&gt;
                    &lt;ChevronRight size={11} style={{ flexShrink: 0, color: &quot;#5C6478&quot; }} /&gt;
                    {f}
                  &lt;/div&gt;
                ))}
              &lt;/div&gt;
              &lt;button
                className=&quot;plan-pay-btn&quot;
                disabled={p.name === &quot;Free&quot;}
                onClick={() =&gt; onSubscribe(p)}
              &gt;
                &lt;QrCode size={13} /&gt;
                {p.name === &quot;Free&quot; ? &quot;Current plan&quot; : &quot;Subscribe&quot;}
              &lt;/button&gt;
            &lt;/div&gt;
          ))}
        &lt;/div&gt;
      &lt;/div&gt;

      &lt;div className=&quot;panel&quot; style={{ marginTop: 20 }}&gt;
        &lt;div className=&quot;panel-title&quot;&gt;
          &lt;Wallet size={12} style={{ display: &quot;inline&quot;, marginRight: 6, verticalAlign: -2 }} /&gt;
          Your Earnings
        &lt;/div&gt;
        &lt;div className=&quot;stat-row&quot;&gt;
          &lt;div className=&quot;stat-box&quot;&gt;
            &lt;div className=&quot;stat-label&quot;&gt;&lt;Users size={11} /&gt; Subscribers&lt;/div&gt;
            &lt;div className=&quot;stat-val&quot;&gt;312&lt;/div&gt;
          &lt;/div&gt;
          &lt;div className=&quot;stat-box&quot;&gt;
            &lt;div className=&quot;stat-label&quot;&gt;&lt;Wallet size={11} /&gt; This Month&lt;/div&gt;
            &lt;div className=&quot;stat-val gold&quot;&gt;₹1,86,400&lt;/div&gt;
          &lt;/div&gt;
          &lt;div className=&quot;stat-box&quot;&gt;
            &lt;div className=&quot;stat-label&quot;&gt;&lt;Crown size={11} /&gt; Elite Users&lt;/div&gt;
            &lt;div className=&quot;stat-val&quot;&gt;44&lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;
        &lt;div className=&quot;disclaimer&quot;&gt;
          &lt;ShieldCheck size={16} /&gt;
          &lt;span&gt;
            Illustrative numbers — wire them to your real user table (see
            backend db.js) once you have paying users.
          &lt;/span&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/&gt;
  );
}

function AuthModal({ onAuthenticated, onClose }) {
  const [step, setStep] = useState(&quot;email&quot;); // email | otp
  const [email, setEmail] = useState(&quot;&quot;);
  const [code, setCode] = useState(&quot;&quot;);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(&quot;&quot;);

  const requestOtp = async () =&gt; {
    setError(&quot;&quot;);
    if (!email) {
      setError(&quot;Enter your email.&quot;);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/request-otp`, {
        method: &quot;POST&quot;,
        headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || &quot;Something went wrong.&quot;);
        return;
      }
      setStep(&quot;otp&quot;);
    } catch {
      setError(&quot;Couldn&#x27;t reach the server — try again in a moment.&quot;);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () =&gt; {
    setError(&quot;&quot;);
    if (!code) {
      setError(&quot;Enter the code sent to your email.&quot;);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
        method: &quot;POST&quot;,
        headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || &quot;Invalid code.&quot;);
        return;
      }
      saveStoredAuth({ token: data.token, userId: data.userId, email: data.email });
      onAuthenticated({
        userId: data.userId,
        email: data.email,
        plan: data.plan,
        profile: data.profile,
      });
    } catch {
      setError(&quot;Couldn&#x27;t reach the server — try again in a moment.&quot;);
    } finally {
      setLoading(false);
    }
  };

  return (
    &lt;div className=&quot;modal-backdrop&quot; onClick={onClose}&gt;
      &lt;div className=&quot;modal-card&quot; onClick={(e) =&gt; e.stopPropagation()}&gt;
        &lt;div className=&quot;modal-head&quot;&gt;
          &lt;div className=&quot;modal-title&quot;&gt;
            &lt;Zap size={16} /&gt; {step === &quot;email&quot; ? &quot;Sign in&quot; : &quot;Enter code&quot;}
          &lt;/div&gt;
          &lt;button className=&quot;modal-close&quot; onClick={onClose}&gt;
            &lt;X size={16} /&gt;
          &lt;/button&gt;
        &lt;/div&gt;

        {step === &quot;email&quot; ? (
          &lt;&gt;
            &lt;input
              className=&quot;auth-input&quot;
              type=&quot;email&quot;
              autoComplete=&quot;email&quot;
              placeholder=&quot;Email&quot;
              value={email}
              onChange={(e) =&gt; setEmail(e.target.value)}
              onKeyDown={(e) =&gt; e.key === &quot;Enter&quot; &amp;&amp; requestOtp()}
            /&gt;
            {error &amp;&amp; &lt;div className=&quot;rzp-error&quot;&gt;{error}&lt;/div&gt;}
            &lt;button className=&quot;rzp-btn&quot; onClick={requestOtp} disabled={loading}&gt;
              {loading ? &quot;Sending…&quot; : &quot;Send code&quot;}
            &lt;/button&gt;
          &lt;/&gt;
        ) : (
          &lt;&gt;
            &lt;div className=&quot;otp-hint&quot;&gt;Code sent to {email}&lt;/div&gt;
            &lt;input
              className=&quot;auth-input&quot;
              type=&quot;text&quot;
              inputMode=&quot;numeric&quot;
              maxLength={6}
              placeholder=&quot;6-digit code&quot;
              value={code}
              onChange={(e) =&gt; setCode(e.target.value.replace(/\D/g, &quot;&quot;))}
              onKeyDown={(e) =&gt; e.key === &quot;Enter&quot; &amp;&amp; verifyOtp()}
            /&gt;
            {error &amp;&amp; &lt;div className=&quot;rzp-error&quot;&gt;{error}&lt;/div&gt;}
            &lt;button className=&quot;rzp-btn&quot; onClick={verifyOtp} disabled={loading}&gt;
              {loading ? &quot;Verifying…&quot; : &quot;Verify &amp; continue&quot;}
            &lt;/button&gt;
            &lt;div className=&quot;auth-switch&quot;&gt;
              &lt;span onClick={() =&gt; setStep(&quot;email&quot;)}&gt;Use a different email&lt;/span&gt;
            &lt;/div&gt;
          &lt;/&gt;
        )}
      &lt;/div&gt;
    &lt;/div&gt;
  );
}
                  function loadRazorpayScript() {
  return new Promise((resolve) =&gt; {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement(&quot;script&quot;);
    script.src = &quot;https://checkout.razorpay.com/v1/checkout.js&quot;;
    script.onload = () =&gt; resolve(true);
    script.onerror = () =&gt; resolve(false);
    document.body.appendChild(script);
  });
}

function PaymentModal({ plan, sessionId, onClose, onActivated }) {
  const [tab, setTab] = useState(&quot;crypto&quot;);
  const [copied, setCopied] = useState(false);
  const [rzpLoading, setRzpLoading] = useState(false);
  const [rzpError, setRzpError] = useState(&quot;&quot;);

  // Real crypto order state — created on the backend so the exact amount
  // is unique to this order and can be auto-matched on-chain.
  const [cryptoOrder, setCryptoOrder] = useState(null);
  const [cryptoError, setCryptoError] = useState(&quot;&quot;);
  const [cryptoStatus, setCryptoStatus] = useState(&quot;pending&quot;); // pending | paid | expired

  useEffect(() =&gt; {
    if (tab !== &quot;crypto&quot; || cryptoOrder) return;
    let cancelled = false;
    (async () =&gt; {
      try {
        const res = await fetch(`${BACKEND_URL}/api/subscribe/create-crypto-order`, {
          method: &quot;POST&quot;,
          headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },
          body: JSON.stringify({ userId: sessionId, planName: plan.name }),
        });
        if (!res.ok) throw new Error(&quot;bad response&quot;);
        const data = await res.json();
        if (!cancelled) setCryptoOrder(data);
      } catch {
        if (!cancelled)
          setCryptoError(&quot;Couldn&#x27;t reach the backend to create a payment order.&quot;);
      }
    })();
    return () =&gt; {
      cancelled = true;
    };
  }, [tab, cryptoOrder, sessionId, plan.name]);

  // Poll for automatic on-chain confirmation — no admin action needed.
  useEffect(() =&gt; {
    if (!cryptoOrder || cryptoStatus !== &quot;pending&quot;) return;
    const id = setInterval(async () =&gt; {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/subscribe/crypto-status?orderId=${cryptoOrder.orderId}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === &quot;paid&quot;) {
          setCryptoStatus(&quot;paid&quot;);
          onActivated(plan.name);
        } else if (data.status === &quot;expired&quot;) {
          setCryptoStatus(&quot;expired&quot;);
        }
      } catch {
        // ignore transient poll failures
      }
    }, 5000);
    return () =&gt; clearInterval(id);
  }, [cryptoOrder, cryptoStatus, onActivated, plan.name]);

  const qrUrl = cryptoOrder
    ? `https://api.qrserver.com/v1/create-qr-code/?size=190x190&amp;margin=8&amp;color=237-166-75&amp;bgcolor=13-16-23&amp;data=${encodeURIComponent(
        cryptoOrder.walletAddress
      )}`
    : null;

  const handleCopy = (text) =&gt; {
    navigator.clipboard?.writeText(text).catch(() =&gt; {});
    setCopied(true);
    setTimeout(() =&gt; setCopied(false), 1800);
  };

  const payWithRazorpay = async () =&gt; {
    setRzpError(&quot;&quot;);
    setRzpLoading(true);
    try {
      const orderRes = await fetch(`${BACKEND_URL}/api/subscribe/create-order`, {
        method: &quot;POST&quot;,
        headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },
        body: JSON.stringify({ userId: sessionId, planName: plan.name }),
      });
      if (!orderRes.ok) throw new Error(&quot;Order creation failed&quot;);
      const order = await orderRes.json();

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error(&quot;Could not load Razorpay checkout&quot;);

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: &quot;CandleVolt&quot;,
        description: `${plan.name} plan`,
        theme: { color: &quot;#E3A64B&quot; },
        handler: async (response) =&gt; {
                  try {
            const verifyRes = await fetch(`${BACKEND_URL}/api/subscribe/verify`, {
              method: &quot;POST&quot;,
              headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },
              body: JSON.stringify({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                userId: sessionId,
                planName: plan.name,
              }),
            });
            if (verifyRes.ok) {
              onActivated(plan.name);
            } else {
              setRzpError(&quot;Payment captured but verification failed — contact support.&quot;);
            }
          } catch {
            setRzpError(&quot;Verification request failed.&quot;);
          }
        },
      });
      rzp.on(&quot;payment.failed&quot;, () =&gt; setRzpError(&quot;Payment failed or was cancelled.&quot;));
      rzp.open();
    } catch (e) {
      setRzpError(
        e.message === &quot;Order creation failed&quot;
          ? &quot;Couldn&#x27;t reach the backend — is it running and is BACKEND_URL set correctly?&quot;
          : e.message
      );
    } finally {
      setRzpLoading(false);
    }
  };

  return (
    &lt;div className=&quot;modal-backdrop&quot; onClick={onClose}&gt;
      &lt;div className=&quot;modal-card&quot; onClick={(e) =&gt; e.stopPropagation()}&gt;
        &lt;div className=&quot;modal-head&quot;&gt;
          &lt;div className=&quot;modal-title&quot;&gt;
            &lt;QrCode size={16} /&gt; Subscribe — {plan.name}
          &lt;/div&gt;
          &lt;button className=&quot;modal-close&quot; onClick={onClose}&gt;
            &lt;X size={16} /&gt;
          &lt;/button&gt;
        &lt;/div&gt;

        &lt;div className=&quot;pay-tabs&quot;&gt;
          &lt;button
            className={`pay-tab ${tab === &quot;crypto&quot; ? &quot;pay-tab-active&quot; : &quot;&quot;}`}
            onClick={() =&gt; setTab(&quot;crypto&quot;)}
          &gt;
            &lt;QrCode size={13} /&gt; Crypto
          &lt;/button&gt;
          &lt;button
            className={`pay-tab ${tab === &quot;razorpay&quot; ? &quot;pay-tab-active&quot; : &quot;&quot;}`}
            onClick={() =&gt; setTab(&quot;razorpay&quot;)}
          &gt;
            &lt;CreditCard size={13} /&gt; Card / UPI
          &lt;/button&gt;
        &lt;/div&gt;

        &lt;div className=&quot;modal-plan-row&quot;&gt;
          &lt;span&gt;{plan.name} plan&lt;/span&gt;
          &lt;span className=&quot;modal-amount&quot;&gt;
            {plan.price}
            {tab === &quot;crypto&quot; &amp;&amp; cryptoOrder &amp;&amp; (
              &lt;span className=&quot;modal-amount-usdt&quot;&gt; ≈ {cryptoOrder.amount} USDT&lt;/span&gt;
            )}
          &lt;/span&gt;
        &lt;/div&gt;

        {tab === &quot;crypto&quot; ? (
          &lt;&gt;
            {cryptoError &amp;&amp; &lt;div className=&quot;rzp-error&quot;&gt;{cryptoError}&lt;/div&gt;}

            {!cryptoOrder &amp;&amp; !cryptoError &amp;&amp; (
              &lt;div className=&quot;rzp-box&quot;&gt;
                &lt;p&gt;Setting up your payment order…&lt;/p&gt;
              &lt;/div&gt;
            )}

            {cryptoOrder &amp;&amp; cryptoStatus === &quot;pending&quot; &amp;&amp; (
              &lt;&gt;
                &lt;div className=&quot;exact-amount-box&quot;&gt;
                  &lt;div className=&quot;exact-amount-label&quot;&gt;Send exactly&lt;/div&gt;
                  &lt;div className=&quot;exact-amount-value&quot;&gt;
                    {cryptoOrder.amount} USDT
                    &lt;button
                      className=&quot;copy-btn-inline&quot;
                      onClick={() =&gt; handleCopy(String(cryptoOrder.amount))}
                    &gt;
                      {copied ? &lt;Check size={12} /&gt; : &lt;Copy size={12} /&gt;}
                    &lt;/button&gt;
                  &lt;/div&gt;
                  &lt;div className=&quot;exact-amount-warn&quot;&gt;
                  The exact decimal amount matters — it&#x27;s how we identify your
                    payment. Sending a rounded amount will delay activation.
                  &lt;/div&gt;
                &lt;/div&gt;

                &lt;div className=&quot;qr-box&quot;&gt;
                  &lt;img src={qrUrl} alt=&quot;Payment QR code&quot; width={190} height={190} /&gt;
                &lt;/div&gt;

                &lt;div className=&quot;wallet-row&quot;&gt;
                  &lt;span className=&quot;wallet-addr&quot;&gt;{cryptoOrder.walletAddress}&lt;/span&gt;
                  &lt;button
                    className=&quot;copy-btn&quot;
                    onClick={() =&gt; handleCopy(cryptoOrder.walletAddress)}
                  &gt;
                    {copied ? &lt;Check size={13} /&gt; : &lt;Copy size={13} /&gt;}
                    {copied ? &quot;Copied&quot; : &quot;Copy&quot;}
                  &lt;/button&gt;
                &lt;/div&gt;

                &lt;div className=&quot;waiting-row&quot;&gt;
                  &lt;span className=&quot;pulse-dot&quot; /&gt;
                  Waiting for payment — this page updates automatically, no need
                  to refresh.
                &lt;/div&gt;

                &lt;div className=&quot;modal-note&quot;&gt;
                  Network: &lt;strong&gt;USDT-TRC20&lt;/strong&gt; only. Sending on any other
                  network will not be detected.
                &lt;/div&gt;
              &lt;/&gt;
            )}

            {cryptoStatus === &quot;paid&quot; &amp;&amp; (
              &lt;div className=&quot;rzp-box&quot;&gt;
                &lt;Check size={22} style={{ color: &quot;#E3A64B&quot;, marginBottom: 8 }} /&gt;
                &lt;p&gt;Payment received — your plan is now active.&lt;/p&gt;
              &lt;/div&gt;
            )}

            {cryptoStatus === &quot;expired&quot; &amp;&amp; (
              &lt;div className=&quot;rzp-box&quot;&gt;
                &lt;p&gt;This payment window expired. Close and reopen to get a fresh amount.&lt;/p&gt;
              &lt;/div&gt;
            )}
          &lt;/&gt;
        ) : (
          &lt;&gt;
            &lt;div className=&quot;rzp-box&quot;&gt;
              &lt;CreditCard size={22} style={{ color: &quot;#E3A64B&quot;, marginBottom: 8 }} /&gt;
              &lt;p&gt;
                Pay securely via Razorpay Checkout — cards, UPI, and netbanking.
                Your plan activates automatically the moment payment clears.
              &lt;/p&gt;
              &lt;button className=&quot;rzp-btn&quot; onClick={payWithRazorpay} disabled={rzpLoading}&gt;
                {rzpLoading ? &quot;Opening checkout…&quot; : `Pay ${plan.price} now`}
              &lt;/button&gt;
              {rzpError &amp;&amp; &lt;div className=&quot;rzp-error&quot;&gt;{rzpError}&lt;/div&gt;}
            &lt;/div&gt;
            &lt;div className=&quot;modal-demo-tag&quot;&gt;
              &lt;ShieldCheck size={12} /&gt; Requires the CandleVolt backend running with
              real Razorpay keys — see backend README.
            &lt;/div&gt;
          &lt;/&gt;
        )}
      &lt;/div&gt;
    &lt;/div&gt;
  );
}

// ---------------------------------------------------------------------------

export default function CandleVolt() {
  const [market, setMarket] = useState(&quot;crypto&quot;);
  const [view, setView] = useState(&quot;dashboard&quot;);
  const [menuOpen, setMenuOpen] = useState(false);
  const [series, setSeries] = useState(() =&gt; {
    const all = {};
    Object.values(ASSETS)
      .flat()
      .forEach((a) =&gt; {
        all[a.symbol] = seedSeries(a.base);
      });
    return all;
  });
  const [signals, setSignals] = useState([]);
  const [selected, setSelected] = useState(ASSETS.crypto[0].symbol);
  const [dashboardTf, setDashboardTf] = useState(&quot;1m&quot;);
  const [payingPlan, setPayingPlan] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(true);
                  // ---- Auth state ----
  // Defaults silently to a guest session on load — never a blocking popup.
  // Sign-in is opt-in via the profile button in the header / Account view.
  const [auth, setAuth] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const guestIdRef = useRef(null);

  const effectiveUserId = auth?.userId || guestIdRef.current;

  useEffect(() =&gt; {
    (async () =&gt; {
      const stored = loadStoredAuth();
      if (!stored) {
        if (!guestIdRef.current) guestIdRef.current = makeSessionId();
        setAuth({ userId: guestIdRef.current, email: null, plan: &quot;Free&quot;, guest: true, profile: {} });
        setAuthChecked(true);
        return;
      }
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${stored.token}` },
        });
        if (!res.ok) throw new Error(&quot;session invalid&quot;);
        const data = await res.json();
        setAuth({
          userId: data.userId,
          email: data.email,
          plan: data.plan,
          profile: data.profile || {},
          guest: false,
        });
      } catch {
        clearStoredAuth();
        if (!guestIdRef.current) guestIdRef.current = makeSessionId();
        setAuth({ userId: guestIdRef.current, email: null, plan: &quot;Free&quot;, guest: true, profile: {} });
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  const handleAuthenticated = ({ userId, email, plan, profile }) =&gt; {
    setAuth({ userId, email, plan, profile: profile || {}, guest: false });
    setShowAuthModal(false);
  };

  const handleProfileSaved = (profile) =&gt; {
    setAuth((prev) =&gt; (prev ? { ...prev, profile } : prev));
  };

  const handleLogout = () =&gt; {
    clearStoredAuth();
    guestIdRef.current = makeSessionId();
    setAuth({ userId: guestIdRef.current, email: null, plan: &quot;Free&quot;, guest: true, profile: {} });
    setView(&quot;dashboard&quot;);
  };

  const allAssets = Object.values(ASSETS).flat();

  useEffect(() =&gt; {
    const id = setInterval(() =&gt; setNow(Date.now()), 1000);
    return () =&gt; clearInterval(id);
  }, []);

  // Poll the real backend for prices — falls back to holding the last known
  // value (and flags &quot;offline&quot;) if the backend isn&#x27;t reachable yet.
  const pollPrices = useCallback(async () =&gt; {
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/api/prices`);
      if (!res.ok) throw new Error(&quot;bad response&quot;);
      const data = await res.json();
      if (!data || typeof data !== &quot;object&quot;) throw new Error(&quot;bad payload&quot;);
      setConnected(true);
      setSeries((prev) =&gt; {
        const next = { ...prev };
        Object.values(data).forEach((list) =&gt; {
          if (!Array.isArray(list)) return;
          list.forEach((entry) =&gt; {
            const symbol = entry?.symbol;
            const price = entry?.price;
            if (!symbol || price == null || Number.isNaN(price)) return;
            const arr = [...(next[symbol] || seedSeries(price))];
            arr.push(price);
            if (arr.length &gt; HISTORY_LEN) arr.shift();
            next[symbol] = arr;
          });
        });
        return next;
      });
    } catch (e) {
      console.warn(&quot;[CandleVolt] price poll failed:&quot;, e?.message);
      setConnected(false);
    }
  }, []);

  // Poll real signals for the active market — free-plan delay is enforced
  // server-side, so whatever we get back here is already correctly gated.
  const pollSignals = useCallback(async () =&gt; {
    if (!effectiveUserId) return;
    try {
      const res = await fetchWithTimeout(
        `${BACKEND_URL}/api/signals?market=${market}&amp;userId=${effectiveUserId}`
      );
      if (!res.ok) throw new Error(&quot;bad response&quot;);
      const data = await res.json();
      setSignals(Array.isArray(data?.signals) ? data.signals : []);
    } catch (e) {
      console.warn(&quot;[CandleVolt] signal poll failed:&quot;, e?.message);
      // keep whatever signals we already have rather than clearing them
    }
  }, [market, effectiveUserId]);

  useEffect(() =&gt; {
    pollPrices();
    pollSignals();
    const priceId = setInterval(pollPrices, POLL_MS);
    const sigId = setInterval(pollSignals, POLL_MS);
    return () =&gt; {
      clearInterval(priceId);
      clearInterval(sigId);
    };
  }, [pollPrices, pollSignals]);

  const tickerData = allAssets.map((a) =&gt; {
    const arr = series[a.symbol];
    const price = arr[arr.length - 1];
    const prev = arr[Math.max(0, arr.length - 6)];
    const pct = prev ? ((price - prev) / prev) * 100 : 0;
    return { symbol: a.symbol, price, up: price &gt;= prev, pct };
  });

  const visibleAssets = ASSETS[market];
  const currentPlan = auth?.plan || &quot;Free&quot;;
  const isFree = currentPlan === &quot;Free&quot;;

  const plans = [
    {
      name: &quot;Free&quot;,
      price: &quot;₹0&quot;,
      period: &quot;/mo&quot;,
      features: [&quot;3 signals / day&quot;, &quot;2–3 min delayed&quot;, &quot;Crypto only&quot;],
    },
    {
      name: &quot;Pro&quot;,
      price: &quot;₹999&quot;,
      period: &quot;/mo&quot;,
      features: [
        &quot;Unlimited signals&quot;,
        &quot;Real-time delivery&quot;,
        &quot;Crypto + Forex + Commodities&quot;,
        &quot;Entry / Target / Stop&quot;,
      ],
      highlight: true,
    },
    {
      name: &quot;Elite&quot;,
      price: &quot;₹2,499&quot;,
      period: &quot;/mo&quot;,
      features: [
        &quot;Everything in Pro&quot;,
        &quot;Memecoin signals&quot;,
        &quot;Confidence scoring&quot;,
        &quot;Priority signal queue&quot;,
      ],
    },
  ];

  return (
    &lt;div className=&quot;app-root&quot;&gt;
      &lt;style&gt;{`
        @import url(&#x27;https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&amp;family=IBM+Plex+Mono:wght@400;500;600&amp;family=Inter:wght@400;500;600&amp;display=swap&#x27;);
                  * { box-sizing: border-box; }
        html, body { margin: 0; overflow-x: hidden; max-width: 100%; }
        .app-root {
          background: radial-gradient(ellipse 1200px 600px at 50% -10%, #161B26 0%, #0A0D12 55%);
          min-height: 100vh;
          width: 100%;
          overflow-x: hidden;
          color: #EDEFF3;
          font-family: 'Inter', sans-serif;
          padding-bottom: 48px;
        }
        .ticker-wrap {
          overflow: hidden;
          border-bottom: 1px solid #232A3B;
          background: linear-gradient(180deg, #0F131B, #0A0D12);
          white-space: nowrap;
        }
        .ticker-track {
          display: inline-flex;
          animation: scroll 34s linear infinite;
          padding: 8px 0;
        }
        @keyframes scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .ticker-item {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          padding: 0 22px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          border-right: 1px solid #1B2130;
        }
        .ticker-sym { color: #9AA3B5; }
        .ticker-up { color: #E3A64B; }
        .ticker-down { color: #E2555A; }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 28px 18px;
          max-width: 1100px;
          margin: 0 auto;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 20px;
          letter-spacing: -0.01em;
        }
        .brand-mark {
          width: 30px; height: 30px;
          border-radius: 7px;
          background: linear-gradient(135deg, #F0B65C, #C97A2E);
          box-shadow: 0 2px 10px rgba(227,166,75,0.35);
          display: flex; align-items: center; justify-content: center;
          color: #0A0D12;
        }
        .live-pill {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-family: 'IBM Plex Mono', monospace;
          color: #9AA3B5;
          border: 1px solid #232A3B;
          background: #0F131B;
          padding: 5px 10px;
          border-radius: 20px;
        }
        .live-pill.offline { color: #E2555A; border-color: #3A1E20; }
        .header-right { display: flex; align-items: center; gap: 10px; }
        .menu-btn {
          background: none; border: none; color: #9AA3B5; cursor: pointer;
          padding: 4px; display: flex; align-items: center;
        }
        .menu-scrim {
          position: fixed; inset: 0; background: rgba(4,5,8,0);
          pointer-events: none; transition: background .2s ease; z-index: 60;
        }
        .menu-scrim-open { background: rgba(4,5,8,0.6); pointer-events: auto; }
        .side-menu {
          position: fixed; top: 0; left: 0; bottom: 0; width: 260px;
          background: linear-gradient(180deg, #161C29, #10141C);
          border-right: 1px solid #232A3B;
          box-shadow: 20px 0 60px rgba(0,0,0,0.4);
          transform: translateX(-100%); transition: transform .22s ease;
          z-index: 61; padding: 20px 14px; display: flex; flex-direction: column; gap: 4px;
        }
                  .side-menu-open { transform: translateX(0); }
        .side-menu-head {
          display: flex; align-items: center; gap: 10px;
          font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 17px;
          padding: 4px 10px 18px;
        }
        .side-menu-items { display: flex; flex-direction: column; gap: 4px; }
        .side-menu-item {
          display: flex; align-items: center; gap: 12px;
          padding: 11px 12px; border-radius: 8px; border: none; background: none;
          color: #9AA3B5; font-family: 'Inter', sans-serif; font-size: 13.5px;
          cursor: pointer; text-align: left;
        }
        .side-menu-item:hover { background: #171D2A; }
        .side-menu-item.active { background: linear-gradient(135deg, #1E2740, #171D2A); color: #E3A64B; font-weight: 600; box-shadow: inset 0 1px 0 rgba(227,166,75,0.1); }
        .coming-soon { text-align: center; padding: 26px 14px; }
        .coming-soon p { font-size: 12.5px; color: #9AA3B5; line-height: 1.7; max-width: 380px; margin: 0 auto; }
        .analysis-updated { font-size: 10.5px; color: #5C6478; font-family: 'IBM Plex Mono', monospace; margin-bottom: 12px; }
        .analysis-text { font-size: 13.5px; color: #EDEFF3; line-height: 1.8; white-space: pre-wrap; margin-bottom: 16px; }
        .cal-feed { display: flex; flex-direction: column; gap: 8px; max-height: 560px; overflow-y: auto; }
        .cal-item { background: #0D1017; border: 1px solid #1B2130; border-left: 3px solid #5C6478; border-radius: 8px; padding: 10px 12px; }
        .cal-high { border-left-color: #E2555A; }
        .cal-medium { border-left-color: #E3A64B; }
        .cal-low { border-left-color: #5C6478; }
        .cal-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .cal-country { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #9AA3B5; }
        .cal-impact { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; }
        .cal-impact-high { color: #E2555A; background: rgba(226,85,90,0.12); }
        .cal-impact-medium { color: #E3A64B; background: rgba(227,166,75,0.12); }
        .cal-impact-low { color: #9AA3B5; background: rgba(154,163,181,0.12); }
        .cal-title { font-size: 13px; color: #EDEFF3; font-weight: 500; margin-bottom: 4px; }
        .cal-time { font-size: 10.5px; color: #5C6478; font-family: 'IBM Plex Mono', monospace; margin-bottom: 6px; }
        .cal-figures { display: flex; gap: 12px; font-size: 10.5px; color: #9AA3B5; flex-wrap: wrap; }
        .account-guest-box { text-align: center; padding: 10px 0; }
        .account-guest-box p { font-size: 12.5px; color: #9AA3B5; margin-bottom: 14px; line-height: 1.6; }
        .account-info-row { display: flex; justify-content: space-between; align-items: center; }
        .account-email { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #EDEFF3; margin-bottom: 4px; }
        .account-plan-label { font-size: 11.5px; color: #9AA3B5; }
        .auth-badge { display: flex; align-items: center; gap: 8px; font-size: 11px; }
        .auth-badge-label { color: #9AA3B5; font-family: 'IBM Plex Mono', monospace; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .auth-badge-btn { background: #1A2030; border: 1px solid #232A3B; color: #E3A64B; font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 11px; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
        .profile-btn {
          width: 32px; height: 32px; border-radius: 50%; border: 1px solid #232A3B;
          background: #12161F; color: #9AA3B5; display: flex; align-items: center;
          justify-content: center; cursor: pointer; overflow: hidden; padding: 0;
        }
        .profile-btn-avatar { width: 100%; height: 100%; object-fit: cover; }
        .profile-avatar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .profile-avatar {
          width: 56px; height: 56px; border-radius: 50%; background: #0D1017;
          border: 1px solid #232A3B; display: flex; align-items: center; justify-content: center;
          color: #5C6478; cursor: pointer; overflow: hidden; flex-shrink: 0;
        }
        .profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .profile-bio { resize: none; font-family: 'Inter', sans-serif; }
        .profile-save-msg { font-size: 11.5px; color: #9AA3B5; margin-top: 8px; }
        .otp-hint { font-size: 12px; color: #9AA3B5; margin-bottom: 10px; }
        .auth-input {
          width: 100%; padding: 10px 12px; margin-bottom: 10px; border-radius: 8px;
          border: 1px solid #232A3B; background: #0D1017; color: #EDEFF3;
          font-family: 'Inter', sans-serif; font-size: 13px;
        }
        .auth-input:focus { outline: none; border-color: #3A2E1C; }
        .auth-switch { text-align: center; font-size: 12px; color: #9AA3B5; margin-top: 12px; }
        .auth-switch span { color: #E3A64B; cursor: pointer; font-weight: 600; }
        .auth-guest { text-align: center; font-size: 11.5px; color: #5C6478; margin-top: 14px; cursor: pointer; text-decoration: underline; }
        .live-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #E3A64B;
          animation: pulse 1.6s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
                  .container { max-width: 1100px; margin: 0 auto; padding: 0 28px; }

        .offline-banner {
          display: flex; align-items: center; gap: 8px;
          background: #1A1210; border: 1px solid #3A2418; color: #E3A64B;
          font-size: 12px; border-radius: 8px; padding: 9px 12px; margin-bottom: 16px;
        }

        .market-tabs {
          display: flex; gap: 6px; margin: 18px 0 20px; flex-wrap: wrap;
        }
        .tab-btn {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 600; font-size: 13px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid #232A3B;
          background: #12161F;
          color: #9AA3B5;
          cursor: pointer;
          transition: all .18s ease;
        }
        .tab-btn.active {
          background: linear-gradient(135deg, #1E2740, #171D2A);
          color: #E3A64B;
          border-color: #3A2E1C;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(227,166,75,0.1);
        }

        .layout {
          display: grid;
          grid-template-columns: 1.1fr 1.6fr;
          gap: 20px;
        }
        @media (max-width: 820px) {
          .layout { grid-template-columns: 1fr; }
        }

        .panel {
          background: linear-gradient(180deg, #141924, #10141C);
          border: 1px solid #1B2130;
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        }
        .panel-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 13px; font-weight: 600;
          color: #9AA3B5;
          text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 12px;
        }

        .asset-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 8px;
          border-radius: 8px;
          cursor: pointer;
          border: 1px solid transparent;
        }
        .asset-row:hover { background: #171D2A; }
        .asset-row.selected { border-color: #232A3B; background: #171D2A; }
        .asset-info { display: flex; flex-direction: column; gap: 2px; }
        .asset-sym { font-family: 'IBM Plex Mono', monospace; font-size: 13px; font-weight: 500; }
        .asset-price { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #9AA3B5; }
        .asset-chart { width: 90px; }

        .chart-hero {
          margin-top: 14px;
          padding: 14px;
          background: #0D1017;
          border-radius: 10px;
          border: 1px solid #1B2130;
        }
        .chart-hero-head {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-bottom: 6px;
        }
        .chart-hero-sym {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px;
        }
        .chart-hero-price {
          font-family: 'IBM Plex Mono', monospace; font-size: 14px; color: #E3A64B;
        }
        .candle-chart-box { width: 100%; max-width: 100%; border-radius: 6px; overflow: hidden; }
        .tf-bar { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
        .tf-btn {
          font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 500;
          padding: 5px 10px; border-radius: 6px; border: 1px solid #232A3B;
          background: #0D1017; color: #9AA3B5; cursor: pointer;
        }
        .tf-btn.active { color: #E3A64B; border-color: #3A2E1C; background: #171307; }
        .chart-symbol-picker { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
        .chart-page-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
        .chart-note { font-size: 10.5px; color: #5C6478; margin-top: 8px; line-height: 1.5; }

        .sig-feed { display: flex; flex-direction: column; gap: 10px; max-height: 620px; overflow-y: auto; }
        .sig-card {
          border-radius: 10px;
          padding: 13px 14px;
          border: 1px solid #1B2130;
          background: linear-gradient(180deg, #10141C, #0C0F15);
          border-left: 3px solid #E3A64B;
          position: relative;
          transition: transform .15s ease, box-shadow .15s ease;
        }
        .sig-card:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,0.3); }
        .sig-sell { border-left-color: #E2555A; }
        .sig-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .sig-dir { display: flex; align-items: center; gap: 5px; font-weight: 600; font-size: 12px; color: #E3A64B; font-family: 'Space Grotesk', sans-serif; }
        .sig-sell .sig-dir { color: #E2555A; }
        .sig-market { font-size: 10px; color: #5C6478; font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.05em; }
        .sig-symbol { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; margin-bottom: 8px; }
        .sig-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
        .sig-label { font-size: 10px; color: #5C6478; margin-bottom: 2px; }
        .sig-val { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; }
        .sig-val-up { color: #E3A64B; }
        .sig-val-down { color: #E2555A; }
        .sig-conf-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .sig-conf-track { flex: 1; height: 4px; background: #1B2130; border-radius: 4px; overflow: hidden; }
        .sig-conf-fill { height: 100%; border-radius: 4px; }
        .sig-conf-num { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #9AA3B5; width: 32px; text-align: right; }
        .sig-foot { display: flex; justify-content: space-between; font-size: 11px; color: #5C6478; }

        .sig-locked { min-height: 96px; }
        .blurred { filter: blur(5px); user-select: none; }
        .lock-overlay {
          position: absolute; inset: 0; top: 40px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 4px; color: #E3A64B; font-family: 'IBM Plex Mono', monospace; font-size: 12px;
          background: linear-gradient(180deg, rgba(13,16,23,0.4), rgba(13,16,23,0.92));
        }
        .lock-sub { color: #5C6478; font-size: 10.5px; font-family: 'Inter', sans-serif; }

        .empty-state { padding: 30px 10px; text-align: center; color: #5C6478; font-size: 13px; line-height: 1.6; }

        .news-feed { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
        .news-item {
          display: block; padding: 10px 12px; border-radius: 8px;
          background: #0D1017; border: 1px solid #1B2130;
          text-decoration: none; color: inherit;
        }
                  .news-item:hover { border-color: #232A3B; }
        .news-title { font-size: 12.5px; color: #EDEFF3; line-height: 1.5; margin-bottom: 6px; }
        .news-meta { display: flex; justify-content: space-between; font-size: 10.5px; }
        .news-source { color: #E3A64B; font-family: 'Space Grotesk', sans-serif; font-weight: 600; }
        .news-time { color: #5C6478; font-family: 'IBM Plex Mono', monospace; }

        .bottom-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;
        }
        @media (max-width: 820px) { .bottom-grid { grid-template-columns: 1fr; } }

        .stat-row { display: flex; justify-content: space-between; gap: 10px; }
        .stat-box {
          flex: 1; background: #0D1017; border: 1px solid #1B2130; border-radius: 10px; padding: 12px;
        }
        .stat-label { font-size: 10.5px; color: #5C6478; margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
        .stat-val { font-family: 'IBM Plex Mono', monospace; font-size: 18px; font-weight: 500; color: #EDEFF3; }
        .stat-val.gold { color: #E3A64B; }

        .plans-row { display: flex; flex-direction: column; gap: 10px; }
        .plan-card {
          border: 1px solid #1B2130; border-radius: 12px; padding: 13px 14px;
          background: #0D1017; cursor: pointer;
          transition: transform .15s ease, box-shadow .15s ease;
        }
        .plan-card.highlight {
          border: 1px solid transparent;
          background:
            linear-gradient(#14110A, #14110A) padding-box,
            linear-gradient(135deg, #E3A64B, #7A5620) border-box;
          box-shadow: 0 6px 20px rgba(227,166,75,0.12);
        }
        .plan-card.active { outline: 1.5px solid #E3A64B; }
        .plan-card:hover { transform: translateY(-1px); }
        .plan-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .plan-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; }
        .plan-price { font-family: 'IBM Plex Mono', monospace; font-size: 14px; color: #E3A64B; }
        .plan-price span { color: #5C6478; font-size: 11px; }
        .plan-feats { font-size: 11.5px; color: #9AA3B5; line-height: 1.9; margin-bottom: 10px; }
        .plan-pay-btn {
          width: 100%; padding: 8px; border-radius: 7px; border: 1px solid #3A2E1C;
          background: #1A2030; color: #E3A64B; font-family: 'Space Grotesk', sans-serif;
          font-weight: 600; font-size: 12px; cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 6px; transition: all .15s ease;
        }
        .plan-pay-btn:hover:not(:disabled) { background: #212940; box-shadow: 0 2px 10px rgba(227,166,75,0.15); }
        .plan-pay-btn:disabled { opacity: 0.35; cursor: default; }

        .disclaimer {
          margin-top: 24px; padding: 12px 14px; border-radius: 10px;
          background: #14110A; border: 1px solid #2A2013;
          font-size: 11.5px; color: #9AA3B5; display: flex; gap: 8px;
        }
        .disclaimer svg { flex-shrink: 0; margin-top: 1px; color: #E3A64B; }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #232A3B; border-radius: 4px; }

        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(4,5,8,0.72);
          backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 50; padding: 16px;
        }
        .modal-card {
          background: linear-gradient(180deg, #161C29, #12161F);
          border: 1px solid #232A3B; border-radius: 16px;
          padding: 18px; width: 100%; max-width: 340px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .modal-title { display: flex; align-items: center; gap: 7px; font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; color: #E3A64B; }
        .modal-close { background: none; border: none; color: #5C6478; cursor: pointer; padding: 4px; }
        .modal-plan-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; font-size: 13px; color: #9AA3B5; }
        .modal-amount { font-family: 'IBM Plex Mono', monospace; color: #EDEFF3; font-size: 14px; }
        .modal-amount-usdt { color: #E3A64B; font-size: 11.5px; }
        .pay-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
        .pay-tab {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 12px; font-family: 'Space Grotesk', sans-serif; font-weight: 600;
          padding: 8px; border-radius: 7px; border: 1px solid #232A3B; background: #0D1017;
          color: #9AA3B5; cursor: pointer;
        }
        .pay-tab-active { color: #E3A64B; border-color: #3A2E1C; background: #171307; }
        .network-chips { display: flex; gap: 6px; margin-bottom: 14px; }
        .chip { flex: 1; font-size: 10.5px; font-family: 'IBM Plex Mono', monospace; padding: 6px 4px; border-radius: 6px; border: 1px solid #232A3B; background: #0D1017; color: #9AA3B5; cursor: pointer; }
        .chip-active { border-color: #3A2E1C; color: #E3A64B; background: #171307; }
        .qr-box { display: flex; justify-content: center; padding: 12px; background: #0D1017; border: 1px solid #1B2130; border-radius: 10px; margin-bottom: 12px; }
        .qr-box img { border-radius: 6px; }
        .wallet-row { display: flex; align-items: center; gap: 8px; background: #0D1017; border: 1px solid #1B2130; border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; }
        .wallet-addr { flex: 1; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: #9AA3B5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .copy-btn { display: flex; align-items: center; gap: 4px; font-size: 11px; background: #1A2030; border: 1px solid #232A3B; color: #E3A64B; padding: 5px 8px; border-radius: 6px; cursor: pointer; }
        .modal-note { font-size: 11px; color: #9AA3B5; line-height: 1.6; margin-bottom: 10px; }
        .modal-demo-tag { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: #5C6478; }
        .rzp-box { text-align: center; padding: 18px 10px; background: #0D1017; border: 1px solid #1B2130; border-radius: 10px; margin-bottom: 12px; }
        .rzp-box p { font-size: 12px; color: #9AA3B5; line-height: 1.6; margin: 0 0 14px; }
        .rzp-btn {
          width: 100%; padding: 10px; border-radius: 8px; border: none;
          background: linear-gradient(135deg, #F0B65C, #C97A2E); color: #0A0D12;
          font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 13px; cursor: pointer;
          box-shadow: 0 4px 14px rgba(227,166,75,0.25); transition: transform .12s ease, box-shadow .12s ease;
        }
        .rzp-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(227,166,75,0.35); }
        .rzp-btn:disabled { opacity: 0.6; cursor: default; }
        .rzp-error { margin-top: 10px; color: #E2555A; font-size: 11.5px; }
        .exact-amount-box { background: #171307; border: 1px solid #3A2E1C; border-radius: 10px; padding: 12px; margin-bottom: 12px; text-align: center; }
        .exact-amount-label { font-size: 10.5px; color: #9AA3B5; margin-bottom: 4px; }
        .exact-amount-value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; color: #E3A64B; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .copy-btn-inline { background: none; border: none; color: #E3A64B; cursor: pointer; padding: 2px; }
        .exact-amount-warn { font-size: 10.5px; color: #9AA3B5; margin-top: 6px; line-height: 1.5; }
        .waiting-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: #9AA3B5; margin-bottom: 10px; }
        .pulse-dot { width: 7px; height: 7px; border-radius: 50%; background: #E3A64B; animation: pulse 1.6s ease-in-out infinite; flex-shrink: 0; }
      `}</style>

      <Ticker tickerData={tickerData} />

      <div className="header">
        <div className="brand">
          <button className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="brand-mark">
            <Zap size={16} strokeWidth={2.6} />
          </div>
          CandleVolt
        </div>
        <div className="header-right">
          <div className={`live-pill ${connected ? "" : "offline"}`}>
            {connected ? (
              <>
                <span className="live-dot" />
                LIVE · REAL FEED
              </>
            ) : (
              <>
                <WifiOff size={11} />
                BACKEND OFFLINE
              </>
            )}
          </div>
          {authChecked && auth && (
            <button className="profile-btn" onClick={() => setView("account")} aria-label="Profile">
              {auth.profile?.avatar ? (
                <img src={auth.profile.avatar} className="profile-btn-avatar" alt="" />
              ) : (
                <UserCircle size={20} />
              )}
            </button>
          )}
        </div>
      </div>
                  <div className="container">
        {!connected && (
          <div className="offline-banner">
            <WifiOff size={14} />
            Can't reach the CandleVolt backend at {BACKEND_URL}. Start it with
            <code style={{ margin: "0 4px" }}>npm start</code> in candlevolt-backend/,
            or update BACKEND_URL in this file to your deployed URL.
          </div>
        )}

        {view === "dashboard" && (
          <>
        <div className="market-tabs">
          {Object.keys(ASSETS).map((key) => (
            <button
              key={key}
              className={`tab-btn ${market === key ? "active" : ""}`}
              onClick={() => {
                setMarket(key);
                setSelected(ASSETS[key][0].symbol);
              }}
            >
              {MARKET_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="layout">
          {/* LEFT: asset watchlist + hero chart */}
          <div className="panel">
            <div className="panel-title">Watchlist</div>
            {visibleAssets.map((a) => {
              const arr = series[a.symbol];
              const price = arr[arr.length - 1];
              const prev = arr[0];
              const up = price >= prev;
              return (
                <div
                  key={a.symbol}
                  className={`asset-row ${selected === a.symbol ? "selected" : ""}`}
                  onClick={() => setSelected(a.symbol)}
                >
                  <div className="asset-info">
                    <span className="asset-sym">{a.symbol}</span>
                    <span className="asset-price">{fmtPrice(price, a.symbol)}</span>
                  </div>
                  <div className="asset-chart">
                    <Sparkline data={arr} positive={up} />
                  </div>
                </div>
              );
            })}

            <div className="chart-hero">
              <div className="chart-hero-head">
                <span className="chart-hero-sym">{selected}</span>
                <span className="chart-hero-price">
                  {fmtPrice(
                    (series[selected] || [])[((series[selected] || []).length || 1) - 1],
                    selected
                  )}
                </span>
              </div>
              {market === "crypto" || market === "meme" ? (
                <>
                  <TimeframeBar value={dashboardTf} onChange={setDashboardTf} />
                  <CandlestickChart symbol={selected} interval={dashboardTf} />
                </>
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={(series[selected] || []).map((v, i) => ({ i, v }))}>
                    <YAxis domain={["dataMin", "dataMax"]} hide />
                    <Line
                      type="monotone"
                      dataKey="v"
                      stroke="#E3A64B"
                      strokeWidth={1.8}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
              {market !== "crypto" && market !== "meme" && (
                <div className="chart-note">
                  Line chart — full candlesticks need a paid forex/commodities
                  data plan (free tier only gives the latest price, not OHLC).
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: signal feed */}
          <div className="panel">
            <div className="panel-title">
              <Radio size={12} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
              Signal Feed — {MARKET_LABELS[market]}
              {isFree && (
                <span style={{ color: "#5C6478", fontWeight: 400, textTransform: "none", marginLeft: 8 }}>
                  (Free plan — delayed 2–3 min)
                </span>
              )}
            </div>
            <div className="sig-feed">
              {signals.length === 0 && (
                <div className="empty-state">
                  {connected
                    ? `Scanning ${visibleAssets.map((a) => a.symbol).join(", ")} for real crossovers — signals appear here the moment one fires.`
                    : "Waiting for the backend to connect before showing real signals."}
                </div>
              )}
              {signals.map((sig) => (
                <SignalCard key={sig.id} sig={sig} locked={false} remainingMs={0} />
              ))}
            </div>
          </div>
        </div>
          </>
        )}
{view === "chart" && <ChartView />}
        {view === "news" && <NewsView />}
        {view === "calendar" && <CalendarView />}
        {view === "analysis" && <AnalysisView />}
        {view === "account" && (
          <AccountView
            auth={auth}
            onLogout={handleLogout}
            onShowAuth={() => setShowAuthModal(true)}
            onProfileSaved={handleProfileSaved}
            plans={plans}
            currentPlan={currentPlan}
            onSubscribe={(p) => setPayingPlan(p)}
          />
        )}
      </div>

      {payingPlan && (
        <PaymentModal
          plan={payingPlan}
          sessionId={effectiveUserId}
          onClose={() => setPayingPlan(null)}
          onActivated={(planName) => {
            setAuth((prev) => (prev ? { ...prev, plan: planName } : prev));
            setPayingPlan(null);
          }}
        />
      )}

      {showAuthModal && (
        <AuthModal onAuthenticated={handleAuthenticated} onClose={() => setShowAuthModal(false)} />
      )}

      <SideMenu
        open={menuOpen}
        activeView={view}
        onSelect={setView}
        onClose={() => setMenuOpen(false)}
      />
    </div>
  );
}
