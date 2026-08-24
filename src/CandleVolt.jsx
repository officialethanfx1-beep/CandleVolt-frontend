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
} from "lucide-react";

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

function makeSessionId() {
  return `sess-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

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
  }
  return null;
}

function saveStoredAuth({ token, userId, email }) {
  try {
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_USERID, userId);
    if (email) localStorage.setItem(LS_EMAIL, email);
  } catch {
  }
}

function clearStoredAuth() {
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USERID);
    localStorage.removeItem(LS_EMAIL);
  } catch {
  }
}

function fetchWithTimeout(url, ms = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
}

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

function CandlestickChart({ symbol }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 220,
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

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetchWithTimeout(
          `${BACKEND_URL}/api/candles?symbol=${encodeURIComponent(symbol)}&limit=100`
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
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  return <div ref={containerRef} className="candle-chart-box" />;
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

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
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
  const [impact, setImpact] = useState("all");

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const url =
          impact === "all"
            ? `${BACKEND_URL}/api/calendar`
            : `${BACKEND_URL}/api/calendar?impact=${impact}`;
        const res = await fetchWithTimeout(url);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setEvents(Array.isArray(data?.events) ? data.events : []);
      } catch {
      }
    };
    poll();
    const id = setInterval(poll, 5 * 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [impact]);

  return (
    <div className="panel">
      <div className="panel-title">
        <CalendarClock size={12} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
        Market Calendar
      </div>
      <div className="market-tabs" style={{ marginBottom: 14 }}>
        {["all", "High", "Medium", "Low"].map((lvl) => (
          <button
            key={lvl}
            className={`tab-btn ${impact === lvl ? "active" : ""}`}
            onClick={() => setImpact(lvl)}
          >
            {lvl === "all" ? "All" : lvl}
          </button>
        ))}
      </div>
      <div className="cal-feed">
        {events.length === 0 && (
          <div className="empty-state">Fetching this week's economic calendar…</div>
        )}
        {events.map((e) => (
          <div key={e.id} className={`cal-item cal-${(e.impact || "").toLowerCase()}`}>
            <div className="cal-top">
              <span className="cal-country">{e.country}</span>
              <span className={`cal-impact cal-impact-${(e.impact || "").toLowerCase()}`}>
                {e.impact}
              </span>
            </div>
            <div className="cal-title">{e.title}</div>
            <div className="cal-time">{fmtEventTime(e.date)}</div>
            <div className="cal-figures">
              <span>Forecast: {e.forecast || "—"}</span>
              <span>Previous: {e.previous || "—"}</span>
              <span>Actual: {e.actual || "—"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalysisView() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/analysis`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAnalysis(data);
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    poll();
    const id = setInterval(poll, 5 * 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="panel">
      <div className="panel-title">
        <Sparkles size={12} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
        Daily Analysis
      </div>

      {loading && (
        <div className="empty-state">Loading the latest briefing…</div>
      )}

      {!loading && !analysis?.text && (
        <div className="coming-soon">
          <Sparkles size={28} style={{ color: "#5C6478", marginBottom: 10 }} />
          <p>No briefing generated yet — check back shortly.</p>
        </div>
      )}

      {!loading && analysis?.text && (
        <>
          <div className="analysis-updated">
            Last updated {timeAgoShort(analysis.generatedAt)}
          </div>
          <div className="analysis-text">{analysis.text}</div>
          <div className="disclaimer">
            <ShieldCheck size={16} />
            <span>
              AI-generated read on current conditions — not a guaranteed
              prediction. Always do your own research before trading.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function AccountView({ auth, onLogout, onShowAuth, plans, currentPlan, onSubscribe }) {
  return (
    <>
      <div className="panel">
        <div className="panel-title">
          <UserCircle size={12} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
          Account
        </div>
        {auth?.guest ? (
          <div className="account-guest-box">
            <p>You're browsing as a guest — your plan won't be saved if you clear this device.</p>
            <button className="rzp-btn" onClick={onShowAuth}>
              Sign up or log in
            </button>
          </div>
        ) : (
          <div className="account-info-row">
            <div>
              <div className="account-email">{auth?.email}</div>
              <div className="account-plan-label">Current plan: {currentPlan}</div>
            </div>
            <button className="auth-badge-btn" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-title">
          <Crown size={12} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
          Subscription Plans
        </div>
        <div className="plans-row">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`plan-card ${p.highlight ? "highlight" : ""} ${
                currentPlan === p.name ? "active" : ""
              }`}
            >
              <div className="plan-head">
                <span className="plan-name">
                  {p.name === "Elite" && <Crown size={13} />}
                  {p.name}
                </span>
                <span className="plan-price">
                  {p.price}
                  <span>{p.period}</span>
                </span>
              </div>
              <div className="plan-feats">
                {p.features.map((f) => (
                  <div key={f} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <ChevronRight size={11} style={{ flexShrink: 0, color: "#5C6478" }} />
                    {f}
                  </div>
                ))}
              </div>
              <button
                className="plan-pay-btn"
                disabled={p.name === "Free"}
                onClick={() => onSubscribe(p)}
              >
                <QrCode size={13} />
                {p.name === "Free" ? "Current plan" : "Subscribe"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-title">
          <Wallet size={12} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
          Your Earnings
        </div>
        <div className="stat-row">
          <div className="stat-box">
            <div className="stat-label"><Users size={11} /> Subscribers</div>
            <div className="stat-val">312</div>
          </div>
          <div className="stat-box">
            <div className="stat-label"><Wallet size={11} /> This Month</div>
            <div className="stat-val gold">₹1,86,400</div>
          </div>
          <div className="stat-box">
            <div className="stat-label"><Crown size={11} /> Elite Users</div>
            <div className="stat-val">44</div>
          </div>
        </div>
        <div className="disclaimer">
          <ShieldCheck size={16} />
          <span>
            Illustrative numbers — wire them to your real user table (see
            backend db.js) once you have paying users.
          </span>
        </div>
      </div>
    </>
  );
}

function AuthModal({ onAuthenticated, onGuest }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/auth/${mode === "login" ? "login" : "signup"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      saveStoredAuth({ token: data.token, userId: data.userId, email: data.email });
      onAuthenticated({ userId: data.userId, email: data.email, plan: data.plan });
    } catch {
      setError("Couldn't reach the server — try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-title" style={{ marginBottom: 16 }}>
          <Zap size={16} /> {mode === "login" ? "Log in" : "Create your account"}
        </div>

        <input
          className="auth-input"
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="auth-input"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        {error && <div className="rzp-error">{error}</div>}

        <button className="rzp-btn" onClick={submit} disabled={loading}>
          {loading ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>

        <div className="auth-switch">
          {mode === "login" ? (
            <>
              Don't have an account?{" "}
              <span onClick={() => setMode("signup")}>Sign up</span>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <span onClick={() => setMode("login")}>Log in</span>
            </>
          )}
        </div>

        <div className="auth-guest" onClick={onGuest}>
          Continue as guest
        </div>
      </div>
    </div>
  );
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function PaymentModal({ plan, sessionId, onClose, onActivated }) {
  const [tab, setTab] = useState("crypto");
  const [copied, setCopied] = useState(false);
  const [rzpLoading, setRzpLoading] = useState(false);
  const [rzpError, setRzpError] = useState("");

  const [cryptoOrder, setCryptoOrder] = useState(null);
  const [cryptoError, setCryptoError] = useState("");
  const [cryptoStatus, setCryptoStatus] = useState("pending");

  useEffect(() => {
    if (tab !== "crypto" || cryptoOrder) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/subscribe/create-crypto-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: sessionId, planName: plan.name }),
        });
        if (!res.ok) throw new Error("bad response");
        const data = await res.json();
        if (!cancelled) setCryptoOrder(data);
      } catch {
        if (!cancelled)
          setCryptoError("Couldn't reach the backend to create a payment order.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, cryptoOrder, sessionId, plan.name]);

  useEffect(() => {
    if (!cryptoOrder || cryptoStatus !== "pending") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/subscribe/crypto-status?orderId=${cryptoOrder.orderId}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "paid") {
          setCryptoStatus("paid");
          onActivated(plan.name);
        } else if (data.status === "expired") {
          setCryptoStatus("expired");
        }
      } catch {
      }
    }, 5000);
    return () => clearInterval(id);
  }, [cryptoOrder, cryptoStatus, onActivated, plan.name]);

  const qrUrl = cryptoOrder
    ? `https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=8&color=237-166-75&bgcolor=13-16-23&data=${encodeURIComponent(
        cryptoOrder.walletAddress
      )}`
    : null;

  const handleCopy = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const payWithRazorpay = async () => {
    setRzpError("");
    setRzpLoading(true);
    try {
      const orderRes = await fetch(`${BACKEND_URL}/api/subscribe/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: sessionId, planName: plan.name }),
      });
      if (!orderRes.ok) throw new Error("Order creation failed");
      const order = await orderRes.json();

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Could not load Razorpay checkout");

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "CandleVolt",
        description: `${plan.name} plan`,
        theme: { color: "#E3A64B" },
        handler: async (response) => {
          try {
            const verifyRes = await fetch(`${BACKEND_URL}/api/subscribe/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
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
              setRzpError("Payment captured but verification failed — contact support.");
            }
          } catch {
            setRzpError("Verification request failed.");
          }
        },
      });
      rzp.on("payment.failed", () => setRzpError("Payment failed or was cancelled."));
      rzp.open();
    } catch (e) {
      setRzpError(
        e.message === "Order creation failed"
          ? "Couldn't reach the backend — is it running and is BACKEND_URL set correctly?"
          : e.message
      );
    } finally {
      setRzpLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <QrCode size={16} /> Subscribe — {plan.name}
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="pay-tabs">
          <button
            className={`pay-tab ${tab === "crypto" ? "pay-tab-active" : ""}`}
            onClick={() => setTab("crypto")}
          >
            <QrCode size={13} /> Crypto
          </button>
          <button
            className={`pay-tab ${tab === "razorpay" ? "pay-tab-active" : ""}`}
            onClick={() => setTab("razorpay")}
          >
            <CreditCard size={13} /> Card / UPI
          </button>
        </div>

        <div className="modal-plan-row">
          <span>{plan.name} plan</span>
          <span className="modal-amount">
            {plan.price}
            {tab === "crypto" && cryptoOrder && (
              <span className="modal-amount-usdt"> ≈ {cryptoOrder.amount} USDT</span>
            )}
          </span>
        </div>

        {tab === "crypto" ? (
          <>
            {cryptoError && <div className="rzp-error">{cryptoError}</div>}

            {!cryptoOrder && !cryptoError && (
              <div className="rzp-box">
                <p>Setting up your payment order…</p>
              </div>
            )}

            {cryptoOrder && cryptoStatus === "pending" && (
              <>
                <div className="exact-amount-box">
                  <div className="exact-amount-label">Send exactly</div>
                  <div className="exact-amount-value">
                    {cryptoOrder.amount} USDT
                    <button
                      className="copy-btn-inline"
                      onClick={() => handleCopy(String(cryptoOrder.amount))}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <div className="exact-amount-warn">
                    The exact decimal amount matters — it's how we identify your
                    payment. Sending a rounded amount will delay activation.
                  </div>
                </div>

                <div className="qr-box">
                  <img src={qrUrl} alt="Payment QR code" width={190} height={190} />
                </div>

                <div className="wallet-row">
                  <span className="wallet-addr">{cryptoOrder.walletAddress}</span>
                  <button
                    className="copy-btn"
                    onClick={() => handleCopy(cryptoOrder.walletAddress)}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <div className="waiting-row">
                  <span className="pulse-dot" />
                  Waiting for payment — this page updates automatically, no need
                  to refresh.
                </div>

                <div className="modal-note">
                  Network: <strong>USDT-TRC20</strong> only. Sending on any other
                  network will not be detected.
                </div>
              </>
            )}

            {cryptoStatus === "paid" && (
              <div className="rzp-box">
                <Check size={22} style={{ color: "#E3A64B", marginBottom: 8 }} />
                <p>Payment received — your plan is now active.</p>
              </div>
            )}

            {cryptoStatus === "expired" && (
              <div className="rzp-box">
                <p>This payment window expired. Close and reopen to get a fresh amount.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="rzp-box">
              <CreditCard size={22} style={{ color: "#E3A64B", marginBottom: 8 }} />
              <p>
                Pay securely via Razorpay Checkout — cards, UPI, and netbanking.
                Your plan activates automatically the moment payment clears.
              </p>
              <button className="rzp-btn" onClick={payWithRazorpay} disabled={rzpLoading}>
                {rzpLoading ? "Opening checkout…" : `Pay ${plan.price} now`}
              </button>
              {rzpError && <div className="rzp-error">{rzpError}</div>}
            </div>
            <div className="modal-demo-tag">
              <ShieldCheck size={12} /> Requires the CandleVolt backend running with
              real Razorpay keys — see backend README.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CandleVolt() {
  const [market, setMarket] = useState("crypto");
  const [view, setView] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [series, setSeries] = useState(() => {
    const all = {};
    Object.values(ASSETS)
      .flat()
      .forEach((a) => {
        all[a.symbol] = seedSeries(a.base);
      });
    return all;
  });
  const [signals, setSignals] = useState([]);
  const [selected, setSelected] = useState(ASSETS.crypto[0].symbol);
  const [payingPlan, setPayingPlan] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(true);

  const [auth, setAuth] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const guestIdRef = useRef(null);

  const effectiveUserId = auth?.userId || guestIdRef.current;

  useEffect(() => {
    (async () => {
      const stored = loadStoredAuth();
      if (!stored) {
        setAuthChecked(true);
        setShowAuthModal(true);
        return;
      }
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${stored.token}` },
        });
        if (!res.ok) throw new Error("session invalid");
        const data = await res.json();
        setAuth({ userId: data.userId, email: data.email, plan: data.plan, guest: false });
      } catch {
        clearStoredAuth();
        setShowAuthModal(true);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  const handleAuthenticated = ({ userId, email, plan }) => {
    setAuth({ userId, email, plan, guest: false });
    setShowAuthModal(false);
  };

  const handleGuest = () => {
    if (!guestIdRef.current) guestIdRef.current = makeSessionId();
    setAuth({ userId: guestIdRef.current, email: null, plan: "Free", guest: true });
    setShowAuthModal(false);
  };

  const handleLogout = () => {
    clearStoredAuth();
    setAuth(null);
    setShowAuthModal(true);
  };

  const allAssets = Object.values(ASSETS).flat();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const pollPrices = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/api/prices`);
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      if (!data || typeof data !== "object") throw new Error("bad payload");
      setConnected(true);
      setSeries((prev) => {
        const next = { ...prev };
        Object.values(data).forEach((list) => {
          if (!Array.isArray(list)) return;
          list.forEach((entry) => {
            const symbol = entry?.symbol;
            const price = entry?.price;
            if (!symbol || price == null || Number.isNaN(price)) return;
            const arr = [...(next[symbol] || seedSeries(price))];
            arr.push(price);
            if (arr.length > HISTORY_LEN) arr.shift();
            next[symbol] = arr;
          });
        });
        return next;
      });
    } catch (e) {
      console.warn("[CandleVolt] price poll failed:", e?.message);
      setConnected(false);
    }
  }, []);

  const pollSignals = useCallback(async () => {
    if (!effectiveUserId) return;
    try {
      const res = await fetchWithTimeout(
        `${BACKEND_URL}/api/signals?market=${market}&userId=${effectiveUserId}`
      );
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      setSignals(Array.isArray(data?.signals) ? data.signals : []);
    } catch (e) {
      console.warn("[CandleVolt] signal poll failed:", e?.message);
    }
  }, [market, effectiveUserId]);

  useEffect(() => {
    pollPrices();
    pollSignals();
    const priceId = setInterval(pollPrices, POLL_MS);
    const sigId = setInterval(pollSignals, POLL_MS);
    return () => {
      clearInterval(priceId);
      clearInterval(sigId);
    };
  }, [pollPrices, pollSignals]);

  const tickerData = allAssets.map((a) => {
    const arr = series[a.symbol];
    const price = arr[arr.length - 1];
    const prev = arr[Math.max(0, arr.length - 6)];
    const pct = prev ? ((price - prev) / prev) * 100 : 0;
    return { symbol: a.symbol, price, up: price >= prev, pct };
  });

  const visibleAssets = ASSETS[market];
  const currentPlan = auth?.plan || "Free";
  const isFree = currentPlan === "Free";

  const plans = [
    {
      name: "Free",
      price: "₹0",
      period: "/mo",
      features: ["3 signals / day", "2–3 min delayed", "Crypto only"],
    },
    {
      name: "Pro",
      price: "₹999",
      period: "/mo",
      features: [
        "Unlimited signals",
        "Real-time delivery",
        "Crypto + Forex + Commodities",
        "Entry / Target / Stop",
      ],
      highlight: true,
    },
    {
      name: "Elite",
      price: "₹2,499",
      period: "/mo",
      features: [
        "Everything in Pro",
        "Memecoin signals",
        "Confidence scoring",
        "Priority signal queue",
      ],
    },
  ];

  return (
    <div className="app-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');

        * { box-sizing: border-box; 
        .app-root {
          background: radial-gradient(ellipse 1200px 600px at 50% -10%, #161B26 0%, #0A0D12 55%);
          min-height: 100vh;
          color: #EDEFF3;
          font-family: 'Inter', sans-serif;
          padding-bottom: 48px;
        }
        .ticker-wrap {
          overflow: hidden;
          border-bottom: 1px solid #232A3B;
          background: #0D1017;
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
          background: #12161F; border-right: 1px solid #232A3B;
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
        .side-menu-item.active { background: #1A2030; color: #E3A64B; font-weight: 600; }
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
        .candle-chart-box { width: 100%; border-radius: 6px; overflow: hidden; }
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
          display: flex; align-items: center; justify-content: center;
          z-index: 50; padding: 16px;
        }
        .modal-card {
          background: #12161F; border: 1px solid #232A3B; border-radius: 14px;
          padding: 18px; width: 100%; max-width: 340px;
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
          background: linear-gradient(135deg, #E3A64B, #C97A2E); color: #0A0D12;
          font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 13px; cursor: pointer;
        }
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
            <div className="auth-badge">
              {auth.guest ? (
                <>
                  <span className="auth-badge-label">Guest</span>
                  <button className="auth-badge-btn" onClick={() => setShowAuthModal(true)}>
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  <span className="auth-badge-label">{auth.email}</span>
                  <button className="auth-badge-btn" onClick={handleLogout}>
                    Log out
                  </button>
                </>
              )}
            </div>
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
                <CandlestickChart symbol={selected} />
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

        {view === "news" && <NewsView />}
        {view === "calendar" && <CalendarView />}
        {view === "analysis" && <AnalysisView />}
        {view === "account" && (
          <AccountView
            auth={auth}
            onLogout={handleLogout}
            onShowAuth={() => setShowAuthModal(true)}
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
        <AuthModal onAuthenticated={handleAuthenticated} onGuest={handleGuest} />
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
