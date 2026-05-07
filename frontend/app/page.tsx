"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TrendingUp, TrendingDown, Activity, BarChart3, Gauge, Layers } from "lucide-react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Environment } from "@react-three/drei"
import * as THREE from "three"
import OptimizationCard from "./OptimizationCard"

function PokemonCard3D({ cardImage, isHovered }: { cardImage: string | null; isHovered: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!cardImage) return
    const loader = new THREE.TextureLoader()
    loader.load(cardImage, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      setTexture(t)
    })
  }, [cardImage])

  useFrame((state) => {
    if (!groupRef.current) return
    const time = state.clock.elapsedTime
    groupRef.current.rotation.y = Math.sin(time * 0.5) * 0.3 + (isHovered ? 0 : Math.PI * 0.05)
  })

  return (
    <group ref={groupRef}>
      <mesh castShadow>
        <boxGeometry args={[3.3, 4.6, 0.08]} />
        <meshStandardMaterial color="#d4af37" metalness={0.95} roughness={0.1} />
      </mesh>
      {texture ? (
        <mesh position={[0, 0, 0.041]}>
          <planeGeometry args={[3.2, 4.5]} />
          <meshPhysicalMaterial map={texture} metalness={0.1} roughness={0.15} clearcoat={0} />
        </mesh>
      ) : (
        <mesh position={[0, 0, 0.041]}>
          <planeGeometry args={[3.2, 4.5]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.3} roughness={0.4} />
        </mesh>
      )}
    </group>
  )
}

function CardScene({ cardImage }: { cardImage: string | null }) {
  const [isHovered, setIsHovered] = useState(false)
  return (
    <div className="w-full h-full cursor-grab active:cursor-grabbing" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <Canvas shadows camera={{ position: [0, 0, 6], fov: 50 }} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
        <spotLight position={[5, 5, 5]} angle={0.9} penumbra={1} intensity={0.3} castShadow color="#fff5e6" />
        <spotLight position={[-5, 3, 5]} angle={0.3} penumbra={1} intensity={0.2} color="#ffd700" />
        <pointLight position={[0, -3, 3]} intensity={0.3} color="#d4af37" />
        <Suspense fallback={null}>
          <PokemonCard3D cardImage={cardImage} isHovered={isHovered} />
          <Environment preset="studio" environmentIntensity={0.7} />
        </Suspense>
      </Canvas>
    </div>
  )
}

const getRsiStatus = (rsi: number | null | undefined) => {
  if (rsi == null) return { text: "N/A", color: "text-white/30" }
  if (rsi > 70) return { text: "Overbought", color: "text-rose-400" }
  if (rsi < 30) return { text: "Oversold", color: "text-emerald-400" }
  return { text: "Neutral", color: "text-white/50" }
}

const getMacdStatus = (macd: number | null | undefined, signal: number | null | undefined) => {
  if (macd == null || signal == null) return { text: "N/A", color: "text-white/30" }
  return macd > signal ? { text: "Bullish", color: "text-emerald-400" } : { text: "Bearish", color: "text-rose-400" }
}

const safeFormat = (v: number | null | undefined, d = 2) => v == null || isNaN(v) ? "N/A" : v.toFixed(d)
const safeSlice = <T,>(arr: T[] | null, s: number, e?: number) => Array.isArray(arr) ? arr.slice(s, e) : []
const safeMinMax = (arr: (number | null)[] | null) => {
  if (!Array.isArray(arr) || !arr.length) return { min: 0, max: 100 }
  const valid = arr.filter((n): n is number => typeof n === 'number' && !isNaN(n))
  return valid.length ? { min: Math.min(...valid), max: Math.max(...valid) } : { min: 0, max: 100 }
}

export default function QuantAnalyzer() {
  const CARDS = [
  "Charizard",   // 
  "Pikachu",  // 
  "Mewtwo",  // 
  "Blastoise",   // 
  "Venusaur",  // 
  "Gyarados",   // 
]

const IMAGES: Record<string, string> = {
  "charizard": "/charizard.png",
  "pikachu": "/pikachu.png",
  "mewtwo": "/mewtwo.png",
  "blastoise": "/blastoise.png",
  "venusaur": "/venusaur.png",
  "gyarados": "/gyarados.png",
}

  const [cardName, setCardName] = useState("Charizard")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [backendAvailable, setBackendAvailable] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [disabledUntil, setDisabledUntil] = useState(0)

  const getImage = (n: string | null) => n ? IMAGES[n.toLowerCase()] || IMAGES.charizard : null

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

  const mockPrices = () => {
    let prices = [100]
    for (let i = 0; i < 49; i++) prices.push(Math.max(50, prices[i] + (Math.random() - 0.48) * 10))
    return prices
  }

  const mockResults = (n: string | null) => {
    const name = n ? String(n).trim() : "Unknown"
    const prices = mockPrices()
    const current = prices[prices.length - 1]
    const sma20s = safeSlice(prices, -20)
    const sma20 = sma20s.length ? sma20s.reduce((a, b) => a + b) / sma20s.length : current

    let up = 0, down = 0
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1]
      change > 0 ? up += change : down -= change
    }
    const rs = (up / 14) / ((down / 14) || 0.01)
    const rsi = 100 - (100 / (1 + rs))
    const mean = prices.reduce((a, b) => a + b) / prices.length
    const variance = prices.reduce((s, p) => s + (p - mean) ** 2) / prices.length
    const volatility = mean ? (Math.sqrt(variance) / mean) * 100 : 0

    return {
      card_name: name,
      card_image: getImage(name),
      indicators: {
        price: current,
        sma20,
        rsi,
        volatility,
        bbands_upper: sma20 * 1.05,
        bbands_lower: sma20 * 0.95,
        macd: (current - (prices[Math.max(0, prices.length - 12)] || current)) / 10,
        signal_line: (current - (prices[Math.max(0, prices.length - 26)] || current)) / 20,
        buy_signal: rsi < 30 || current < sma20 * 0.95,
        sell_signal: rsi > 70 || current > sma20 * 1.05,
      },
      latency_ms: Math.random() * 10 + 2,
      prices,
    }
  }

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
    setLoading(true)
    setError(null)
    try {
      const prices = mockPrices()
      const response = await fetch('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_name: cardName.trim(), prices }),
        signal: AbortSignal.timeout(5000)
      })
      if (!response?.ok) throw new Error(`Backend error ${response?.status}`)
      const data = await response?.json?.()
      if (!data || typeof data !== 'object') throw new Error('Invalid response')
      setResults({ ...data, card_image: data?.card_image ?? getImage(cardName), prices, indicators: { ...data?.indicators } })
      setBackendAvailable(true)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Backend error')
      setResults(mockResults(cardName))
    } finally {
      setLoading(false)
      setDisabledUntil(Date.now() + 6000)
    }
  }

  const currentPrice = results?.indicators?.price
  const sma20 = results?.indicators?.sma20
  const pricePercentage = currentPrice != null && sma20 != null && sma20 !== 0 ? (((currentPrice - sma20) / sma20) * 100).toFixed(1) : null
  const isPriceAboveSMA = currentPrice != null && sma20 != null && currentPrice > sma20

  const stats = [
    { label: "RSI (14)", value: safeFormat(results?.indicators?.rsi, 1), desc: getRsiStatus(results?.indicators?.rsi).text, color: getRsiStatus(results?.indicators?.rsi).color, icon: Gauge },
    { label: "Volatility", value: `${safeFormat(results?.indicators?.volatility, 1)}%`, desc: "Deviation", icon: BarChart3 },
    { label: "MACD", value: safeFormat(results?.indicators?.macd, 2), desc: getMacdStatus(results?.indicators?.macd, results?.indicators?.signal_line).text, color: getMacdStatus(results?.indicators?.macd, results?.indicators?.signal_line).color, icon: TrendingUp },
    { label: "BB Width", value: `$${safeFormat((results?.indicators?.bbands_upper ?? 0) - (results?.indicators?.bbands_lower ?? 0), 2)}`, desc: "Spread", icon: Layers },
  ]

  return (
    <div className="min-h-screen w-full text-white overflow-hidden" style={{ backgroundImage: 'url(/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative h-screen w-full flex flex-col p-6">
        
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex justify-between items-center mb-4">
          <div className="flex flex-row">
            <img src="oak.png" alt="Logo" className="w-[40px] h-[40px]" />
            <h1 className="text-3xl tracking-tight font-semibold">Oak's Collections (Base set 1 analyser)</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${backendAvailable ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="text-xs text-white/50">{backendAvailable ? 'Backend: OK' : 'Backend: Offline'}</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.1 }} className="flex gap-3 mb-4 w-fit">
          <div className="relative">
            <button onClick={() => setDropdownOpen(!dropdownOpen)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm flex items-center gap-2 hover:bg-white/10 transition-colors">
              {cardName} <svg className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
            </button>
            {dropdownOpen && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="absolute top-full left-0 mt-2 bg-slate-900 border border-white/10 rounded-lg shadow-xl z-50">
                {CARDS.map((card) => (
                  <button key={card} onClick={() => { setCardName(card); setDropdownOpen(false) }} className="w-full px-4 py-2 text-left text-sm hover:bg-white/10 first:rounded-t-lg last:rounded-b-lg transition-colors text-white/80 hover:text-white">
                    {card}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
          <button onClick={analyzeCard} disabled={loading || Date.now() < disabledUntil} className="px-6 py-2 bg-gradient-to-r from-amber-200 to-amber-100 text-black font-medium rounded-lg hover:shadow-lg hover:shadow-amber-200/20 transition-all disabled:opacity-50 text-sm">
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </motion.div>

        {error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-rose-400 text-sm mb-4">{error}</motion.div>}

        <AnimatePresence mode="wait">
          {results ? (
            <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="grid lg:grid-cols-2 gap-4 flex-1 min-h-0">
              
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.1 }} className="relative bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col">
                <div className="absolute top-3 left-3 z-10">
                  <p className="text-amber-200 text-xs tracking-[0.2em] uppercase font-medium">{results?.card_name ?? "Unknown"}</p>
                  <p className="text-white/40 text-[10px] tracking-wider">Base Set</p>
                </div>
                <div className="flex-1 min-h-0">
                  <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-amber-200/30 border-t-amber-200 rounded-full animate-spin" /></div>}>
                    <CardScene cardImage={results?.card_image ?? null} />
                  </Suspense>
                </div>
              </motion.div>

              <div className="flex flex-col gap-3 overflow-y-auto pr-2 min-h-0">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 flex-shrink-0">
                  <p className="text-white/40 text-[9px] tracking-[0.2em] uppercase mb-1">Market Price</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extralight text-white">${safeFormat(currentPrice, 2)}</span>
                    {pricePercentage != null && <span className={`text-xs ${isPriceAboveSMA ? "text-emerald-400" : "text-rose-400"}`}>{isPriceAboveSMA ? "+" : ""}{pricePercentage}%</span>}
                  </div>
                  <p className="text-white/30 text-[9px] mt-1">vs SMA(20): ${safeFormat(sma20, 2)}</p>
                </motion.div>

                <div className="grid grid-cols-2 gap-2 flex-shrink-0">
                  {stats.map((item, i) => (
                    <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 + i * 0.05 }} className="group relative">
                      <div className="absolute -inset-[1px] bg-gradient-to-b from-amber-200/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-2.5">
                        <item.icon className="w-3 h-3 text-amber-200/60 mb-1" />
                        <p className="text-white/40 text-[8px] tracking-[0.15em] uppercase mb-0.5">{item.label}</p>
                        <p className="text-lg font-extralight text-white">{item.value}</p>
                        <p className={`text-[8px] mt-0.5 ${item.color || "text-white/30"}`}>{item.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <OptimizationCard />

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.4 }} className="text-center flex-shrink-0">
                  <p className="text-white/20 text-[9px] tracking-widest">Response time: <span className="text-amber-200/60">{safeFormat(results?.indicators.latency_ms, 1)}ms</span></p>
                </motion.div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="flex-1 flex flex-col items-center justify-center">
              <Activity className="w-12 h-12 text-white/20 mb-4" />
              <p className="text-white/40 text-sm">Select a Pokemon card and click Analyze</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}