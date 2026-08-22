import React, { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { createChart, ColorType, CandlestickSeries } from "lightweight-charts";
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

    const series = chart.addSeries(CandlestickSeries, {
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
        // keep showing the last known candles rather than clearing the chart
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

  // Real crypto order state — created on the backend so the exact amount
  // is unique to this order and can be auto-matched on-chain.
  const [cryptoOrder, setCryptoOrder] = useState(null);
  const [cryptoError, setCryptoError] = useState("");
  const [cryptoStatus, setCryptoStatus] = useState("pending"); // pending | paid | expired

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

  // Poll for automatic on-chain confirmation — no admin action needed.
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
        // ignore transient poll failures
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

// ---------------------------------------------------------------------------

export default function CandleVolt() {
  const [market, setMarket] = useState("crypto");
  const [series, setSeries] = useState(() => {
    const all = {};
    Object.values(ASSETS)
      .flat()
      .forEach((a) => {
        all[a.symbol] = seedSeries(a.base);
      });
    return all;
  });
