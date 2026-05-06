"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, TrendingUp, TrendingDown, Activity, BarChart3, Gauge, Layers } from "lucide-react"
import { Canvas, useFrame } from "@react-three/fiber"
import { useTexture, RoundedBox, Environment } from "@react-three/drei"
import * as THREE from "three"

// 3D Pokemon Card Component
function PokemonCard3D({ cardImage, isHovered }: { cardImage: string | null; isHovered: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const [loadError, setLoadError] = useState(false)

  // Safely load texture
  useEffect(() => {
    if (!cardImage) {
      setLoadError(true)
      return
    }

    const textureLoader = new THREE.TextureLoader()
    textureLoader.load(
      cardImage,
      (loadedTexture) => {
        loadedTexture.colorSpace = THREE.SRGBColorSpace
        setTexture(loadedTexture)
        setLoadError(false)
      },
      undefined,
      () => setLoadError(true)
    )
  }, [cardImage])

  // Auto rotation + hover effect
  useFrame((state) => {
    if (!groupRef.current) return
    const time = state.clock.elapsedTime
    groupRef.current.rotation.y = Math.sin(time * 0.5) * 0.3 + (isHovered ? 0 : Math.PI * 0.05)
  })

  const cardWidth = 3.2
  const cardHeight = 4.5
  const cardDepth = 0.08

  return (
    <group ref={groupRef}>
      {/* Gold card frame/border */}
      <mesh castShadow>
        <boxGeometry args={[cardWidth + 0.1, cardHeight + 0.1, cardDepth]} />
        <meshStandardMaterial
          color="#d4af37"
          metalness={0.95}
          roughness={0.1}
        />
      </mesh>

      {/* Card front face with Pokemon image or fallback */}
      {texture && !loadError ? (
        <mesh position={[0, 0, cardDepth / 2 + 0.001]}>
          <planeGeometry args={[cardWidth, cardHeight]} />
          <meshPhysicalMaterial
            map={texture}
            metalness={0.1}
            roughness={0.15}
            clearcoat={0}
            clearcoatRoughness={0.05}
            reflectivity={0.2}
            envMapIntensity={0.5}
          />
        </mesh>
      ) : (
        <mesh position={[0, 0, cardDepth / 2 + 0.001]}>
          <planeGeometry args={[cardWidth, cardHeight]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.3} roughness={0.4} />
        </mesh>
      )}

      {/* Card back */}
      <mesh position={[0, 0, -cardDepth / 2 - 0.001]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[cardWidth, cardHeight]} />
        <meshPhysicalMaterial
          color="#1a1a2e"
          metalness={0.5}
          roughness={0.3}
          clearcoat={0.2}
        />
      </mesh>
    </group>
  )
}

// Card Scene Wrapper
function CardScene({ cardImage }: { cardImage: string | null }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="w-full h-full cursor-grab active:cursor-grabbing"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Canvas
        shadows
        camera={{ position: [0, 0, 6], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <spotLight
          position={[5, 5, 5]}
          angle={0.9}
          penumbra={1}
          intensity={0.3}
          castShadow
          color="#fff5e6"
        />
        <spotLight
          position={[-5, 3, 5]}
          angle={0.3}
          penumbra={1}
          intensity={0.2}
          color="#ffd700"
        />
        <pointLight position={[0, -3, 3]} intensity={0.3} color="#d4af37" />
        <Suspense fallback={null}>
          <PokemonCard3D cardImage={cardImage} isHovered={isHovered} />
          <Environment preset="studio" environmentIntensity={0.7} />
        </Suspense>
      </Canvas>
    </div>
  )
}

// Helper functions with null safety
const getRsiStatus = (rsi: number | null | undefined) => {
  if (rsi == null) return { text: "N/A", color: "text-white/30" }
  if (rsi > 70) return { text: "Overbought", color: "text-rose-400" }
  if (rsi < 30) return { text: "Oversold", color: "text-emerald-400" }
  return { text: "Neutral", color: "text-white/50" }
}

const getMacdStatus = (macd: number | null | undefined, signal: number | null | undefined) => {
  if (macd == null || signal == null) return { text: "N/A", color: "text-white/30" }
  if (macd > signal) return { text: "Bullish", color: "text-emerald-400" }
  if (macd < signal) return { text: "Bearish", color: "text-rose-400" }
  return { text: "Neutral", color: "text-white/50" }
}

// Safe value formatter
const safeFormat = (value: number | null | undefined, decimals = 2): string => {
  if (value == null || isNaN(value)) return "N/A"
  return value.toFixed(decimals)
}

// Safe array handlers
const safeArraySlice = <T,>(arr: T[] | null | undefined, start: number, end?: number): T[] => {
  if (!Array.isArray(arr)) return [] as T[]
  return arr.slice(start, end)
}

const safeMinMax = (arr: (number | null)[] | null | undefined): { min: number; max: number } => {
  if (!Array.isArray(arr) || arr.length === 0) return { min: 0, max: 100 }
  const valid = arr.filter((n): n is number => typeof n === 'number' && !isNaN(n))
  if (valid.length === 0) return { min: 0, max: 100 }
  return { min: Math.min(...valid), max: Math.max(...valid) }
}

export default function QuantAnalyzer() {
  const [cardName, setCardName] = useState("Charizard")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [backendAvailable, setBackendAvailable] = useState(false)

  // Sample Pokemon card images (using official high-res cards)
  const cardImages: Record<string, string> = {
    charizard: "https://images.pokemontcg.io/base1/4_hires.png",
    pikachu: "https://images.pokemontcg.io/base1/58_hires.png",
    mewtwo: "https://images.pokemontcg.io/base1/10_hires.png",
    blastoise: "https://images.pokemontcg.io/base1/2_hires.png",
    venusaur: "https://images.pokemontcg.io/base1/15_hires.png",
    gyarados: "https://images.pokemontcg.io/base1/6_hires.png",
  }

  const getCardImage = (name: string | null | undefined): string | null => {
    if (!name || typeof name !== 'string') return null
    const normalized = name.toLowerCase().trim()
    return cardImages[normalized] || cardImages.charizard
  }

  const generateMockPrices = (): number[] => {
    let prices: number[] = [100]
    for (let i = 0; i < 49; i++) {
      let change = (Math.random() - 0.48) * 10
      prices.push(Math.max(50, prices[i] + change))
    }
    return prices
  }

  const generateMockResults = (name: string | null | undefined) => {
    const safeCardName = name && typeof name === 'string' ? name.trim() : "Unknown"
    const prices = generateMockPrices()
    const current = prices?.[prices.length - 1] ?? 100
    const sma20Slice = safeArraySlice(prices, -20)
    const sma20 = sma20Slice.length > 0 
      ? sma20Slice.reduce((a, b) => a + b, 0) / sma20Slice.length 
      : current

    let up = 0, down = 0
    for (let i = 1; i < (prices?.length ?? 0); i++) {
      const change = (prices?.[i] ?? 0) - (prices?.[i - 1] ?? 0)
      if (change > 0) up += change
      else down -= change
    }
    const avgUp = up / 14
    const avgDown = down / 14
    const rs = avgUp / (avgDown || 0.01)
    const rsi = 100 - (100 / (1 + rs))

    const mean = prices?.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 100
    const variance = prices?.length
      ? prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length
      : 0
    const volatility = mean !== 0 ? (Math.sqrt(variance) / mean) * 100 : 0

    return {
      card_name: safeCardName,
      card_image: getCardImage(safeCardName),
      indicators: {
        price: current,
        sma20: sma20,
        rsi: rsi,
        volatility: volatility,
        bbands_upper: sma20 * 1.05,
        bbands_lower: sma20 * 0.95,
        macd: (current - (prices?.[Math.max(0, prices.length - 12)] ?? current)) / 10,
        signal_line: (current - (prices?.[Math.max(0, prices.length - 26)] ?? current)) / 20,
        buy_signal: rsi < 30 || current < sma20 * 0.95,
        sell_signal: rsi > 70 || current > sma20 * 1.05,
      },
      latency_ms: Math.random() * 10 + 2,
      prices: prices,
    }
  }

  // Check if backend is available on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(2000) })
        setBackendAvailable(response?.ok ?? false)
      } catch {
        setBackendAvailable(false)
      }
    }
    checkBackend()
  }, [])

  const analyzeCard = async () => {
    if (!cardName || !cardName.trim()) {
      setError("Please enter a card name")
      return
    }
    setLoading(true)
    setError(null)

    try {
      const prices = generateMockPrices()
      
      // Call your C++ backend via Node server
      const response = await fetch('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_name: cardName,
          prices: prices
        }),
        signal: AbortSignal.timeout(5000)
      })

      if (!response?.ok) {
        const errorText = await response?.text?.() ?? 'Unknown error'
        throw new Error(`Backend returned ${response?.status ?? 'error'}: ${errorText}`)
      }

      const data = await response?.json?.()
      
      // Validate and combine backend results with frontend data
      if (data && typeof data === 'object') {
        setResults({
          ...data,
          card_image: data?.card_image ?? getCardImage(cardName),
          prices: prices,
          indicators: {
            ...data?.indicators,
            price: data?.indicators?.price ?? null,
            sma20: data?.indicators?.sma20 ?? null,
            rsi: data?.indicators?.rsi ?? null,
            volatility: data?.indicators?.volatility ?? null,
            bbands_upper: data?.indicators?.bbands_upper ?? null,
            bbands_lower: data?.indicators?.bbands_lower ?? null,
            macd: data?.indicators?.macd ?? null,
            signal_line: data?.indicators?.signal_line ?? null,
            buy_signal: data?.indicators?.buy_signal ?? false,
            sell_signal: data?.indicators?.sell_signal ?? false,
          }
        })
      } else {
        throw new Error('Invalid response format')
      }
      setBackendAvailable(true)
    } catch (error) {
      console.error('Fetch error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Backend error'
      setError(errorMessage)

      // Fallback to mock data
      console.log('Using mock data as fallback')
      setResults(generateMockResults(cardName))
    } finally {
      setLoading(false)
    }
  }

  const currentPrice = results?.indicators?.price
  const sma20 = results?.indicators?.sma20
  const pricePercentage = (currentPrice != null && sma20 != null && sma20 !== 0)
    ? (((currentPrice - sma20) / sma20) * 100).toFixed(1)
    : null
  const isPriceAboveSMA = currentPrice != null && sma20 != null && currentPrice > sma20

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white overflow-hidden">
      {/* Full viewport container - no scrolling */}
      <div className="h-screen w-full flex flex-col p-6">
        
        {/* Header - compact */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex justify-between items-center mb-4"
        >
          <div>
            <h1 className="text-3xl font-light tracking-tight">Pokemon Quant</h1>
            <p className="text-white/40 text-xs mt-1">Technical Analysis Dashboard</p>
          </div>

          {/* Backend Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${backendAvailable ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="text-xs text-white/50">
              {backendAvailable ? 'Backend: OK' : 'Backend: Offline (using mock)'}
            </span>
          </div>
        </motion.div>

        {/* Search Bar - compact */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex gap-3 mb-4"
        >
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search Pokemon card..."
              value={cardName ?? ""}
              onChange={(e) => setCardName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && analyzeCard()}
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:border-amber-200/50 transition-colors"
            />
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-white/30" />
          </div>
          <button
            onClick={analyzeCard}
            disabled={loading || !cardName?.trim()}
            className="px-6 py-2 bg-gradient-to-r from-amber-200 to-amber-100 text-black font-medium rounded-lg hover:shadow-lg hover:shadow-amber-200/20 transition-all disabled:opacity-50 text-sm"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </motion.div>

        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-rose-400 mb-2 bg-rose-400/10 px-3 py-2 rounded border border-rose-400/20"
          >
            Error: {error}
          </motion.div>
        )}

        {/* Main Content - flex grow to fill remaining space */}
        <AnimatePresence mode="wait">
          {results ? (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {/* Grid Layout - fits in remaining space */}
              <div className="grid lg:grid-cols-2 gap-4 flex-1 min-h-0">
                {/* 3D Card - left side */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="relative bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col"
                >
                  <div className="absolute top-3 left-3 z-10">
                    <p className="text-amber-200 text-xs tracking-[0.2em] uppercase font-medium">
                      {results?.card_name ?? "Unknown"}
                    </p>
                    <p className="text-white/40 text-[10px] tracking-wider">Base Set</p>
                  </div>
                  <div className="flex-1 min-h-0">
                    <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-amber-200/30 border-t-amber-200 rounded-full animate-spin" /></div>}>
                      <CardScene cardImage={results?.card_image ?? null} />
                    </Suspense>
                  </div>
                  {/* Signal Badge */}
                  {(results?.indicators?.buy_signal || results?.indicators?.sell_signal) && (
                    <div
                      className={`absolute bottom-3 right-3 px-3 py-1.5 rounded-full backdrop-blur-xl border text-xs font-medium ${
                        results?.indicators?.buy_signal
                          ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-400"
                          : "bg-rose-500/20 border-rose-400/40 text-rose-400"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {results?.indicators?.buy_signal ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {results?.indicators?.buy_signal ? "BUY" : "SELL"}
                      </div>
                    </div>
                  )}
                </motion.div>

                {/* Stats Panel - right side */}
                <div className="flex flex-col gap-3 overflow-y-auto pr-2 min-h-0">
                  {/* Price Header */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 flex-shrink-0"
                  >
                    <p className="text-white/40 text-[9px] tracking-[0.2em] uppercase mb-1">Market Price</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extralight text-white">
                        ${safeFormat(currentPrice, 2)}
                      </span>
                      {pricePercentage != null && (
                        <span className={`text-xs ${isPriceAboveSMA ? "text-emerald-400" : "text-rose-400"}`}>
                          {isPriceAboveSMA ? "+" : ""}{pricePercentage}%
                        </span>
                      )}
                    </div>
                    <p className="text-white/30 text-[9px] mt-1">
                      vs SMA(20): ${safeFormat(sma20, 2)}
                    </p>
                  </motion.div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 flex-shrink-0">
                    {[
                      {
                        label: "RSI (14)",
                        value: safeFormat(results?.indicators?.rsi, 1),
                        desc: getRsiStatus(results?.indicators?.rsi).text,
                        descColor: getRsiStatus(results?.indicators?.rsi).color,
                        icon: Gauge,
                      },
                      {
                        label: "Volatility",
                        value: `${safeFormat(results?.indicators?.volatility, 1)}%`,
                        desc: "Deviation",
                        icon: BarChart3,
                      },
                      {
                        label: "MACD",
                        value: safeFormat(results?.indicators?.macd, 2),
                        desc: getMacdStatus(results?.indicators?.macd, results?.indicators?.signal_line).text,
                        descColor: getMacdStatus(results?.indicators?.macd, results?.indicators?.signal_line).color,
                        icon: TrendingUp,
                      },
                      {
                        label: "BB Width",
                        value: `$${safeFormat(
                          (results?.indicators?.bbands_upper ?? 0) - (results?.indicators?.bbands_lower ?? 0),
                          2
                        )}`,
                        desc: "Spread",
                        icon: Layers,
                      },
                    ].map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 + i * 0.05 }}
                        className="group relative"
                      >
                        <div className="absolute -inset-[1px] bg-gradient-to-b from-amber-200/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-2.5">
                          <item.icon className="w-3 h-3 text-amber-200/60 mb-1" />
                          <p className="text-white/40 text-[8px] tracking-[0.15em] uppercase mb-0.5">
                            {item.label}
                          </p>
                          <p className="text-lg font-extralight text-white">{item.value}</p>
                          <p className={`text-[8px] mt-0.5 ${item.descColor || "text-white/30"}`}>
                            {item.desc}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Mini Chart */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.35 }}
                    className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex-1 min-h-0"
                  >
                    <h3 className="text-white/50 text-[9px] tracking-[0.2em] uppercase mb-2">
                      Price History
                    </h3>
                    <div className="h-full flex items-end gap-[1px] min-h-[80px]">
                      {(() => {
                        const priceSlice: (number | null)[] = safeArraySlice(results?.prices, -30)
                        if (priceSlice.length === 0) {
                          return <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">No data</div>
                        }
                        const { min, max } = safeMinMax(priceSlice)
                        const range = max - min || 1
                        return priceSlice.map((price: number | null, i: number) => {
                          const safePrice = price ?? min
                          const height = ((safePrice - min) / range) * 100
                          return (
                            <div
                              key={i}
                              className="flex-1 bg-gradient-to-t from-amber-200/60 to-amber-200/20 rounded-t-sm hover:from-amber-200 hover:to-amber-200/50 transition-all duration-200"
                              style={{ height: `${Math.max(3, height)}%` }}
                            />
                          )
                        })
                      })()}
                    </div>
                  </motion.div>

                  {/* Footer - latency */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.4 }}
                    className="text-center flex-shrink-0"
                  >
                    <p className="text-white/20 text-[9px] tracking-widest">
                      Response time:{" "}
                      <span className="text-amber-200/60">{safeFormat(results?.latency_ms, 1)}ms</span>
                    </p>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="flex-1 flex flex-col items-center justify-center"
            >
              <Activity className="w-12 h-12 text-white/20 mb-4" />
              <p className="text-white/40 text-sm">Search for a Pokemon card to analyze</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}