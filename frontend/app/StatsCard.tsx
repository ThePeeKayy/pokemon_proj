import { motion } from "framer-motion"
import { TrendingUp, TrendingDown, Layers } from "lucide-react"
import { safeFormat } from "./utils"

interface StatItem {
  label: string
  value: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
}

export function StatsGrid({ stats }: { stats: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 flex-shrink-0">
      {stats.map((item, i) => (
        <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 + i * 0.05 }} className="group relative">
          <div className="absolute -inset-[1px] bg-gradient-to-b from-amber-200/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-2.5">
            <item.icon className="w-3 h-3 text-amber-200/60 mb-1" />
            <p className="text-white/40 text-[8px] tracking-[0.15em] uppercase mb-0.5">{item.label}</p>
            <p className="text-lg font-extralight text-white">{item.value}</p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

export function PriceCard({ currentPrice, sma20, pricePercentage, isPriceAboveSMA }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 flex-shrink-0">
      <p className="text-white/40 text-[9px] tracking-[0.2em] uppercase mb-1">Market Price</p>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-extralight text-white">${safeFormat(currentPrice, 2)}</span>
        {pricePercentage != null && <span className={`text-xs ${isPriceAboveSMA ? "text-emerald-400" : "text-rose-400"}`}>{isPriceAboveSMA ? "+" : ""}{pricePercentage}%</span>}
      </div>
      <p className="text-white/30 text-[9px] mt-1">vs SMA(20): ${safeFormat(sma20, 2)}</p>
    </motion.div>
  )
}
