import { useState, useEffect } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import './App.css'

// Call the API directly from the browser.
// Prefer Vite env var, fall back to the existing Lambda URL for safety.
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  'http://44.202.160.149:8000'

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

function App() {
  return (
    <div className="app-shell">
      <header className="app-nav">
        <span className="app-logo">Markets Before Headlines</span>
        <nav>
          <Link to="/" className="app-link" style={{ marginRight: '1rem' }}>
            Landing
          </Link>
          <Link to="/dashboard" className="app-link" style={{ marginRight: '1rem' }}>
            Dashboard
          </Link>
          <Link to="/screener" className="app-link">
            Screener
          </Link>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/screener" element={<ScreenerPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
