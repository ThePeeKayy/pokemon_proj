#pragma once

#include <vector>
#include <string>
#include <ctime>
#include <algorithm>
#include <cmath>
#include <map>
#include <sstream>
#include <iomanip>
#include <atomic>
#include <array>
#include <memory>
#include <cstdint>
#include <chrono>
#include <limits>

namespace pokemon {

struct PerformanceMetric {
    double      latency_ms;
    uint64_t    timestamp_ns;
    std::string indicator_type;
    size_t      dataset_size;
    bool        cache_hit;
};

enum class Indicator : uint8_t {
    RSI = 0, SMA, MACD, BBANDS, OTHER, COUNT_
};

inline const char* indicator_name(Indicator i) noexcept {
    switch (i) {
        case Indicator::RSI:    return "rsi";
        case Indicator::SMA:    return "sma";
        case Indicator::MACD:   return "macd";
        case Indicator::BBANDS: return "bbands";
        default:                return "other";
    }
}

class MetricsCollector {
public:
    static constexpr size_t kRingSize = 1u << 20;
    static constexpr size_t kRingMask = kRingSize - 1;

    MetricsCollector()
        : start_time_(std::time(nullptr))
        , ring_(new Slot[kRingSize])
        , write_idx_(0)
        , dropped_(0)
    {}

    void record_metric(double latency_ms,
                       Indicator indicator,
                       size_t dataset_size,
                       bool cache_hit = false) noexcept
    {
        const size_t idx = write_idx_.fetch_add(1, std::memory_order_acq_rel);
        if (idx >= kRingSize) {
            dropped_.fetch_add(1, std::memory_order_relaxed);
            return;
        }
        Slot& s = ring_[idx];
        s.latency_ms   = latency_ms;
        s.timestamp_ns = get_current_ns();
        s.dataset_size = static_cast<uint32_t>(dataset_size);
        s.indicator    = indicator;
        s.cache_hit    = cache_hit;
        s.committed.store(true, std::memory_order_release);
    }

    struct AggregateStats {
        double mean_ms             = 0.0;
        double median_ms           = 0.0;
        double p50_ms              = 0.0;
        double p95_ms              = 0.0;
        double p99_ms              = 0.0;
        double p999_ms             = 0.0;
        double min_ms              = 0.0;
        double max_ms              = 0.0;
        double stddev_ms           = 0.0;
        double sum_ms              = 0.0;
        size_t count               = 0;
        double cache_hit_rate      = 0.0;
        size_t below_1_ms          = 0;
        size_t below_5_ms          = 0;
        size_t below_10_ms         = 0;
        size_t above_10_ms         = 0;
        bool   is_regressed        = false;
        double regression_severity = 0.0;
        std::string baseline_comparison;
    };

    AggregateStats compute_stats(Indicator filter = Indicator::COUNT_) {
        AggregateStats stats{};
        const size_t end = std::min(write_idx_.load(std::memory_order_acquire), kRingSize);

        std::vector<double> values;
        values.reserve(end);

        size_t count = 0, cache_hits = 0;
        size_t b1 = 0, b5 = 0, b10 = 0, a10 = 0;
        double sum = 0.0, sum_sq = 0.0;
        double mn = std::numeric_limits<double>::infinity();
        double mx = -std::numeric_limits<double>::infinity();

        for (size_t i = 0; i < end; ++i) {
            const Slot& s = ring_[i];
            if (!s.committed.load(std::memory_order_acquire)) continue;
            if (filter != Indicator::COUNT_ && s.indicator != filter) continue;

            const double v = s.latency_ms;
            values.push_back(v);
            ++count;
            sum    += v;
            sum_sq += v * v;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
            if (s.cache_hit) ++cache_hits;
            if (v <  1.0)  ++b1;
            if (v <  5.0)  ++b5;
            if (v < 10.0)  ++b10;
            if (v >= 10.0) ++a10;
        }

        stats.count = count;
        if (count == 0) return stats;

        stats.min_ms  = mn;
        stats.max_ms  = mx;
        stats.sum_ms  = sum;
        stats.mean_ms = sum / static_cast<double>(count);
        const double var = sum_sq / static_cast<double>(count)
                         - stats.mean_ms * stats.mean_ms;
        stats.stddev_ms = std::sqrt(var > 0.0 ? var : 0.0);
        stats.cache_hit_rate =
            static_cast<double>(cache_hits) / static_cast<double>(count) * 100.0;
        stats.below_1_ms  = b1;
        stats.below_5_ms  = b5;
        stats.below_10_ms = b10;
        stats.above_10_ms = a10;

        std::sort(values.begin(), values.end());
        stats.median_ms = values[values.size() / 2];
        stats.p50_ms    = percentile(values, 0.50);
        stats.p95_ms    = percentile(values, 0.95);
        stats.p99_ms    = percentile(values, 0.99);
        stats.p999_ms   = percentile(values, 0.999);

        detect_regression(stats);
        return stats;
    }

    struct PerIndicatorStats {
        std::map<std::string, AggregateStats> indicator_stats;
        AggregateStats overall_stats;
        double total_calls   = 0.0;
        double total_time_ms = 0.0;
    };

    PerIndicatorStats compute_per_indicator_stats() {
        PerIndicatorStats result{};
        result.overall_stats = compute_stats();
        result.total_calls   = static_cast<double>(result.overall_stats.count);
        result.total_time_ms = result.overall_stats.sum_ms;

        for (uint8_t i = 0; i < static_cast<uint8_t>(Indicator::COUNT_); ++i) {
            const Indicator ind = static_cast<Indicator>(i);
            AggregateStats s = compute_stats(ind);
            if (s.count > 0) {
                result.indicator_stats[indicator_name(ind)] = s;
            }
        }
        return result;
    }

    // NOT thread-safe with concurrent record_metric callers
    void clear() noexcept {
        write_idx_.store(0, std::memory_order_relaxed);
        dropped_.store(0, std::memory_order_relaxed);
        for (size_t i = 0; i < kRingSize; ++i) {
            ring_[i].committed.store(false, std::memory_order_relaxed);
        }
    }

    size_t metric_count() const noexcept {
        return std::min(write_idx_.load(std::memory_order_acquire), kRingSize);
    }

    size_t dropped_count() const noexcept {
        return dropped_.load(std::memory_order_relaxed);
    }

    std::string to_json() {
        auto per = compute_per_indicator_stats();
        const auto& ov = per.overall_stats;
        std::ostringstream oss;
        oss << std::fixed << std::setprecision(4);
        oss << "{";
        oss << "\"timestamp\":" << std::time(nullptr) << ",";
        oss << "\"uptime_seconds\":" << (std::time(nullptr) - start_time_) << ",";
        oss << "\"total_requests\":" << per.total_calls << ",";
        oss << "\"total_time_ms\":"  << per.total_time_ms << ",";

        oss << "\"overall\":{";
        oss << "\"mean_ms\":"   << ov.mean_ms << ",";
        oss << "\"median_ms\":" << ov.median_ms << ",";
        oss << "\"p95_ms\":"    << ov.p95_ms << ",";
        oss << "\"p99_ms\":"    << ov.p99_ms << ",";
        oss << "\"p999_ms\":"   << ov.p999_ms << ",";
        oss << "\"min_ms\":"    << ov.min_ms << ",";
        oss << "\"max_ms\":"    << ov.max_ms << ",";
        oss << "\"stddev_ms\":" << ov.stddev_ms << ",";
        oss << "\"cache_hit_rate\":" << ov.cache_hit_rate << ",";
        oss << "\"is_regressed\":" << (ov.is_regressed ? "true" : "false") << ",";
        oss << "\"regression_severity\":" << ov.regression_severity << ",";
        oss << "\"baseline_comparison\":\"" << ov.baseline_comparison << "\"";
        oss << "},";

        oss << "\"per_indicator\":{";
        bool first = true;
        for (const auto& [indicator, s] : per.indicator_stats) {
            if (!first) oss << ",";
            oss << "\"" << indicator << "\":{";
            oss << "\"mean_ms\":" << s.mean_ms << ",";
            oss << "\"p95_ms\":"  << s.p95_ms << ",";
            oss << "\"p99_ms\":"  << s.p99_ms << ",";
            oss << "\"count\":"   << s.count << ",";
            oss << "\"cache_hit_rate\":" << s.cache_hit_rate;
            oss << "}";
            first = false;
        }
        oss << "},";

        const double uptime = std::max(1.0,
            static_cast<double>(std::time(nullptr) - start_time_));
        const double throughput_ops_per_min = per.total_calls / (uptime / 60.0);

        oss << "\"throughput_ops_per_min\":" << throughput_ops_per_min << ",";
        oss << "\"dropped\":" << dropped_count() << ",";
        oss << "\"latency_distribution\":{";
        oss << "\"<1ms\":"  << ov.below_1_ms  << ",";
        oss << "\"<5ms\":"  << ov.below_5_ms  << ",";
        oss << "\"<10ms\":" << ov.below_10_ms << ",";
        oss << "\">10ms\":" << ov.above_10_ms;
        oss << "}";

        oss << "}";
        return oss.str();
    }

private:
    struct Slot {
        double      latency_ms{0.0};
        uint64_t    timestamp_ns{0};
        uint32_t    dataset_size{0};
        Indicator   indicator{Indicator::OTHER};
        bool        cache_hit{false};
        std::atomic<bool> committed{false};
    };

    std::time_t                     start_time_;
    std::unique_ptr<Slot[]>         ring_;
    alignas(64) std::atomic<size_t> write_idx_;
    alignas(64) std::atomic<size_t> dropped_;

    static constexpr double BASELINE_P95_MS = 2.0;
    static constexpr double BASELINE_P99_MS = 3.0;

    static uint64_t get_current_ns() noexcept {
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
    }

    static double percentile(const std::vector<double>& sorted, double p) noexcept {
        if (sorted.empty()) return 0.0;
        size_t idx = static_cast<size_t>(sorted.size() * p);
        return sorted[std::min(idx, sorted.size() - 1)];
    }

    void detect_regression(AggregateStats& stats) {
        if (stats.p95_ms > BASELINE_P95_MS * 1.5) {
            stats.is_regressed = true;
            stats.regression_severity =
                ((stats.p95_ms - BASELINE_P95_MS) / BASELINE_P95_MS) * 100.0;
            if (stats.regression_severity > 50)      stats.baseline_comparison = "CRITICAL: +";
            else if (stats.regression_severity > 25) stats.baseline_comparison = "WARNING: +";
            else                                     stats.baseline_comparison = "CAUTION: +";
            stats.baseline_comparison +=
                std::to_string(static_cast<int>(stats.regression_severity)) + "%";
        } else {
            stats.is_regressed = false;
            stats.regression_severity = 0.0;
            stats.baseline_comparison = "HEALTHY";
        }
    }
};

} // namespace pokemon