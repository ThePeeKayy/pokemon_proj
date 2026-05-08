// backend/include/statsmodel.h
#pragma once
#include <vector>
#include <cstdint>
#include <cmath>
#include <string>
#include <sstream>
#include <iomanip>
#include <algorithm>

namespace pokemon {

struct alignas(16) Price {
    double value;
    uint32_t timestamp;
};

class StatsModel {
public:
    explicit StatsModel(size_t window_size = 50) : window_size_(window_size) {
        prices_.reserve(window_size);
    }
    
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
    size_t price_count() const { return prices_.size(); }
    
private:
    std::vector<Price> prices_;
    size_t window_size_;
    
    double calculate_sma_(size_t period) const;
    double calculate_rsi_() const;
    void calculate_bollinger_bands_(double& upper, double& lower) const;
    void calculate_macd_(double& macd, double& signal) const;
    double calculate_volatility_() const;
};

// Mean Reversion Algo
class MeanReversionAlgo {
public:
    struct Signal {
        bool buy;
        bool sell;
        double confidence;
    };
    
    Signal analyze(const std::vector<double>& prices) {
        if (prices.size() < 20) return {false, false, 0.0};
        
        double mean = 0.0;
        for (double p : prices) mean += p;
        mean /= prices.size();
        
        double var = 0.0;
        for (double p : prices) {
            double d = p - mean;
            var += d * d;
        }
        double stddev = std::sqrt(var / prices.size());
        
        double current = prices.back();
        double zscore = (current - mean) / (stddev + 1e-6);
        
        Signal s{false, false, 0.0};
        if (zscore < -2.0) {
            s.buy = true;
            s.confidence = std::min(100.0, (-zscore - 2.0) * 20.0);
        } else if (zscore > 2.0) {
            s.sell = true;
            s.confidence = std::min(100.0, (zscore - 2.0) * 20.0);
        }
        return s;
    }
};

// Momentum Algo
class MomentumAlgo {
public:
    struct Signal {
        bool buy;
        bool sell;
        double momentum;
    };
    
    Signal analyze(const std::vector<double>& prices) {
        if (prices.size() < 10) return {false, false, 0.0};
        
        double mom = ((prices.back() - prices[prices.size() - 10]) / prices[prices.size() - 10]) * 100.0;
        
        Signal s{false, false, mom};
        if (mom > 5.0) s.buy = true;
        else if (mom < -5.0) s.sell = true;
        return s;
    }
};

} // namespace pokemon