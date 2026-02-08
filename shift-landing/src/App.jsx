import { useState, useEffect } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import './App.css'

// Call the Lambda API directly from the browser
const API_BASE =
  'https://wnlul5avuii4hh4crehsmljhzq0ikxwx.lambda-url.us-east-1.on.aws'

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
  const tradability = useApi('/tradeability-score')
  const eventsByVolume = useApi('/top_events_volume')
  const eventsByOpenInterest = useApi('/top_events_open_interest')

  return (
    <div className="dashboard">
      <h2>Prediction Market Dashboard</h2>
      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-header">
          <div className="panel-title">Top Tradability Markets</div>
          <div className="panel-status">/tradability-score</div>
        </div>
        <div className="panel-body">
          {tradability.loading && (
            <div className="loading">Loading markets…</div>
          )}
          {tradability.error && (
            <div className="error">{tradability.error.message}</div>
          )}
          {Array.isArray(tradability.data) && tradability.data.length > 0 && (
            <div className="markets-table-wrapper">
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Volume</th>
                    <th>Open Interest</th>
                    <th>Tradability</th>
                  </tr>
                </thead>
                <tbody>
                  {tradability.data.map((row) => (
                    <tr key={row.market_ticker}>
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
                        {typeof row.tradability_score === 'number'
                          ? (
                              <span className="tradability-blur">
                                {row.tradability_score.toFixed(2)}
                              </span>
                            )
                          : (
                              <span className="tradability-blur">
                                {row.tradability_score}
                              </span>
                            )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {Array.isArray(tradability.data) && tradability.data.length === 0 &&
            !tradability.loading &&
            !tradability.error && (
              <span className="muted">No markets available.</span>
            )}

          <div className="dashboard-cta">
            <h3>Get these shifts before they move headlines.</h3>
            <p>
              We send one short, insight-heavy email per day with the most
              interesting moves in prediction markets.
            </p>
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
            <p className="fineprint">No spam. One email per day.</p>
          </div>

          <div className="legal-disclaimer">
            This site provides informational market data only and does not
            constitute financial, investment, or trading advice. Past market
            performance and tradability scores are not indicative of future
            results. Always do your own research and consult a qualified
            advisor before making investment decisions.
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-header">
          <div className="panel-title">Top Events by Volume</div>
          <div className="panel-status">/top_events_volume</div>
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
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Markets</th>
                    <th>Total Volume</th>
                    <th>Avg Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsByVolume.data.map((row) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div className="panel-header">
          <div className="panel-title">Top Events by Open Interest</div>
          <div className="panel-status">/top_events_open_interest</div>
        </div>
        <div className="panel-body">
          {eventsByOpenInterest.loading && (
            <div className="loading">Loading events…</div>
          )}
          {eventsByOpenInterest.error && (
            <div className="error">{eventsByOpenInterest.error.message}</div>
          )}
          {Array.isArray(eventsByOpenInterest.data) &&
            eventsByOpenInterest.data.length > 0 && (
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Markets</th>
                    <th>Total Open Interest</th>
                    <th>Avg Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsByOpenInterest.data.map((row) => (
                    <tr key={row.event_ticker}>
                      <td>{row.event_ticker}</td>
                      <td>{row.n_markets}</td>
                      <td>
                        {typeof row.total_open_interest === 'number'
                          ? row.total_open_interest.toLocaleString('en-US')
                          : row.total_open_interest}
                      </td>
                      <td>
                        {typeof row.avg_spread_ticks === 'number'
                          ? row.avg_spread_ticks.toFixed(2)
                          : row.avg_spread_ticks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <Link to="/dashboard" className="app-link">
            Dashboard
          </Link>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
