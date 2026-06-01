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
    {}
    void record_metric(double latency_ms,
                       Indicator indicator,
                       size_t dataset_size,
                       bool cache_hit = false) noexcept
    {
        const uint64_t raw = write_idx_.fetch_add(1, std::memory_order_acq_rel);
        Slot& s = ring_[raw & kRingMask];

        const uint64_t done = (raw + 1) << 1; 
        const uint64_t busy = done | 1ull;     


        s.seq.store(busy, std::memory_order_release);
        std::atomic_thread_fence(std::memory_order_release);

        s.latency_ms.store(latency_ms, std::memory_order_relaxed);
        s.timestamp_ns.store(get_current_ns(), std::memory_order_relaxed);
        s.dataset_size.store(static_cast<uint32_t>(dataset_size),
                             std::memory_order_relaxed);
        s.indicator.store(static_cast<uint8_t>(indicator),
                          std::memory_order_relaxed);
        s.cache_hit.store(cache_hit, std::memory_order_relaxed);

        s.seq.store(done, std::memory_order_release);
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

        const uint64_t total     = write_idx_.load(std::memory_order_acquire);
        const uint64_t available = std::min<uint64_t>(total, kRingSize);
        const uint64_t start     = total - available;

        std::vector<double> values;
        values.reserve(static_cast<size_t>(available));

        size_t count = 0, cache_hits = 0;
        size_t b1 = 0, b5 = 0, b10 = 0, a10 = 0;
        double sum = 0.0, sum_sq = 0.0;
        double mn = std::numeric_limits<double>::infinity();
        double mx = -std::numeric_limits<double>::infinity();

        Sample sm;
        for (uint64_t r = start; r < total; ++r) {
            if (!try_read(r, sm)) continue;
            if (filter != Indicator::COUNT_ && sm.indicator != filter) continue;

            const double v = sm.latency_ms;
            values.push_back(v);
            ++count;
            sum    += v;
            sum_sq += v * v;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
            if (sm.cache_hit) ++cache_hits;
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

    void clear() noexcept {
        write_idx_.store(0, std::memory_order_relaxed);
        for (size_t i = 0; i < kRingSize; ++i) {
            ring_[i].seq.store(0, std::memory_order_relaxed);
        }
    }

    size_t metric_count() const noexcept {
        const uint64_t total = write_idx_.load(std::memory_order_acquire);
        return static_cast<size_t>(std::min<uint64_t>(total, kRingSize));
    }

    size_t dropped_count() const noexcept {
        const uint64_t total = write_idx_.load(std::memory_order_acquire);
        return total > kRingSize
            ? static_cast<size_t>(total - kRingSize)
            : 0;
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
        std::atomic<double>   latency_ms{0.0};
        std::atomic<uint64_t> timestamp_ns{0};
        std::atomic<uint32_t> dataset_size{0};
        std::atomic<uint8_t>  indicator{static_cast<uint8_t>(Indicator::OTHER)};
        std::atomic<bool>     cache_hit{false};
        std::atomic<uint64_t> seq{0};
    };

    struct Sample {
        double    latency_ms{0.0};
        uint64_t  timestamp_ns{0};
        uint32_t  dataset_size{0};
        Indicator indicator{Indicator::OTHER};
        bool      cache_hit{false};
    };

    std::time_t                       start_time_;
    std::unique_ptr<Slot[]>           ring_;
    alignas(64) std::atomic<uint64_t> write_idx_;

    static constexpr double BASELINE_P95_MS = 2.0;
    static constexpr double BASELINE_P99_MS = 3.0;

    bool try_read(uint64_t raw, Sample& out) const noexcept {
        const Slot& s = ring_[raw & kRingMask];
        const uint64_t expected = (raw + 1) << 1;   

        const uint64_t s1 = s.seq.load(std::memory_order_acquire);
        if (s1 != expected) return false;           

        out.latency_ms   = s.latency_ms.load(std::memory_order_relaxed);
        out.timestamp_ns = s.timestamp_ns.load(std::memory_order_relaxed);
        out.dataset_size = s.dataset_size.load(std::memory_order_relaxed);
        out.indicator    = static_cast<Indicator>(
                               s.indicator.load(std::memory_order_relaxed));
        out.cache_hit    = s.cache_hit.load(std::memory_order_relaxed);

        std::atomic_thread_fence(std::memory_order_acquire);
        const uint64_t s2 = s.seq.load(std::memory_order_relaxed);
        return s1 == s2;
    }

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