import { useState, useEffect } from 'react'
import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom'
import './App.css'

// Call the API directly from the browser.
// Prefer Vite env var, fall back to the public domain (not the :8000 port).
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  'https://api.predictionshift.com'

// Polymarket API — default to the hosted API to avoid local proxy failures
// when port 8001 is not running. Set VITE_POLY_API_BASE=/poly to use the
// local Vite proxy in development.
const POLY_API_BASE =
  import.meta.env.VITE_POLY_API_BASE ||
  'https://api.predictionshift.com/poly'

const KALSHI_LOGO_URL = '/kalshi-logo.svg'
const POLYMARKET_LOGO_URL = '/poly-icon-blue.svg'

export async function getHealth() {
  const response = await fetch(`${API_BASE}/health`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

// Module-level cache shared across all hook calls (stale-while-revalidate)
// TTL = 55 minutes so data refreshes just before the hourly cadence
const _apiCache = new Map()
const CACHE_TTL = 55 * 60 * 1000

function _cachedFetch(url, setter, setLoading, setError, signal) {
  const cached = _apiCache.get(url)
  if (cached) {
    // Serve stale data immediately — no spinner
    setter(cached.data)
    setLoading(false)
    // If still fresh, skip network request
    if (Date.now() - cached.ts < CACHE_TTL) return
  }

  fetch(url, { signal })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((json) => {
      _apiCache.set(url, { data: json, ts: Date.now() })
      setter(json)
    })
    .catch((err) => {
      if (err.name !== 'AbortError') setError(err)
    })
    .finally(() => setLoading(false))
}

function useApi(endpoint, params) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const query = params ? `?${new URLSearchParams(params).toString()}` : ''
    const url = `${API_BASE}${endpoint}${query}`

    setError(null)
    _cachedFetch(url, setData, setLoading, setError, controller.signal)

    return () => controller.abort()
  }, [endpoint, JSON.stringify(params)])

  return { data, loading, error }
}

function usePolyApi(endpoint, params) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const query = params ? `?${new URLSearchParams(params).toString()}` : ''
    const url = `${POLY_API_BASE}${endpoint}${query}`

    setError(null)
    _cachedFetch(url, setData, setLoading, setError, controller.signal)

    return () => controller.abort()
  }, [endpoint, JSON.stringify(params)])

  return { data, loading, error }
}

const KALSHI_CATEGORIES = [
  'Trending', 'Politics', 'Sports', 'Culture', 'Crypto',
  'Climate', 'Economics', 'Mentions', 'Companies', 'Financials', 'Tech & Science',
]

const POLY_CATEGORIES = [
  'Trending', 'Breaking', 'New', 'Politics', 'Sports', 'Crypto',
  'Finance', 'Geopolitics', 'Earnings', 'Tech', 'Culture',
  'World', 'Economy', 'Climate & Science', 'Mentions',
]

const TOP_CHANGES_METRICS = {
  kalshi: [
    { value: 'volume', label: 'Volume' },
    { value: 'open_interest', label: 'Open Interest' },
    { value: 'mid', label: 'Mid' },
    { value: 'spread_ticks', label: 'Spread (ticks)' },
  ],
  poly: [
    { value: 'volume', label: 'Volume' },
    { value: 'volume_24hr', label: 'Volume (24h)' },
    { value: 'liquidity', label: 'Liquidity' },
    { value: 'outcome_yes_price', label: 'YES Price' },
  ],
}

const TOP_CHANGES_MAX_ROWS = 10

function Last24hChangesPanel({ defaultProvider = 'kalshi' }) {
  const [provider, setProvider] = useState(defaultProvider)
  const [metric, setMetric] = useState('volume')
  const [limit, setLimit] = useState(TOP_CHANGES_MAX_ROWS)
  const [minPrevValue, setMinPrevValue] = useState(0)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [sortBy, setSortBy] = useState('delta_value')
  const [sortDir, setSortDir] = useState('desc')

  const metricOptions = TOP_CHANGES_METRICS[provider] ?? []

  useEffect(() => {
    if (!metricOptions.some((opt) => opt.value === metric)) {
      setMetric(metricOptions[0]?.value ?? 'volume')
    }
  }, [provider])

  useEffect(() => {
    const controller = new AbortController()
    const base = provider === 'kalshi' ? API_BASE : POLY_API_BASE
    const query = new URLSearchParams({
      metric,
      limit: String(limit),
      min_prev_value: String(minPrevValue),
    }).toString()

    setLoading(true)
    setError(null)

    fetch(`${base}/markets/top-changes-24h?${query}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`)
          err.status = res.status
          err.body = await res.text()
          throw err
        }
        return res.json()
      })
      .then((json) => setRows(Array.isArray(json) ? json : []))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err)
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [provider, metric, limit, minPrevValue, retryNonce])

  const formatValue = (value) => {
    if (typeof value !== 'number') return value ?? '—'
    if (Math.abs(value) >= 1000) return value.toLocaleString('en-US')
    return value.toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
  }

  const formatPct = (value) => {
    if (typeof value !== 'number') return '—'
    return `${value.toFixed(2)}%`
  }

  const getIdentifier = (row) => {
    if (provider === 'kalshi') return row.market_ticker ?? '—'
    return row.condition_id ?? '—'
  }

  const getTitle = (row) => {
    if (provider === 'kalshi') return row.title ?? '—'
    return row.question ?? '—'
  }

  const getComparableValue = (row, key) => {
    if (key === 'identifier') return String(getIdentifier(row)).toLowerCase()
    if (key === 'title') return String(getTitle(row)).toLowerCase()
    const value = row[key]
    if (typeof value === 'number') return value
    if (value === null || value === undefined) return Number.NEGATIVE_INFINITY
    const asNum = Number(value)
    if (!Number.isNaN(asNum)) return asNum
    return String(value).toLowerCase()
  }

  const sortedRows = [...rows].sort((a, b) => {
    const av = getComparableValue(a, sortBy)
    const bv = getComparableValue(b, sortBy)
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(column)
    setSortDir(column === 'identifier' || column === 'title' ? 'asc' : 'desc')
  }

  const renderSortArrow = (column) => {
    if (sortBy !== column) return '↕'
    return sortDir === 'asc' ? '↑' : '↓'
  }

  return (
    <div className="panel" style={{ marginTop: '1rem' }}>
      <div className="panel-header">
        <div className="panel-title">Last 24h Changes</div>
      </div>
      <div className="panel-body">

        {loading && <div className="loading">Loading 24h changes…</div>}

        {!loading && error?.status === 400 && (
          <div className="error">Unsupported metric for selected provider.</div>
        )}

        {!loading && error?.status === 500 && (
          <div className="top-changes-retry">
            <div className="error">
              Backend snapshot issue while loading last 24h changes.
            </div>
            <button
              type="button"
              onClick={() => setRetryNonce((n) => n + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && error && error.status !== 400 && error.status !== 500 && (
          <div className="error">{error.message}</div>
        )}

        {!loading && !error && rows.length === 0 && (
          <span className="muted">No markets matched this filter in last 24h.</span>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="markets-table-scroll">
            <table className="markets-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('title')} className="sortable-header">
                    Title / Question {renderSortArrow('title')}
                  </th>
                  {provider === 'kalshi' && (
                    <th onClick={() => handleSort('identifier')} className="sortable-header">
                      Identifier {renderSortArrow('identifier')}
                    </th>
                  )}
                  <th onClick={() => handleSort('current_value')} className="sortable-header">
                    Current {renderSortArrow('current_value')}
                  </th>
                  <th onClick={() => handleSort('prev_value')} className="sortable-header">
                    Previous {renderSortArrow('prev_value')}
                  </th>
                  <th onClick={() => handleSort('delta_value')} className="sortable-header">
                    Delta {renderSortArrow('delta_value')}
                  </th>
                  <th onClick={() => handleSort('pct_change')} className="sortable-header">
                    % Change {renderSortArrow('pct_change')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.slice(0, TOP_CHANGES_MAX_ROWS).map((row, idx) => {
                  const delta = row.delta_value
                  const deltaClass = typeof delta === 'number'
                    ? delta > 0
                      ? 'delta-positive'
                      : delta < 0
                        ? 'delta-negative'
                        : ''
                    : ''
                  return (
                    <tr key={`${getIdentifier(row)}-${idx}`}>
                      <td>{getTitle(row)}</td>
                      {provider === 'kalshi' && <td>{getIdentifier(row)}</td>}
                      <td>{formatValue(row.current_value)}</td>
                      <td>{formatValue(row.prev_value)}</td>
                      <td className={deltaClass}>{formatValue(row.delta_value)}</td>
                      <td>{formatPct(row.pct_change)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function LandingPage() {
  return (
    <main className="page">
      <section className="hero">
        <div className="hero-content">
          <h1>Markets reveal truth before headlines.</h1>

          <p className="subhead">
            We track prediction markets and news in real time to show how
            collective belief is shifting, before it’s obvious.
          </p>

          <ul className="features">
            <li>📈 Market-implied probabilities over time</li>
            <li>📰 News vs market divergence signals</li>
            <li>⚡ Real-time Kalshi &amp; Polymarket analytics</li>
          </ul>

          <form
            className="signup"
            method="POST"
            action="https://formspree.io/f/maqodkvw"
          >
            <input
              name="email"
              type="email"
              placeholder="you@email.com"
              required
            />
            <button type="submit">Notify me</button>
          </form>

          <p className="fineprint">No spam. One insight-heavy email per day. <br />
            This site provides informational market data only and does not
            constitute financial, investment, or trading advice. Past market
            performance and tradability scores are not indicative of future
            results. Always do your own research and consult a qualified
            advisor before making investment decisions.
          </p>
          

          <Link to="/dashboard" className="enter-dashboard">
            Enter dashboard <span>→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}

function Dashboard() {
  const [activeCategory, setActiveCategory] = useState('Trending')
  const eventsByVolume = useApi('/top-events-volume')
  const spreadBlowouts = useApi('/markets/spread-blowouts')
  const expiringSoon = useApi('/markets/expiring-soon')
  const marketMovers = useApi('/market-movers')
  const globalDeltas = useApi('/global-6h-deltas', { limit: 150 })

  let latestIndex = null
  let shiftChartSeries = null

  if (Array.isArray(globalDeltas.data) && globalDeltas.data.length > 0) {
    const deltas = [...globalDeltas.data].slice().reverse()

    const baseVol = deltas[0].d_volume_6h || 1
    const baseOi = deltas[0].d_oi_6h || 1
    const baseWide = deltas[0].d_wide_6h || 1

    const values = deltas.map((row) => {
      const relVol = row.d_volume_6h / baseVol
      const relOi = row.d_oi_6h / baseOi
      const relWide = row.d_wide_6h / baseWide
      return (100 * (relVol + relOi + relWide)) / 3
    })
    const times = deltas.map((row) => row.snap_ts)

    shiftChartSeries = [{ label: 'Market Shift Index', values, times, color: '#6366f1' }]
    latestIndex = values[values.length - 1]
  }

  const fmtNum = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v)
  const fmtDec = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : v)
  const fmtCompact = (v) => {
    if (typeof v !== 'number') return '—'
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
    if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'K'
    return v.toLocaleString('en-US')
  }

  // compute time-until-expiry helper
  const timeUntilK = (dateStr) => {
    if (!dateStr) return ''
    const diff = new Date(dateStr) - new Date()
    if (diff <= 0) return 'Expired'
    const hrs = Math.floor(diff / 3600000)
    const mins = Math.floor((diff % 3600000) / 60000)
    if (hrs >= 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
    return `${hrs}h ${mins}m`
  }

  // ── Hero stat aggregates from time-windowed delta rows ──
  const now = Date.now()
  const deltaRows = Array.isArray(globalDeltas.data) ? globalDeltas.data : []
  const rows24h = deltaRows.filter((r) => r.snap_ts && (now - new Date(r.snap_ts).getTime()) < 86_400_000)
  const rows30d = deltaRows.filter((r) => r.snap_ts && (now - new Date(r.snap_ts).getTime()) < 30 * 86_400_000)
  const sumField = (rows, field) => rows.reduce((s, r) => s + (typeof r[field] === 'number' ? r[field] : 0), 0)

  const heroVol24h   = rows24h.length > 0 ? sumField(rows24h, 'd_volume_6h') : null
  const heroVol30d   = rows30d.length > 0 ? sumField(rows30d, 'd_volume_6h') : null
  const heroOi24h    = rows24h.length > 0 ? sumField(rows24h, 'd_oi_6h')     : null
  const heroOi30d    = rows30d.length > 0 ? sumField(rows30d, 'd_oi_6h')     : null
  const heroWide24h  = rows24h.length > 0 ? sumField(rows24h, 'd_wide_6h')   : null
  const heroWide30d  = rows30d.length > 0 ? sumField(rows30d, 'd_wide_6h')   : null

  // latest delta for hero stats
  const latestDelta = deltaRows.length > 0 ? deltaRows[0] : null

  return (
    <div className="dashboard kalshi-dash">
      <p className="seo-blurb">
        Market Shift Index hourly deltas, real-time market movers, top events by traded volume, spread blowouts, expiring contracts, and global order-flow metrics across prediction markets.
      </p>
      <h2 className="dashboard-title">
        <img
          src={KALSHI_LOGO_URL}
          alt="Kalshi logo"
          className="dashboard-title-logo dashboard-title-logo--kalshi"
          loading="lazy"
        />
        <span>Prediction Market Dashboard</span>
      </h2>

      <nav className="category-subnav">
        {KALSHI_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`category-subnav-item${activeCategory === cat ? ' category-subnav-item--active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </nav>

      {/* ═══ HERO STATS BAR ═══ */}
      {(heroVol24h !== null || globalDeltas.loading) && (
        <div className="poly-stats-bar" style={{ marginTop: '1.5rem' }}>
          {globalDeltas.loading && <div className="loading">Loading stats…</div>}
          {!globalDeltas.loading && (
            <>
              <div className="poly-stat-card">
                <div className="poly-stat-label">Volume (24h)</div>
                <div className="poly-stat-value">{fmtCompact(heroVol24h)}</div>
                {heroVol30d !== null && (
                  <div className="poly-stat-period-row">
                    <span className="poly-stat-period-label">30d</span>
                    <span className="poly-stat-period-value">{fmtCompact(heroVol30d)}</span>
                  </div>
                )}
                {latestDelta && typeof latestDelta.d_volume_6h === 'number' && (
                  <div className={`poly-stat-delta ${latestDelta.d_volume_6h >= 0 ? 'up' : 'down'}`}>
                    {latestDelta.d_volume_6h >= 0 ? '▲' : '▼'} {fmtCompact(Math.abs(latestDelta.d_volume_6h))} last 1h
                  </div>
                )}
              </div>
              <div className="poly-stat-card">
                <div className="poly-stat-label">Open Interest (24h)</div>
                <div className="poly-stat-value">{fmtCompact(heroOi24h)}</div>
                {heroOi30d !== null && (
                  <div className="poly-stat-period-row">
                    <span className="poly-stat-period-label">30d</span>
                    <span className="poly-stat-period-value">{fmtCompact(heroOi30d)}</span>
                  </div>
                )}
                {latestDelta && typeof latestDelta.d_oi_6h === 'number' && (
                  <div className={`poly-stat-delta ${latestDelta.d_oi_6h >= 0 ? 'up' : 'down'}`}>
                    {latestDelta.d_oi_6h >= 0 ? '▲' : '▼'} {fmtCompact(Math.abs(latestDelta.d_oi_6h))} last 1h
                  </div>
                )}
              </div>
              <div className="poly-stat-card">
                <div className="poly-stat-label">Wide Spreads (24h)</div>
                <div className="poly-stat-value">{fmtCompact(heroWide24h)}</div>
                {heroWide30d !== null && (
                  <div className="poly-stat-period-row">
                    <span className="poly-stat-period-label">30d</span>
                    <span className="poly-stat-period-value">{fmtCompact(heroWide30d)}</span>
                  </div>
                )}
                {latestDelta && typeof latestDelta.d_wide_6h === 'number' && (
                  <div className={`poly-stat-delta ${latestDelta.d_wide_6h >= 0 ? 'up' : 'down'}`}>
                    {latestDelta.d_wide_6h >= 0 ? '▲' : '▼'} {fmtCompact(Math.abs(latestDelta.d_wide_6h))} last 1h
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ MARKET MOVERS — Leaderboard Feed ═══ */}
      {(Array.isArray(marketMovers.data) && marketMovers.data.length > 0) && (
        <div className="movers-section">
          <div className="movers-section-header">
            <span className="movers-live-dot" />
            <span className="movers-section-title">Market Movers</span>
            <span className="movers-section-sub">Biggest price shifts · 1h window</span>
          </div>
          <div className="movers-feed">
            {marketMovers.data.slice(0, 6).map((row, idx) => {
              const diff = typeof row.price_diff === 'number' ? row.price_diff : 0
              const isUp = diff >= 0
              const tickerName = (row.market_ticker || '')
                .replace(/^KX/i, '')
                .split('-')[0]
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/([A-Z]+)/g, ' $1')
                .trim()
              return (
                <div key={row.market_ticker ?? idx} className={`mover-row ${isUp ? 'mover-up' : 'mover-down'}`}>
                  <div className="mover-rank">#{idx + 1}</div>
                  <div className={`mover-delta-block ${isUp ? 'delta-up' : 'delta-down'}`}>
                    <span className="mover-delta-value">{isUp ? '+' : ''}{fmtDec(diff)}¢</span>
                    <span className="mover-direction">{isUp ? '▲ Rising' : '▼ Falling'}</span>
                  </div>
                  <div className="mover-info">
                    <div className="mover-name">{tickerName || row.market_ticker}</div>
                    <div className="mover-ticker-id">{row.market_ticker}</div>
                    <div className="mover-price-trail">
                      <span className="mover-label">Was</span>
                      <span className="mover-old">{fmtDec(row.old_price)}¢</span>
                      <span className="mover-arrow-trail">→</span>
                      <span className="mover-label">Now</span>
                      <span className="mover-new">{fmtDec(row.new_price)}¢</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {marketMovers.loading && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="panel-body"><div className="loading">Loading market movers…</div></div>
        </div>
      )}

      <Last24hChangesPanel defaultProvider="kalshi" />

      {/* ═══ MARKET SHIFT INDEX ═══ */}
      <div className="panel poly-vol-panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div className="panel-title">Market Shift Index</div>
          {latestIndex !== null && (
            <div className="poly-vol-badge">
              <span className="poly-vol-badge-value">{latestIndex.toFixed(1)}</span>
              <span className="poly-vol-badge-unit">composite</span>
            </div>
          )}
        </div>
        <div className="panel-body">
          <ModernLineChart
            series={shiftChartSeries}
            loading={globalDeltas.loading}
            error={globalDeltas.error}
            showAxes={true}
            yAxisFormatter={(v) => (typeof v === 'number' && !isNaN(v) ? v.toFixed(1) : '')}
            xAxisFormatter={(t) => {
              if (!t) return '';
              const d = new Date(t);
              if (isNaN(d.getTime())) return t;
              return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            }}
          />
          <p className="panel-methodology">
            This index combines 2-hour changes in trading volume, open
            interest, and market breadth into a single normalized score.
            Higher values generally correspond to periods of elevated
            prediction-market activity and crowd repricing, which tend to
            coincide with higher perceived volatility.
          </p>
        </div>
      </div>

      {/* ═══ TOP EVENTS + SPREAD BLOWOUTS — side by side ═══ */}
      <div className="poly-events-duo">
        {/* Top Events by Volume */}
        <div className="panel poly-events-panel">
          <div className="panel-header">
            <div className="panel-title">Top Events by Volume</div>
          </div>
          <div className="panel-body">
            {eventsByVolume.loading && <div className="loading">Loading…</div>}
            {eventsByVolume.error && <div className="error">{eventsByVolume.error.message}</div>}
            {Array.isArray(eventsByVolume.data) && eventsByVolume.data.length > 0 && (
              <div className="poly-event-list">
                {eventsByVolume.data.slice(0, 8).map((row, idx) => (
                  <div key={row.event_ticker ?? idx} className="poly-event-row">
                    <span className="poly-event-rank">{idx + 1}</span>
                    <div className="poly-event-info">
                      <div className="poly-event-name">{row.event_ticker}</div>
                      <div className="poly-event-meta">
                        {fmtNum(row.n_markets)} markets · spread {fmtDec(row.avg_spread_ticks, 2)}
                      </div>
                    </div>
                    <div className="poly-event-stat">{fmtNum(row.total_volume)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Spread Blowouts */}
        <div className="panel poly-events-panel">
          <div className="panel-header">
            <div className="panel-title">Spread Blowouts</div>
          </div>
          <div className="panel-body">
            {spreadBlowouts.loading && <div className="loading">Loading…</div>}
            {spreadBlowouts.error && <div className="error">{spreadBlowouts.error.message}</div>}
            {Array.isArray(spreadBlowouts.data) && spreadBlowouts.data.length > 0 && (
              <div className="kalshi-blowout-list">
                {spreadBlowouts.data.slice(0, 8).map((row, idx) => {
                  const dSpread = typeof row.d_spread === 'number' ? row.d_spread : 0
                  const isWider = dSpread > 0
                  return (
                    <div key={row.market_ticker ?? idx} className={`kalshi-blowout-row ${isWider ? 'blowout-wider' : 'blowout-tighter'}`}>
                      <div className="blowout-ticker">
                        <div className="blowout-market">{row.market_ticker}</div>
                        <div className="blowout-event">{row.event_ticker}</div>
                      </div>
                      <div className="blowout-spread-change">
                        <span className="blowout-prev">{fmtDec(row.spread_prev)}</span>
                        <span className="pulse-arrow">→</span>
                        <span className="blowout-now">{fmtDec(row.spread_now)}</span>
                        <span className={`blowout-delta ${isWider ? 'diff-up' : 'diff-down'}`}>
                          {isWider ? '+' : ''}{fmtDec(dSpread)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {Array.isArray(spreadBlowouts.data) && spreadBlowouts.data.length === 0 &&
              !spreadBlowouts.loading && !spreadBlowouts.error && (
              <span className="muted">No spread blowouts detected.</span>
            )}
          </div>
        </div>
      </div>

      {/* ═══ EXPIRING SOON — countdown cards ═══ */}
      {Array.isArray(expiringSoon.data) && expiringSoon.data.length > 0 && (
        <div className="poly-expiring-section">
          <h3 className="poly-section-title">⏱ Expiring Soon</h3>
          <div className="poly-expiring-grid">
            {expiringSoon.data.slice(0, 8).map((row, idx) => {
              const remaining = timeUntilK(row.expiration_time)
              const midPrice = typeof row.mid === 'number' ? row.mid : null
              const isUrgent = remaining.includes('h') && !remaining.includes('d')
              return (
                <div key={row.market_ticker ?? idx} className={`poly-expiring-card${isUrgent ? ' expiring-urgent' : ''}`}>
                  <div className="expiring-countdown">{remaining}</div>
                  <div className="expiring-question">{row.market_ticker}</div>
                  <div className="expiring-footer">
                    {midPrice !== null && (
                      <div className="expiring-price-bar">
                        <div className="expiring-yes-fill" style={{ width: `${Math.min(midPrice, 99)}%` }} />
                        <span className="expiring-yes-label">MID {fmtDec(midPrice)}¢</span>
                      </div>
                    )}
                    <div className="expiring-meta">
                      OI: {fmtNum(row.open_interest)} · Vol: {fmtNum(row.volume)} · Spread: {fmtDec(row.spread_ticks)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {expiringSoon.loading && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="panel-body"><div className="loading">Loading expiring markets…</div></div>
        </div>
      )}

      {/* ═══ GLOBAL 6H DELTAS TABLE ═══ */}
      <div className="panel" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="panel-header">
          <div className="panel-title">Global 6h Deltas (run-over-run)</div>
        </div>
        <div className="panel-body">
          {globalDeltas.loading && <div className="loading">Loading deltas…</div>}
          {globalDeltas.error && <div className="error">{globalDeltas.error.message}</div>}
          {Array.isArray(globalDeltas.data) && globalDeltas.data.length > 0 && (
            <div className="markets-table-scroll">
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Snapshot</th>
                    <th>Δ Volume</th>
                    <th>Δ OI</th>
                    <th>Δ Priced</th>
                    <th>Δ Spread</th>
                    <th>Δ Wide</th>
                  </tr>
                </thead>
                <tbody>
                  {globalDeltas.data.slice(0, 10).map((row, idx) => (
                    <tr key={row.snap_ts ?? idx}>
                      <td>{row.snap_ts}</td>
                      <td>{fmtNum(row.d_volume_6h)}</td>
                      <td>{fmtNum(row.d_oi_6h)}</td>
                      <td>{fmtNum(row.d_priced_6h)}</td>
                      <td>{typeof row.d_spread_6h === 'number' ? row.d_spread_6h.toFixed(3) : row.d_spread_6h}</td>
                      <td>{fmtNum(row.d_wide_6h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ScreenerPage() {
  const [form, setForm] = useState({
    minVolume: '',
    minOpenInterest: '',
    minSpread: '',
    minTradability: '',
    minChurn: '',
    sortBy: 'tradability_score',
    sortDir: 'desc',
  })
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [allRows, setAllRows] = useState([])
  const [filteredRows, setFilteredRows] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const screener = useApi('/markets/screener', {
    limit: 250,
    _refresh: refreshNonce,
  })

  useEffect(() => {
    if (Array.isArray(screener.data)) {
      setAllRows(screener.data)
      setFilteredRows(screener.data)
      setPage(1)
    }
  }, [screener.data])

  const passMin = (value, minValue) => {
    if (minValue === '' || minValue === null || minValue === undefined) {
      return true
    }
    const min = Number(minValue)
    if (Number.isNaN(min)) return true
    if (typeof value === 'number') return value >= min
    const numericValue = Number(value)
    if (Number.isNaN(numericValue)) return false
    return numericValue >= min
  }

  const sortRows = (rows) => {
    const sorted = [...rows]
    sorted.sort((a, b) => {
      const aVal = a[form.sortBy]
      const bVal = b[form.sortBy]

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return form.sortDir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      const aNum = Number(aVal)
      const bNum = Number(bVal)
      const safeA = Number.isFinite(aNum) ? aNum : -Infinity
      const safeB = Number.isFinite(bNum) ? bNum : -Infinity

      return form.sortDir === 'asc' ? safeA - safeB : safeB - safeA
    })

    return sorted
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const applyFilters = () => {
    const filtered = allRows.filter((row) =>
      passMin(row.volume, form.minVolume) &&
      passMin(row.open_interest, form.minOpenInterest) &&
      passMin(row.spread_ticks, form.minSpread) &&
      passMin(row.tradability_score, form.minTradability) &&
      passMin(row.churn_rate, form.minChurn)
    )

    const sorted = sortRows(filtered)
    setFilteredRows(sorted)
    setPage(1)
  }

  const resetFilters = () => {
    setForm({
      minVolume: '',
      minOpenInterest: '',
      minSpread: '',
      minTradability: '',
      minChurn: '',
      sortBy: 'tradability_score',
      sortDir: 'desc',
    })
    setFilteredRows(allRows)
    setPage(1)
  }

  const refreshOnly = () => {
    setRefreshNonce((n) => n + 1)
  }

  const totalPages = Math.max(
    1,
    Math.ceil((filteredRows?.length ?? 0) / pageSize) || 1,
  )

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  const pageStart = (page - 1) * pageSize
  const pageRows = filteredRows.slice(pageStart, pageStart + pageSize)

  return (
    <div className="dashboard">
      <p className="seo-blurb">
        Interactive prediction market screener filtering by volume, open interest, spread tightness, tradability score, churn rate, and price levels for Kalshi and Polymarket contracts.
      </p>
      <h2>Market Screener <span className="coming-soon-badge coming-soon-badge--lg">Coming Soon</span></h2>
      <div className="coming-soon-banner">
        This feature is a work in progress. Filtering is currently disabled.
      </div>

      <fieldset disabled className="screener-filters screener-fieldset-wip">
        <div className="screener-filter-group">
          <label htmlFor="minVolume">Min Volume</label>
          <input
            id="minVolume"
            name="minVolume"
            type="number"
            min="0"
            value={form.minVolume}
            onChange={handleChange}
            placeholder="e.g. 1,000,000"
          />
        </div>
        <div className="screener-filter-group">
          <label htmlFor="minOpenInterest">Min Open Interest</label>
          <input
            id="minOpenInterest"
            name="minOpenInterest"
            type="number"
            min="0"
            value={form.minOpenInterest}
            onChange={handleChange}
            placeholder="e.g. 500,000"
          />
        </div>
        <div className="screener-filter-group">
          <label htmlFor="minSpread">Min Spread (ticks)</label>
          <input
            id="minSpread"
            name="minSpread"
            type="number"
            min="0"
            step="0.1"
            value={form.minSpread}
            onChange={handleChange}
            placeholder="e.g. 0.5"
          />
        </div>
        <div className="screener-filter-group">
          <label htmlFor="minTradability">Min Tradability Score</label>
          <input
            id="minTradability"
            name="minTradability"
            type="number"
            min="0"
            step="0.1"
            value={form.minTradability}
            onChange={handleChange}
            placeholder="e.g. 20"
          />
        </div>
        <div className="screener-filter-group">
          <label htmlFor="minChurn">Min Churn Rate</label>
          <input
            id="minChurn"
            name="minChurn"
            type="number"
            min="0"
            step="0.1"
            value={form.minChurn}
            onChange={handleChange}
            placeholder="e.g. 1.5"
          />
        </div>
        <div className="screener-filter-group">
          <label htmlFor="sortBy">Order by</label>
          <select
            id="sortBy"
            name="sortBy"
            value={form.sortBy}
            onChange={handleChange}
          >
            <option value="tradability_score">Tradability score</option>
            <option value="volume">Volume</option>
            <option value="open_interest">Open interest</option>
            <option value="churn_rate">Churn rate</option>
            <option value="spread_ticks">Spread (tightest)</option>
          </select>
        </div>
        <div className="screener-filter-group">
          <label htmlFor="sortDir">Direction</label>
          <select
            id="sortDir"
            name="sortDir"
            value={form.sortDir}
            onChange={handleChange}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
        <div className="screener-filter-actions">
          <button type="button" onClick={applyFilters}>
            Apply filters
          </button>
          <button type="button" onClick={refreshOnly}>
            Refresh
          </button>
          <button type="button" onClick={resetFilters}>
            Reset
          </button>
        </div>
      </fieldset>

      <div className="panel" style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>
        <div className="panel-header">
          <div className="panel-title">High-Activity Markets</div>
        </div>
        <div className="panel-body">
          {screener.loading && (
            <div className="loading">Loading screener…</div>
          )}
          {screener.error && (
            <div className="error">{screener.error.message}</div>
          )}
          {filteredRows.length > 0 && (
            <div className="markets-table-scroll">
              <div className="screener-table-controls">
                <div className="screener-results-meta">
                  Showing {filteredRows.length === 0 ? 0 : pageStart + 1}–
                  {Math.min(pageStart + pageSize, filteredRows.length)} of {filteredRows.length}
                </div>
                <div className="screener-page-size">
                  <label htmlFor="pageSize">Results per page</label>
                  <select
                    id="pageSize"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                  >
                    {[10, 25, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="screener-pagination">
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                  >
                    First
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Prev
                  </button>
                  <span className="screener-page-indicator">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                  >
                    Last
                  </button>
                </div>
              </div>
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Market Ticker</th>
                    <th>Title</th>
                    <th>Volume</th>
                    <th>Open Interest</th>
                    <th>Yes Bid</th>
                    <th>Yes Ask</th>
                    <th>Mid</th>
                    <th>Spread (ticks)</th>
                    <th>Tradability</th>
                    <th>Churn Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, idx) => (
                    <tr key={row.market_ticker ?? idx}>
                      <td>{row.market_ticker}</td>
                      <td>{row.title}</td>
                      <td>
                        {typeof row.volume === 'number'
                          ? row.volume.toLocaleString('en-US')
                          : row.volume}
                      </td>
                      <td>
                        {typeof row.open_interest === 'number'
                          ? row.open_interest.toLocaleString('en-US')
                          : row.open_interest}
                      </td>
                      <td>
                        {typeof row.yes_bid === 'number'
                          ? row.yes_bid.toFixed(0)
                          : row.yes_bid}
                      </td>
                      <td>
                        {typeof row.yes_ask === 'number'
                          ? row.yes_ask.toFixed(0)
                          : row.yes_ask}
                      </td>
                      <td>
                        {typeof row.yes_bid === 'number' &&
                        typeof row.yes_ask === 'number'
                          ? ((row.yes_bid + row.yes_ask) / 2).toFixed(1)
                          : ''}
                      </td>
                      <td>
                        {typeof row.spread_ticks === 'number'
                          ? row.spread_ticks.toFixed(1)
                          : row.spread_ticks}
                      </td>
                      <td>
                        {typeof row.tradability_score === 'number'
                          ? row.tradability_score.toFixed(2)
                          : row.tradability_score}
                      </td>
                      <td>
                        {typeof row.churn_rate === 'number'
                          ? row.churn_rate.toFixed(2)
                          : row.churn_rate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {Array.isArray(screener.data) &&
            filteredRows.length === 0 &&
            !screener.loading &&
            !screener.error && (
              <span className="muted">No screener results available.</span>
            )}
        </div>
      </div>
    </div>
  )
}

// ─── Polymarket Dashboard ────────────────────────────────────────────────────

function PolyDashboard() {
  const [activeCategory, setActiveCategory] = useState('Trending')
  const globalSnapshot   = usePolyApi('/global-snapshot')
  const globalDeltas     = usePolyApi('/global-deltas', { limit: 50 })
  const globalDeltasFull = usePolyApi('/global-deltas', { limit: 200 })
  const topEventsVolume  = usePolyApi('/top-events-volume', { limit: 15 })
  const topEventsLiq     = usePolyApi('/top-events-liquidity', { limit: 15 })
  const expiringSoon     = usePolyApi('/markets/expiring-soon', { hours: 48, limit: 15 })
  const midMoves         = usePolyApi('/markets/mid-moves', { hours: 24, limit: 15 })
  const volIndex         = usePolyApi('/vol/index/global', { points: 50 })

  // Build vol-index series for ModernLineChart
  let latestVolIndex = null
  let volChartSeries = null
  const volSeries = Array.isArray(volIndex.data?.series) ? volIndex.data.series
                  : Array.isArray(volIndex.data) ? volIndex.data
                  : []
  if (volSeries.length > 0) {
    const rows = [...volSeries].reverse()
    const values = rows.map((s) => s.vol_index ?? 0)
    const times = rows.map((s) => s.snap_ts ?? '')
    volChartSeries = [{ label: 'Realized Vol Index', values, times, color: '#a855f7' }]
    latestVolIndex = values[values.length - 1]
  }

  const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : v)
  const fmtNum = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v)
  const fmtDec = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : v)
  const fmtUsd = (v) => {
    if (typeof v !== 'number') return v
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
    return `$${v.toLocaleString('en-US')}`
  }

  // compute time-until-expiry helper
  const timeUntil = (dateStr) => {
    if (!dateStr) return ''
    const diff = new Date(dateStr) - new Date()
    if (diff <= 0) return 'Expired'
    const hrs = Math.floor(diff / 3600000)
    const mins = Math.floor((diff % 3600000) / 60000)
    if (hrs >= 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
    return `${hrs}h ${mins}m`
  }

  // find latest delta for snapshot comparison (uses small-limit hook)
  const latestDelta = Array.isArray(globalDeltas.data) && globalDeltas.data.length > 0
    ? globalDeltas.data[0]
    : null

  // ── Hero stat aggregates: positional slicing from the full-history hook ──
  // Assumes snapshots are ordered newest-first. Detect cadence from first two rows.
  const fullRows = Array.isArray(globalDeltasFull.data) ? globalDeltasFull.data : []

  const detectInterval = (rows) => {
    if (rows.length < 2) return 3_600_000
    const t0 = new Date(rows[0]?.snap_ts).getTime()
    const t1 = new Date(rows[1]?.snap_ts).getTime()
    const diff = t0 - t1
    return diff > 0 && diff < 7 * 86_400_000 ? diff : 3_600_000
  }
  const snapInterval = detectInterval(fullRows)

  const polySnapsIn24h = Math.max(1, Math.round(86_400_000  / snapInterval))
  const polySnapsIn30d = Math.max(1, Math.round(30 * 86_400_000 / snapInterval))

  const polyRows24h = fullRows.slice(0, Math.min(polySnapsIn24h, fullRows.length))
  const polyRows30d = fullRows.slice(0, Math.min(polySnapsIn30d, fullRows.length))

  const polySum = (rows, field) => rows.reduce((s, r) => s + (typeof r[field] === 'number' ? r[field] : 0), 0)

  const polyVol24h = polyRows24h.length > 0 ? polySum(polyRows24h, 'd_volume')    : null
  const polyVol30d = polyRows30d.length > 0 ? polySum(polyRows30d, 'd_volume')    : null
  const polyLiq24h = polyRows24h.length > 0 ? polySum(polyRows24h, 'd_liquidity') : null
  const polyLiq30d = polyRows30d.length > 0 ? polySum(polyRows30d, 'd_liquidity') : null

  // Human-readable label for the detected snapshot cadence
  const snapIntervalLabel = (() => {
    const mins = Math.round(snapInterval / 60_000)
    if (mins < 60) return `last ${mins}m`
    const hrs = Math.round(snapInterval / 3_600_000)
    return `last ${hrs}h`
  })()

  return (
    <div className="dashboard poly-dash">
      <p className="seo-blurb">
        Polymarket real-time analytics: vol index, market mid-moves, top events
        by volume and liquidity, expiring markets, and global USDC flow metrics.
      </p>
      <h2 className="dashboard-title">
        <img
          src={POLYMARKET_LOGO_URL}
          alt="Polymarket logo"
          className="dashboard-title-logo"
          loading="lazy"
        />
        <span>Polymarket Dashboard</span>
      </h2>

      <nav className="category-subnav">
        {POLY_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`category-subnav-item${activeCategory === cat ? ' category-subnav-item--active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </nav>

      {/* ═══ HERO STATS BAR ═══ */}
      <div className="poly-stats-bar">
        {(globalDeltasFull.loading && globalSnapshot.loading) && <div className="loading">Loading stats…</div>}
        {(!globalDeltasFull.loading || !globalSnapshot.loading) && (
          <>
            <div className="poly-stat-card">
              <div className="poly-stat-label">Volume (24h)</div>
              <div className="poly-stat-value">
                {polyVol24h !== null
                  ? fmtUsd(polyVol24h)
                  : globalSnapshot.loading ? '…' : fmtUsd(globalSnapshot.data?.total_volume)}
              </div>
              {polyVol30d !== null && polyVol30d !== polyVol24h && (
                <div className="poly-stat-period-row">
                  <span className="poly-stat-period-label">30d</span>
                  <span className="poly-stat-period-value">{fmtUsd(polyVol30d)}</span>
                </div>
              )}
              {latestDelta && typeof latestDelta.d_volume === 'number' && (
                <div className={`poly-stat-delta ${latestDelta.d_volume >= 0 ? 'up' : 'down'}`}>
                  {latestDelta.d_volume >= 0 ? '▲' : '▼'} {fmtUsd(Math.abs(latestDelta.d_volume))} {snapIntervalLabel}
                </div>
              )}
            </div>
            <div className="poly-stat-card">
              <div className="poly-stat-label">Liquidity (24h)</div>
              <div className="poly-stat-value">
                {polyLiq24h !== null
                  ? fmtUsd(polyLiq24h)
                  : globalSnapshot.loading ? '…' : fmtUsd(globalSnapshot.data?.total_liquidity)}
              </div>
              {polyLiq30d !== null && polyLiq30d !== polyLiq24h && (
                <div className="poly-stat-period-row">
                  <span className="poly-stat-period-label">30d</span>
                  <span className="poly-stat-period-value">{fmtUsd(polyLiq30d)}</span>
                </div>
              )}
              {latestDelta && typeof latestDelta.d_liquidity === 'number' && (
                <div className={`poly-stat-delta ${latestDelta.d_liquidity >= 0 ? 'up' : 'down'}`}>
                  {latestDelta.d_liquidity >= 0 ? '▲' : '▼'} {fmtUsd(Math.abs(latestDelta.d_liquidity))} {snapIntervalLabel}
                </div>
              )}
            </div>
            <div className="poly-stat-card">
              <div className="poly-stat-label">Vol Index</div>
              <div className="poly-stat-value">
                {volIndex.loading ? '…' : latestVolIndex !== null ? fmtDec(latestVolIndex, 2) : '—'}
              </div>
              <div className="poly-stat-period-row" style={{ visibility: 'hidden' }}>
                <span className="poly-stat-period-label">30d</span>
                <span className="poly-stat-period-value">—</span>
              </div>
              {(() => {
                if (!volChartSeries) return null
                const vals = volChartSeries[0].values
                if (vals.length < 2) return null
                const diff = vals[vals.length - 1] - vals[vals.length - 2]
                const isUp = diff >= 0
                return (
                  <div className={`poly-stat-delta ${isUp ? 'up' : 'down'}`}>
                    {isUp ? '▲' : '▼'} {Math.abs(diff).toFixed(2)} {snapIntervalLabel}
                  </div>
                )
              })()}
            </div>
          </>
        )}
      </div>

      {/* ═══ MARKET PULSE — Leaderboard Feed ═══ */}
      {(Array.isArray(midMoves.data) && midMoves.data.length > 0) && (
        <div className="movers-section">
          <div className="movers-section-header">
            <span className="movers-live-dot" />
            <span className="movers-section-title">Market Pulse</span>
            <span className="movers-section-sub">Biggest moves · 24h window</span>
          </div>
          <div className="movers-feed">
            {midMoves.data.slice(0, 6).map((row, idx) => {
              const diff = typeof row.price_diff === 'number' ? row.price_diff : 0
              const isUp = diff >= 0
              return (
                <div key={row.condition_id ?? idx} className={`mover-row ${isUp ? 'mover-up' : 'mover-down'}`}>
                  <div className="mover-rank">#{idx + 1}</div>
                  <div className={`mover-delta-block ${isUp ? 'delta-up' : 'delta-down'}`}>
                    <span className="mover-delta-value">{isUp ? '+' : ''}{(diff * 100).toFixed(1)}pp</span>
                    <span className="mover-direction">{isUp ? '▲ Rising' : '▼ Falling'}</span>
                  </div>
                  <div className="mover-info">
                    <div className="mover-name">{row.question ?? row.title}</div>
                    <div className="mover-price-trail">
                      <span className="mover-label">Was</span>
                      <span className="mover-old">{fmtPct(row.old_price)}</span>
                      <span className="mover-arrow-trail">→</span>
                      <span className="mover-label">Now</span>
                      <span className="mover-new">{fmtPct(row.new_price)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {midMoves.loading && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="panel-body"><div className="loading">Loading market pulse…</div></div>
        </div>
      )}

      <Last24hChangesPanel defaultProvider="poly" />

      {/* ═══ VOLATILITY INDEX ═══ */}
      <div className="panel poly-vol-panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div className="panel-title">Realized Vol Index</div>
          {latestVolIndex !== null && (
            <div className="poly-vol-badge">
              <span className="poly-vol-badge-value">{fmtDec(latestVolIndex, 1)}</span>
              <span className="poly-vol-badge-unit">annualized</span>
            </div>
          )}
        </div>
        <div className="panel-body">
          <ModernLineChart
            series={volChartSeries}
            loading={volIndex.loading}
            error={volIndex.error}
            showAxes={true}
            yAxisFormatter={(v) => (typeof v === 'number' && !isNaN(v) ? v.toFixed(0) : '')}
            xAxisFormatter={(t) => {
              if (!t) return '';
              const d = new Date(t);
              if (isNaN(d.getTime())) return t;
              return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            }}
          />
          {volIndex.data && volSeries.length === 0 &&
            !volIndex.loading && !volIndex.error && (
            <span className="muted">No vol-index data available yet.</span>
          )}
          <p className="panel-methodology">
            Liquidity-weighted annualized realized volatility computed from
            log-odds price changes across all tracked Polymarket contracts.
            Higher values indicate elevated repricing activity.
          </p>
        </div>
      </div>

      {/* ═══ TOP EVENTS — side by side ═══ */}
      <div className="poly-events-duo">
        <div className="panel poly-events-panel">
          <div className="panel-header">
            <div className="panel-title">Top Events by Volume</div>
          </div>
          <div className="panel-body">
            {topEventsVolume.loading && <div className="loading">Loading…</div>}
            {topEventsVolume.error && <div className="error">{topEventsVolume.error.message}</div>}
            {Array.isArray(topEventsVolume.data) && topEventsVolume.data.length > 0 && (
              <div className="poly-event-list">
                {topEventsVolume.data.slice(0, 8).map((row, idx) => (
                  <div key={row.event_slug ?? idx} className="poly-event-row">
                    <span className="poly-event-rank">{idx + 1}</span>
                    <div className="poly-event-info">
                      <div className="poly-event-name">{row.event_title ?? row.event_slug ?? row.title}</div>
                      <div className="poly-event-meta">
                        {fmtNum(row.n_markets)} markets · {fmtUsd(row.total_volume)} vol
                      </div>
                    </div>
                    <div className="poly-event-stat">{fmtUsd(row.total_liquidity)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel poly-events-panel">
          <div className="panel-header">
            <div className="panel-title">Top Events by Liquidity</div>
          </div>
          <div className="panel-body">
            {topEventsLiq.loading && <div className="loading">Loading…</div>}
            {topEventsLiq.error && <div className="error">{topEventsLiq.error.message}</div>}
            {Array.isArray(topEventsLiq.data) && topEventsLiq.data.length > 0 && (
              <div className="poly-event-list">
                {topEventsLiq.data.slice(0, 8).map((row, idx) => (
                  <div key={row.event_slug ?? idx} className="poly-event-row">
                    <span className="poly-event-rank">{idx + 1}</span>
                    <div className="poly-event-info">
                      <div className="poly-event-name">{row.event_title ?? row.event_slug ?? row.title}</div>
                      <div className="poly-event-meta">
                        {fmtNum(row.n_markets)} markets · {fmtUsd(row.total_liquidity)} liq
                      </div>
                    </div>
                    <div className="poly-event-stat">{fmtUsd(row.total_volume)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ EXPIRING SOON — countdown cards ═══ */}
      {Array.isArray(expiringSoon.data) && expiringSoon.data.length > 0 && (
        <div className="poly-expiring-section">
          <h3 className="poly-section-title">⏱ Expiring Soon</h3>
          <div className="poly-expiring-grid">
            {expiringSoon.data.slice(0, 8).map((row, idx) => {
              const remaining = timeUntil(row.end_date)
              const yesPrice = typeof row.outcome_yes_price === 'number' ? row.outcome_yes_price : null
              const isUrgent = remaining.includes('h') && !remaining.includes('d')
              return (
                <div key={row.condition_id ?? idx} className={`poly-expiring-card${isUrgent ? ' expiring-urgent' : ''}`}>
                  <div className="expiring-countdown">{remaining}</div>
                  <div className="expiring-question">{row.question ?? row.title}</div>
                  <div className="expiring-footer">
                    {yesPrice !== null && (
                      <div className="expiring-price-bar">
                        <div className="expiring-yes-fill" style={{ width: `${yesPrice * 100}%` }} />
                        <span className="expiring-yes-label">YES {fmtPct(yesPrice)}</span>
                      </div>
                    )}
                    <div className="expiring-meta">
                      Vol: {fmtUsd(row.volume)} · Liq: {fmtUsd(row.liquidity)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {expiringSoon.loading && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="panel-body"><div className="loading">Loading expiring markets…</div></div>
        </div>
      )}

      {/* ═══ GLOBAL DELTAS TABLE ═══ */}
      <div className="panel" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="panel-header">
          <div className="panel-title">Global Deltas (run-over-run)</div>
        </div>
        <div className="panel-body">
          {globalDeltas.loading && <div className="loading">Loading deltas…</div>}
          {globalDeltas.error   && <div className="error">{globalDeltas.error.message}</div>}
          {Array.isArray(globalDeltas.data) && globalDeltas.data.length > 0 && (
            <div className="markets-table-scroll">
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Snapshot</th>
                    <th>Δ Volume (USDC)</th>
                    <th>Δ Liquidity (USDC)</th>
                    <th>Δ Markets</th>
                  </tr>
                </thead>
                <tbody>
                  {globalDeltas.data.slice(0, 10).map((row, idx) => (
                    <tr key={row.snap_ts ?? idx}>
                      <td>{row.snap_ts}</td>
                      <td>{fmtNum(row.d_volume)}</td>
                      <td>{fmtNum(row.d_liquidity)}</td>
                      <td>{fmtNum(row.d_markets)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Polymarket Screener ─────────────────────────────────────────────────────

function PolyScreenerPage() {
  const [form, setForm] = useState({
    minVolume: '',
    minLiquidity: '',
    category: '',
    sortBy: 'tradability_score',
    sortDir: 'desc',
  })
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [allRows, setAllRows] = useState([])
  const [filteredRows, setFilteredRows] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const screener = usePolyApi('/markets/screener', {
    limit: 250,
    _refresh: refreshNonce,
  })

  useEffect(() => {
    if (Array.isArray(screener.data)) {
      setAllRows(screener.data)
      setFilteredRows(screener.data)
      setPage(1)
    }
  }, [screener.data])

  const passMin = (value, minValue) => {
    if (minValue === '' || minValue === null || minValue === undefined) return true
    const min = Number(minValue)
    if (Number.isNaN(min)) return true
    const num = Number(value)
    if (Number.isNaN(num)) return false
    return num >= min
  }

  const passCategory = (value, catFilter) => {
    if (!catFilter) return true
    return (value ?? '').toLowerCase().includes(catFilter.toLowerCase())
  }

  const sortRows = (rows) => {
    const sorted = [...rows]
    sorted.sort((a, b) => {
      const aVal = a[form.sortBy]
      const bVal = b[form.sortBy]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return form.sortDir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      const aNum = Number(aVal)
      const bNum = Number(bVal)
      const safeA = Number.isFinite(aNum) ? aNum : -Infinity
      const safeB = Number.isFinite(bNum) ? bNum : -Infinity
      return form.sortDir === 'asc' ? safeA - safeB : safeB - safeA
    })
    return sorted
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const applyFilters = () => {
    const filtered = allRows.filter(
      (row) =>
        passMin(row.volume, form.minVolume) &&
        passMin(row.liquidity, form.minLiquidity) &&
        passCategory(row.category, form.category),
    )
    setFilteredRows(sortRows(filtered))
    setPage(1)
  }

  const resetFilters = () => {
    setForm({ minVolume: '', minLiquidity: '', category: '', sortBy: 'tradability_score', sortDir: 'desc' })
    setFilteredRows(allRows)
    setPage(1)
  }

  const refreshOnly = () => setRefreshNonce((n) => n + 1)

  const totalPages = Math.max(1, Math.ceil((filteredRows?.length ?? 0) / pageSize) || 1)
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  const pageStart = (page - 1) * pageSize
  const pageRows = filteredRows.slice(pageStart, pageStart + pageSize)

  const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : v)
  const fmtNum = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v)
  const fmtDec = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : v)

  return (
    <div className="dashboard">
      <p className="seo-blurb">
        Polymarket screener — filter by volume, liquidity, and category; sort
        by tradability score, churn, uncertainty, or any metric.
      </p>
      <h2>Polymarket Screener <span className="coming-soon-badge coming-soon-badge--lg">Coming Soon</span></h2>
      <div className="coming-soon-banner">
        This feature is a work in progress. Filtering is currently disabled.
      </div>

      <fieldset disabled className="screener-filters screener-fieldset-wip">
        <div className="screener-filter-group">
          <label htmlFor="poly-minVolume">Min Volume (USDC)</label>
          <input
            id="poly-minVolume"
            name="minVolume"
            type="number"
            min="0"
            value={form.minVolume}
            onChange={handleChange}
            placeholder="e.g. 100000"
          />
        </div>
        <div className="screener-filter-group">
          <label htmlFor="poly-minLiquidity">Min Liquidity (USDC)</label>
          <input
            id="poly-minLiquidity"
            name="minLiquidity"
            type="number"
            min="0"
            value={form.minLiquidity}
            onChange={handleChange}
            placeholder="e.g. 5000"
          />
        </div>
        <div className="screener-filter-group">
          <label htmlFor="poly-category">Category</label>
          <input
            id="poly-category"
            name="category"
            type="text"
            value={form.category}
            onChange={handleChange}
            placeholder="e.g. Politics"
          />
        </div>
        <div className="screener-filter-group">
          <label htmlFor="poly-sortBy">Order by</label>
          <select id="poly-sortBy" name="sortBy" value={form.sortBy} onChange={handleChange}>
            <option value="tradability_score">Tradability score</option>
            <option value="volume">Volume</option>
            <option value="volume_24hr">Volume 24h</option>
            <option value="liquidity">Liquidity</option>
            <option value="churn_rate">Churn rate</option>
            <option value="uncertainty">Uncertainty</option>
          </select>
        </div>
        <div className="screener-filter-group">
          <label htmlFor="poly-sortDir">Direction</label>
          <select id="poly-sortDir" name="sortDir" value={form.sortDir} onChange={handleChange}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
        <div className="screener-filter-actions">
          <button type="button" onClick={applyFilters}>Apply filters</button>
          <button type="button" onClick={refreshOnly}>Refresh</button>
          <button type="button" onClick={resetFilters}>Reset</button>
        </div>
      </fieldset>

      <div className="panel" style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>
        <div className="panel-header">
          <div className="panel-title">High-Activity Markets (Polymarket)</div>
        </div>
        <div className="panel-body">
          {screener.loading && <div className="loading">Loading screener…</div>}
          {screener.error   && <div className="error">{screener.error.message}</div>}
          {filteredRows.length > 0 && (
            <div className="markets-table-scroll">
              <div className="screener-table-controls">
                <div className="screener-results-meta">
                  Showing {filteredRows.length === 0 ? 0 : pageStart + 1}–
                  {Math.min(pageStart + pageSize, filteredRows.length)} of{' '}
                  {filteredRows.length}
                </div>
                <div className="screener-page-size">
                  <label htmlFor="poly-pageSize">Results per page</label>
                  <select
                    id="poly-pageSize"
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                  >
                    {[10, 25, 50, 100].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="screener-pagination">
                  <button type="button" onClick={() => setPage(1)} disabled={page === 1}>First</button>
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
                  <span className="screener-page-indicator">Page {page} of {totalPages}</span>
                  <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
                  <button type="button" onClick={() => setPage(totalPages)} disabled={page === totalPages}>Last</button>
                </div>
              </div>
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Category</th>
                    <th>Volume (USDC)</th>
                    <th>Vol 24h (USDC)</th>
                    <th>Liquidity (USDC)</th>
                    <th>Yes</th>
                    <th>No</th>
                    <th>Churn</th>
                    <th>Uncertainty</th>
                    <th>Tradability</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, idx) => (
                    <tr key={row.condition_id ?? idx}>
                      <td>{row.question ?? row.title}</td>
                      <td>{row.category ?? '—'}</td>
                      <td>{fmtNum(row.volume)}</td>
                      <td>{fmtNum(row.volume_24hr)}</td>
                      <td>{fmtNum(row.liquidity)}</td>
                      <td>{fmtPct(row.outcome_yes_price)}</td>
                      <td>{fmtPct(row.outcome_no_price)}</td>
                      <td>{fmtDec(row.churn_rate)}</td>
                      <td>{fmtDec(row.uncertainty)}</td>
                      <td>{fmtDec(row.tradability_score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {Array.isArray(screener.data) && filteredRows.length === 0 &&
            !screener.loading && !screener.error && (
            <span className="muted">No screener results available.</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Treemap helpers ─────────────────────────────────────────────────────────

function tmLayout(items, x = 0, y = 0, w = 100, h = 100) {
  if (!items || items.length === 0) return []
  if (items.length === 1) return [{ ...items[0], x, y, w, h }]
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((s, it) => s + it.value, 0)
  if (total === 0) return sorted.map((it, i) => ({ ...it, x: x + (i / sorted.length) * w, y, w: w / sorted.length, h }))
  let cum = 0, splitIdx = sorted.length - 1
  for (let i = 0; i < sorted.length - 1; i++) {
    cum += sorted[i].value
    if (cum >= total / 2) { splitIdx = i; break }
  }
  const first = sorted.slice(0, splitIdx + 1)
  const second = sorted.slice(splitIdx + 1)
  const ratio = first.reduce((s, it) => s + it.value, 0) / total
  const wide = w >= h
  const [r1, r2] = wide
    ? [{ x, y, w: w * ratio, h }, { x: x + w * ratio, y, w: w * (1 - ratio), h }]
    : [{ x, y, w, h: h * ratio }, { x, y: y + h * ratio, w, h: h * (1 - ratio) }]
  return [...tmLayout(first, r1.x, r1.y, r1.w, r1.h), ...tmLayout(second, r2.x, r2.y, r2.w, r2.h)]
}

function lerpC(a, b, t) { return Math.round(a + (b - a) * t) }

function heatColor(v) {
  const c = Math.max(-1, Math.min(1, v))
  if (c >= 0) return `rgb(${lerpC(30,52,c)},${lerpC(41,211,c)},${lerpC(59,153,c)})`
  const t = -c
  return `rgb(${lerpC(30,248,t)},${lerpC(41,113,t)},${lerpC(59,113,t)})`
}

function VolHeatmap({ tiles, loading, error, sizeLabel = 'Volume', heatLabel = 'Avg Price Shift' }) {
  const [hovered, setHovered] = useState(null)

  if (loading) return <div className="loading">Building heatmap…</div>
  if (error) return <div className="error">{error.message}</div>
  const valid = (tiles || []).filter((t) => t.value > 0)
  if (valid.length === 0) return <span className="muted">No sector data available yet.</span>

  const rects = tmLayout(valid)
  const maxHeat = Math.max(...valid.map((t) => Math.abs(t.heat ?? 0)), 0.001)
  const PAD = 0.4

  const hoveredRect = hovered !== null ? rects[hovered] : null

  return (
    <div className="vol-heatmap-wrap">
      <svg
        viewBox="0 0 100 60"
        className="vol-heatmap-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {rects.map((rect, i) => {
          const norm = (rect.heat ?? 0) / maxHeat
          const fill = heatColor(norm)
          const rx = rect.x + PAD / 2
          const ry = rect.y + PAD / 2
          const rw = Math.max(0, rect.w - PAD)
          const rh = Math.max(0, rect.h - PAD)
          if (rw < 0.5 || rh < 0.5) return null
          const area = rw * rh
          const fs = Math.max(1.1, Math.min(3.8, rw / 7))
          const subFs = fs * 0.72
          const showLabel = area > 8
          const showSub = area > 22 && rect.heatLabel
          const maxChars = Math.max(2, Math.floor(rw / fs * 1.6))
          const labelText = (rect.label || '').length > maxChars
            ? (rect.label || '').slice(0, maxChars - 1) + '…'
            : (rect.label || '')
          const isHov = hovered === i
          return (
            <g key={rect.label + i}>
              <rect
                x={rx} y={ry} width={rw} height={rh}
                fill={fill}
                rx={0.5}
                stroke={isHov ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'}
                strokeWidth={isHov ? 0.35 : 0.15}
                style={{ cursor: 'pointer', transition: 'stroke 0.12s, stroke-width 0.12s' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
              {showLabel && (
                <>
                  <text
                    x={rx + rw / 2}
                    y={ry + rh / 2 - (showSub ? subFs * 0.65 : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fs}
                    fontWeight="700"
                    fill="rgba(255,255,255,0.93)"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {labelText}
                  </text>
                  {showSub && (
                    <text
                      x={rx + rw / 2}
                      y={ry + rh / 2 + fs * 0.72}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={subFs}
                      fontWeight="600"
                      fill={norm >= 0 ? 'rgba(52,211,153,0.85)' : 'rgba(248,113,113,0.85)'}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {rect.heatLabel}
                    </text>
                  )}
                </>
              )}
            </g>
          )
        })}
      </svg>

      {/* Hover detail card */}
      <div className={`vol-heatmap-detail${hoveredRect ? ' visible' : ''}`}>
        {hoveredRect ? (
          <>
            <div className="hm-detail-name">{hoveredRect.label}</div>
            {hoveredRect.sublabel && <div className="hm-detail-sub">{hoveredRect.sublabel}</div>}
            <div className="hm-detail-grid">
              <span className="hm-detail-key">{sizeLabel}</span>
              <span className="hm-detail-val">
                {typeof hoveredRect.value === 'number'
                  ? hoveredRect.value >= 1_000_000
                    ? (hoveredRect.value / 1_000_000).toFixed(1) + 'M'
                    : hoveredRect.value >= 1_000
                      ? (hoveredRect.value / 1_000).toFixed(1) + 'K'
                      : hoveredRect.value.toLocaleString('en-US')
                  : hoveredRect.value}
              </span>
              <span className="hm-detail-key">{heatLabel}</span>
              <span className={`hm-detail-val ${(hoveredRect.heat ?? 0) >= 0 ? 'tip-up' : 'tip-down'}`}>
                {hoveredRect.heatLabel || '—'}
              </span>
              {hoveredRect.count != null && (
                <>
                  <span className="hm-detail-key">Markets</span>
                  <span className="hm-detail-val">{hoveredRect.count}</span>
                </>
              )}
            </div>
          </>
        ) : (
          <span className="hm-detail-hint">Hover a tile for details</span>
        )}
      </div>

      {/* Legend */}
      <div className="vol-heatmap-legend">
        <span className="hm-leg-label down">▼ Falling</span>
        <div className="hm-leg-bar" />
        <span className="hm-leg-label up">▲ Rising</span>
      </div>
    </div>
  )
}

// ─── Vol Index Page ───────────────────────────────────────────────────────────

function buildNormPoints(values, w = 100, h = 40, pad = 4) {
  if (!values || values.length < 2) return ''
  const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (validValues.length < 2) return ''
  const min = Math.min(...validValues)
  const max = Math.max(...validValues)
  const span = max - min || 1
  return values
    .map((v, i) => {
      if (typeof v !== 'number' || isNaN(v)) return null;
      const x = (i / (values.length - 1)) * w
      // Clamp the value between min and max to ensure it never goes out of bounds
      const clampedV = Math.max(min, Math.min(max, v));
      const norm = (clampedV - min) / span
      const y = h - pad - norm * (h - pad * 2)
      return `${x},${y}`
    })
    .filter(Boolean)
    .join(' ')
}

function ModernLineChart({ series, loading, error, showAxes = true, yAxisFormatter = (v) => v, xAxisFormatter = (v) => v }) {
  const COLORS = ['#7c6af7', '#38bdf8', '#10b981', '#f59e0b', '#ef4444']
  const [hoveredIndex, setHoveredIndex] = useState(null)

  if (loading) return <div className="loading">Loading chart…</div>
  if (error) return <div className="error">{error.message}</div>
  if (!series || series.every((s) => !s.values || s.values.length < 2)) {
    return <span className="muted">No chart data yet.</span>
  }

  // Find global min/max for all series to scale them together if needed
  // Or scale them independently if they have vastly different ranges
  // For simplicity, we'll scale each series independently to fit the 0-40 viewBox height
  // but we'll calculate the min/max for the first series to show on the Y axis
  const primarySeries = series[0];
  const validValues = primarySeries.values.filter(v => typeof v === 'number' && !isNaN(v));
  const primaryMin = validValues.length ? Math.min(...validValues) : 0;
  const primaryMax = validValues.length ? Math.max(...validValues) : 100;
  const primarySpan = primaryMax - primaryMin || 1;

  const yAxisLabels = [
    primaryMax,
    primaryMin + primarySpan * 0.75,
    primaryMin + primarySpan * 0.5,
    primaryMin + primarySpan * 0.25,
    primaryMin
  ];

  // Generate X-axis labels (e.g., 3 evenly spaced labels to prevent overlap)
  const xAxisLabels = [];
  if (primarySeries.times && primarySeries.times.length > 0) {
    const len = primarySeries.times.length;
    const numLabels = Math.min(3, len); // Use 3 labels max
    
    for (let i = 0; i < numLabels; i++) {
      // Calculate index: 0, middle, end
      const index = i === 0 ? 0 : i === numLabels - 1 ? len - 1 : Math.floor((len - 1) * (i / (numLabels - 1)));
      
      // Avoid duplicates if len is very small
      if (!xAxisLabels.find(l => l.index === index)) {
        xAxisLabels.push({
          index,
          time: primarySeries.times[index],
          percent: len > 1 ? (index / (len - 1)) * 100 : 50
        });
      }
    }
  }

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const percentage = x / width;
    const dataLength = primarySeries.values.length;
    const index = Math.min(Math.max(Math.round(percentage * (dataLength - 1)), 0), dataLength - 1);
    setHoveredIndex(index);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <div className="modern-chart-wrapper" style={{ background: '#0f172a', borderRadius: '12px', padding: '1.5rem', border: '1px solid #1e293b', position: 'relative' }}>
      <div className="dual-chart-legend" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {hoveredIndex !== null && primarySeries.times && primarySeries.times[hoveredIndex] && (
          <span style={{ color: '#94a3b8', fontSize: '0.875rem', marginRight: '1rem', fontWeight: 'bold' }}>
            {xAxisFormatter(primarySeries.times[hoveredIndex])}
          </span>
        )}
        {series.map((s, si) => (
          <span key={si} className="legend-item" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}>
            <span
              className="legend-dot"
              style={{ background: s.color ?? COLORS[si % COLORS.length], width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' }}
            />
            {s.label}
            {hoveredIndex !== null && s.values[hoveredIndex] !== undefined && s.values[hoveredIndex] !== null && (
              <strong style={{ color: '#fff', marginLeft: '4px' }}>
                {yAxisFormatter(s.values[hoveredIndex])}
              </strong>
            )}
          </span>
        ))}
      </div>
      
      <div style={{ display: 'flex', width: '100%', height: '14rem' }}>
        {showAxes && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: '10px', paddingBottom: '20px', color: '#64748b', fontSize: '0.7rem', textAlign: 'right', width: '50px', flexShrink: 0 }}>
            {yAxisLabels.map((val, i) => (
              <span key={i}>{yAxisFormatter(val)}</span>
            ))}
          </div>
        )}
        
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, height: '100%' }}>
          <div 
            style={{ position: 'relative', flexGrow: 1, cursor: 'crosshair', overflow: 'hidden' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <svg
              className="modern-chart"
              viewBox="0 0 100 40"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block', overflow: 'hidden' }}
            >
              {/* Grid lines */}
              <line x1="0" y1="0" x2="100" y2="0" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2 2" />
              <line x1="0" y1="10" x2="100" y2="10" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2 2" />
              <line x1="0" y1="20" x2="100" y2="20" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2 2" />
              <line x1="0" y1="30" x2="100" y2="30" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2 2" />
              <line x1="0" y1="40" x2="100" y2="40" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2 2" />
              
              {series.map((s, si) => {
                const pts = buildNormPoints(s.values)
                if (!pts) return null;
                const color = s.color ?? COLORS[si % COLORS.length];
                const fillId = `gradient-${s.label.replace(/[^a-zA-Z0-9]/g, '-')}-${si}`;
                return (
                  <g key={si}>
                    <defs>
                      <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <polygon
                      points={`0,40 ${pts} 100,40`}
                      fill={`url(#${fillId})`}
                    />
                    <polyline
                      points={pts}
                      fill="none"
                      stroke={color}
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )
              })}

              {/* Hover Line */}
              {hoveredIndex !== null && (
                <line 
                  x1={(hoveredIndex / (primarySeries.values.length - 1)) * 100} 
                  y1="0" 
                  x2={(hoveredIndex / (primarySeries.values.length - 1)) * 100} 
                  y2="40" 
                  stroke="#94a3b8" 
                  strokeWidth="0.5" 
                  strokeDasharray="1 1" 
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          </div>
          
          {/* X-Axis Labels */}
          {showAxes && xAxisLabels.length > 0 && (
            <div style={{ position: 'relative', height: '20px', marginTop: '8px', color: '#64748b', fontSize: '0.7rem' }}>
              {xAxisLabels.map((label, i) => {
                // Adjust alignment for first and last labels to prevent overflow
                let transform = `translateX(-50%)`;
                let left = `${label.percent}%`;
                if (i === 0) {
                  transform = `translateX(0)`;
                  left = `0%`;
                } else if (i === xAxisLabels.length - 1) {
                  transform = `translateX(-100%)`;
                  left = `100%`;
                }
                
                return (
                  <span 
                    key={i} 
                    style={{ 
                      position: 'absolute', 
                      left: left, 
                      transform: transform,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {xAxisFormatter(label.time)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function VolatilityGauge({ value, min = 0, max = 100, label }) {
  const numericValue = parseFloat(value) || 0;
  const clampedValue = Math.min(Math.max(numericValue, min), max);
  const percentage = max > min ? (clampedValue - min) / (max - min) : 0;
  
  const radius = 40;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - percentage * circumference;

  let statusText = "NORMAL";
  let statusColor = "#f59e0b";
  if (percentage < 0.33) {
    statusText = "LOW VOLATILITY";
    statusColor = "#10b981";
  } else if (percentage > 0.66) {
    statusText = "HIGH VOLATILITY";
    statusColor = "#ef4444";
  }

  return (
    <div className="vol-gauge-container" style={{ textAlign: 'center', margin: '2rem 0' }}>
      <div style={{ position: 'relative', width: '240px', height: '130px', margin: '0 auto' }}>
        <svg viewBox="0 0 100 55" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#1e293b"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="url(#gauge-gradient)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
          <defs>
            <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
        </svg>
        <div style={{
          position: 'absolute',
          bottom: '-10px',
          left: '0',
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '3.5rem', fontWeight: '800', lineHeight: '1', color: '#f8fafc', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
            {value}
          </span>
          <span style={{ fontSize: '0.875rem', color: statusColor, fontWeight: '700', letterSpacing: '0.05em', marginTop: '0.5rem' }}>
            {statusText}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '220px', margin: '1.5rem auto 0', fontSize: '0.75rem', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em' }}>
        <span>LOW</span>
        <span>HIGH</span>
      </div>
    </div>
  );
}

function VolIndexPage() {
  const [hmProvider, setHmProvider] = useState('kalshi')

  const kalshiDeltas   = useApi('/global-6h-deltas', { limit: 50 })
  const polyVolIndex   = usePolyApi('/vol/index/global', { points: 50 })
  const polyDeltas     = usePolyApi('/global-deltas', { limit: 50 })

  // ── Extra data for sector heatmap ──
  const kalshiScreener = useApi('/markets/screener', { limit: 500 })
  const kalshiMovers   = useApi('/market-movers')
  const polyTopEvents  = usePolyApi('/top-events-volume', { limit: 50 })
  const polyMidMoves   = usePolyApi('/markets/mid-moves', { hours: 24, limit: 60 })

  // ── Kalshi index (volume + OI + breadth normalized composite) ──
  let kalshiIndexPoints = ''
  let kalshiLatest = null
  let kalshiValues = []
  let kalshiTimes = []
  if (Array.isArray(kalshiDeltas.data) && kalshiDeltas.data.length > 0) {
    const rows = [...kalshiDeltas.data].reverse()
    const baseVol  = rows[0].d_volume_6h || 1
    const baseOi   = rows[0].d_oi_6h || 1
    const baseWide = rows[0].d_wide_6h || 1
    kalshiValues = rows.map((r) => {
      const relVol  = r.d_volume_6h / baseVol
      const relOi   = r.d_oi_6h / baseOi
      const relWide = r.d_wide_6h / baseWide
      return (100 * (relVol + relOi + relWide)) / 3
    })
    kalshiTimes = rows.map(r => r.snap_ts)
    kalshiIndexPoints = buildNormPoints(kalshiValues)
    kalshiLatest = kalshiValues[kalshiValues.length - 1]?.toFixed(1)
  }

  // ── Kalshi Δ volume / Δ OI chart ──
  const kalshiChartSeries = Array.isArray(kalshiDeltas.data) && kalshiDeltas.data.length > 1
    ? (() => {
        const rows = [...kalshiDeltas.data].reverse()
        return [
          { label: 'Δ Volume (6h)', values: rows.map((r) => r.d_volume_6h ?? 0), times: rows.map(r => r.snap_ts), color: '#7c6af7' },
          { label: 'Δ Open Interest (6h)', values: rows.map((r) => r.d_oi_6h ?? 0), times: rows.map(r => r.snap_ts), color: '#38bdf8' },
        ]
      })()
    : null

  // ── Poly vol index (log-odds, annualized) ──
  let polyIndexPoints = ''
  let polyLatest = null
  let polyValues = []
  let polyTimes = []
  const polyVolSeries = polyVolIndex.data?.series || (Array.isArray(polyVolIndex.data) ? polyVolIndex.data : [])
  if (polyVolSeries.length > 0) {
    const rows = [...polyVolSeries].reverse()
    polyValues = rows.map((r) => r.vol_index ?? 0)
    polyTimes = rows.map((r) => r.snap_ts ?? '')
    polyIndexPoints = buildNormPoints(polyValues)
    polyLatest = polyValues[polyValues.length - 1]?.toFixed(4)
  }

  // ── Poly Δ volume / Δ liquidity chart ──
  const polyChartSeries = Array.isArray(polyDeltas.data) && polyDeltas.data.length > 1
    ? (() => {
        const rows = [...polyDeltas.data].reverse()
        return [
          { label: 'Δ Volume (USDC)', values: rows.map((r) => r.d_volume ?? 0), times: rows.map(r => r.snap_ts), color: '#7c6af7' },
          { label: 'Δ Liquidity (USDC)', values: rows.map((r) => r.d_liquidity ?? 0), times: rows.map(r => r.snap_ts), color: '#38bdf8' },
        ]
      })()
    : null

  // ── Global Volatility Index (Kalshi Only) ──
  let combinedLatest = null;
  let combinedValues = [];
  let combinedTimes = [];
  let combinedIndexPoints = '';

  const isCombinedLoading = kalshiDeltas.loading;

  if (kalshiValues.length > 0) {
    const kalshiMax = Math.max(...kalshiValues) || 1;
    combinedValues = kalshiValues.map(k => {
      const val = (k / kalshiMax) * 100;
      return isNaN(val) ? null : val;
    });
    combinedTimes = kalshiTimes;
    combinedIndexPoints = buildNormPoints(combinedValues);
    const validCombined = combinedValues.filter(v => v !== null);
    combinedLatest = validCombined[validCombined.length - 1]?.toFixed(1);
  }

  // ── Heatmap tiles: Kalshi — group screener rows by series, heat from movers ──
  const kalshiTiles = (() => {
    if (!Array.isArray(kalshiScreener.data) || kalshiScreener.data.length === 0) return []
    // Build price-diff lookup from movers
    const diffMap = {}
    if (Array.isArray(kalshiMovers.data)) {
      kalshiMovers.data.forEach((m) => {
        if (m.market_ticker && typeof m.price_diff === 'number') {
          diffMap[m.market_ticker] = m.price_diff
        }
      })
    }
    // Extract series from ticker: strip KX prefix, take first segment before '-'
    const groups = {}
    kalshiScreener.data.forEach((row) => {
      const series = (row.market_ticker || '')
        .replace(/^KX/i, '')
        .split('-')[0]
        .toUpperCase() || 'OTHER'
      if (!groups[series]) groups[series] = { volume: 0, diffSum: 0, diffCount: 0, count: 0 }
      const vol = typeof row.volume === 'number' ? row.volume : 0
      groups[series].volume += vol
      groups[series].count += 1
      const diff = diffMap[row.market_ticker]
      if (typeof diff === 'number') {
        groups[series].diffSum += diff * vol // volume-weighted
        groups[series].diffCount += vol
      }
    })
    return Object.entries(groups)
      .filter(([, g]) => g.volume > 0)
      .map(([series, g]) => {
        const avgDiff = g.diffCount > 0 ? g.diffSum / g.diffCount : 0
        const sign = avgDiff >= 0 ? '+' : ''
        return {
          label: series,
          value: g.volume,
          heat: avgDiff,
          count: g.count,
          heatLabel: g.diffCount > 0 ? `${sign}${avgDiff.toFixed(1)}¢` : null,
          sublabel: `${g.count} markets`,
        }
      })
      .sort((a, b) => b.value - a.value)
  })()

  // ── Heatmap tiles: Polymarket — group mid-moves by keyword category ──
  const POLY_KEYWORD_CATS = [
    ['Crypto',     /bitcoin|btc|eth|ethereum|sol|solana|doge|xrp|crypto|coin/i],
    ['Politics',   /trump|biden|harris|election|president|senate|congress|vote|poll|democrat|republican|governor/i],
    ['Sports',     /nba|nfl|mlb|nhl|soccer|football|basketball|baseball|tennis|golf|olympics|ufc|mma|f1|formula/i],
    ['Finance',    /fed|inflation|gdp|rate|economy|recession|market|nasdaq|s&p|dow|interest|oil|gold/i],
    ['Geopolitics',/war|ukraine|russia|israel|gaza|nato|china|taiwan|iran|north.korea|middle.east/i],
    ['Tech',       /ai|openai|apple|google|microsoft|nvidia|tesla|meta|amazon|twitter|chatgpt|model/i],
    ['Climate',    /climate|weather|hurricane|earthquake|wildfire|flood|temperature/i],
  ]
  function polyCategory(question) {
    const q = (question || '').toLowerCase()
    for (const [cat, re] of POLY_KEYWORD_CATS) {
      if (re.test(q)) return cat
    }
    return 'Other'
  }

  const polyTiles = (() => {
    if (!Array.isArray(polyMidMoves.data) || polyMidMoves.data.length === 0) return []
    // Build volume lookup from top events (keyed by condition_id or merged by question)
    // topEventsVolume doesn't share IDs with midMoves, so we use midMoves directly:
    // size = equal weight (no volume on mid-moves endpoint), heat = price_diff
    // Fallback: if polyTopEvents has data, use it for volume context
    const groups = {}
    polyMidMoves.data.forEach((row) => {
      const cat = polyCategory(row.question ?? row.title ?? '')
      if (!groups[cat]) groups[cat] = { diffSum: 0, count: 0 }
      const diff = typeof row.price_diff === 'number' ? row.price_diff * 100 : 0
      groups[cat].diffSum += diff
      groups[cat].count += 1
    })
    // For size: try to use topEventsVolume volume by category match
    const evtVolByCat = {}
    if (Array.isArray(polyTopEvents.data)) {
      polyTopEvents.data.forEach((ev) => {
        // Guess category from event_ticker first segment
        const prefix = (ev.event_ticker || '').split('-')[0].toUpperCase()
        const cat = polyCategory(ev.event_ticker || prefix)
        evtVolByCat[cat] = (evtVolByCat[cat] || 0) + (ev.total_volume || 0)
      })
    }
    return Object.entries(groups)
      .map(([cat, g]) => {
        const avgDiff = g.count > 0 ? g.diffSum / g.count : 0
        const sign = avgDiff >= 0 ? '+' : ''
        // Use top-events volume for tile size when available, otherwise use market count
        const vol = evtVolByCat[cat] || g.count * 1000
        return {
          label: cat,
          value: vol,
          heat: avgDiff,
          count: g.count,
          heatLabel: `${sign}${avgDiff.toFixed(1)}pp`,
          sublabel: `${g.count} markets`,
        }
      })
      .sort((a, b) => b.value - a.value)
  })()

  const hmLoading = hmProvider === 'kalshi'
    ? kalshiScreener.loading || kalshiMovers.loading
    : polyMidMoves.loading
  const hmError = hmProvider === 'kalshi'
    ? kalshiScreener.error || kalshiMovers.error
    : polyMidMoves.error
  const hmTiles = hmProvider === 'kalshi' ? kalshiTiles : polyTiles

  return (
    <div className="dashboard">
      <p className="seo-blurb">
        A realized volatility index based on Kalshi data —
        tracking Kalshi's Market Shift Index (volume, open-interest, and breadth deltas).
      </p>
      <h2>Global Volatility Index</h2>

      {/* ═══ SECTOR VOLATILITY HEATMAP ═══ */}
      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div className="panel-title">Sector Volatility Heatmap</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.15rem' }}>
              Tile size = trading volume &nbsp;·&nbsp; Color = price direction
            </div>
          </div>
          <div className="hm-provider-tabs">
            <button
              type="button"
              className={`hm-tab${hmProvider === 'kalshi' ? ' active' : ''}`}
              onClick={() => setHmProvider('kalshi')}
            >
              <img src={KALSHI_LOGO_URL} alt="" style={{ height: '14px', width: '14px', objectFit: 'contain' }} />
              Kalshi
            </button>
            <button
              type="button"
              className={`hm-tab${hmProvider === 'poly' ? ' active' : ''}`}
              onClick={() => setHmProvider('poly')}
            >
              <img src={POLYMARKET_LOGO_URL} alt="" style={{ height: '14px', width: '14px', objectFit: 'contain' }} />
              Polymarket
            </button>
          </div>
        </div>
        <div className="panel-body">
          <VolHeatmap
            tiles={hmTiles}
            loading={hmLoading}
            error={hmError}
            sizeLabel="Volume"
            heatLabel={hmProvider === 'kalshi' ? 'Avg Price Shift' : 'Avg Move (24h)'}
          />
          <p className="panel-methodology" style={{ marginTop: '0.75rem' }}>
            Each tile represents a market series or category.{' '}
            {hmProvider === 'kalshi'
              ? 'Tile size reflects total traded volume across all contracts in that series. Color (green = rising, red = falling) reflects the volume-weighted average price change from recent market-mover data.'
              : 'Tile size reflects total event volume. Color reflects the average price movement across the top 24h movers in each category, derived from keyword classification of market questions.'}
          </p>
        </div>
      </div>

      <div
        className="vol-index-grid"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2rem',
          marginTop: '1.5rem',
        }}
      >
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Market Volatility</div>
          </div>
          <div className="panel-body">
            {isCombinedLoading && <div className="loading">Loading…</div>}
            {!isCombinedLoading && kalshiDeltas.error && (
              <div className="error">
                Failed to load volatility data.
              </div>
            )}
            {!isCombinedLoading && combinedIndexPoints && (
              <VolatilityGauge 
                value={combinedLatest} 
                min={0} 
                max={100} 
                label="Global Volatility Index" 
              />
            )}
            {!isCombinedLoading && !combinedIndexPoints && (
              <span className="muted">No volatility index data available.</span>
            )}

            <p className="panel-methodology" style={{ marginTop: '1rem', marginBottom: '2rem' }}>
              <strong>Methodology:</strong> The Global Volatility Index is a measure that 
              synthesizes activity across Kalshi. It normalizes Kalshi's Market Shift Index 
              (which tracks 2-hour changes in volume, open interest, and market breadth). 
              The resulting score is scaled from 0 to 100, where higher values indicate periods 
              of rapid collective repricing, elevated order flow, and broad market uncertainty.
            </p>

            <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
              <div>
                <div
                  className="panel-section-label"
                  style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.4rem' }}
                >
                  KALSHI: Δ VOLUME &amp; Δ OPEN INTEREST (6h)
                </div>
                <ModernLineChart
                  series={kalshiChartSeries}
                  loading={kalshiDeltas.loading}
                  error={kalshiDeltas.error}
                  yAxisFormatter={(v) => {
                    if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1) + 'M';
                    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
                    return v.toFixed(0);
                  }}
                  xAxisFormatter={(t) => {
                    if (!t) return '';
                    const d = new Date(t);
                    if (isNaN(d.getTime())) return t;
                    return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                  }}
                />
              </div>
              <div>
                <div
                  className="panel-section-label"
                  style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.4rem' }}
                >
                  POLYMARKET: Δ VOLUME &amp; Δ LIQUIDITY (USDC)
                </div>
                <ModernLineChart
                  series={polyChartSeries}
                  loading={polyDeltas.loading}
                  error={polyDeltas.error}
                  yAxisFormatter={(v) => {
                    if (Math.abs(v) >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
                    if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
                    return '$' + v.toFixed(0);
                  }}
                  xAxisFormatter={(t) => {
                    if (!t) return '';
                    const d = new Date(t);
                    if (isNaN(d.getTime())) return t;
                    return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <div
                className="panel-section-label"
                style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.4rem' }}
              >
                HISTORICAL GLOBAL VOLATILITY INDEX
              </div>
              <ModernLineChart
                series={[{ label: 'Global Volatility Index', values: combinedValues, times: combinedTimes, color: '#f59e0b' }]}
                loading={isCombinedLoading}
                error={!kalshiValues.length ? kalshiDeltas.error : null}
                showAxes={true}
                yAxisFormatter={(v) => (typeof v === 'number' && !isNaN(v) ? v.toFixed(1) : '')}
                xAxisFormatter={(t) => {
                  if (!t) return '';
                  // Handle both ISO strings and unix timestamps
                  const d = new Date(t);
                  if (isNaN(d.getTime())) return t; // fallback if invalid date
                  return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const location = useLocation()
  const screenerActive = location.pathname === '/screener' || location.pathname === '/poly-screener'

  return (
    <div className="app-shell">
      <svg style={{ width: 0, height: 0, position: 'absolute' }} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="chart-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
      </svg>
      <header className="app-nav">
        <NavLink to="/" end className={({ isActive }) => 'app-logo' + (isActive ? ' active' : '')}>Prediction Shift</NavLink>
        <nav style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <NavLink to="/dashboard" className={({ isActive }) => 'app-link' + (isActive ? ' active' : '')}>
            Kalshi Dashboard
          </NavLink>
          <NavLink to="/poly-dashboard" className={({ isActive }) => 'app-link' + (isActive ? ' active' : '')}>
            Poly Dashboard
          </NavLink>
          <NavLink to="/vol-index" className={({ isActive }) => 'app-link' + (isActive ? ' active' : '')}>
            Vol Index
          </NavLink>
          <div className={`nav-dropdown${screenerActive ? ' nav-dropdown--active' : ''}`}>
            <span className="app-link nav-dropdown-trigger">Screeners ▾</span>
            <div className="nav-dropdown-menu">
              <NavLink to="/screener" className={({ isActive }) => 'app-link nav-dropdown-item' + (isActive ? ' active' : '')}>
                Kalshi Screener <span className="coming-soon-badge">Coming Soon</span>
              </NavLink>
              <NavLink to="/poly-screener" className={({ isActive }) => 'app-link nav-dropdown-item' + (isActive ? ' active' : '')}>
                Poly Screener <span className="coming-soon-badge">Coming Soon</span>
              </NavLink>
            </div>
          </div>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/screener" element={<ScreenerPage />} />
          <Route path="/poly-dashboard" element={<PolyDashboard />} />
          <Route path="/poly-screener" element={<PolyScreenerPage />} />
          <Route path="/vol-index" element={<VolIndexPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
