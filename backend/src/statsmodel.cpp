// backend/src/StatsModel.cpp - NO EXTERNAL DEPENDENCIES

#include "../include/statsmodel.h"
#include <cmath>
#include <algorithm>
#include <ctime>

namespace pokemon {

void StatsModel::add_price(double price) {
    prices_.push_back({price, static_cast<uint32_t>(std::time(nullptr))});
    if (prices_.size() > window_size_) {
        prices_.erase(prices_.begin());
    }
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
    for (const auto& p : prices_) {
        mean += p.value;
    }
    mean /= prices_.size();
    
    double variance = 0.0;
    for (const auto& p : prices_) {
        double delta = p.value - mean;
        variance += delta * delta;
    }
    variance /= prices_.size();
    
    double std_dev = std::sqrt(variance);
    return (std_dev / mean) * 100.0;
}

double StatsModel::calculate_rsi_() const {
    if (prices_.size() < 15) return 50.0;
    
    double up_sum = 0.0, down_sum = 0.0;
    
    for (size_t i = 1; i < prices_.size(); i++) {
        double change = prices_[i].value - prices_[i-1].value;
        if (change > 0) {
            up_sum += change;
        } else {
            down_sum += -change;
        }
    }
    
    double avg_up = up_sum / 14.0;
    double avg_down = down_sum / 14.0;
    
    if (avg_down == 0.0) return 100.0;
    
    double rs = avg_up / avg_down;
    return 100.0 - (100.0 / (1.0 + rs));
}

void StatsModel::calculate_bollinger_bands_(double& upper, double& lower) const {
    double sma = calculate_sma_(20);
    
    if (prices_.empty()) {
        upper = sma * 1.02;
        lower = sma * 0.98;
        return;
    }
    
    double mean = sma;
    double std_dev = 0.0;
    
    size_t period = std::min(size_t(20), prices_.size());
    for (size_t i = prices_.size() - period; i < prices_.size(); i++) {
        double delta = prices_[i].value - mean;
        std_dev += delta * delta;
    }
    std_dev = std::sqrt(std_dev / period);
    
    upper = mean + (2.0 * std_dev);
    lower = mean - (2.0 * std_dev);
}

void StatsModel::calculate_macd_(double& macd, double& signal) const {
    if (prices_.size() < 26) {
        macd = 0.0;
        signal = 0.0;
        return;
    }
    
    double ema12 = 0.0, ema26 = 0.0;
    double multiplier12 = 2.0 / 13.0;
    double multiplier26 = 2.0 / 27.0;
    
    for (size_t i = prices_.size() - 26; i < prices_.size(); i++) {
        if (i == prices_.size() - 26) {
            ema12 = prices_[i].value;
            ema26 = prices_[i].value;
        } else {
            ema12 = prices_[i].value * multiplier12 + ema12 * (1.0 - multiplier12);
            ema26 = prices_[i].value * multiplier26 + ema26 * (1.0 - multiplier26);
        }
    }
    
    macd = ema12 - ema26;
    signal = macd * 0.66;
}

StatsModel::MarketState StatsModel::get_state() const {
    MarketState state{};
    state.num_observations = prices_.size();
    
    if (prices_.empty()) {
        return state;
    }
    
    state.current_price = prices_.back().value;
    state.sma_20 = calculate_sma_(20);
    state.rsi = calculate_rsi_();
    state.volatility = calculate_volatility_();
    
    calculate_bollinger_bands_(state.bbands_upper, state.bbands_lower);
    calculate_macd_(state.macd, state.signal_line);
    
    state.buy_signal = (state.current_price < state.bbands_lower) || (state.rsi < 30);
    state.sell_signal = (state.current_price > state.bbands_upper) || (state.rsi > 70);
    
    return state;
}

std::string StatsModel::to_json() const {
    auto state = get_state();
    
    std::ostringstream oss;
    oss << "{"
        << "\"price\":" << state.current_price << ","
        << "\"rsi\":" << state.rsi << ","
        << "\"sma20\":" << state.sma_20 << ","
        << "\"bbands_upper\":" << state.bbands_upper << ","
        << "\"bbands_lower\":" << state.bbands_lower << ","
        << "\"macd\":" << state.macd << ","
        << "\"signal_line\":" << state.signal_line << ","
        << "\"volatility\":" << state.volatility << ","
        << "\"buy_signal\":" << (state.buy_signal ? "true" : "false") << ","
        << "\"sell_signal\":" << (state.sell_signal ? "true" : "false")
        << "}";
    
    return oss.str();
}

} // namespace pokemon