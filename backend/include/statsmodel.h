// backend/include/StatsModel.h - NO EXTERNAL DEPENDENCIES

#pragma once

#include <vector>
#include <cstdint>
#include <cmath>
#include <string>
#include <sstream>
#include <iomanip>
#include <algorithm>

namespace pokemon {

struct Price {
    double value;
    uint32_t timestamp;
};

class StatsModel {
public:
    StatsModel(size_t window_size = 50) : window_size_(window_size) {}
    
    void add_price(double price);
    
    struct MarketState {
        double current_price = 0.0;
        double sma_20 = 0.0;
        double rsi = 50.0;
        double bbands_upper = 0.0;
        double bbands_lower = 0.0;
        double macd = 0.0;
        double signal_line = 0.0;
        double volatility = 0.0;
        bool buy_signal = false;
        bool sell_signal = false;
        uint32_t num_observations = 0;
    };
    
    MarketState get_state() const;
    std::string to_json() const;
    
private:
    std::vector<Price> prices_;
    size_t window_size_;
    
    double calculate_sma_(size_t period) const;
    double calculate_rsi_() const;
    void calculate_bollinger_bands_(double& upper, double& lower) const;
    void calculate_macd_(double& macd, double& signal) const;
    double calculate_volatility_() const;
};

} // namespace pokemon