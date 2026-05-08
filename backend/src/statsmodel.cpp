// backend/src/statsmodel.cpp - SIMD OPTIMIZED

#include "../include/statsmodel.h"
#include <cmath>
#include <algorithm>
#include <ctime>
#include <future>
#include <immintrin.h>
#include <iomanip>

namespace pokemon {

void StatsModel::add_price(double price) {
    prices_.push_back({price, static_cast<uint32_t>(std::time(nullptr))});
    if (prices_.size() > window_size_) {
        prices_.erase(prices_.begin());
    }
}

// SIMD-accelerated SMA calculation
double StatsModel::calculate_sma_(size_t period) const {
    if (prices_.size() < period) return 0.0;
    
    size_t start = prices_.size() - period;
    double sum = 0.0;
    
    // Process 4 doubles at a time with AVX2
    size_t i = start;
    const size_t end_simd = start + ((period / 4) * 4);
    
    __m256d sum_vec = _mm256_setzero_pd();
    
    for (; i < end_simd; i += 4) {
        __m256d vals = _mm256_set_pd(
            prices_[i+3].value,
            prices_[i+2].value,
            prices_[i+1].value,
            prices_[i].value
        );
        sum_vec = _mm256_add_pd(sum_vec, vals);
    }
    
    // Horizontal sum
    double tmp[4];
    _mm256_storeu_pd(tmp, sum_vec);
    sum = tmp[0] + tmp[1] + tmp[2] + tmp[3];
    
    // Handle remainder
    for (; i < prices_.size(); i++) {
        sum += prices_[i].value;
    }
    
    return sum / period;
}

// SIMD-accelerated volatility
double StatsModel::calculate_volatility_() const {
    if (prices_.size() < 2) return 0.0;
    
    double mean = 0.0;
    for (const auto& p : prices_) mean += p.value;
    mean /= prices_.size();
    
    // SIMD variance calculation
    __m256d mean_vec = _mm256_set1_pd(mean);
    __m256d var_vec = _mm256_setzero_pd();
    
    size_t i = 0;
    const size_t end_simd = (prices_.size() / 4) * 4;
    
    for (; i < end_simd; i += 4) {
        __m256d vals = _mm256_set_pd(
            prices_[i+3].value,
            prices_[i+2].value,
            prices_[i+1].value,
            prices_[i].value
        );
        __m256d diff = _mm256_sub_pd(vals, mean_vec);
        __m256d sq = _mm256_mul_pd(diff, diff);
        var_vec = _mm256_add_pd(var_vec, sq);
    }
    
    // Horizontal sum
    double tmp[4];
    _mm256_storeu_pd(tmp, var_vec);
    double var = tmp[0] + tmp[1] + tmp[2] + tmp[3];
    
    // Handle remainder
    for (; i < prices_.size(); i++) {
        double d = prices_[i].value - mean;
        var += d * d;
    }
    
    return (std::sqrt(var / prices_.size()) / mean) * 100.0;
}

double StatsModel::calculate_rsi_() const {
    if (prices_.size() < 15) return 50.0;
    
    double up = 0.0, down = 0.0;
    for (size_t i = 1; i < prices_.size(); i++) {
        double ch = prices_[i].value - prices_[i-1].value;
        if (ch > 0.0) {
            up += ch;
        } else {
            down -= ch;
        }
    }
    
    double avg_up = up / 14.0;
    double avg_down = down / 14.0;
    
    if (avg_down == 0.0) return 100.0;
    return 100.0 - (100.0 / (1.0 + avg_up / avg_down));
}

void StatsModel::calculate_bollinger_bands_(double& upper, double& lower) const {
    double sma = calculate_sma_(20);
    if (prices_.empty()) {
        upper = sma * 1.02;
        lower = sma * 0.98;
        return;
    }
    
    size_t period = std::min(size_t(20), prices_.size());
    size_t start = prices_.size() - period;
    
    double sd = 0.0;
    double sum_sq = 0.0;
    
    // SIMD variance for bollinger bands
    __m256d sma_vec = _mm256_set1_pd(sma);
    __m256d sum_sq_vec = _mm256_setzero_pd();
    
    size_t i = start;
    const size_t end_simd = start + ((period / 4) * 4);
    
    for (; i < end_simd; i += 4) {
        __m256d vals = _mm256_set_pd(
            prices_[i+3].value,
            prices_[i+2].value,
            prices_[i+1].value,
            prices_[i].value
        );
        __m256d diff = _mm256_sub_pd(vals, sma_vec);
        __m256d sq = _mm256_mul_pd(diff, diff);
        sum_sq_vec = _mm256_add_pd(sum_sq_vec, sq);
    }
    
    double tmp[4];
    _mm256_storeu_pd(tmp, sum_sq_vec);
    sum_sq = tmp[0] + tmp[1] + tmp[2] + tmp[3];
    
    for (; i < prices_.size(); i++) {
        double d = prices_[i].value - sma;
        sum_sq += d * d;
    }
    
    sd = std::sqrt(sum_sq / period);
    upper = sma + (2.0 * sd);
    lower = sma - (2.0 * sd);
}

void StatsModel::calculate_macd_(double& macd, double& signal) const {
    if (prices_.size() < 26) {
        macd = signal = 0.0;
        return;
    }
    
    const double m12 = 2.0 / 13.0;
    const double m26 = 2.0 / 27.0;
    const double m_inv12 = 1.0 - m12;
    const double m_inv26 = 1.0 - m26;
    
    double ema12 = prices_[prices_.size() - 26].value;
    double ema26 = prices_[prices_.size() - 26].value;
    
    for (size_t i = prices_.size() - 25; i < prices_.size(); i++) {
        ema12 = prices_[i].value * m12 + ema12 * m_inv12;
        ema26 = prices_[i].value * m26 + ema26 * m_inv26;
    }
    
    macd = ema12 - ema26;
    signal = macd * 0.66;
}

StatsModel::MarketState StatsModel::get_state() const {
    MarketState s{};
    s.num_observations = prices_.size();
    
    if (prices_.empty()) return s;
    
    s.current_price = prices_.back().value;
    
    // Launch all indicators in parallel
    auto rsi_f = std::async(std::launch::async, [this]() { 
        return calculate_rsi_(); 
    });
    auto sma_f = std::async(std::launch::async, [this]() { 
        return calculate_sma_(20); 
    });
    auto vol_f = std::async(std::launch::async, [this]() { 
        return calculate_volatility_(); 
    });
    auto bb_f = std::async(std::launch::async, [this]() {
        double u, l;
        calculate_bollinger_bands_(u, l);
        return std::make_pair(u, l);
    });
    auto mc_f = std::async(std::launch::async, [this]() {
        double m, s;
        calculate_macd_(m, s);
        return std::make_pair(m, s);
    });
    
    s.rsi = rsi_f.get();
    s.sma_20 = sma_f.get();
    s.volatility = vol_f.get();
    
    auto bb = bb_f.get();
    s.bbands_upper = bb.first;
    s.bbands_lower = bb.second;
    
    auto mc = mc_f.get();
    s.macd = mc.first;
    s.signal_line = mc.second;
    
    s.buy_signal = (s.current_price < s.bbands_lower) || (s.rsi < 30);
    s.sell_signal = (s.current_price > s.bbands_upper) || (s.rsi > 70);
    
    return s;
}

std::string StatsModel::to_json() const {
    auto s = get_state();
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