// backend/include/metrics.h - REAL-TIME PERFORMANCE MONITORING

#pragma once

#include <vector>
#include <string>
#include <ctime>
#include <algorithm>
#include <cmath>
#include <map>
#include <sstream>
#include <iomanip>

namespace pokemon {

struct PerformanceMetric {
    double latency_ms;
    uint64_t timestamp_ns;
    std::string indicator_type;  // "sma", "rsi", "volatility", etc.
    size_t dataset_size;
    bool cache_hit;
};

class MetricsCollector {
public:
    MetricsCollector() : start_time_(std::time(nullptr)) {}
    
    void record_metric(double latency_ms, const std::string& indicator, size_t dataset_size, bool cache_hit = false) {
        PerformanceMetric m{
            latency_ms,
            get_current_ns(),
            indicator,
            dataset_size,
            cache_hit
        };
        metrics_.push_back(m);
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
        
        // Regression detection
        bool is_regressed;
        double regression_severity;  // % change from baseline
        std::string baseline_comparison;
    };
    
    AggregateStats compute_stats(const std::string& indicator_type = "") {
        std::vector<double> values;
        size_t cache_hits = 0;
        
        for (const auto& m : metrics_) {
            if (indicator_type.empty() || m.indicator_type == indicator_type) {
                values.push_back(m.latency_ms);
                if (m.cache_hit) cache_hits++;
            }
        }
        
        AggregateStats stats{};
        stats.count = values.size();
        
        if (values.empty()) {
            return stats;
        }
        
        std::sort(values.begin(), values.end());
        
        stats.min_ms = values.front();
        stats.max_ms = values.back();
        stats.median_ms = values[values.size() / 2];
        stats.p50_ms = percentile(values, 0.50);
        stats.p95_ms = percentile(values, 0.95);
        stats.p99_ms = percentile(values, 0.99);
        stats.p999_ms = percentile(values, 0.999);
        
        double sum = 0.0;
        for (double v : values) sum += v;
        stats.mean_ms = sum / values.size();
        
        double sq_sum = 0.0;
        for (double v : values) {
            double diff = v - stats.mean_ms;
            sq_sum += diff * diff;
        }
        stats.stddev_ms = std::sqrt(sq_sum / values.size());
        
        stats.cache_hit_rate = static_cast<double>(cache_hits) / values.size() * 100.0;
        
        // Regression detection: compare current P95 to baseline
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
        result.total_calls = metrics_.size();
        
        // Collect unique indicator types without std::set
        std::map<std::string, bool> indicator_set;
        for (const auto& m : metrics_) {
            indicator_set[m.indicator_type] = true;
        }
        
        // Compute stats per indicator
        for (const auto& [indicator, _] : indicator_set) {
            result.indicator_stats[indicator] = compute_stats(indicator);
        }
        
        // Sum total time
        double total_time = 0.0;
        for (const auto& m : metrics_) {
            total_time += m.latency_ms;
        }
        result.total_time_ms = total_time;
        
        return result;
    }
    
    void clear() {
        metrics_.clear();
    }
    
    size_t metric_count() const {
        return metrics_.size();
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
        
        // Overall stats
        oss << "\"overall\":{";
        oss << "\"mean_ms\":" << per_indicator.overall_stats.mean_ms << ",";
        oss << "\"median_ms\":" << per_indicator.overall_stats.median_ms << ",";
        oss << "\"p95_ms\":" << per_indicator.overall_stats.p95_ms << ",";
        oss << "\"p99_ms\":" << per_indicator.overall_stats.p99_ms << ",";
        oss << "\"p999_ms\":" << per_indicator.overall_stats.p999_ms << ",";
        oss << "\"min_ms\":" << per_indicator.overall_stats.min_ms << ",";
        oss << "\"max_ms\":" << per_indicator.overall_stats.max_ms << ",";
        oss << "\"stddev_ms\":" << per_indicator.overall_stats.stddev_ms << ",";
        oss << "\"cache_hit_rate\":" << per_indicator.overall_stats.cache_hit_rate << ",";
        oss << "\"is_regressed\":" << (per_indicator.overall_stats.is_regressed ? "true" : "false") << ",";
        oss << "\"regression_severity\":" << per_indicator.overall_stats.regression_severity << ",";
        oss << "\"baseline_comparison\":\"" << per_indicator.overall_stats.baseline_comparison << "\"";
        oss << "},";
        
        // Per-indicator stats
        oss << "\"per_indicator\":{";
        bool first = true;
        for (const auto& [indicator, stats] : per_indicator.indicator_stats) {
            if (!first) oss << ",";
            oss << "\"" << indicator << "\":{";
            oss << "\"mean_ms\":" << stats.mean_ms << ",";
            oss << "\"p95_ms\":" << stats.p95_ms << ",";
            oss << "\"p99_ms\":" << stats.p99_ms << ",";
            oss << "\"count\":" << stats.count << ",";
            oss << "\"cache_hit_rate\":" << stats.cache_hit_rate;
            oss << "}";
            first = false;
        }
        oss << "},";
        
        // Throughput
        double uptime = std::max(1.0, static_cast<double>(std::time(nullptr) - start_time_));
        double throughput_ops_per_sec = per_indicator.total_calls / (uptime / 60.0);
        
        oss << "\"throughput_ops_per_min\":" << throughput_ops_per_sec << ",";
        oss << "\"latency_distribution\":{";
        oss << "\"<1ms\":" << count_latencies_below(1.0) << ",";
        oss << "\"<5ms\":" << count_latencies_below(5.0) << ",";
        oss << "\"<10ms\":" << count_latencies_below(10.0) << ",";
        oss << "\">10ms\":" << count_latencies_above(10.0);
        oss << "}";
        
        oss << "}";
        return oss.str();
    }
    
private:
    std::vector<PerformanceMetric> metrics_;
    std::time_t start_time_;
    
    // Baseline thresholds (from benchmarks)
    static constexpr double BASELINE_P95_MS = 2.0;
    static constexpr double BASELINE_P99_MS = 3.0;
    
    uint64_t get_current_ns() {
        return std::chrono::high_resolution_clock::now().time_since_epoch().count();
    }
    
    double percentile(const std::vector<double>& sorted, double p) {
        if (sorted.empty()) return 0.0;
        size_t idx = static_cast<size_t>(sorted.size() * p);
        return sorted[std::min(idx, sorted.size() - 1)];
    }
    
    void detect_regression(AggregateStats& stats) {
        // Simple regression detection: if P95 > baseline * 1.5
        if (stats.p95_ms > BASELINE_P95_MS * 1.5) {
            stats.is_regressed = true;
            stats.regression_severity = ((stats.p95_ms - BASELINE_P95_MS) / BASELINE_P95_MS) * 100.0;
            
            if (stats.regression_severity > 50) {
                stats.baseline_comparison = "CRITICAL: +";
            } else if (stats.regression_severity > 25) {
                stats.baseline_comparison = "WARNING: +";
            } else {
                stats.baseline_comparison = "CAUTION: +";
            }
            stats.baseline_comparison += std::to_string(static_cast<int>(stats.regression_severity)) + "%";
        } else {
            stats.is_regressed = false;
            stats.regression_severity = 0.0;
            stats.baseline_comparison = "HEALTHY";
        }
    }
    
    size_t count_latencies_below(double threshold) {
        size_t count = 0;
        for (const auto& m : metrics_) {
            if (m.latency_ms < threshold) count++;
        }
        return count;
    }
    
    size_t count_latencies_above(double threshold) {
        size_t count = 0;
        for (const auto& m : metrics_) {
            if (m.latency_ms >= threshold) count++;
        }
        return count;
    }
};

} // namespace pokemon