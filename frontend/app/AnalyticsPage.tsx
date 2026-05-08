"use client"

import { motion} from "framer-motion"
import { ArrowLeft } from "lucide-react"
import { Suspense } from "react"
import { CardScene } from "./PokemonCard3D"
import { safeFormat } from "./utils"

interface AnalyticsPageProps {
  metricsData: any
  onBack: () => void
  cardImage: string | null
  cardName: string
  onRegenerateMetrics: () => void
  regeneratingMetrics: boolean
}

export function AnalyticsPage({
  metricsData,
  onBack,
  cardImage,
  cardName,
  onRegenerateMetrics,
  regeneratingMetrics,
}: AnalyticsPageProps) {
  const overallMetrics = metricsData?.overall || {}
  const indicators = metricsData?.indicators || {}
  const algos = metricsData?.algos || {}

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="h-screen w-screen text-white overflow-hidden flex flex-col bg-black"
    >
      {/* Subtle gold accent background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-black to-yellow-950/5 pointer-events-none" />

      <div className="relative h-screen w-full flex flex-col overflow-hidden">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex-shrink-0 px-4 py-3 border-b border-yellow-600/20 bg-black/40 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-600/10 border border-yellow-600/30 hover:bg-yellow-600/20 transition-colors text-xs font-medium text-yellow-400"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <h1 className="text-lg sm:text-xl font-bold text-yellow-400 tracking-tight">Analytics</h1>
            <div className="w-16" />
          </div>
        </motion.div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="px-4 py-4 space-y-2 pb-2">
            {/* Card + Quick Metrics */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="bg-gradient-to-br from-yellow-900/10 to-black border border-yellow-600/20 rounded-xl overflow-hidden"
            >
              {/* Card Name */}
              <div className="px-4 pt-3 pb-2 border-b border-yellow-600/10">
                <p className="text-xs tracking-widest text-yellow-400 font-semibold uppercase">{cardName}</p>
                <p className="text-[10px] text-yellow-600/50 tracking-wider">Base Set</p>
              </div>

              {/* 3D Card */}
              <div className="h-40 sm:h-48 bg-black/50">
                <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-5 h-5 border-2 border-yellow-600/30 border-t-yellow-400 rounded-full animate-spin" /></div>}>
                  <CardScene cardImage={cardImage} />
                </Suspense>
              </div>

              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 p-3 border-t border-yellow-600/10 bg-black/30">
                <div className="text-center">
                  <p className="text-[8px] text-yellow-600/60 uppercase tracking-wider mb-1">Mean</p>
                  <p className="text-sm font-bold text-yellow-400">{safeFormat(overallMetrics.mean_ms, 3)}ms</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] text-yellow-600/60 uppercase tracking-wider mb-1">P95</p>
                  <p className="text-sm font-bold text-yellow-400">{safeFormat(overallMetrics.p95_ms, 3)}ms</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] text-yellow-600/60 uppercase tracking-wider mb-1">P99</p>
                  <p className="text-sm font-bold text-yellow-400">{safeFormat(overallMetrics.p99_ms, 3)}ms</p>
                </div>
              </div>

              {/* Status & Button */}
              <div className="px-3 py-3 space-y-2 border-t border-yellow-600/10 bg-black/50">

                <motion.button
                  onClick={onRegenerateMetrics}
                  disabled={regeneratingMetrics}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full px-3 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold rounded-lg hover:shadow-lg hover:shadow-yellow-500/20 transition-all disabled:opacity-50 text-xs uppercase tracking-wide"
                >
                  {regeneratingMetrics ? "Regenerating..." : "Regenerate"}
                </motion.button>
              </div>
            </motion.div>

            {/* Market Indicators */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="bg-black/30 border border-yellow-600/20 rounded-xl overflow-hidden"
            >
              <div className="px-4 py-3 flex items-center gap-2 border-b border-yellow-600/10 bg-black/50">
                <h2 className="text-sm font-bold text-yellow-400 uppercase tracking-wide">Market Indicators</h2>
              </div>
              <div className="grid grid-cols-3 gap-2 p-3">
                <div className="bg-black/50 rounded-lg p-2.5 text-center border border-yellow-600/10">
                  <p className="text-[8px] text-yellow-600/60 uppercase tracking-wider mb-0.5">Price</p>
                  <p className="text-base font-bold text-yellow-400">${safeFormat(indicators.current_price, 2)}</p>
                </div>
                <div className="bg-black/50 rounded-lg p-2.5 text-center border border-yellow-600/10">
                  <p className="text-[8px] text-yellow-600/60 uppercase tracking-wider mb-0.5">SMA(20)</p>
                  <p className="text-base font-bold text-yellow-400">${safeFormat(indicators.sma_20, 2)}</p>
                </div>
                <div className="bg-black/50 rounded-lg p-2.5 text-center border border-yellow-600/10">
                  <p className="text-[8px] text-yellow-600/60 uppercase tracking-wider mb-0.5">RSI</p>
                  <p className="text-base font-bold text-yellow-400">{safeFormat(indicators.rsi, 1)}</p>
                </div>
              </div>
            </motion.div>

            {/* Mean Reversion Algorithm */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="bg-gradient-to-br from-yellow-900/10 to-black border border-yellow-600/20 rounded-xl p-3.5 overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-500/5 rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-start gap-2 mb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-yellow-400">Mean Reversion</h3>
                    <p className="text-[10px] text-yellow-600/50">Price normalization</p>
                  </div>
                </div>

                <p className="text-xs text-yellow-600/80 mb-2 leading-relaxed">
                  Assets return to their average price over time. When price deviates significantly, a reversion to mean is likely.
                </p>

                <div className="bg-black/50 rounded-lg p-2.5 border border-yellow-600/10 space-y-1.5">
                  <div className="flex items-center justify-between pt-1 border-t border-yellow-600/10">
                    <p className="text-[9px] text-yellow-600/60">Confidence</p>
                    <p className="text-xs font-bold text-yellow-400">{safeFormat((algos.mean_reversion?.confidence || 0) * 100, 1)}%</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Momentum Algorithm */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="bg-gradient-to-br from-yellow-900/10 to-black border border-yellow-600/20 rounded-xl p-3.5 overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-500/5 rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-start gap-2 mb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-yellow-400">Momentum</h3>
                    <p className="text-[10px] text-yellow-600/50">Trend continuation</p>
                  </div>
                </div>

                <p className="text-xs text-yellow-600/80 mb-2 leading-relaxed">
                  Strong trends continue. Momentum measures the rate of price change—assets with upward momentum tend to keep rising.
                </p>

                <div className="bg-black/50 rounded-lg p-2.5 border border-yellow-600/10 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-yellow-600/60 uppercase tracking-wide">Momentum</p>
                    <p className="text-xs font-bold text-yellow-400">{safeFormat((algos.momentum?.momentum || 0) * 100, 1)}%</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Custom scrollbar styling */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </motion.div>
  )
}