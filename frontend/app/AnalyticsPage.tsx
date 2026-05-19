"use client"

import { motion } from "framer-motion"
import { ArrowLeft, ChevronDown, CheckCircle2, XCircle, ShieldCheck, Activity } from "lucide-react"
import { Suspense, useEffect, useState } from "react"
import { CardScene } from "./PokemonCard3D"
import { safeFormat } from "./utils"
import { on } from "events"

interface AnalyticsPageProps {
  metricsData: any
  onBack: () => void
  cardImage: string | null
  cardName: string
  onRegenerateMetrics: (cardname: string) => void
  regeneratingMetrics: boolean
  onCardChange?: (cardName: string) => void
  availableCards?: string[]
  onRunConcurrency?: () => void
  runningConcurrency?: boolean
  onRunCorrectness?: () => void
  runningCorrectness?: boolean
}

const DEFAULT_CARDS = ["Charizard", "Pikachu", "Mewtwo", "Blastoise", "Venusaur", "Gyarados"]
const DEFAULT_IMAGES: Record<string, string> = {
  "charizard": "/charizard.png",
  "pikachu": "/pikachu.png",
  "mewtwo": "/mewtwo.png",
  "blastoise": "/blastoise.png",
  "venusaur": "/venusaur.png",
  "gyarados": "/gyarados.png",
}

const fmt = (v: any, digits = 2, unit = "") => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return `${safeFormat(v, digits)}${unit}`
}

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-black/20 rounded-lg p-2 text-center border border-white/10">
    <p className="text-[7px] sm:text-[8px] text-black uppercase tracking-wider mb-0.5">{label}</p>
    <p className="text-sm sm:text-base font-bold text-amber-200">{value}</p>
  </div>
)

const CardDropdown = ({ open, onToggle, selected, cards, onSelect, disabled }: any) => (
  <div className="relative">
    <button
      onClick={() => onToggle(!open)}
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-black/40 border border-white/20 hover:bg-black/50 transition-colors text-xs font-medium text-amber-200"
    >
      <span className="truncate">{selected}</span>
      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute top-full left-0 right-0 mt-1 z-50 bg-black/80 backdrop-blur-xl border border-white/20 rounded-lg overflow-hidden shadow-xl max-h-48 overflow-y-auto"
      >
        {cards.map((card: string) => (
          <button
            key={card}
            onClick={() => onSelect(card)}
            disabled={disabled}
            className="w-full px-3 py-2 text-left text-xs text-amber-200 hover:bg-white/10 transition-colors disabled:opacity-50 border-b border-white/10 last:border-b-0"
          >
            {card}
          </button>
        ))}
      </motion.div>
    )}
  </div>
)

// ---------- Concurrency panel ----------

const ConcurrencyPanel = ({
  data,
  onRun,
  running,
}: {
  data: any
  onRun?: () => void
  running?: boolean
}) => {
  const rows: Array<any> = data?.rows || []
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-amber-200" />
          <h2 className="text-xs font-bold text-amber-200 uppercase">Mutex vs Lock-Free</h2>
        </div>
        {onRun && (
          <button
            onClick={onRun}
            disabled={running}
            className="text-[10px] px-2 py-1 rounded bg-black/40 border border-white/20 text-amber-200 hover:bg-black/50 disabled:opacity-50"
          >
            {running ? "Running…" : "Run"}
          </button>
        )}
      </div>
      <p className="text-[9px] text-black mb-2">
        Pool size {data?.pool_size ?? "—"}. ns per acquire+release, lower is better.
        Fast = ~50ns work unit (hot path). Slow = ~2ms work unit (I/O-bound).
      </p>

      {rows.length === 0 ? (
        <div className="text-[10px] text-black py-3 text-center">
          No data yet — click Run to measure on this host.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] text-black border-collapse">
            <thead>
              <tr className="text-black">
                <th className="text-left font-medium py-1">Threads</th>
                <th className="text-left font-medium py-1">Workload</th>
                <th className="text-right font-medium py-1">Mutex</th>
                <th className="text-right font-medium py-1">Lock-free</th>
                <th className="text-right font-medium py-1">Speedup</th>
                <th className="text-right font-medium py-1">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const speedup = r.speedup ?? (r.mutex_ns / r.lockfree_ns)
                // Verdict: lock-free is worth the complexity only when it
                // clearly wins (≥1.2x). Otherwise mutex is the right call.
                const verdict =
                  speedup >= 1.2
                    ? { text: "lock-free", cls: "text-emerald-600" }
                    : speedup <= 0.85
                    ? { text: "mutex", cls: "text-emerald-600" }
                    : { text: "tie", cls: "text-black" }
                return (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-1">{r.threads}</td>
                    <td className="py-1">{r.workload}</td>
                    <td className="py-1 text-right">{fmt(r.mutex_ns, r.workload === "slow" ? 0 : 1)}</td>
                    <td className="py-1 text-right">{fmt(r.lockfree_ns, r.workload === "slow" ? 0 : 1)}</td>
                    <td className="py-1 text-right">{fmt(speedup, 2, "×")}</td>
                    <td className={`py-1 text-right ${verdict.cls}`}>{verdict.text}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-[9px] text-black mt-2 italic">
            Curl pool uses mutex (slow workload). Metrics ring uses lock-free (fast workload).
          </p>
        </div>
      )}
    </motion.div>
  )
}

// ---------- Correctness panel ----------

const CorrectnessPanel = ({
  data,
  onRun,
  running,
}: {
  data: any
  onRun?: () => void
  running?: boolean
}) => {
  const result = data?.correctness ?? null
  const ok = data?.success ?? result?.ok ?? null
  const cases: Array<any> = result?.cases || []
  const tsan = result?.tsan === true

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22 }}
      className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-amber-200" />
          <h2 className="text-xs font-bold text-amber-200 uppercase">Concurrency Correctness</h2>
        </div>
        <div className="flex items-center gap-2">
          {ok === true && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
              <CheckCircle2 className="w-3 h-3" /> pass
            </span>
          )}
          {ok === false && (
            <span className="flex items-center gap-1 text-[10px] text-rose-600">
              <XCircle className="w-3 h-3" /> fail
            </span>
          )}
          {tsan && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              TSan
            </span>
          )}
          {onRun && (
            <button
              onClick={onRun}
              disabled={running}
              className="text-[10px] px-2 py-1 rounded bg-black/40 border border-white/20 text-amber-200 hover:bg-black/50 disabled:opacity-50"
            >
              {running ? "Running…" : "Run"}
            </button>
          )}
        </div>
      </div>

      <p className="text-[9px] text-black mb-2">
        TSan instrumentation catches data races
        even when counts align by luck.
      </p>

      {cases.length === 0 ? (
        <div className="text-[10px] text-black py-3 text-center">
          No data yet — click Run to test on this host.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] text-black border-collapse">
            <thead>
              <tr className="text-black">
                <th className="text-left font-medium py-1">Threads</th>
                <th className="text-right font-medium py-1">Per-thread</th>
                <th className="text-right font-medium py-1">Expected</th>
                <th className="text-right font-medium py-1">Observed</th>
                <th className="text-right font-medium py-1">Per-ind sum</th>
                <th className="text-right font-medium py-1">Wall (ms)</th>
                <th className="text-right font-medium py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-1">{c.threads}</td>
                  <td className="py-1 text-right">{c.per_thread}</td>
                  <td className="py-1 text-right">{c.expected}</td>
                  <td className="py-1 text-right">{c.observed}</td>
                  <td className="py-1 text-right">{c.per_indicator_sum}</td>
                  <td className="py-1 text-right">{fmt(c.wall_ms, 1)}</td>
                  <td className={`py-1 text-right ${c.ok ? "text-emerald-600" : "text-rose-600"}`}>
                    {c.ok ? "ok" : (c.reason || "fail")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  )
}

// ---------- Main page ----------

export function AnalyticsPage({
  metricsData,
  onBack,
  cardName,
  onRegenerateMetrics,
  regeneratingMetrics,
  onCardChange,
  availableCards = DEFAULT_CARDS,
  onRunConcurrency,
  runningConcurrency,
  onRunCorrectness,
  runningCorrectness,
}: AnalyticsPageProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState(cardName)

  const metrics = metricsData?.metrics || {}
  const benchmark = metricsData?.benchmark || {}
  const concurrency = metricsData?.concurrency || null
  const correctness = metricsData?.correctness || null

  const overallMetrics = metrics.overall || {}
  const indicators = metrics.indicators || {}
  const algos = metrics.algos || {}

  const handleCardSelect = (card: string) => {
    setSelectedCard(card)
    setIsDropdownOpen(false)
    onCardChange?.(card)
    onRegenerateMetrics(card)
  }

  useEffect(() => {
    onRegenerateMetrics(selectedCard)
  }, [])

  return (
    <div
      className="h-screen w-screen text-white overflow-hidden flex flex-col pb-2"
      style={{ backgroundImage: 'url(/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-yellow-600/30 bg-black/20 backdrop-blur-sm flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/20 hover:bg-black/50 text-xs font-medium text-amber-200"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <h1 className="text-sm sm:text-base font-bold text-amber-200">Benchmark</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex flex-col sm:flex-row gap-4 p-4 scrollbar-hide">
        {/* Card Selector - Hidden on mobile */}
        <div className="hidden sm:flex sm:flex-col gap-2 w-32 flex-shrink-0">
          <CardDropdown
            open={isDropdownOpen}
            onToggle={setIsDropdownOpen}
            selected={selectedCard}
            cards={availableCards}
            onSelect={handleCardSelect}
            disabled={regeneratingMetrics}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-3 min-w-0">
          {/* Mobile Dropdown */}
          <div className="sm:hidden">
            <CardDropdown
              open={isDropdownOpen}
              onToggle={setIsDropdownOpen}
              selected={selectedCard}
              cards={availableCards}
              onSelect={handleCardSelect}
              disabled={regeneratingMetrics}
            />
          </div>

          {/* Card Display */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
          >
            <div className="px-4 py-2 border-b border-white/10">
              <p className="text-xs font-semibold text-amber-200 uppercase">{selectedCard}</p>
              <p className="text-[10px] text-black">Base Set</p>
            </div>
            <div className="h-40 sm:h-48 bg-black/50">
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-yellow-600/30 border-t-yellow-400 rounded-full animate-spin" /></div>}>
                <CardScene cardImage={DEFAULT_IMAGES[selectedCard.toLowerCase()] || DEFAULT_IMAGES.charizard} />
              </Suspense>
            </div>
            <div className="grid grid-cols-3 gap-2 p-3 border-t border-white/10 bg-black/10">
              <StatCard label="Mean" value={fmt(overallMetrics.mean_ms, 3, "ms")} />
              <StatCard label="P95" value={fmt(overallMetrics.p95_ms, 3, "ms")} />
              <StatCard label="P99" value={fmt(overallMetrics.p99_ms, 3, "ms")} />
            </div>
            <div className="text-[9px] text-black px-3 py-2 border-t border-white/10 bg-black/10">Manual Stopwatch</div>
            <div className="px-3 py-2">
              <motion.button
                onClick={() => onRegenerateMetrics(selectedCard)}
                disabled={regeneratingMetrics}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full px-3 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold rounded-lg hover:shadow-lg hover:shadow-yellow-500/20 disabled:opacity-50 text-xs uppercase"
              >
                {regeneratingMetrics ? "Regenerating..." : "Regenerate"}
              </motion.button>
            </div>
          </motion.div>

          {/* Market Indicators */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-3"
          >
            <h2 className="text-xs font-bold text-amber-200 uppercase mb-2">Market Indicators</h2>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Price" value={fmt(indicators.current_price, 2, "")} />
              <StatCard label="SMA(20)" value={fmt(indicators.sma_20, 2, "")} />
              <StatCard label="RSI" value={fmt(indicators.rsi, 1)} />
            </div>
          </motion.div>

          {/* Benchmark Results */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-3"
          >
            <h2 className="text-xs font-bold text-amber-200 uppercase mb-2">Google Benchmark</h2>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Mean" value={fmt(benchmark.mean_ms, 2, "ms")} />
              <StatCard label="Min" value={fmt(benchmark.min_ms, 2, "ms")} />
              <StatCard label="Max" value={fmt(benchmark.max_ms, 2, "ms")} />
              <StatCard label="P95" value={fmt(benchmark.p95_ms, 2, "ms")} />
              <StatCard label="P99" value={fmt(benchmark.p99_ms, 2, "ms")} />
              <StatCard label="Iterations" value={benchmark.iterations != null ? String(benchmark.iterations) : "—"} />
            </div>
          </motion.div>

          {/* NEW: Concurrency Comparison */}
          <ConcurrencyPanel data={concurrency} onRun={onRunConcurrency} running={runningConcurrency} />

          {/* NEW: Correctness */}
          <CorrectnessPanel data={correctness} onRun={onRunCorrectness} running={runningCorrectness} />

          {/* Algos */}
          <div className="grid grid-cols-2 gap-3 mb-2">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-3"
            >
              <h3 className="text-xs font-bold text-amber-200 mb-1">Mean Reversion</h3>
              <p className="text-[9px] text-black mb-2">Price normalization</p>
              <div className="flex justify-between">
                <span className="text-[8px] text-black">Confidence</span>
                {/* confidence comes from C++ as 0-100 already; do not multiply. */}
                <span className="text-xs font-bold text-amber-200">{fmt(algos.mean_reversion?.confidence, 1, "%")}</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-3"
            >
              <h3 className="text-xs font-bold text-amber-200 mb-1">Momentum</h3>
              <p className="text-[9px] text-black mb-2">Trend continuation</p>
              <div className="flex justify-between">
                <span className="text-[8px] text-black">Momentum</span>
                {/* momentum is a percentage already in C++; do not multiply. */}
                <span className="text-xs font-bold text-amber-200">{fmt(algos.momentum?.momentum, 1, "%")}</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}