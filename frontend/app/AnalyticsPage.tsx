"use client"

import { motion } from "framer-motion"
import { ArrowLeft, ChevronDown, CheckCircle2, XCircle } from "lucide-react"
import { Suspense, useEffect, useState } from "react"
import { CardScene } from "./PokemonCard3D"
import { safeFormat } from "./utils"

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
  charizard: "/charizard.png",
  pikachu: "/pikachu.png",
  mewtwo: "/mewtwo.png",
  blastoise: "/blastoise.png",
  venusaur: "/venusaur.png",
  gyarados: "/gyarados.png",
}

const fmt = (v: any, digits = 2, unit = "") => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return `${safeFormat(v, digits)}${unit}`
}

/* ----------------------------- shared atoms ----------------------------- */

// A single spec value. Label sits quiet on top, number does the talking.
const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-neutral-950 px-3 py-3.5">
    <p className="text-[9px] uppercase tracking-[0.18em] text-neutral-500">{label}</p>
    <p className="mt-1.5 font-mono text-base sm:text-lg font-medium text-white tabular-nums">{value}</p>
  </div>
)

// Hairline-separated grid of Stats. gap-px over a faint bg draws the rules.
const SpecGrid = ({ cols = 3, children }: { cols?: 2 | 3; children: React.ReactNode }) => (
  <div
    className={`grid ${cols === 2 ? "grid-cols-2" : "grid-cols-3"} gap-px bg-white/10 rounded-lg overflow-hidden`}
  >
    {children}
  </div>
)

// Numbered section header — editorial index + tracked caps title.
const SectionHead = ({ index, title, hint }: { index: string; title: string; hint?: string }) => (
  <div className="flex items-baseline gap-3 mb-3">
    <span className="font-mono text-[11px] text-amber-300/70 tabular-nums">{index}</span>
    <div className="min-w-0">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white">{title}</h2>
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-neutral-400">{hint}</p>}
    </div>
  </div>
)

const Panel = ({
  delay = 0,
  children,
}: {
  delay?: number
  children: React.ReactNode
}) => (
  <motion.section
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4, ease: "easeOut" }}
    className="border border-white/10 bg-white/3 backdrop-blur-md rounded-xl p-4"
  >
    {children}
  </motion.section>
)

const CardDropdown = ({ open, onToggle, selected, cards, onSelect, disabled }: any) => (
  <div className="relative">
    <button
      onClick={() => onToggle(!open)}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-neutral-950 border border-white/15 hover:border-white/30 transition-colors text-xs font-medium uppercase tracking-wider text-white"
    >
      <span className="truncate">{selected}</span>
      <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute top-full left-0 right-0 mt-1 z-50 bg-neutral-950 border border-white/15 rounded-lg overflow-hidden max-h-48 overflow-y-auto"
      >
        {cards.map((card: string) => (
          <button
            key={card}
            onClick={() => onSelect(card)}
            disabled={disabled}
            className={`w-full px-3 py-2.5 text-left text-xs uppercase tracking-wider transition-colors disabled:opacity-40 border-b border-white/5 last:border-b-0 ${
              card === selected ? "text-amber-300" : "text-neutral-300 hover:bg-white/5"
            }`}
          >
            {card}
          </button>
        ))}
      </motion.div>
    )}
  </div>
)

/* --------------------------- concurrency panel -------------------------- */

const ConcurrencyPanel = ({
  index,
  data,
  onRun,
  running,
}: {
  index: string
  data: any
  onRun?: () => void
  running?: boolean
}) => {
  const rows: Array<any> = data?.rows || []
  return (
    <Panel delay={0.2}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <SectionHead
          index={index}
          title="Mutex vs Lock-Free"
          hint={`Pool size ${data?.pool_size ?? "—"}. Nanoseconds per acquire + release — lower is better. Fast ≈ 50ns hot path, slow ≈ 2ms I/O-bound unit.`}
        />
        {onRun && (
          <button
            onClick={onRun}
            disabled={running}
            className="shrink-0 text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-md border border-white/25 text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            {running ? "Running" : "Run"}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="text-[10px] text-neutral-500 py-6 text-center border-t border-white/10 mt-2">
          No data yet — run to measure on this host.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="text-neutral-500 uppercase tracking-wider">
                <th className="text-left font-medium py-2 px-1">Threads</th>
                <th className="text-left font-medium py-2 px-1">Workload</th>
                <th className="text-right font-medium py-2 px-1">Mutex</th>
                <th className="text-right font-medium py-2 px-1">Lock-free</th>
                <th className="text-right font-medium py-2 px-1">Speedup</th>
                <th className="text-right font-medium py-2 px-1">Verdict</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums text-neutral-300">
              {rows.map((r, i) => {
                const speedup = r.speedup ?? r.mutex_ns / r.lockfree_ns
                // Lock-free is only worth the complexity when it clearly wins (≥1.2×).
                const verdict =
                  speedup >= 1.2
                    ? { text: "lock-free", cls: "text-emerald-400" }
                    : speedup <= 0.85
                    ? { text: "mutex", cls: "text-emerald-400" }
                    : { text: "tie", cls: "text-neutral-500" }
                return (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-2 px-1">{r.threads}</td>
                    <td className="py-2 px-1 font-sans uppercase tracking-wide text-neutral-400">{r.workload}</td>
                    <td className="py-2 px-1 text-right">{fmt(r.mutex_ns, r.workload === "slow" ? 0 : 1)}</td>
                    <td className="py-2 px-1 text-right">{fmt(r.lockfree_ns, r.workload === "slow" ? 0 : 1)}</td>
                    <td className="py-2 px-1 text-right text-white">{fmt(speedup, 2, "×")}</td>
                    <td className={`py-2 px-1 text-right font-sans uppercase tracking-wide ${verdict.cls}`}>
                      {verdict.text}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-[9px] text-neutral-500 mt-3 pt-2 border-t border-white/5">
            Curl pool uses a mutex (slow workload). Metrics ring uses lock-free (fast workload).
          </p>
        </div>
      )}
    </Panel>
  )
}

/* --------------------------- correctness panel -------------------------- */

const CorrectnessPanel = ({
  index,
  data,
  onRun,
  running,
}: {
  index: string
  data: any
  onRun?: () => void
  running?: boolean
}) => {
  const result = data?.correctness ?? null
  const ok = data?.success ?? result?.ok ?? null
  const cases: Array<any> = result?.cases || []
  const tsan = result?.tsan === true

  return (
    <Panel delay={0.24}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <SectionHead
          index={index}
          title="Concurrency Correctness"
          hint="ThreadSanitizer instrumentation catches data races even when the counts happen to line up by luck."
        />
        <div className="flex items-center gap-2 shrink-0">
          {ok === true && (
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-400">
              <CheckCircle2 className="w-3 h-3" /> pass
            </span>
          )}
          {ok === false && (
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-rose-400">
              <XCircle className="w-3 h-3" /> fail
            </span>
          )}
          {tsan && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-white/20 text-neutral-300">
              TSan
            </span>
          )}
          {onRun && (
            <button
              onClick={onRun}
              disabled={running}
              className="text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-md border border-white/25 text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
            >
              {running ? "Running" : "Run"}
            </button>
          )}
        </div>
      </div>

      {cases.length === 0 ? (
        <div className="text-[10px] text-neutral-500 py-6 text-center border-t border-white/10 mt-2">
          No data yet — run to test on this host.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="text-neutral-500 uppercase tracking-wider">
                <th className="text-left font-medium py-2 px-1">Threads</th>
                <th className="text-right font-medium py-2 px-1">Per-thread</th>
                <th className="text-right font-medium py-2 px-1">Expected</th>
                <th className="text-right font-medium py-2 px-1">Observed</th>
                <th className="text-right font-medium py-2 px-1">Per-ind sum</th>
                <th className="text-right font-medium py-2 px-1">Wall (ms)</th>
                <th className="text-right font-medium py-2 px-1">Status</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums text-neutral-300">
              {cases.map((c, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-2 px-1">{c.threads}</td>
                  <td className="py-2 px-1 text-right">{c.per_thread}</td>
                  <td className="py-2 px-1 text-right">{c.expected}</td>
                  <td className="py-2 px-1 text-right text-white">{c.observed}</td>
                  <td className="py-2 px-1 text-right">{c.per_indicator_sum}</td>
                  <td className="py-2 px-1 text-right">{fmt(c.wall_ms, 1)}</td>
                  <td
                    className={`py-2 px-1 text-right font-sans uppercase tracking-wide ${
                      c.ok ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {c.ok ? "ok" : c.reason || "fail"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

/* -------------------------------- page --------------------------------- */

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
      className="relative h-screen w-screen text-white overflow-hidden flex flex-col"
      style={{
        backgroundImage: "url(/background.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Scrim — calms the photo so the data reads cleanly */}
      <div className="absolute inset-0 bg-linear-to-b from-black/75 via-black/65 to-black/85" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <header className="px-4 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-neutral-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="text-center">
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-[0.3em] text-white">Benchmark</h1>
            <p className="text-[9px] uppercase tracking-[0.2em] text-neutral-500 mt-0.5">
              Market Indicator Compute Time
            </p>
          </div>
          <div className="w-13" aria-hidden />
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto flex flex-col sm:flex-row gap-4 p-4 sm:p-6 scrollbar-hide">
          {/* Card selector — desktop rail */}
          <div className="hidden sm:block w-40 shrink-0">
            <CardDropdown
              open={isDropdownOpen}
              onToggle={setIsDropdownOpen}
              selected={selectedCard}
              cards={availableCards}
              onSelect={handleCardSelect}
              disabled={regeneratingMetrics}
            />
          </div>

          <div className="flex-1 space-y-4 min-w-0">
            {/* Card selector — mobile */}
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

            {/* Subject card */}
            <Panel>
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-300">{selectedCard}</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mt-0.5">Base Set</p>
                </div>
                <span className="font-mono text-[11px] text-neutral-600 tabular-nums">—</span>
              </div>

              <div className="h-44 sm:h-52 bg-neutral-950 rounded-lg overflow-hidden">
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-full">
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                  }
                >
                  <CardScene cardImage={DEFAULT_IMAGES[selectedCard.toLowerCase()] || DEFAULT_IMAGES.charizard} />
                </Suspense>
              </div>

              <button
                onClick={() => onRegenerateMetrics(selectedCard)}
                disabled={regeneratingMetrics}
                className="mt-3 w-full px-4 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-[0.15em] rounded-md hover:bg-neutral-200 disabled:opacity-40 transition-colors"
              >
                {regeneratingMetrics ? "Regenerating" : "Regenerate"}
              </button>
            </Panel>

            {/* 01 — Latency: chrono + Google Benchmark, together */}
            <Panel delay={0.08}>
              <SectionHead
                index="01"
                title="Calculation Latency"
                hint={`Wall-clock time to compute ${selectedCard}'s market indicators (SMA, RSI, mean-reversion & momentum signals), measured two ways.`}
              />

              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-neutral-400 mb-2">
                std::chrono — manual timing
              </p>
              <SpecGrid cols={3}>
                <Stat label="Mean" value={fmt(overallMetrics.mean_ms, 3, "ms")} />
                <Stat label="P95" value={fmt(overallMetrics.p95_ms, 3, "ms")} />
                <Stat label="P99" value={fmt(overallMetrics.p99_ms, 3, "ms")} />
              </SpecGrid>

              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-neutral-400 mt-4 mb-2">
                Google Benchmark
              </p>
              <SpecGrid cols={3}>
                <Stat label="Mean" value={fmt(benchmark.mean_ms, 2, "ms")} />
                <Stat label="Min" value={fmt(benchmark.min_ms, 2, "ms")} />
                <Stat label="Max" value={fmt(benchmark.max_ms, 2, "ms")} />
                <Stat label="P95" value={fmt(benchmark.p95_ms, 2, "ms")} />
                <Stat label="P99" value={fmt(benchmark.p99_ms, 2, "ms")} />
                <Stat
                  label="Iterations"
                  value={benchmark.iterations != null ? String(benchmark.iterations) : "—"}
                />
              </SpecGrid>
            </Panel>

            {/* 02 — Market Indicators (the values being timed above) */}
            <Panel delay={0.12}>
              <SectionHead
                index="02"
                title="Market Indicators"
                hint="The values computed during the runs above."
              />
              <SpecGrid cols={3}>
                <Stat label="Price" value={fmt(indicators.current_price, 2, "")} />
                <Stat label="SMA (20)" value={fmt(indicators.sma_20, 2, "")} />
                <Stat label="RSI" value={fmt(indicators.rsi, 1)} />
              </SpecGrid>
            </Panel>

            {/* 03 — Concurrency */}
            <ConcurrencyPanel
              index="03"
              data={concurrency}
              onRun={onRunConcurrency}
              running={runningConcurrency}
            />

            {/* 04 — Correctness */}
            <CorrectnessPanel
              index="04"
              data={correctness}
              onRun={onRunCorrectness}
              running={runningCorrectness}
            />

            {/* 05 — Signals */}
            <Panel delay={0.28}>
              <SectionHead index="05" title="Signals" hint="Derived from the indicators above." />
              <div className="grid grid-cols-2 gap-px bg-white/10 rounded-lg overflow-hidden">
                <div className="bg-neutral-950 p-3.5">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">Mean Reversion</h3>
                  <p className="text-[9px] text-neutral-500 mt-0.5">Price normalization</p>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-[9px] uppercase tracking-wider text-neutral-500">Confidence</span>
                    {/* confidence comes from C++ as 0-100 already; do not multiply. */}
                    <span className="font-mono text-base font-medium text-white tabular-nums">
                      {fmt(algos.mean_reversion?.confidence, 1, "%")}
                    </span>
                  </div>
                </div>

                <div className="bg-neutral-950 p-3.5">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">Momentum</h3>
                  <p className="text-[9px] text-neutral-500 mt-0.5">Trend continuation</p>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-[9px] uppercase tracking-wider text-neutral-500">Momentum</span>
                    {/* momentum is a percentage already in C++; do not multiply. */}
                    <span className="font-mono text-base font-medium text-white tabular-nums">
                      {fmt(algos.momentum?.momentum, 1, "%")}
                    </span>
                  </div>
                </div>
              </div>
            </Panel>
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