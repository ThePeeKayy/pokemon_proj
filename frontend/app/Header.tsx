import { motion } from "framer-motion"

interface HeaderProps {
  cardName: string
  onCardChange: (card: string) => void
  onAnalyze: () => void
  loading: boolean
  disabledUntil: number
  backendAvailable: boolean
  cards: string[]
  showAnalyticsButton?: boolean
  onShowAnalytics?: () => void
}

export function Header({
  cardName,
  onCardChange,
  onAnalyze,
  loading,
  disabledUntil,
  backendAvailable,
  cards,
  showAnalyticsButton,
  onShowAnalytics,
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false)
  const now = Date.now()
  const isDisabled = loading || now < disabledUntil
  const timeRemaining = disabledUntil > now ? Math.ceil((disabledUntil - now) / 1000) : 0

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex justify-between items-center mb-4">
      <div className="flex flex-row items-center gap-3">
        <img src="oak.png" alt="Logo" className="w-[40px] h-[40px]" />
        <h1 className="text-3xl tracking-tight font-semibold">Oak's Collections</h1>
        <span className="text-white/40 text-sm">(Base set 1 analyser)</span>
      </div>
      <div className="flex items-center gap-4">
        <div className={`w-2 h-2 rounded-full ${backendAvailable ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      </div>
    </motion.div>
  )
}

import React from 'react'

export function Controls({
  cardName,
  onCardChange,
  onAnalyze,
  loading,
  disabledUntil,
  cards,
  showAnalyticsButton,
  onShowAnalytics,
}: Omit<HeaderProps, 'backendAvailable'>) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false)
  const now = Date.now()
  const isDisabled = loading || now < disabledUntil
  const timeRemaining = disabledUntil > now ? Math.ceil((disabledUntil - now) / 1000) : 0

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.1 }} className="flex gap-3 mb-4 w-fit flex-wrap">
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm flex items-center gap-2 hover:bg-white/10 transition-colors"
        >
          {cardName}{" "}
          <svg
            className={`w-4 h-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
        {dropdownOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 mt-2 bg-slate-900 border border-white/10 rounded-lg shadow-xl z-50"
          >
            {cards.map((card) => (
              <button
                key={card}
                onClick={() => {
                  onCardChange(card)
                  setDropdownOpen(false)
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-white/10 first:rounded-t-lg last:rounded-b-lg transition-colors text-white/80 hover:text-white"
              >
                {card}
              </button>
            ))}
          </motion.div>
        )}
      </div>

      <button
        onClick={onAnalyze}
        disabled={isDisabled}
        className="px-6 py-2 bg-gradient-to-r from-amber-200 to-amber-100 text-black font-medium rounded-lg hover:shadow-lg hover:shadow-amber-200/20 transition-all disabled:opacity-50 text-sm"
        title={isDisabled && timeRemaining > 0 ? `Wait ${timeRemaining}s` : ""}
      >
        {loading ? "Analyzing..." : isDisabled && timeRemaining > 0 ? `Wait ${timeRemaining}s` : "Analyze"}
      </button>

      {showAnalyticsButton && (
        <button
          onClick={onShowAnalytics}
          className="px-6 py-2 bg-gradient-to-r from-purple-200 to-purple-100 text-black font-medium rounded-lg hover:shadow-lg hover:shadow-purple-200/20 transition-all text-sm"
        >
          Analytics
        </button>
      )}
    </motion.div>
  )
}
