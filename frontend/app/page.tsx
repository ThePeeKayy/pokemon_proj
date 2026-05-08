"use client"

import { useState, useEffect, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TrendingUp, TrendingDown, Activity, Layers, BarChart3 } from "lucide-react"
import { CardScene } from "./PokemonCard3D"
import { StatsGrid, PriceCard } from "./StatsCard"
import { Controls, Header } from "./Header"
import { AnalyticsPage } from "./AnalyticsPage"
import { safeFormat, mockResults, mockPrices } from "./utils"

export default function QuantAnalyzer() {
  const CARDS = ["Charizard", "Pikachu", "Mewtwo", "Blastoise", "Venusaur", "Gyarados"]

  const IMAGES: Record<string, string> = {
    "charizard": "/charizard.png",
    "pikachu": "/pikachu.png",
    "mewtwo": "/mewtwo.png",
    "blastoise": "/blastoise.png",
    "venusaur": "/venusaur.png",
    "gyarados": "/gyarados.png",
  }

  const getImage = (n: string | null) => n ? IMAGES[n.toLowerCase()] || IMAGES.charizard : null

  // Main state
  const [currentPage, setCurrentPage] = useState<'analyzer' | 'analytics'>('analyzer')
  const [cardName, setCardName] = useState("Charizard")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [backendAvailable, setBackendAvailable] = useState(true)
  const [disabledUntil, setDisabledUntil] = useState(0)

  // Analytics state
  const [metricsData, setMetricsData] = useState<any>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [analyticsAvailable, setAnalyticsAvailable] = useState(false)

  // Cooldown timer
  useEffect(() => {
    if (disabledUntil === 0) return
    const timer = setInterval(() => {
      setDisabledUntil((prev) => {
        const now = Date.now()
        return now >= prev ? 0 : prev
      })
    }, 100)
    return () => clearInterval(timer)
  }, [disabledUntil])

  // Check backend health on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('https://pokemonproj-production.up.railway.app/health', { signal: AbortSignal.timeout(20000) })
        setBackendAvailable(response?.ok ?? false)
      } catch {
        setBackendAvailable(false)
      }
    }
    checkBackend()
    analyzeCard()
  }, [])

  // Analyze card
  const analyzeCard = async () => {
    setLoading(true)
    setError(null)
    try {
      const prices = mockPrices()
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_name: cardName.trim(), prices }),
        signal: AbortSignal.timeout(20000)
      })
      if (!response?.ok) throw new Error(`Backend error ${response?.status}`)
      const data = await response?.json?.()
      if (!data || typeof data !== 'object') throw new Error('Invalid response')
      
      const indicators = {
        price: data?.price ?? data?.indicators?.price,
        bbands_upper: data?.bbands_upper ?? data?.indicators?.bbands_upper,
        bbands_lower: data?.bbands_lower ?? data?.indicators?.bbands_lower,
        sma20: data?.sma20 ?? data?.indicators?.sma20,
        latency_ms: data?.latency_ms ?? data?.indicators?.latency_ms,
      }
      setResults({ ...data, card_image: data?.card_image ?? getImage(cardName), prices, indicators })
      setBackendAvailable(true)
      setAnalyticsAvailable(true)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Backend error')
      setResults(mockResults(cardName, getImage))
    } finally {
      setLoading(false)
      setDisabledUntil(Date.now() + 6000)
    }
  }

  // Fetch metrics
  const fetchMetrics = async () => {
    setMetricsLoading(true)
    try {
      const response = await fetch('https://pokemonproj-production.up.railway.app/api/metrics')
      if (!response.ok) throw new Error('Failed to fetch metrics')
      const data = await response.json()
      setMetricsData(data)
      setCurrentPage('analytics')
    } catch (err) {
      console.error('Metrics error:', err)
      setError('Failed to fetch metrics. Make sure the backend is running.')
    } finally {
      setMetricsLoading(false)
    }
  }

  // Regenerate metrics
  const regenerateMetrics = async (cardName:string) => {
    setMetricsLoading(true)
    try {
      const response = await fetch('https://pokemonproj-production.up.railway.app/api/regenerate-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardName: cardName }),
      })
      if (!response.ok) throw new Error('Failed to regenerate metrics')
      const data = await response.json()
      if (data.metrics) {
        setMetricsData(data.metrics)
      }
    } catch (err) {
      console.error('Regenerate error:', err)
      setError('Failed to regenerate metrics')
    } finally {
      setMetricsLoading(false)
    }
  }

  // Calculate price stats
  const currentPrice = results?.indicators?.price
  const sma20 = results?.indicators?.sma20
  const pricePercentage = currentPrice != null && sma20 != null && sma20 !== 0 ? (((currentPrice - sma20) / sma20) * 100).toFixed(1) : null
  const isPriceAboveSMA = currentPrice != null && sma20 != null && currentPrice > sma20

  const stats = [
    { label: "BB Upper", value: `$${safeFormat(results?.indicators?.bbands_upper, 2)}`, desc: "Resistance", icon: TrendingUp },
    { label: "BB Lower", value: `$${safeFormat(results?.indicators?.bbands_lower, 2)}`, desc: "Support", icon: TrendingDown },
    { label: "BB Width", value: `$${safeFormat((results?.indicators?.bbands_upper ?? 0) - (results?.indicators?.bbands_lower ?? 0), 2)}`, desc: "Spread", icon: Layers },
    { label: "SMA (20)", value: `$${safeFormat(results?.indicators?.sma20, 2)}`, desc: "Simple Moving Average", icon: Activity },
  ]

  // Analytics page
  if (currentPage === 'analytics') {
    return (
      <AnalyticsPage
        metricsData={metricsData}
        onBack={() => setCurrentPage('analyzer')}
        cardImage={results?.card_image ?? null}
        cardName={cardName}
        onRegenerateMetrics={regenerateMetrics}
        regeneratingMetrics={metricsLoading}
        onCardChange={setCardName}
        availableCards={CARDS}
      />
    )
  }

  // Main analyzer page
  return (
    <div>
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm pointer-events-none z-0" />
      <div className="relative min-h-screen w-full text-black overflow-auto" style={{ backgroundImage: 'url(/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="relative h-screen w-full flex flex-col p-6">
        
        {/* Header with Analytics Button */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex justify-between items-center mb-6"
        >
          <div className="flex flex-row">
            <img src="./oak.png" className="sm:h-[70px] sm:w-[70px] h-[55px] w-[55px]"/>
            <h1 className="sm:text-7xl text-xl font-bold tracking-tight">Oak's Collections <span className="text-sm font-normal">(quant analyzer)</span></h1>
          </div>
          <motion.button
            onClick={fetchMetrics}
            disabled={metricsLoading || !analyticsAvailable}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-6 py-3 bg-yellow-500 text-black font-semibold rounded-lg hover:shadow-xl hover:shadow-yellow-400/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <BarChart3 className="w-4 h-4" />
            {metricsLoading ? "Loading..." : "Benchmark"}
          </motion.button>
        </motion.div>

        <Controls
          cardName={cardName}
          onCardChange={setCardName}
          onAnalyze={analyzeCard}
          loading={loading}
          disabledUntil={disabledUntil}
          cards={CARDS}
          showAnalyticsButton={false}
          onShowAnalytics={() => {}}
        />

        {error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-rose-400 text-sm mb-4">{error}</motion.div>}

        <AnimatePresence mode="wait">
          {results ? (
            <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="grid lg:grid-cols-2 gap-4 flex-1 min-h-0">
              
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.1 }} className="relative bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col">
                <div className="absolute top-3 left-3 z-10">
                  <p className="text-amber-200 text-xs tracking-[0.2em] uppercase font-medium">{results?.card_name ?? "Unknown"}</p>
                  <p className="text-black text-[10px] tracking-wider">Base Set</p>
                </div>
                <div className="flex-1 min-h-0">
                  <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-amber-200/30 border-t-amber-200 rounded-full animate-spin" /></div>}>
                    <CardScene cardImage={results?.card_image ?? null} />
                  </Suspense>
                </div>
              </motion.div>

              <div className="flex flex-col gap-3 overflow-y-auto pr-2 min-h-0">
                <PriceCard
                  currentPrice={currentPrice}
                  sma20={sma20}
                  pricePercentage={pricePercentage}
                  isPriceAboveSMA={isPriceAboveSMA}
                />

                <StatsGrid stats={stats} />

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.4 }} className="text-center flex-shrink-0">
                  <p className="text-black/40 text-[15px] tracking-widest">Response time: <span className="text-yellow-500">{safeFormat(results?.indicators.latency_ms, 1)}ms</span></p>
                </motion.div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="flex-1 flex flex-col items-center justify-center">
              <Activity className="w-12 h-12 text-white/20 mb-4" />
              <p className="text-black/40 text-sm">Select a Pokemon card and click Analyze</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </div>
  )
}