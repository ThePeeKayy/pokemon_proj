"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, TrendingUp, TrendingDown, Activity, BarChart3, Gauge, Layers } from "lucide-react"
import { Canvas, useFrame } from "@react-three/fiber"
import { useTexture, RoundedBox, Environment } from "@react-three/drei"
import * as THREE from "three"

// 3D Pokemon Card Component
function PokemonCard3D({ cardImage, isHovered }: { cardImage: string; isHovered: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const texture = useTexture(cardImage)
  
  // Configure texture to fill the geometry
  texture.colorSpace = THREE.SRGBColorSpace

  // Auto rotation + hover effect
  useFrame((state) => {
    if (!groupRef.current) return
    const time = state.clock.elapsedTime

    // Smooth auto-rotation
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
      
      {/* Card front face with Pokemon image */}
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
function CardScene({ cardImage }: { cardImage: string }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="w-full h-full min-h-[500px] cursor-grab active:cursor-grabbing"
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

export default function QuantAnalyzer() {
  const [cardName, setCardName] = useState("Charizard")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)

  // Sample Pokemon card images (using official high-res cards)
  const cardImages: Record<string, string> = {
    charizard: "https://images.pokemontcg.io/base1/4_hires.png",
    pikachu: "https://images.pokemontcg.io/base1/58_hires.png",
    mewtwo: "https://images.pokemontcg.io/base1/10_hires.png",
    blastoise: "https://images.pokemontcg.io/base1/2_hires.png",
    venusaur: "https://images.pokemontcg.io/base1/15_hires.png",
    gyarados: "https://images.pokemontcg.io/base1/6_hires.png",
  }

  const getCardImage = (name: string) => {
    const normalized = name.toLowerCase().trim()
    return cardImages[normalized] || cardImages.charizard
  }

  const generateMockPrices = () => {
    let prices = [100]
    for (let i = 0; i < 49; i++) {
      let change = (Math.random() - 0.48) * 10
      prices.push(Math.max(50, prices[i] + change))
    }
    return prices
  }

  const generateMockResults = (name: string) => {
    const prices = generateMockPrices()
    const current = prices[prices.length - 1]
    const sma20 = prices.slice(-20).reduce((a, b) => a + b) / 20

    let up = 0, down = 0
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1]
      if (change > 0) up += change
      else down -= change
    }
    const avgUp = up / 14
    const avgDown = down / 14
    const rs = avgUp / (avgDown || 0.01)
    const rsi = 100 - (100 / (1 + rs))

    const mean = prices.reduce((a, b) => a + b) / prices.length
    const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length
    const volatility = (Math.sqrt(variance) / mean) * 100

    return {
      card_name: name,
      card_image: getCardImage(name),
      indicators: {
        price: current,
        sma20: sma20,
        rsi: rsi,
        volatility: volatility,
        bbands_upper: sma20 * 1.05,
        bbands_lower: sma20 * 0.95,
        macd: (prices[prices.length - 1] - prices[Math.max(0, prices.length - 12)]) / 10,
        signal_line: (prices[prices.length - 1] - prices[Math.max(0, prices.length - 26)]) / 20,
        buy_signal: rsi < 30 || current < sma20 * 0.95,
        sell_signal: rsi > 70 || current > sma20 * 1.05,
      },
      latency_ms: Math.random() * 10 + 2,
      prices: prices,
    }
  }

  const analyzeCard = async () => {
    if (!cardName.trim()) return
    setLoading(true)
    await new Promise((r) => setTimeout(r, 800))
    setResults(generateMockResults(cardName))
    setLoading(false)
  }

  useEffect(() => {
    analyzeCard()
  }, [])

  const getRsiStatus = (rsi: number) => {
    if (rsi > 70) return { text: "Overbought", color: "text-rose-400" }
    if (rsi < 30) return { text: "Oversold", color: "text-emerald-400" }
    return { text: "Neutral", color: "text-amber-200/60" }
  }

  const getMacdStatus = (macd: number, signal: number) => {
    return macd > signal
      ? { text: "Bullish", color: "text-emerald-400" }
      : { text: "Bearish", color: "text-rose-400" }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Premium Background */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/white-gold-wave-abstract-background_754401-250.jpg-dRAOcISpqQ39LzzAKehj8y9QJThxXg.avif')`,
        }}
      />
      <div className="fixed inset-0 bg-gradient-to-br from-black/50 via-black/30 to-black/60" />

      {/* Content */}
      <div className="relative z-10 min-h-screen px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-6xl font-extralight tracking-tight text-white mb-3">
            Quant<span className="font-medium text-amber-200">Analyzer</span>
          </h1>
          <p className="text-white/50 text-xs md:text-sm tracking-[0.3em] uppercase font-light">
            Pokémon Card Market Intelligence
          </p>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-xl mx-auto mb-8"
        >
          <div className="relative group">
            <div className="absolute -inset-[1px] bg-gradient-to-r from-amber-200/30 via-white/20 to-amber-200/30 rounded-2xl blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl overflow-hidden">
              <Search className="w-5 h-5 text-white/40 ml-5" />
              <input
                type="text"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && analyzeCard()}
                placeholder="Search card..."
                className="flex-1 bg-transparent text-white placeholder:text-white/30 px-4 py-4 text-base font-light focus:outline-none"
              />
              <button
                onClick={analyzeCard}
                disabled={loading}
                className="m-2 px-6 py-2.5 bg-gradient-to-r from-amber-200 to-amber-100 text-black/80 font-medium rounded-xl hover:from-amber-100 hover:to-amber-50 transition-all duration-300 disabled:opacity-50 text-sm"
              >
                {loading ? "..." : "Analyze"}
              </button>
            </div>
          </div>
          <p className="text-center text-white/30 text-xs mt-3">
            Try: Charizard, Pikachu, Mewtwo, Blastoise, Venusaur, Gyarados
          </p>
        </motion.div>

        {/* Results */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 py-20"
            >
              <div className="w-12 h-12 border-2 border-amber-200/30 border-t-amber-200 rounded-full animate-spin" />
              <p className="text-white/50 text-sm tracking-widest uppercase">Processing</p>
            </motion.div>
          ) : results ? (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-7xl mx-auto"
            >
              {/* Main Layout: Card + Stats */}
              <div className="grid lg:grid-cols-2 gap-8 mb-8 lg:auto-rows-fr">
                {/* 3D Card */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  className="relative h-full"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-amber-200/5 via-transparent to-amber-200/5 rounded-3xl" />
                  <div className="relative h-full bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden flex flex-col">
                    <div className="absolute top-4 left-4 z-10">
                      <p className="text-amber-200 text-xs tracking-[0.2em] uppercase font-medium">
                        {results.card_name}
                      </p>
                      <p className="text-white/40 text-[10px] tracking-wider">Base Set Holo</p>
                    </div>
                    <div className="flex-1 min-h-[500px]">
                      <Suspense
                        fallback={
                          <div className="w-full h-full min-h-[500px] flex items-center justify-center">
                            <div className="w-8 h-8 border-2 border-amber-200/30 border-t-amber-200 rounded-full animate-spin" />
                          </div>
                        }
                      >
                        <CardScene cardImage={results.card_image} />
                      </Suspense>
                    </div>
                    {/* Signal Badge */}
                    {(results.indicators.buy_signal || results.indicators.sell_signal) && (
                      <div
                        className={`absolute bottom-4 right-4 px-4 py-2 rounded-full backdrop-blur-xl border ${
                          results.indicators.buy_signal
                            ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-400"
                            : "bg-rose-500/20 border-rose-400/40 text-rose-400"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {results.indicators.buy_signal ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : (
                            <TrendingDown className="w-4 h-4" />
                          )}
                          <span className="text-xs font-medium tracking-wide">
                            {results.indicators.buy_signal ? "BUY" : "SELL"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Stats Panel */}
                <div className="flex flex-col gap-4">
                  {/* Price Header */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
                  >
                    <p className="text-white/40 text-[10px] tracking-[0.2em] uppercase mb-2">Market Price</p>
                    <div className="flex items-baseline gap-3">
                      <span className="text-5xl font-extralight text-white">
                        ${results.indicators.price.toFixed(2)}
                      </span>
                      <span
                        className={`text-sm ${
                          results.indicators.price > results.indicators.sma20
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {results.indicators.price > results.indicators.sma20 ? "+" : ""}
                        {(
                          ((results.indicators.price - results.indicators.sma20) /
                            results.indicators.sma20) *
                          100
                        ).toFixed(1)}
                        %
                      </span>
                    </div>
                    <p className="text-white/30 text-xs mt-2">
                      vs SMA(20): ${results.indicators.sma20.toFixed(2)}
                    </p>
                  </motion.div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      {
                        label: "RSI (14)",
                        value: results.indicators.rsi.toFixed(1),
                        desc: getRsiStatus(results.indicators.rsi).text,
                        descColor: getRsiStatus(results.indicators.rsi).color,
                        icon: Gauge,
                      },
                      {
                        label: "Volatility",
                        value: `${results.indicators.volatility.toFixed(1)}%`,
                        desc: "Price deviation",
                        icon: BarChart3,
                      },
                      {
                        label: "MACD",
                        value: results.indicators.macd.toFixed(3),
                        desc: getMacdStatus(results.indicators.macd, results.indicators.signal_line)
                          .text,
                        descColor: getMacdStatus(
                          results.indicators.macd,
                          results.indicators.signal_line
                        ).color,
                        icon: TrendingUp,
                      },
                      {
                        label: "BB Width",
                        value: `$${(
                          results.indicators.bbands_upper - results.indicators.bbands_lower
                        ).toFixed(2)}`,
                        desc: "Band spread",
                        icon: Layers,
                      },
                    ].map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 + i * 0.05 }}
                        className="group relative"
                      >
                        <div className="absolute -inset-[1px] bg-gradient-to-b from-amber-200/20 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4">
                          <item.icon className="w-3.5 h-3.5 text-amber-200/60 mb-2" />
                          <p className="text-white/40 text-[9px] tracking-[0.15em] uppercase mb-1">
                            {item.label}
                          </p>
                          <p className="text-2xl font-extralight text-white">{item.value}</p>
                          <p className={`text-[10px] mt-1 ${item.descColor || "text-white/30"}`}>
                            {item.desc}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Mini Chart */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                    className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex-1"
                  >
                    <h3 className="text-white/50 text-[10px] tracking-[0.2em] uppercase mb-4">
                      Price History
                    </h3>
                    <div className="h-24 flex items-end gap-[2px]">
                      {results.prices.slice(-30).map((price: number, i: number) => {
                        const slicedPrices = results.prices.slice(-30)
                        const min = Math.min(...slicedPrices)
                        const max = Math.max(...slicedPrices)
                        const height = ((price - min) / (max - min)) * 100
                        return (
                          <div
                            key={i}
                            className="flex-1 bg-gradient-to-t from-amber-200/60 to-amber-200/20 rounded-t-sm hover:from-amber-200 hover:to-amber-200/50 transition-all duration-200"
                            style={{ height: `${Math.max(5, height)}%` }}
                          />
                        )
                      })}
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Footer */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="text-center"
              >
                <p className="text-white/20 text-xs tracking-widest">
                  Response time:{" "}
                  <span className="text-amber-200/60">{results.latency_ms.toFixed(1)}ms</span>
                </p>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
