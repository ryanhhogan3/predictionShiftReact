import { useState, useEffect } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import './App.css'

// Call the API directly from the browser.
// Prefer Vite env var, fall back to the public domain (not the :8000 port).
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  'https://api.predictionshift.com'

// Polymarket API — in dev the Vite proxy intercepts /poly/* and strips the
// prefix before forwarding to http://localhost:8001.  In production nginx
// does the same; set VITE_POLY_API_BASE to override for direct port access.
const POLY_API_BASE =
  import.meta.env.VITE_POLY_API_BASE ||
  (import.meta.env.DEV ? '/poly' : 'https://api.predictionshift.com/poly')

export async function getHealth() {
  const response = await fetch(`${API_BASE}/health`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

function useApi(endpoint, params) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const query = params
      ? `?${new URLSearchParams(params).toString()}`
      : ''

    setLoading(true)
    setError(null)

    fetch(`${API_BASE}${endpoint}${query}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((json) => setData(json))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err)
        }
      })
      .finally(() => setLoading(false))

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
    const query = params
      ? `?${new URLSearchParams(params).toString()}`
      : ''

    setLoading(true)
    setError(null)

    fetch(`${POLY_API_BASE}${endpoint}${query}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json) => setData(json))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [endpoint, JSON.stringify(params)])

  return { data, loading, error }
}

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

function Last24hChangesPanel({ defaultProvider = 'kalshi' }) {
  const [provider, setProvider] = useState(defaultProvider)
  const [metric, setMetric] = useState('volume')
  const [limit, setLimit] = useState(50)
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
        <div className="top-changes-controls">
          <div className="top-changes-control">
            <label>Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="kalshi">Kalshi</option>
              <option value="poly">Polymarket</option>
            </select>
          </div>
          <div className="top-changes-control">
            <label>Metric</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {metricOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="top-changes-control">
            <label>Limit</label>
            <input
              type="number"
              min="1"
              max="250"
              value={limit}
              onChange={(e) => {
                const val = Number(e.target.value)
                setLimit(Number.isFinite(val) && val > 0 ? val : 50)
              }}
            />
          </div>
          <div className="top-changes-control">
            <label>Min Prev Value</label>
            <input
              type="number"
              step="any"
              value={minPrevValue}
              onChange={(e) => {
                const val = Number(e.target.value)
                setMinPrevValue(Number.isFinite(val) ? val : 0)
              }}
            />
          </div>
        </div>

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
                  <th onClick={() => handleSort('identifier')} className="sortable-header">
                    Identifier {renderSortArrow('identifier')}
                  </th>
                  <th onClick={() => handleSort('title')} className="sortable-header">
                    Title / Question {renderSortArrow('title')}
                  </th>
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
                  <th onClick={() => handleSort('latest_snap_ts')} className="sortable-header">
                    Snapshot Time {renderSortArrow('latest_snap_ts')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => {
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
                      <td>{getIdentifier(row)}</td>
                      <td>{getTitle(row)}</td>
                      <td>{formatValue(row.current_value)}</td>
                      <td>{formatValue(row.prev_value)}</td>
                      <td className={deltaClass}>{formatValue(row.delta_value)}</td>
                      <td>{formatPct(row.pct_change)}</td>
                      <td>{row.latest_snap_ts ?? '—'}</td>
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
  const eventsByVolume = useApi('/top-events-volume')
  const spreadBlowouts = useApi('/markets/spread-blowouts')
  const expiringSoon = useApi('/markets/expiring-soon')
  const marketMovers = useApi('/market-movers')
  const globalDeltas = useApi('/global-6h-deltas', { limit: 30 })

  let vixPoints = ''
  let latestIndex = null

  if (Array.isArray(globalDeltas.data) && globalDeltas.data.length > 0) {
    const deltas = [...globalDeltas.data].slice().reverse()

    const baseVol = deltas[0].d_volume_6h || 1
    const baseOi = deltas[0].d_oi_6h || 1
    const baseWide = deltas[0].d_wide_6h || 1

    const series = deltas.map((row) => {
      const relVol = row.d_volume_6h / baseVol
      const relOi = row.d_oi_6h / baseOi
      const relWide = row.d_wide_6h / baseWide
      const index = (100 * (relVol + relOi + relWide)) / 3
      return { ts: row.snap_ts, index }
    })

    const values = series.map((s) => s.index)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1

    vixPoints = series
      .map((s, i) => {
        const x = series.length === 1 ? 0 : (i / (series.length - 1)) * 100
        const norm = (s.index - min) / span
        const y = 35 - norm * 25
        return `${x},${y}`
      })
      .join(' ')

    latestIndex = series[series.length - 1].index
  }

  return (
    <div className="dashboard">
      <p className="seo-blurb">
        Market Shift Index 6-hour deltas, real-time market movers, top events by traded volume, spread blowouts, expiring contracts, and global order-flow metrics across prediction markets.
      </p>
      <h2>Prediction Market Dashboard</h2>

      <Last24hChangesPanel defaultProvider="kalshi" />

      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-header">
          <div className="panel-title">Market Shift Index (6h)</div>
        </div>
        <div className="panel-body">
          {globalDeltas.loading && (
            <div className="loading">Loading index…</div>
          )}
          {globalDeltas.error && (
            <div className="error">{globalDeltas.error.message}</div>
          )}
          {vixPoints && (
            <div className="vix-chart-wrapper">
              <svg
                className="vix-chart"
                viewBox="0 0 100 40"
                preserveAspectRatio="none"
              >
                <polyline
                  className="vix-chart-path"
                  points={vixPoints}
                />
              </svg>
            </div>
          )}
          {latestIndex !== null && (
            <div className="vix-chart-label">
              Current index: <strong>{latestIndex.toFixed(1)}</strong>
            </div>
          )}
          <p className="panel-methodology">
            This index combines 6-hour changes in trading volume, open
            interest, and market breadth into a single normalized score.
            Higher values generally correspond to periods of elevated
            prediction-market activity and crowd repricing, which tend to
            coincide with higher perceived volatility.
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-header">
          <div className="panel-title">Market Movers</div>
        </div>
        <div className="panel-body">
          {marketMovers.loading && (
            <div className="loading">Loading market movers…</div>
          )}
          {marketMovers.error && (
            <div className="error">{marketMovers.error.message}</div>
          )}
          {Array.isArray(marketMovers.data) &&
            marketMovers.data.length > 0 && (
              <div className="markets-table-scroll">
                <table className="markets-table">
                  <thead>
                    <tr>
                      <th>Market Ticker</th>
                      <th>Old Price</th>
                      <th>New Price</th>
                      <th>Δ Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketMovers.data.slice(0, 15).map((row, idx) => (
                      <tr key={row.market_ticker ?? idx}>
                        <td>{row.market_ticker}</td>
                        <td>
                          {typeof row.old_price === 'number'
                            ? row.old_price.toFixed(1)
                            : row.old_price}
                        </td>
                        <td>
                          {typeof row.new_price === 'number'
                            ? row.new_price.toFixed(1)
                            : row.new_price}
                        </td>
                        <td>
                          {typeof row.price_diff === 'number'
                            ? row.price_diff.toFixed(1)
                            : row.price_diff}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          {Array.isArray(marketMovers.data) &&
            marketMovers.data.length === 0 &&
            !marketMovers.loading &&
            !marketMovers.error && (
              <span className="muted">No major market movers.</span>
            )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-header">
          <div className="panel-title">Top Events by Volume</div>
        </div>
        <div className="panel-body">
          {eventsByVolume.loading && (
            <div className="loading">Loading events…</div>
          )}
          {eventsByVolume.error && (
            <div className="error">{eventsByVolume.error.message}</div>
          )}
          {Array.isArray(eventsByVolume.data) &&
            eventsByVolume.data.length > 0 && (
              <div className="markets-table-scroll">
                <table className="markets-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Markets</th>
                      <th>Total Volume</th>
                      <th>Avg Spread</th>
                      <th>Order Flow Imbalance Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsByVolume.data.slice(0, 15).map((row) => (
                      <tr key={row.event_ticker}>
                        <td>{row.event_ticker}</td>
                        <td>{row.n_markets}</td>
                        <td>
                          {typeof row.total_volume === 'number'
                            ? row.total_volume.toLocaleString('en-US')
                            : row.total_volume}
                        </td>
                        <td>
                          {typeof row.avg_spread_ticks === 'number'
                            ? row.avg_spread_ticks.toFixed(2)
                            : row.avg_spread_ticks}
                        </td>
                        <td>
                          <span className="tradability-blur">{row.event_ticker}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-header">
          <div className="panel-title">Spread Blowouts</div>
        </div>
        <div className="panel-body">
          {spreadBlowouts.loading && (
            <div className="loading">Loading spread blowouts…</div>
          )}
          {spreadBlowouts.error && (
            <div className="error">{spreadBlowouts.error.message}</div>
          )}
          {Array.isArray(spreadBlowouts.data) &&
            spreadBlowouts.data.length > 0 && (
              <div className="markets-table-scroll">
                <table className="markets-table">
                  <thead>
                    <tr>
                      <th>Market Ticker</th>
                      <th>Event Ticker</th>
                      <th>Spread Now</th>
                      <th>Spread Prev</th>
                      <th>Δ Spread</th>
                      <th>Mid Now</th>
                      <th>Mid Prev</th>
                      <th>Δ Mid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spreadBlowouts.data.slice(0, 10).map((row, idx) => (
                      <tr key={row.market_ticker ?? idx}>
                        <td>{row.market_ticker}</td>
                        <td>{row.event_ticker}</td>
                        <td>
                          {typeof row.spread_now === 'number'
                            ? row.spread_now.toFixed(1)
                            : row.spread_now}
                        </td>
                        <td>
                          {typeof row.spread_prev === 'number'
                            ? row.spread_prev.toFixed(1)
                            : row.spread_prev}
                        </td>
                        <td>
                          {typeof row.d_spread === 'number'
                            ? row.d_spread.toFixed(1)
                            : row.d_spread}
                        </td>
                        <td>
                          {typeof row.mid_now === 'number'
                            ? row.mid_now.toFixed(1)
                            : row.mid_now}
                        </td>
                        <td>
                          {typeof row.mid_prev === 'number'
                            ? row.mid_prev.toFixed(1)
                            : row.mid_prev}
                        </td>
                        <td>
                          {typeof row.d_mid === 'number'
                            ? row.d_mid.toFixed(1)
                            : row.d_mid}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          {Array.isArray(spreadBlowouts.data) &&
            spreadBlowouts.data.length === 0 &&
            !spreadBlowouts.loading &&
            !spreadBlowouts.error && (
              <span className="muted">No spread blowouts detected.</span>
            )}
        </div>
      </div>

        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="panel-header">
            <div className="panel-title">Markets Expiring Soon</div>
          </div>
          <div className="panel-body">
            {expiringSoon.loading && (
              <div className="loading">Loading expiring markets…</div>
            )}
            {expiringSoon.error && (
              <div className="error">{expiringSoon.error.message}</div>
            )}
            {Array.isArray(expiringSoon.data) &&
              expiringSoon.data.length > 0 && (
                <div className="markets-table-scroll">
                  <table className="markets-table">
                    <thead>
                      <tr>
                        <th>Market Ticker</th>
                        <th>Event Ticker</th>
                        <th>Expiration Time</th>
                        <th>Open Interest</th>
                        <th>Volume</th>
                        <th>Spread (ticks)</th>
                        <th>Mid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expiringSoon.data.slice(0, 10).map((row, idx) => (
                        <tr key={row.market_ticker ?? idx}>
                          <td>{row.market_ticker}</td>
                          <td>{row.event_ticker}</td>
                          <td>{row.expiration_time}</td>
                          <td>
                            {typeof row.open_interest === 'number'
                              ? row.open_interest.toLocaleString('en-US')
                              : row.open_interest}
                          </td>
                          <td>
                            {typeof row.volume === 'number'
                              ? row.volume.toLocaleString('en-US')
                              : row.volume}
                          </td>
                          <td>
                            {typeof row.spread_ticks === 'number'
                              ? row.spread_ticks.toFixed(1)
                              : row.spread_ticks}
                          </td>
                          <td>
                            {typeof row.mid === 'number'
                              ? row.mid.toFixed(1)
                              : row.mid}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            {Array.isArray(expiringSoon.data) &&
              expiringSoon.data.length === 0 &&
              !expiringSoon.loading &&
              !expiringSoon.error && (
                <span className="muted">No expiring markets found.</span>
              )}
          </div>
        </div>

      <div className="panel" style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div className="panel-header">
          <div className="panel-title">Global 6h Deltas (Raw)</div>
        </div>
        <div className="panel-body">
          {globalDeltas.loading && (
            <div className="loading">Loading global deltas…</div>
          )}
          {globalDeltas.error && (
            <div className="error">{globalDeltas.error.message}</div>
          )}
          {Array.isArray(globalDeltas.data) && globalDeltas.data.length > 0 && (
            <div className="markets-table-scroll">
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Snapshot</th>
                    <th>Δ Volume 6h</th>
                    <th>Δ OI 6h</th>
                    <th>Δ Priced 6h</th>
                    <th>Δ Spread 6h</th>
                    <th>Δ Wide 6h</th>
                  </tr>
                </thead>
                <tbody>
                  {globalDeltas.data.slice(0, 15).map((row, idx) => (
                    <tr key={row.snap_ts ?? idx}>
                      <td>{row.snap_ts}</td>
                      <td>
                        {typeof row.d_volume_6h === 'number'
                          ? row.d_volume_6h.toLocaleString('en-US')
                          : row.d_volume_6h}
                      </td>
                      <td>
                        {typeof row.d_oi_6h === 'number'
                          ? row.d_oi_6h.toLocaleString('en-US')
                          : row.d_oi_6h}
                      </td>
                      <td>
                        {typeof row.d_priced_6h === 'number'
                          ? row.d_priced_6h.toLocaleString('en-US')
                          : row.d_priced_6h}
                      </td>
                      <td>
                        {typeof row.d_spread_6h === 'number'
                          ? row.d_spread_6h.toFixed(3)
                          : row.d_spread_6h}
                      </td>
                      <td>
                        {typeof row.d_wide_6h === 'number'
                          ? row.d_wide_6h.toLocaleString('en-US')
                          : row.d_wide_6h}
                      </td>
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
      <h2>Market Screener</h2>

      <div className="screener-filters">
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
      </div>

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
  const globalSnapshot   = usePolyApi('/global-snapshot')
  const globalDeltas     = usePolyApi('/global-deltas', { limit: 20 })
  const topEventsVolume  = usePolyApi('/top-events-volume', { limit: 15 })
  const topEventsLiq     = usePolyApi('/top-events-liquidity', { limit: 15 })
  const expiringSoon     = usePolyApi('/markets/expiring-soon', { hours: 48, limit: 15 })
  const midMoves         = usePolyApi('/markets/mid-moves', { hours: 24, limit: 15 })
  const volIndex         = usePolyApi('/vol/index/global', { points: 50 })

  // Build vol-index sparkline
  let volIndexPoints = ''
  let latestVolIndex = null
  if (Array.isArray(volIndex.data) && volIndex.data.length > 0) {
    const series = [...volIndex.data]
    const values = series.map((s) => s.vol_index ?? 0)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    volIndexPoints = series
      .map((s, i) => {
        const x = series.length === 1 ? 0 : (i / (series.length - 1)) * 100
        const norm = ((s.vol_index ?? 0) - min) / span
        const y = 35 - norm * 25
        return `${x},${y}`
      })
      .join(' ')
    latestVolIndex = values[values.length - 1]
  }

  const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : v)
  const fmtNum = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v)
  const fmtDec = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : v)

  return (
    <div className="dashboard">
      <p className="seo-blurb">
        Polymarket real-time analytics: vol index, market mid-moves, top events
        by volume and liquidity, expiring markets, and global USDC flow metrics.
      </p>
      <h2>Polymarket Dashboard</h2>

      <Last24hChangesPanel defaultProvider="poly" />

      {/* ── Vol Index ── */}
      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-header">
          <div className="panel-title">Realized Vol Index (log-odds, annualized)</div>
        </div>
        <div className="panel-body">
          {volIndex.loading && <div className="loading">Loading vol index…</div>}
          {volIndex.error   && <div className="error">{volIndex.error.message}</div>}
          {volIndexPoints && (
            <div className="vix-chart-wrapper">
              <svg className="vix-chart" viewBox="0 0 100 40" preserveAspectRatio="none">
                <polyline className="vix-chart-path" points={volIndexPoints} />
              </svg>
            </div>
          )}
          {latestVolIndex !== null && (
            <div className="vix-chart-label">
              Current index: <strong>{fmtDec(latestVolIndex, 4)}</strong>
            </div>
          )}
          {Array.isArray(volIndex.data) && volIndex.data.length === 0 &&
            !volIndex.loading && !volIndex.error && (
            <span className="muted">
              No vol-index data yet — enable ENABLE_MARKET_SNAPSHOT=1 on the
              exporter.
            </span>
          )}
          <p className="panel-methodology">
            Liquidity-weighted annualized realized volatility computed from
            log-odds price changes across all tracked Polymarket contracts.
            Higher values indicate elevated repricing activity.
          </p>
        </div>
      </div>

      {/* ── Global Snapshot ── */}
      <div className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-header">
          <div className="panel-title">Global Snapshot</div>
        </div>
        <div className="panel-body">
          {globalSnapshot.loading && <div className="loading">Loading snapshot…</div>}
          {globalSnapshot.error   && <div className="error">{globalSnapshot.error.message}</div>}
          {globalSnapshot.data && !globalSnapshot.loading && (
            <div className="markets-table-scroll">
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Snapshot Time</th>
                    <th>Total Volume (USDC)</th>
                    <th>Total Liquidity (USDC)</th>
                    <th>Active Markets</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{globalSnapshot.data.snap_ts}</td>
                    <td>{fmtNum(globalSnapshot.data.total_volume)}</td>
                    <td>{fmtNum(globalSnapshot.data.total_liquidity)}</td>
                    <td>{fmtNum(globalSnapshot.data.active_markets)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Global Deltas ── */}
      <div className="panel" style={{ marginTop: '1rem' }}>
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
                  {globalDeltas.data.slice(0, 15).map((row, idx) => (
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

      {/* ── Market Mid-Moves ── */}
      <div className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-header">
          <div className="panel-title">Market Mid-Moves (24h)</div>
        </div>
        <div className="panel-body">
          {midMoves.loading && <div className="loading">Loading mid-moves…</div>}
          {midMoves.error   && <div className="error">{midMoves.error.message}</div>}
          {Array.isArray(midMoves.data) && midMoves.data.length > 0 && (
            <div className="markets-table-scroll">
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Old Price</th>
                    <th>New Price</th>
                    <th>Δ Price</th>
                  </tr>
                </thead>
                <tbody>
                  {midMoves.data.slice(0, 15).map((row, idx) => (
                    <tr key={row.condition_id ?? idx}>
                      <td>{row.question ?? row.title}</td>
                      <td>{fmtPct(row.old_price)}</td>
                      <td>{fmtPct(row.new_price)}</td>
                      <td
                        style={{
                          color:
                            typeof row.price_diff === 'number'
                              ? row.price_diff > 0
                                ? 'var(--clr-green, #4caf50)'
                                : row.price_diff < 0
                                ? 'var(--clr-red, #f44336)'
                                : undefined
                              : undefined,
                        }}
                      >
                        {typeof row.price_diff === 'number'
                          ? `${(row.price_diff * 100).toFixed(1)}pp`
                          : row.price_diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {Array.isArray(midMoves.data) && midMoves.data.length === 0 &&
            !midMoves.loading && !midMoves.error && (
            <span className="muted">
              No mid-move data yet — enable ENABLE_MARKET_SNAPSHOT=1 on the
              exporter.
            </span>
          )}
        </div>
      </div>

      {/* ── Top Events by Volume ── */}
      <div className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-header">
          <div className="panel-title">Top Events by Volume</div>
        </div>
        <div className="panel-body">
          {topEventsVolume.loading && <div className="loading">Loading events…</div>}
          {topEventsVolume.error   && <div className="error">{topEventsVolume.error.message}</div>}
          {Array.isArray(topEventsVolume.data) && topEventsVolume.data.length > 0 && (
            <div className="markets-table-scroll">
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Markets</th>
                    <th>Total Volume (USDC)</th>
                    <th>Total Liquidity (USDC)</th>
                  </tr>
                </thead>
                <tbody>
                  {topEventsVolume.data.slice(0, 15).map((row, idx) => (
                    <tr key={row.event_slug ?? row.event_title ?? idx}>
                      <td>{row.event_title ?? row.event_slug ?? row.title}</td>
                      <td>{fmtNum(row.n_markets)}</td>
                      <td>{fmtNum(row.total_volume)}</td>
                      <td>{fmtNum(row.total_liquidity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Top Events by Liquidity ── */}
      <div className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-header">
          <div className="panel-title">Top Events by Liquidity</div>
        </div>
        <div className="panel-body">
          {topEventsLiq.loading && <div className="loading">Loading events…</div>}
          {topEventsLiq.error   && <div className="error">{topEventsLiq.error.message}</div>}
          {Array.isArray(topEventsLiq.data) && topEventsLiq.data.length > 0 && (
            <div className="markets-table-scroll">
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Markets</th>
                    <th>Total Liquidity (USDC)</th>
                    <th>Total Volume (USDC)</th>
                  </tr>
                </thead>
                <tbody>
                  {topEventsLiq.data.slice(0, 15).map((row, idx) => (
                    <tr key={row.event_slug ?? row.event_title ?? idx}>
                      <td>{row.event_title ?? row.event_slug ?? row.title}</td>
                      <td>{fmtNum(row.n_markets)}</td>
                      <td>{fmtNum(row.total_liquidity)}</td>
                      <td>{fmtNum(row.total_volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Expiring Soon ── */}
      <div className="panel" style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div className="panel-header">
          <div className="panel-title">Markets Expiring Soon (48h)</div>
        </div>
        <div className="panel-body">
          {expiringSoon.loading && <div className="loading">Loading expiring markets…</div>}
          {expiringSoon.error   && <div className="error">{expiringSoon.error.message}</div>}
          {Array.isArray(expiringSoon.data) && expiringSoon.data.length > 0 && (
            <div className="markets-table-scroll">
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>End Date</th>
                    <th>Volume (USDC)</th>
                    <th>Liquidity (USDC)</th>
                    <th>Yes Price</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringSoon.data.slice(0, 15).map((row, idx) => (
                    <tr key={row.condition_id ?? idx}>
                      <td>{row.question ?? row.title}</td>
                      <td>{row.end_date}</td>
                      <td>{fmtNum(row.volume)}</td>
                      <td>{fmtNum(row.liquidity)}</td>
                      <td>{fmtPct(row.outcome_yes_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {Array.isArray(expiringSoon.data) && expiringSoon.data.length === 0 &&
            !expiringSoon.loading && !expiringSoon.error && (
            <span className="muted">No markets expiring within 48 hours.</span>
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
      <h2>Polymarket Screener</h2>

      <div className="screener-filters">
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
      </div>

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

// ─── Vol Index Page ───────────────────────────────────────────────────────────

function buildNormPoints(values, w = 100, h = 40, pad = 4) {
  if (!values || values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const norm = (v - min) / span
      const y = h - pad - norm * (h - pad * 2)
      return `${x},${y}`
    })
    .join(' ')
}

function DualLineChart({ series, loading, error }) {
  const COLORS = ['#7c6af7', '#38bdf8']
  if (loading) return <div className="loading">Loading chart…</div>
  if (error) return <div className="error">{error.message}</div>
  if (!series || series.every((s) => !s.values || s.values.length < 2)) {
    return <span className="muted">No chart data yet.</span>
  }
  return (
    <div className="dual-chart-wrapper">
      <svg
        className="dual-chart"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '6rem', display: 'block' }}
      >
        {series.map((s, si) => {
          const pts = buildNormPoints(s.values)
          return pts ? (
            <polyline
              key={si}
              points={pts}
              fill="none"
              stroke={s.color ?? COLORS[si % COLORS.length]}
              strokeWidth="1.4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null
        })}
      </svg>
      <div className="dual-chart-legend">
        {series.map((s, si) => (
          <span key={si} className="legend-item">
            <span
              className="legend-dot"
              style={{ background: s.color ?? COLORS[si % COLORS.length] }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function VolIndexPage() {
  const kalshiDeltas = useApi('/global-6h-deltas', { limit: 50 })
  const polyVolIndex = usePolyApi('/vol/index/global', { points: 50 })
  const polyDeltas   = usePolyApi('/global-deltas', { limit: 50 })

  // ── Kalshi index (volume + OI + breadth normalized composite) ──
  let kalshiIndexPoints = ''
  let kalshiLatest = null
  if (Array.isArray(kalshiDeltas.data) && kalshiDeltas.data.length > 0) {
    const rows = [...kalshiDeltas.data].reverse()
    const baseVol  = rows[0].d_volume_6h || 1
    const baseOi   = rows[0].d_oi_6h || 1
    const baseWide = rows[0].d_wide_6h || 1
    const values = rows.map((r) => {
      const relVol  = r.d_volume_6h / baseVol
      const relOi   = r.d_oi_6h / baseOi
      const relWide = r.d_wide_6h / baseWide
      return (100 * (relVol + relOi + relWide)) / 3
    })
    kalshiIndexPoints = buildNormPoints(values)
    kalshiLatest = values[values.length - 1]?.toFixed(1)
  }

  // ── Kalshi Δ volume / Δ OI chart ──
  const kalshiChartSeries = Array.isArray(kalshiDeltas.data) && kalshiDeltas.data.length > 1
    ? (() => {
        const rows = [...kalshiDeltas.data].reverse()
        return [
          { label: 'Δ Volume (6h)', values: rows.map((r) => r.d_volume_6h ?? 0), color: '#7c6af7' },
          { label: 'Δ Open Interest (6h)', values: rows.map((r) => r.d_oi_6h ?? 0), color: '#38bdf8' },
        ]
      })()
    : null

  // ── Poly vol index (log-odds, annualized) ──
  let polyIndexPoints = ''
  let polyLatest = null
  if (Array.isArray(polyVolIndex.data) && polyVolIndex.data.length > 0) {
    const values = polyVolIndex.data.map((r) => r.vol_index ?? 0)
    polyIndexPoints = buildNormPoints(values)
    polyLatest = values[values.length - 1]?.toFixed(4)
  }

  // ── Poly Δ volume / Δ liquidity chart ──
  const polyChartSeries = Array.isArray(polyDeltas.data) && polyDeltas.data.length > 1
    ? (() => {
        const rows = [...polyDeltas.data].reverse()
        return [
          { label: 'Δ Volume (USDC)', values: rows.map((r) => r.d_volume ?? 0), color: '#7c6af7' },
          { label: 'Δ Liquidity (USDC)', values: rows.map((r) => r.d_liquidity ?? 0), color: '#38bdf8' },
        ]
      })()
    : null

  return (
    <div className="dashboard">
      <p className="seo-blurb">
        Side-by-side realized volatility indexes for Kalshi and Polymarket —
        Kalshi Market Shift Index from 6-hour volume, open-interest, and breadth
        deltas; Polymarket log-odds vol index liquidity-weighted across all
        tracked contracts.
      </p>
      <h2>Vol Index</h2>

      <div
        className="vol-index-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
          marginTop: '1.5rem',
        }}
      >
        {/* ── Kalshi ── */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Kalshi — Market Shift Index</div>
          </div>
          <div className="panel-body">
            {kalshiDeltas.loading && <div className="loading">Loading…</div>}
            {kalshiDeltas.error && (
              <div className="error">{kalshiDeltas.error.message}</div>
            )}
            {kalshiIndexPoints && (
              <>
                <div className="vix-chart-wrapper">
                  <svg
                    className="vix-chart"
                    viewBox="0 0 100 40"
                    preserveAspectRatio="none"
                  >
                    <polyline className="vix-chart-path" points={kalshiIndexPoints} />
                  </svg>
                </div>
                <div className="vix-chart-label">
                  Latest: <strong>{kalshiLatest}</strong>
                </div>
              </>
            )}
            {!kalshiIndexPoints && !kalshiDeltas.loading && !kalshiDeltas.error && (
              <span className="muted">No Kalshi index data available.</span>
            )}

            <div style={{ marginTop: '1.25rem' }}>
              <div
                className="panel-section-label"
                style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.4rem' }}
              >
                Δ VOLUME &amp; Δ OPEN INTEREST (6h windows)
              </div>
              <DualLineChart
                series={kalshiChartSeries}
                loading={kalshiDeltas.loading}
                error={kalshiDeltas.error}
              />
            </div>

            <p className="panel-methodology" style={{ marginTop: '1rem' }}>
              <strong>Methodology:</strong> The Kalshi Market Shift Index
              combines three normalized 6-hour deltas: trading volume
              (Δ&nbsp;volume), open interest (Δ&nbsp;OI), and market breadth
              (Δ&nbsp;wide — count of markets with meaningful two-sided
              liquidity). Each series is normalized relative to the earliest
              observation in the window, then the three relative values are
              averaged and scaled to 100. Higher values indicate periods of
              elevated crowd repricing and order flow. The index is directional
              only and does not represent a tradable asset or financial advice.
            </p>
          </div>
        </div>

        {/* ── Polymarket ── */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Polymarket — Realized Log-Odds Vol Index</div>
          </div>
          <div className="panel-body">
            {polyVolIndex.loading && <div className="loading">Loading…</div>}
            {polyVolIndex.error && (
              <div className="error">{polyVolIndex.error.message}</div>
            )}
            {polyIndexPoints && (
              <>
                <div className="vix-chart-wrapper">
                  <svg
                    className="vix-chart"
                    viewBox="0 0 100 40"
                    preserveAspectRatio="none"
                  >
                    <polyline className="vix-chart-path" points={polyIndexPoints} />
                  </svg>
                </div>
                <div className="vix-chart-label">
                  Latest: <strong>{polyLatest}</strong>
                </div>
              </>
            )}
            {!polyIndexPoints && !polyVolIndex.loading && !polyVolIndex.error && (
              <span className="muted">
                No data yet — enable ENABLE_MARKET_SNAPSHOT=1 on the
                Polymarket exporter.
              </span>
            )}

            <div style={{ marginTop: '1.25rem' }}>
              <div
                className="panel-section-label"
                style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.4rem' }}
              >
                Δ VOLUME &amp; Δ LIQUIDITY (run-over-run, USDC)
              </div>
              <DualLineChart
                series={polyChartSeries}
                loading={polyDeltas.loading}
                error={polyDeltas.error}
              />
            </div>

            <p className="panel-methodology" style={{ marginTop: '1rem' }}>
              <strong>Methodology:</strong> The Polymarket Vol Index is a
              liquidity-weighted annualized realized volatility measure built
              from log-odds price changes. For each contract the log-odds
              return is ln(p&nbsp;/&nbsp;(1−p)) where p is the YES price
              (0–1&nbsp;USDC). Returns are squared, averaged over the sampling
              window, and annualized by scaling to a full year of windows.
              Each contract's result is weighted by its USDC liquidity before
              aggregation, so liquid markets drive the index more than thin
              ones. Higher values indicate rapid collective repricing across
              Polymarket contracts. Requires ENABLE_MARKET_SNAPSHOT=1 on the
              exporter to accumulate price history.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
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
        <span className="app-logo">Markets Before Headlines</span>
        <nav style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <Link to="/" className="app-link">
            Landing
          </Link>
          <Link to="/dashboard" className="app-link">
            Kalshi Dashboard
          </Link>
          <Link to="/screener" className="app-link">
            Kalshi Screener
          </Link>
          <Link to="/poly-dashboard" className="app-link">
            Poly Dashboard
          </Link>
          <Link to="/poly-screener" className="app-link">
            Poly Screener
          </Link>
          <Link to="/vol-index" className="app-link">
            Vol Index
          </Link>
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
