export const safeFormat = (v: number | null | undefined, d = 2) => 
  v == null || isNaN(v) ? "N/A" : v.toFixed(d)

export const safeSlice = <T,>(arr: T[] | null, s: number, e?: number) => 
  Array.isArray(arr) ? arr.slice(s, e) : []

export const safeMinMax = (arr: (number | null)[] | null) => {
  if (!Array.isArray(arr) || !arr.length) return { min: 0, max: 100 }
  const valid = arr.filter((n): n is number => typeof n === 'number' && !isNaN(n))
  return valid.length ? { min: Math.min(...valid), max: Math.max(...valid) } : { min: 0, max: 100 }
}

export const getRsiStatus = (rsi: number | null | undefined) => {
  if (rsi == null) return { text: "N/A", color: "text-white/30" }
  if (rsi > 70) return { text: "Overbought", color: "text-rose-400" }
  if (rsi < 30) return { text: "Oversold", color: "text-emerald-400" }
  return { text: "Neutral", color: "text-white/50" }
}

export const getMacdStatus = (macd: number | null | undefined, signal: number | null | undefined) => {
  if (macd == null || signal == null) return { text: "N/A", color: "text-white/30" }
  return macd > signal ? { text: "Bullish", color: "text-emerald-400" } : { text: "Bearish", color: "text-rose-400" }
}

export const mockPrices = () => {
  let prices = [100]
  for (let i = 0; i < 49; i++) prices.push(Math.max(50, prices[i] + (Math.random() - 0.48) * 10))
  return prices
}

export const mockResults = (n: string | null, getImage: (n: string | null) => string | null) => {
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
      signal_line: 0,
      buy_signal: false,
      sell_signal: false,
    },
    latency_ms: Math.random() * 10 + 2,
    prices,
  }
}
