#pragma once
#include <array>
#include <cstdint>
#include <cmath>
#include <string>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <vector>

namespace pokemon {

struct alignas(16) Price {
    double value;
    uint32_t timestamp;
};



inline constexpr size_t kMaxWindow = 256;

class StatsModel {
public:
    explicit StatsModel(size_t window_size = 50) noexcept
        : window_size_(window_size > kMaxWindow ? kMaxWindow : window_size)
        , head_(0)
        , count_(0)
    {}

    void add_price(double price) noexcept;

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

    MarketState get_state() const noexcept;
    std::string to_json() const;
    size_t price_count() const noexcept { return count_; }

private:
    
    
    std::array<Price, kMaxWindow> prices_{};
    size_t window_size_;
    size_t head_;   
    size_t count_;  

    
    inline double at(size_t i) const noexcept {
        
        size_t base = (count_ < window_size_) ? 0 : head_;
        return prices_[(base + i) % window_size_].value;
    }
    
    
    size_t linearize_tail(size_t period, double* out) const noexcept;

    double calculate_sma_(size_t period) const noexcept;
    double calculate_rsi_() const noexcept;
    void   calculate_bollinger_bands_(double& upper, double& lower) const noexcept;
    void   calculate_macd_(double& macd, double& signal) const noexcept;
    double calculate_volatility_() const noexcept;
};


class MeanReversionAlgo {
public:
    struct Signal {
        bool buy;
        bool sell;
        double confidence;
    };

    Signal analyze(const std::vector<double>& prices) const noexcept {
        const size_t n = prices.size();
        if (n < 20) return {false, false, 0.0};

        double sum = 0.0;
        for (size_t i = 0; i < n; ++i) sum += prices[i];
        const double mean = sum / static_cast<double>(n);

        double var = 0.0;
        for (size_t i = 0; i < n; ++i) {
            const double d = prices[i] - mean;
            var += d * d;
        }
        const double stddev = std::sqrt(var / static_cast<double>(n));

        const double current = prices.back();
        const double zscore = (current - mean) / (stddev + 1e-6);

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

class MomentumAlgo {
public:
    struct Signal {
        bool buy;
        bool sell;
        double momentum;
    };

    Signal analyze(const std::vector<double>& prices) const noexcept {
        const size_t n = prices.size();
        if (n < 10) return {false, false, 0.0};
        const double back = prices[n - 1];
        const double ref  = prices[n - 10];
        const double mom = ((back - ref) / ref) * 100.0;

        Signal s{false, false, mom};
        if (mom > 5.0)       s.buy  = true;
        else if (mom < -5.0) s.sell = true;
        return s;
    }
};

} // namespace pokemon