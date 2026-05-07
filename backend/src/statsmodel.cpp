// backend/src/statsmodel_fast.cpp - MINIMAL PARALLEL INDICATORS

#include "../include/statsmodel.h"
#include <cmath>
#include <algorithm>
#include <ctime>
#include <future>

namespace pokemon {

void StatsModel::add_price(double price) {
    prices_.push_back({price, (uint32_t)std::time(nullptr)});
    if (prices_.size() > window_size_) prices_.erase(prices_.begin());
}

double StatsModel::calculate_sma_(size_t period) const {
    if (prices_.size() < period) return 0.0;
    double sum = 0.0;
    for (size_t i = prices_.size() - period; i < prices_.size(); i++) {
        sum += prices_[i].value;
    }
    return sum / period;
}

double StatsModel::calculate_volatility_() const {
    if (prices_.size() < 2) return 0.0;
    double mean = 0.0;
    for (const auto& p : prices_) mean += p.value;
    mean /= prices_.size();
    double var = 0.0;
    for (const auto& p : prices_) {
        double d = p.value - mean;
        var += d * d;
    }
    return (std::sqrt(var / prices_.size()) / mean) * 100.0;
}

double StatsModel::calculate_rsi_() const {
    if (prices_.size() < 15) return 50.0;
    double up = 0, down = 0;
    for (size_t i = 1; i < prices_.size(); i++) {
        double ch = prices_[i].value - prices_[i-1].value;
        if (ch > 0) up += ch;
        else down += -ch;
    }
    double avg_up = up / 14.0, avg_down = down / 14.0;
    if (avg_down == 0.0) return 100.0;
    return 100.0 - (100.0 / (1.0 + avg_up / avg_down));
}

void StatsModel::calculate_bollinger_bands_(double& upper, double& lower) const {
    double sma = calculate_sma_(20);
    if (prices_.empty()) { upper = sma * 1.02; lower = sma * 0.98; return; }
    
    size_t period = std::min(size_t(20), prices_.size());
    double sd = 0;
    for (size_t i = prices_.size() - period; i < prices_.size(); i++) {
        double d = prices_[i].value - sma;
        sd += d * d;
    }
    sd = std::sqrt(sd / period);
    upper = sma + (2.0 * sd);
    lower = sma - (2.0 * sd);
}

void StatsModel::calculate_macd_(double& macd, double& signal) const {
    if (prices_.size() < 26) { macd = signal = 0.0; return; }
    
    double ema12 = 0, ema26 = 0;
    double m12 = 2.0 / 13.0, m26 = 2.0 / 27.0;
    
    for (size_t i = prices_.size() - 26; i < prices_.size(); i++) {
        if (i == prices_.size() - 26) { ema12 = ema26 = prices_[i].value; }
        else {
            ema12 = prices_[i].value * m12 + ema12 * (1.0 - m12);
            ema26 = prices_[i].value * m26 + ema26 * (1.0 - m26);
        }
    }
    macd = ema12 - ema26;
    signal = macd * 0.66;
}

StatsModel::MarketState StatsModel::get_state() const {
    MarketState s{};
    s.num_observations = prices_.size();
    if (prices_.empty()) return s;
    
    s.current_price = prices_.back().value;
    
    // Launch all 5 indicators in parallel
    auto rsi_f = std::async(std::launch::async, [this]() { return calculate_rsi_(); });
    auto sma_f = std::async(std::launch::async, [this]() { return calculate_sma_(20); });
    auto vol_f = std::async(std::launch::async, [this]() { return calculate_volatility_(); });
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
    oss << "{\"price\":" << s.current_price << ",\"rsi\":" << s.rsi 
        << ",\"sma20\":" << s.sma_20 << ",\"volatility\":" << s.volatility
        << ",\"bbands_upper\":" << s.bbands_upper << ",\"bbands_lower\":" << s.bbands_lower
        << ",\"macd\":" << s.macd << ",\"signal_line\":" << s.signal_line
        << ",\"buy_signal\":" << (s.buy_signal ? "true" : "false")
        << ",\"sell_signal\":" << (s.sell_signal ? "true" : "false") << "}";
    return oss.str();
}

}