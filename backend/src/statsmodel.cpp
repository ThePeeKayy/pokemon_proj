#include "../include/statsmodel.h"
#include <cmath>
#include <algorithm>
#include <ctime>
#include <immintrin.h>
#include <iomanip>
#include <cstring>

namespace pokemon {

__attribute__((target("avx2,fma"))) static inline double hsum256_pd(__m256d v) noexcept {
    __m128d lo = _mm256_castpd256_pd128(v);
    __m128d hi = _mm256_extractf128_pd(v, 1);
    __m128d s  = _mm_add_pd(lo, hi);
    __m128d sh = _mm_unpackhi_pd(s, s);
    return _mm_cvtsd_f64(_mm_add_sd(s, sh));
}

void StatsModel::add_price(double price) noexcept {
    prices_[head_] = Price{price, static_cast<uint32_t>(std::time(nullptr))};
    head_ = (head_ + 1) % window_size_;
    if (count_ < window_size_) ++count_;
}

size_t StatsModel::linearize_tail(size_t period, double* out) const noexcept {
    const size_t n = std::min(period, count_);
    if (n == 0) return 0;
    const size_t logical_start = count_ - n;
    const size_t base = (count_ < window_size_) ? 0 : head_;
    for (size_t i = 0; i < n; ++i) {
        out[i] = prices_[(base + logical_start + i) % window_size_].value;
    }
    return n;
}

__attribute__((target("avx2,fma"))) double StatsModel::calculate_sma_(size_t period) const noexcept {
    if (count_ < period) return 0.0;

    alignas(32) double buf[kMaxWindow];
    const size_t n = linearize_tail(period, buf);

    __m256d acc = _mm256_setzero_pd();
    size_t i = 0;
    const size_t simd_end = (n / 4) * 4;
    for (; i < simd_end; i += 4) {
        acc = _mm256_add_pd(acc, _mm256_load_pd(buf + i));
    }
    double sum = hsum256_pd(acc);
    for (; i < n; ++i) sum += buf[i];
    return sum / static_cast<double>(period);
}

__attribute__((target("avx2,fma"))) double StatsModel::calculate_volatility_() const noexcept {
    if (count_ < 2) return 0.0;

    alignas(32) double buf[kMaxWindow];
    const size_t n = linearize_tail(count_, buf);

    __m256d sum_v = _mm256_setzero_pd();
    size_t i = 0;
    const size_t simd_end = (n / 4) * 4;
    for (; i < simd_end; i += 4) {
        sum_v = _mm256_add_pd(sum_v, _mm256_load_pd(buf + i));
    }
    double sum = hsum256_pd(sum_v);
    for (; i < n; ++i) sum += buf[i];
    const double mean = sum / static_cast<double>(n);

    const __m256d mean_v = _mm256_set1_pd(mean);
    __m256d var_v = _mm256_setzero_pd();
    i = 0;
    for (; i < simd_end; i += 4) {
        __m256d v = _mm256_load_pd(buf + i);
        __m256d d = _mm256_sub_pd(v, mean_v);
        var_v = _mm256_fmadd_pd(d, d, var_v);
    }
    double var = hsum256_pd(var_v);
    for (; i < n; ++i) {
        const double d = buf[i] - mean;
        var += d * d;
    }

    return (std::sqrt(var / static_cast<double>(n)) / mean) * 100.0;
}

double StatsModel::calculate_rsi_() const noexcept {
    if (count_ < 15) return 50.0;

    alignas(32) double buf[kMaxWindow];
    const size_t n = linearize_tail(15, buf);

    double up = 0.0, down = 0.0;
    for (size_t i = 1; i < n; ++i) {
        const double ch = buf[i] - buf[i - 1];
        up   += ch > 0.0 ? ch : 0.0;
        down += ch < 0.0 ? -ch : 0.0;
    }
    const double avg_up   = up   / 14.0;
    const double avg_down = down / 14.0;
    if (avg_down == 0.0) return 100.0;
    return 100.0 - (100.0 / (1.0 + avg_up / avg_down));
}

__attribute__((target("avx2,fma"))) void StatsModel::calculate_bollinger_bands_(double& upper, double& lower) const noexcept {
    const double sma = calculate_sma_(20);
    if (count_ == 0) {
        upper = sma * 1.02;
        lower = sma * 0.98;
        return;
    }
    const size_t period = std::min(static_cast<size_t>(20), count_);

    alignas(32) double buf[kMaxWindow];
    const size_t n = linearize_tail(period, buf);

    const __m256d sma_v = _mm256_set1_pd(sma);
    __m256d sum_sq_v = _mm256_setzero_pd();
    size_t i = 0;
    const size_t simd_end = (n / 4) * 4;
    for (; i < simd_end; i += 4) {
        __m256d v = _mm256_load_pd(buf + i);
        __m256d d = _mm256_sub_pd(v, sma_v);
        sum_sq_v = _mm256_fmadd_pd(d, d, sum_sq_v);
    }
    double sum_sq = hsum256_pd(sum_sq_v);
    for (; i < n; ++i) {
        const double d = buf[i] - sma;
        sum_sq += d * d;
    }

    const double sd = std::sqrt(sum_sq / static_cast<double>(period));
    upper = sma + 2.0 * sd;
    lower = sma - 2.0 * sd;
}

void StatsModel::calculate_macd_(double& macd, double& signal) const noexcept {
    if (count_ < 26) { macd = signal = 0.0; return; }

    alignas(32) double buf[kMaxWindow];
    const size_t n = linearize_tail(26, buf); 

    constexpr double m12     = 2.0 / 13.0;
    constexpr double m26     = 2.0 / 27.0;
    constexpr double m_inv12 = 1.0 - m12;
    constexpr double m_inv26 = 1.0 - m26;

    double ema12 = buf[0];
    double ema26 = buf[0];
    for (size_t i = 1; i < n; ++i) {
        ema12 = buf[i] * m12 + ema12 * m_inv12;
        ema26 = buf[i] * m26 + ema26 * m_inv26;
    }
    macd   = ema12 - ema26;
    signal = macd * 0.66;
}

StatsModel::MarketState StatsModel::get_state() const noexcept {
    MarketState s{};
    s.num_observations = static_cast<uint32_t>(count_);
    if (count_ == 0) return s;

    s.current_price = at(count_ - 1);

    s.rsi        = calculate_rsi_();
    s.sma_20     = calculate_sma_(20);
    s.volatility = calculate_volatility_();
    calculate_bollinger_bands_(s.bbands_upper, s.bbands_lower);
    calculate_macd_(s.macd, s.signal_line);

    s.buy_signal  = (s.current_price < s.bbands_lower) || (s.rsi < 30);
    s.sell_signal = (s.current_price > s.bbands_upper) || (s.rsi > 70);
    return s;
}

std::string StatsModel::to_json() const {
    const auto s = get_state();
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(4);
    oss << "{\"price\":" << s.current_price
        << ",\"rsi\":" << s.rsi
        << ",\"sma20\":" << s.sma_20
        << ",\"volatility\":" << s.volatility
        << ",\"bbands_upper\":" << s.bbands_upper
        << ",\"bbands_lower\":" << s.bbands_lower
        << ",\"macd\":" << s.macd
        << ",\"signal_line\":" << s.signal_line
        << ",\"buy_signal\":" << (s.buy_signal ? "true" : "false")
        << ",\"sell_signal\":" << (s.sell_signal ? "true" : "false") << "}";
    return oss.str();
}

} // namespace pokemon