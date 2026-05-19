#pragma once

#include <vector>
#include <string>
#include <ctime>
#include <algorithm>
#include <cmath>
#include <map>
#include <mutex>
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
                    const std::string& indicator,
                    size_t dataset_size,
                    bool cache_hit = false)
    {
        size_t idx = write_idx_.load(std::memory_order_relaxed);

        while (true) {
            if (idx >= kRingSize) {
                dropped_.fetch_add(1, std::memory_order_relaxed);
                return;
            }

            if (write_idx_.compare_exchange_weak(
                    idx, idx + 1,
                    std::memory_order_acq_rel,
                    std::memory_order_relaxed)) {
                break;
            }
        }

        Slot& s = ring_[idx];

        s.latency_ms   = latency_ms;
        s.timestamp_ns = get_current_ns();

        s.indicator_type = indicator;

        s.dataset_size = dataset_size;
        s.cache_hit    = cache_hit;

        s.committed.store(true, std::memory_order_release);

        std::lock_guard<std::mutex> lk(agg_mu_);
        update_running(aggregates_[indicator], latency_ms, cache_hit);
        update_running(overall_, latency_ms, cache_hit);
    }

    struct AggregateStats {
        double mean_ms;
        double median_ms;
        double p50_ms;
        double p95_ms;
        double p99_ms;
        double p999_ms;
        double min_ms;
        double max_ms;
        double stddev_ms;
        size_t count;
        double cache_hit_rate;
        bool   is_regressed;
        double regression_severity;
        std::string baseline_comparison;
    };

    AggregateStats compute_stats(const std::string& indicator_type = "") {
        AggregateStats stats{};

        Running agg;
        {
            std::lock_guard<std::mutex> lk(agg_mu_);
            if (indicator_type.empty()) {
                agg = overall_;
            } else {
                auto it = aggregates_.find(indicator_type);  // no silent insert
                if (it != aggregates_.end()) agg = it->second;
            }
        }

        stats.count = agg.count;
        if (agg.count == 0) return stats;

        stats.min_ms = agg.min;
        stats.max_ms = agg.max;
        stats.mean_ms = agg.sum / static_cast<double>(agg.count);
        const double var = agg.sum_sq / static_cast<double>(agg.count)
                         - stats.mean_ms * stats.mean_ms;
        stats.stddev_ms = std::sqrt(var > 0.0 ? var : 0.0);
        stats.cache_hit_rate =
            static_cast<double>(agg.cache_hits) / static_cast<double>(agg.count) * 100.0;

        std::vector<double> values;
        values.reserve(agg.count);
        const size_t end = std::min(write_idx_.load(std::memory_order_acquire), kRingSize);
        for (size_t i = 0; i < end; ++i) {
            const Slot& s = ring_[i];
            if (!s.committed.load(std::memory_order_acquire)) continue;
            if (indicator_type.empty() || s.indicator_type == indicator_type) {
                values.push_back(s.latency_ms);
            }
        }
        if (!values.empty()) {
            std::sort(values.begin(), values.end());
            stats.median_ms = values[values.size() / 2];
            stats.p50_ms    = percentile(values, 0.50);
            stats.p95_ms    = percentile(values, 0.95);
            stats.p99_ms    = percentile(values, 0.99);
            stats.p999_ms   = percentile(values, 0.999);
        }
        detect_regression(stats);
        return stats;
    }

    struct PerIndicatorStats {
        std::map<std::string, AggregateStats> indicator_stats;
        AggregateStats overall_stats;
        double total_calls;
        double total_time_ms;
    };

    PerIndicatorStats compute_per_indicator_stats() {
        PerIndicatorStats result{};
        result.overall_stats = compute_stats();

        std::vector<std::string> names;
        {
            std::lock_guard<std::mutex> lk(agg_mu_);
            result.total_calls   = static_cast<double>(overall_.count);
            result.total_time_ms = overall_.sum;
            names.reserve(aggregates_.size());
            for (const auto& [name, _] : aggregates_) names.push_back(name);
        }
        for (const auto& name : names) {
            result.indicator_stats[name] = compute_stats(name);
        }
        return result;
    }

    void clear() {
        write_idx_.store(0, std::memory_order_relaxed);
        dropped_.store(0, std::memory_order_relaxed);
        for (size_t i = 0; i < kRingSize; ++i) {
            ring_[i].committed.store(false, std::memory_order_relaxed);
        }
        std::lock_guard<std::mutex> lk(agg_mu_);
        aggregates_.clear();
        overall_ = Running{};
    }

    size_t metric_count() const {
        return std::min(write_idx_.load(std::memory_order_acquire), kRingSize);
    }

    std::string to_json() {
        auto per_indicator = compute_per_indicator_stats();
        std::ostringstream oss;
        oss << std::fixed << std::setprecision(4);
        oss << "{";
        oss << "\"timestamp\":" << std::time(nullptr) << ",";
        oss << "\"uptime_seconds\":" << (std::time(nullptr) - start_time_) << ",";
        oss << "\"total_requests\":" << per_indicator.total_calls << ",";
        oss << "\"total_time_ms\":" << per_indicator.total_time_ms << ",";

        oss << "\"overall\":{";
        oss << "\"mean_ms\":"   << per_indicator.overall_stats.mean_ms << ",";
        oss << "\"median_ms\":" << per_indicator.overall_stats.median_ms << ",";
        oss << "\"p95_ms\":"    << per_indicator.overall_stats.p95_ms << ",";
        oss << "\"p99_ms\":"    << per_indicator.overall_stats.p99_ms << ",";
        oss << "\"p999_ms\":"   << per_indicator.overall_stats.p999_ms << ",";
        oss << "\"min_ms\":"    << per_indicator.overall_stats.min_ms << ",";
        oss << "\"max_ms\":"    << per_indicator.overall_stats.max_ms << ",";
        oss << "\"stddev_ms\":" << per_indicator.overall_stats.stddev_ms << ",";
        oss << "\"cache_hit_rate\":" << per_indicator.overall_stats.cache_hit_rate << ",";
        oss << "\"is_regressed\":" << (per_indicator.overall_stats.is_regressed ? "true" : "false") << ",";
        oss << "\"regression_severity\":" << per_indicator.overall_stats.regression_severity << ",";
        oss << "\"baseline_comparison\":\"" << per_indicator.overall_stats.baseline_comparison << "\"";
        oss << "},";

        oss << "\"per_indicator\":{";
        bool first = true;
        for (const auto& [indicator, stats] : per_indicator.indicator_stats) {
            if (!first) oss << ",";
            oss << "\"" << indicator << "\":{";
            oss << "\"mean_ms\":" << stats.mean_ms << ",";
            oss << "\"p95_ms\":"  << stats.p95_ms << ",";
            oss << "\"p99_ms\":"  << stats.p99_ms << ",";
            oss << "\"count\":"   << stats.count << ",";
            oss << "\"cache_hit_rate\":" << stats.cache_hit_rate;
            oss << "}";
            first = false;
        }
        oss << "},";

        const double uptime = std::max(1.0,
            static_cast<double>(std::time(nullptr) - start_time_));
        const double throughput_ops_per_min =
            per_indicator.total_calls / (uptime / 60.0);

        // Snapshot histogram buckets under the lock.
        size_t b1, b5, b10, a10;
        {
            std::lock_guard<std::mutex> lk(agg_mu_);
            b1  = overall_.below_1;
            b5  = overall_.below_5;
            b10 = overall_.below_10;
            a10 = overall_.above_10;
        }

        oss << "\"throughput_ops_per_min\":" << throughput_ops_per_min << ",";
        oss << "\"latency_distribution\":{";
        oss << "\"<1ms\":"  << b1  << ",";
        oss << "\"<5ms\":"  << b5  << ",";
        oss << "\"<10ms\":" << b10 << ",";
        oss << "\">10ms\":" << a10;
        oss << "}";

        oss << "}";
        return oss.str();
    }

private:
    struct Slot {
        double      latency_ms{0.0};
        uint64_t    timestamp_ns{0};
        std::string indicator_type;  
        size_t      dataset_size{0};
        bool        cache_hit{false};
        std::atomic<bool> committed{false};
    };

    struct Running {
        size_t count    = 0;
        double sum      = 0.0;
        double sum_sq   = 0.0;
        double min      = std::numeric_limits<double>::infinity();
        double max      = -std::numeric_limits<double>::infinity();
        size_t cache_hits = 0;
        size_t below_1   = 0;
        size_t below_5   = 0;
        size_t below_10  = 0;
        size_t above_10  = 0;
    };

    static void update_running(Running& r, double latency_ms, bool cache_hit) {
        ++r.count;
        r.sum    += latency_ms;
        r.sum_sq += latency_ms * latency_ms;
        if (latency_ms < r.min) r.min = latency_ms;
        if (latency_ms > r.max) r.max = latency_ms;
        if (cache_hit) ++r.cache_hits;
        if (latency_ms <  1.0)  ++r.below_1;
        if (latency_ms <  5.0)  ++r.below_5;
        if (latency_ms < 10.0)  ++r.below_10;
        if (latency_ms >= 10.0) ++r.above_10;
    }

    std::time_t                  start_time_;
    std::unique_ptr<Slot[]>      ring_;
    alignas(64) std::atomic<size_t> write_idx_;
    alignas(64) std::atomic<size_t> dropped_;
    mutable std::mutex             agg_mu_;
    std::map<std::string, Running> aggregates_;
    Running                        overall_;

    static constexpr double BASELINE_P95_MS = 2.0;
    static constexpr double BASELINE_P99_MS = 3.0;

    static uint64_t get_current_ns() noexcept {
        return std::chrono::steady_clock::now()
                   .time_since_epoch().count();
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
            if (stats.regression_severity > 50)        stats.baseline_comparison = "CRITICAL: +";
            else if (stats.regression_severity > 25)   stats.baseline_comparison = "WARNING: +";
            else                                       stats.baseline_comparison = "CAUTION: +";
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