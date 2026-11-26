"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, ArrowDownRight, ArrowUpRight, BatteryCharging, Bell, ChevronDown, CircleHelp, Clock3, Download, Gauge, Leaf, MapPin, Menu, MoreHorizontal, PlugZap, Radio, Settings2, ShieldCheck, Sun, Wifi, Zap } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

type Device = { device_id: string; name: string | null; location: string | null; online: boolean; last_seen: number | null; power_w: number | null; voltage: number | null; current: number | null }
type ReadingPoint = { t: number; power_w: number; energy_kwh?: number }
type Summary = { total_kwh: number; total_cost?: number; currency?: string; devices: { device_id: string; name: string | null; location: string | null; kwh: number; avg_power_w: number | null; peak_power_w: number | null; samples: number }[] }

const demoNow = 1795671600
const demoDevices: Device[] = [
  { device_id: "solar_roof", name: "Rooftop solar", location: "Building A · Roof", online: true, last_seen: demoNow, power_w: 4280, voltage: 231.6, current: 18.5 },
  { device_id: "battery_main", name: "Battery storage", location: "Energy room", online: true, last_seen: demoNow, power_w: -1240, voltage: 230.8, current: 5.4 },
  { device_id: "office_main", name: "Office load", location: "Building A · Floor 1", online: true, last_seen: demoNow, power_w: 2860, voltage: 229.9, current: 12.4 },
  { device_id: "ev_charger", name: "EV charging", location: "Parking · Bay 04", online: false, last_seen: demoNow - 642, power_w: 0, voltage: 0, current: 0 },
]
const demoPoints = Array.from({ length: 24 }, (_, i) => ({ t: demoNow - (23-i)*3600, power_w: Math.round(3500 + Math.sin(i/3)*1200 + Math.cos(i/5)*500), energy_kwh: 0.8 + Math.sin(i/4)*0.3 }))
const fmt = (v: number, digits = 1) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(v)
const timeLabel = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>(demoDevices)
  const [points, setPoints] = useState<ReadingPoint[]>(demoPoints)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [period, setPeriod] = useState("today")
  const [endpoint, setEndpoint] = useState("http://localhost:8000")
  const [token, setToken] = useState("")
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [clientReady, setClientReady] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [selectedDevice, setSelectedDevice] = useState("all")
  const [mobileNav, setMobileNav] = useState(false)

  const loadData = useCallback(async (base = endpoint, auth = token) => {
    const h: HeadersInit = auth ? { Authorization: `Bearer ${auth}` } : {}
    const q = new URLSearchParams({ start: period === "week" ? "-7d" : "-24h", bucket: "15m" })
    const responses = await Promise.all([
      fetch(`${base.replace(/\/$/, "")}/api/devices`, { headers: h }),
      fetch(`${base.replace(/\/$/, "")}/api/summary?period=${period}`, { headers: h }),
      fetch(`${base.replace(/\/$/, "")}/api/total?${q}`, { headers: h }),
    ])
    for (const r of responses) if (!r.ok) throw new Error(r.status === 401 ? "Access denied. Check your read token." : `Energy hub returned ${r.status}.`)
    const [d, s, t] = await Promise.all(responses.map(r => r.json())) as [Device[], Summary, { points: ReadingPoint[] }]
    setDevices(d); setSummary(s); setPoints(t.points || []); setConnected(true); setError(""); setLastUpdated(new Date())
  }, [endpoint, token, period])

  useEffect(() => { setClientReady(true) }, [])

  useEffect(() => {
    if (!connected) return
    let alive = true
    const refresh = () => loadData().catch(e => { if (alive) setError(e instanceof Error ? e.message : "Unable to reach energy hub") })
    refresh()
    const timer = window.setInterval(refresh, 30000)
    const base = endpoint.replace(/\/$/, "")
    const streamUrl = `${base}/api/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`
    const stream = new EventSource(streamUrl)
    stream.onmessage = (event) => {
      try {
        const reading = JSON.parse(event.data) as { device_id: string; power_w: number; ts: number }
        setDevices(current => current.map(d => d.device_id === reading.device_id ? { ...d, power_w: reading.power_w, online: true, last_seen: reading.ts } : d))
        setPoints(current => [...current, { t: reading.ts, power_w: reading.power_w }].slice(-96))
        setLastUpdated(new Date())
      } catch { /* Ignore malformed stream events. */ }
    }
    return () => { alive = false; window.clearInterval(timer); stream.close() }
  }, [connected, endpoint, token, loadData])

  const connect = async () => {
    setConnecting(true); setError("")
    try { await loadData(endpoint, token); setConnected(true); setIsSettingsOpen(false) }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to connect") }
    finally { setConnecting(false) }
  }

  const livePower = devices.reduce((sum, d) => sum + (d.power_w || 0), 0)
  const energyToday = summary?.total_kwh ?? 18.42
  const onlineCount = devices.filter(d => d.online).length
  const chartData = points.map(p => ({ ...p, label: timeLabel(p.t) }))
  const energyBreakdown = summary?.devices ?? [
    { device_id: "solar_roof", name: "Rooftop solar", location: "Building A · Roof", kwh: 9.84, avg_power_w: 4100, peak_power_w: 5120, samples: 124 },
    { device_id: "office_main", name: "Office load", location: "Building A · Floor 1", kwh: 5.62, avg_power_w: 2380, peak_power_w: 3420, samples: 124 },
    { device_id: "battery_main", name: "Battery storage", location: "Energy room", kwh: 2.96, avg_power_w: 840, peak_power_w: 1760, samples: 122 },
  ]
  const solarDevice = energyBreakdown.find(device => /solar|pv|generation/i.test(`${device.name || ""} ${device.device_id}`))
  const mixDevices = connected ? energyBreakdown.slice(0, 3) : [
    { device_id: "solar", name: "Solar", kwh: 9.84 },
    { device_id: "battery", name: "Battery", kwh: 2.76 },
    { device_id: "grid", name: "Grid", kwh: 5.82 },
  ]
  const mixTotal = mixDevices.reduce((total, device) => total + device.kwh, 0)
  const firstMixStop = mixTotal > 0 ? (mixDevices[0]?.kwh || 0) / mixTotal * 100 : 0
  const secondMixStop = mixTotal > 0 ? firstMixStop + (mixDevices[1]?.kwh || 0) / mixTotal * 100 : 0
  const filteredDevices = selectedDevice === "all" ? devices : devices.filter(d => d.device_id === selectedDevice)

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <a className="brand" href="#overview" aria-label="Wattwise home"><span className="brand-mark"><Zap size={19} fill="currentColor" /></span><span>Wattwise<span className="brand-period">.</span></span></a>
        <div className="workspace-switch"><span className="workspace-avatar">N</span><span className="workspace-copy"><b>Northstar Campus</b><small>Energy workspace</small></span><ChevronDown size={15} /></div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#overview"><Activity size={17}/> Overview</a>
          <a className="nav-link" href="#devices"><PlugZap size={17}/> Devices <span className="nav-count">{devices.length}</span></a>
          <a className="nav-link" href="#energy"><Gauge size={17}/> Energy reports</a>
        </nav>
        <div className="side-bottom">
          <div className="side-tip"><span className="tip-icon"><Leaf size={16}/></span><b>Clean energy impact</b><p>Your solar array has avoided an estimated <strong>8.2 kg</strong> of CO₂ today.</p><a href="#energy">View impact <span>↗</span></a></div>
          <button className="nav-link side-settings" onClick={() => setIsSettingsOpen(true)}><Settings2 size={17}/> Hub settings</button>
          <div className="profile-row"><span className="profile-avatar">JD</span><span className="profile-copy"><b>Jordan Davis</b><small>Facility manager</small></span><MoreHorizontal size={18}/></div>
        </div>
      </aside>

      <section className="main-area" id="overview">
        <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Menu size={19}/></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>Overview</b></div><div className="top-actions"><div className={`connection-pill ${connected ? "is-connected" : "is-demo"}`}><span className="status-dot"/>{connected ? "Hub connected" : "Demo data"}</div><button className="icon-button" aria-label="Notifications"><Bell size={18}/><i/></button><button className="help-button"><CircleHelp size={17}/><span>Help center</span></button><button className="top-avatar" aria-label="Account menu">JD</button></div></header>

        <div className="content-wrap">
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> ENERGY OVERVIEW</div><h1>Your energy, <span>in balance.</span></h1><p className="heading-sub">A live view of generation, usage, and storage across your site.</p></div><div className="heading-actions"><button className="outline-button" onClick={() => setIsSettingsOpen(true)}><Settings2 size={16}/> Connect hub</button><button className="primary-button" onClick={() => window.print()}><Download size={16}/> Export report</button></div></div>
          {error && <div className="error-banner" role="alert"><Wifi size={16}/><span>{error}</span><button onClick={() => setIsSettingsOpen(true)}>Check connection</button></div>}
          <div className="date-row"><div className="date-context"><span className="date-icon"><Clock3 size={15}/></span><span>Today, {clientReady ? new Date().toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }) : "—"}</span><span className="date-separator">·</span><span className="updated">Updated {clientReady ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span></div><div className="site-filter"><MapPin size={14}/><span>All locations</span><ChevronDown size={14}/></div></div>

          <section className="metrics-grid" aria-label="Energy summary">
            <article className="metric-card metric-primary"><div className="metric-top"><span>LIVE POWER</span><span className="metric-icon green"><Zap size={17}/></span></div><div className="metric-value">{fmt(livePower / 1000, 2)}<span>kW</span></div><div className="metric-foot"><span className="live-pulse"/> Across {onlineCount} active devices <span className="metric-trend"><ArrowUpRight size={14}/> 6.8%</span></div><div className="metric-spark"><svg viewBox="0 0 140 42" preserveAspectRatio="none" aria-hidden="true"><path d="M0 34 C15 31 18 15 31 21 S48 32 60 22 78 9 90 16 106 28 118 13 132 17 140 4"/></svg></div></article>
            <article className="metric-card"><div className="metric-top"><span>ENERGY TODAY</span><span className="metric-icon blue"><Sun size={17}/></span></div><div className="metric-value">{fmt(energyToday, 2)}<span>kWh</span></div><div className="metric-foot"><span className="trend-positive"><ArrowDownRight size={14}/> 12.4%</span> vs. yesterday</div><div className="metric-note">of 32 kWh daily target</div><div className="progress-track"><span style={{ width: `${Math.min(100, energyToday / 32 * 100)}%` }}/></div></article>
            <article className="metric-card"><div className="metric-top"><span>{connected ? "SOLAR DEVICE ENERGY" : "SOLAR GENERATED"}</span><span className="metric-icon amber"><Sun size={17}/></span></div><div className="metric-value">{connected ? (solarDevice ? fmt(solarDevice.kwh, 2) : "—") : "9.84"}{(!connected || solarDevice) && <span>kWh</span>}</div><div className="metric-foot">{connected ? (solarDevice ? "Reported by solar device" : "No solar device classified") : <><span className="trend-positive"><ArrowUpRight size={14}/> 8.2%</span> vs. yesterday</>}</div><div className="metric-note"><span className="solar-indicator"/> {connected ? "Based on device labels" : "53% of today’s energy"}</div></article>
            <article className="metric-card"><div className="metric-top"><span>GRID INDEPENDENCE</span><span className="metric-icon violet"><BatteryCharging size={17}/></span></div><div className="metric-value">68<span>%</span></div><div className="metric-foot">Self-powered today <span className="metric-trend"><ShieldCheck size={14}/> On track</span></div><div className="independence-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></article>
          </section>

          <section className="dashboard-grid">
            <article className="panel chart-panel" id="energy"><div className="panel-heading"><div><h2>Power flow</h2><p>Real-time energy across your site</p></div><div className="chart-controls"><button className={period !== "week" ? "selected" : ""} onClick={() => setPeriod("today")}>24 hours</button><button className={period === "week" ? "selected" : ""} onClick={() => setPeriod("week")}>7 days</button><button aria-label="Chart options"><MoreHorizontal size={17}/></button></div></div><div className="chart-legend"><span><i className="legend-dot green-dot"/> {connected ? "Net site power" : "Power consumption"}</span><span className="chart-unit">POWER · kW</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="powerFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#74d7ad" stopOpacity={0.22}/><stop offset="100%" stopColor="#74d7ad" stopOpacity={0}/></linearGradient><linearGradient id="solarFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#85b9fa" stopOpacity={0.1}/><stop offset="100%" stopColor="#85b9fa" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="var(--grid-line)" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--text-soft)", fontSize: 11 }} minTickGap={45}/><YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--text-soft)", fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}`} domain={[0, "auto"]}/><Tooltip contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--text-main)", fontSize: 12 }} formatter={(value) => [`${fmt(Number(value)/1000, 2)} kW`, "Power"]}/><Area type="monotone" dataKey="power_w" stroke="#79d6ae" strokeWidth={2.4} fill="url(#powerFill)" isAnimationActive={false} activeDot={{ r: 4, fill: "#79d6ae", stroke: "var(--panel)" }} /></AreaChart></ResponsiveContainer></div><div className="chart-footer"><span><span className="chart-live-dot"/> Live updates enabled</span><span>Peak demand <b>{fmt(Math.max(...points.map(p => p.power_w || 0), 0)/1000, 2)} kW</b> at 11:45 AM</span></div></article>
            <article className="panel source-panel"><div className="panel-heading"><div><h2>{connected ? "Energy by device" : "Energy mix"}</h2><p>{connected ? "Consumption reported by each device" : "Where your power comes from"}</p></div><button className="small-icon" aria-label="More energy mix options"><MoreHorizontal size={18}/></button></div><div className="mix-visual"><div className="donut" style={connected && mixTotal > 0 ? { background: `conic-gradient(#7bd5a9 0 ${firstMixStop}%, #8a79cb ${firstMixStop}% ${secondMixStop}%, #3b4a59 ${secondMixStop}% 100%)` } : undefined}><div className="donut-inner"><strong>{connected ? fmt(mixTotal, 1) : "68"}<span>{connected ? "kWh" : "%"}</span></strong><small>{connected ? "total used" : "self-powered"}</small></div></div></div><div className="mix-rows">{mixDevices.slice(0, 3).map((device, index) => <div className="mix-row" key={device.device_id}><span className="mix-name"><i className={`mix-swatch ${index === 0 ? "mix-solar" : index === 1 ? "mix-battery" : "mix-grid"}`}/>{device.name || device.device_id}</span><b>{fmt(device.kwh, 2)} <small>kWh</small></b><span className="mix-percent">{mixTotal > 0 ? `${Math.round(device.kwh / mixTotal * 100)}%` : "—"}</span></div>)}</div><div className="source-caption"><Leaf size={14}/> {connected ? "Values summarized for selected period" : "2.1 kg CO₂ avoided today"}</div></article>
          </section>

          <section className="panel devices-panel" id="devices"><div className="panel-heading devices-heading"><div><div className="heading-title-row"><h2>Connected devices</h2><span className="device-total">{devices.length}</span></div><p>Monitor the health and output of your energy assets</p></div><div className="devices-actions"><button className="filter-button" onClick={() => setSelectedDevice(selectedDevice === "all" ? devices[0]?.device_id || "all" : "all")}>{selectedDevice === "all" ? "All devices" : "Filtered"}<ChevronDown size={14}/></button><button className="text-button" onClick={() => setIsSettingsOpen(true)}>Manage devices <span>↗</span></button></div></div><div className="table-scroll"><table><thead><tr><th>DEVICE</th><th>STATUS</th><th>POWER</th><th>VOLTAGE</th><th>LAST READING</th><th/></tr></thead><tbody>{filteredDevices.map((device, index) => <tr key={device.device_id}><td><div className="device-cell"><span className={`device-icon device-${index % 4}`}>{index === 0 ? <Sun size={17}/> : index === 1 ? <BatteryCharging size={17}/> : index === 2 ? <Gauge size={17}/> : <PlugZap size={17}/>}</span><span><b>{device.name || device.device_id}</b><small>{device.location || device.device_id}</small></span></div></td><td><span className={`device-status ${device.online ? "online" : "offline"}`}><i/>{device.online ? "Online" : "Offline"}</span></td><td className="power-cell">{fmt((device.power_w || 0)/1000, 2)} <small>kW</small></td><td>{device.voltage ? `${fmt(device.voltage, 1)} V` : "—"}</td><td className="last-seen">{!clientReady ? "—" : device.last_seen ? `${Math.max(0, Math.floor(Date.now()/1000 - device.last_seen)) < 60 ? "Just now" : `${Math.floor((Date.now()/1000 - device.last_seen)/60)} min ago`}` : "No readings yet"}</td><td><button className="row-more" aria-label={`More options for ${device.name || device.device_id}`}><MoreHorizontal size={18}/></button></td></tr>)}</tbody></table></div><div className="table-bottom"><span><Radio size={14}/> Showing {filteredDevices.length} of {devices.length} devices</span><button onClick={() => setIsSettingsOpen(true)}>View all devices <span>→</span></button></div></section>
          <footer className="page-footer"><span>Wattwise Energy Hub <span className="footer-divider">·</span> Monitoring your energy, intelligently.</span><span><span className="footer-status"/> {connected ? "Connected to energy hub" : "Previewing with sample data"}</span></footer>
        </div>
      </section>

      {isSettingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setIsSettingsOpen(false) }}><section className="connect-modal" role="dialog" aria-modal="true" aria-labelledby="connect-title"><button className="modal-close" aria-label="Close settings" onClick={() => setIsSettingsOpen(false)}>×</button><div className="modal-icon"><PlugZap size={20}/></div><div className="eyebrow">ENERGY HUB CONNECTION</div><h2 id="connect-title">Connect your energy hub</h2><p>Enter the address of your Flask energy_hub server. The dashboard reads your device list, summaries, and live stream directly from its API.</p><label htmlFor="hub-url">Hub API address</label><input id="hub-url" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="http://192.168.1.50:8000" type="url"/><small className="field-help">Use your Raspberry Pi&apos;s LAN address and port 8000.</small><label htmlFor="read-token">Read token <span>(optional)</span></label><input id="read-token" value={token} onChange={e => setToken(e.target.value)} placeholder="Set if READ_TOKEN is enabled" type="password" autoComplete="off"/><small className="field-help">Sent as a Bearer token. Kept only in this browser session.</small>{error && <div className="modal-error" role="alert">{error}</div>}<div className="modal-actions"><button className="outline-button" onClick={() => setIsSettingsOpen(false)}>Cancel</button><button className="primary-button" onClick={connect} disabled={connecting}>{connecting ? "Connecting…" : "Connect hub"}</button></div><div className="modal-security"><ShieldCheck size={14}/> Your token is not saved to the server.</div></section></div>}
    </main>
  )
}
