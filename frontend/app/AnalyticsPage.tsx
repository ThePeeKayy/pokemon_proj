"use client"

import { motion } from "framer-motion"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { Suspense, useState } from "react"
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

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-black/20 rounded-lg p-2 text-center border border-white/10">
    <p className="text-[7px] sm:text-[8px] text-white/40 uppercase tracking-wider mb-0.5">{label}</p>
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

export function AnalyticsPage({
  metricsData,
  onBack,
  cardName,
  onRegenerateMetrics,
  regeneratingMetrics,
  onCardChange,
  availableCards = DEFAULT_CARDS,
}: AnalyticsPageProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState(cardName)
  
  const metrics = metricsData?.metrics || {}
  const benchmark = metricsData?.benchmark || {}
  const overallMetrics = metrics.overall || {}
  const indicators = metrics.indicators || {}
  const algos = metrics.algos || {}

  const handleCardSelect = (card: string) => {
    setSelectedCard(card)
    setIsDropdownOpen(false)
    onCardChange?.(card)
    onRegenerateMetrics(card)
  }

  return (
    <div
      className="h-screen w-screen text-white overflow-hidden flex flex-col"
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
              <p className="text-[10px] text-white/30">Base Set</p>
            </div>
            <div className="h-40 sm:h-48 bg-black/50">
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-yellow-600/30 border-t-yellow-400 rounded-full animate-spin" /></div>}>
                <CardScene cardImage={DEFAULT_IMAGES[selectedCard.toLowerCase()] || DEFAULT_IMAGES.charizard} />
              </Suspense>
            </div>
            <div className="grid grid-cols-3 gap-2 p-3 border-t border-white/10 bg-black/10">
              <StatCard label="Mean" value={`${safeFormat(overallMetrics.mean_ms, 3)}ms`} />
              <StatCard label="P95" value={`${safeFormat(overallMetrics.p95_ms, 3)}ms`} />
              <StatCard label="P99" value={`${safeFormat(overallMetrics.p99_ms, 3)}ms`} />
            </div>
            <div className="text-[9px] text-white/40 px-3 py-2 border-t border-white/10 bg-black/10">Manual Stopwatch</div>
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
              <StatCard label="Price" value={`$${safeFormat(indicators.current_price, 2)}`} />
              <StatCard label="SMA(20)" value={`$${safeFormat(indicators.sma_20, 2)}`} />
              <StatCard label="RSI" value={safeFormat(indicators.rsi, 1)} />
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
              <StatCard label="Mean" value={`${safeFormat(benchmark.mean_ms, 2)}ms`} />
              <StatCard label="Min" value={`${safeFormat(benchmark.min_ms, 2)}ms`} />
              <StatCard label="Max" value={`${safeFormat(benchmark.max_ms, 2)}ms`} />
              <StatCard label="P95" value={`${safeFormat(benchmark.p95_ms, 2)}ms`} />
              <StatCard label="P99" value={`${safeFormat(benchmark.p99_ms, 2)}ms`} />
              <StatCard label="Iterations" value={benchmark.iterations || 0} />
            </div>
          </motion.div>

          {/* Algos */}
          <div className="grid grid-cols-2 gap-3">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-3"
            >
              <h3 className="text-xs font-bold text-amber-200 mb-1">Mean Reversion</h3>
              <p className="text-[9px] text-white/40 mb-2">Price normalization</p>
              <div className="flex justify-between">
                <span className="text-[8px] text-white/40">Confidence</span>
                <span className="text-xs font-bold text-amber-200">{safeFormat((algos.mean_reversion?.confidence || 0) * 100, 1)}%</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-3"
            >
              <h3 className="text-xs font-bold text-amber-200 mb-1">Momentum</h3>
              <p className="text-[9px] text-white/40 mb-2">Trend continuation</p>
              <div className="flex justify-between">
                <span className="text-[8px] text-white/40">Momentum</span>
                <span className="text-xs font-bold text-amber-200">{safeFormat((algos.momentum?.momentum || 0) * 100, 1)}%</span>
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