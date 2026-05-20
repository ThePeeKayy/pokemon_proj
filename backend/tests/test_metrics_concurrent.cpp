#include "../include/metrics.h"

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <chrono>
#include <random>
#include <string>
#include <thread>
#include <vector>

using namespace pokemon;

namespace {

struct Result {
    bool ok = true;
    std::string reason;
    size_t expected_total = 0;
    size_t observed_total = 0;
    size_t observed_per_indicator_sum = 0;
    double wall_ms = 0.0;
    size_t threads = 0;
    size_t per_thread = 0;
};

Result run_one(size_t num_threads, size_t per_thread) {
    Result r;
    r.threads = num_threads;
    r.per_thread = per_thread;
    r.expected_total = num_threads * per_thread;

    MetricsCollector m;
    std::atomic<bool> go{false};

    auto worker = [&](unsigned seed) {
        std::mt19937 rng(seed);
        std::uniform_real_distribution<double> lat(0.1, 20.0);
        const Indicator indicators[] = {
            Indicator::RSI, Indicator::SMA, Indicator::MACD, Indicator::BBANDS
        };
        while (!go.load(std::memory_order_acquire)) { /* spin until start */ }
        for (size_t i = 0; i < per_thread; ++i) {
            m.record_metric(lat(rng), indicators[i & 3], 50, (i & 7) == 0);
        }
    };

    std::vector<std::thread> ts;
    ts.reserve(num_threads);
    const auto t0 = std::chrono::steady_clock::now();
    for (size_t i = 0; i < num_threads; ++i) ts.emplace_back(worker, 0xC0FFEE + i);
    go.store(true, std::memory_order_release);
    for (auto& t : ts) t.join();
    const auto t1 = std::chrono::steady_clock::now();
    r.wall_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

    auto stats = m.compute_stats();
    r.observed_total = stats.count;
    if (r.expected_total <= MetricsCollector::kRingSize) {
        if (stats.count != r.expected_total) {
            r.ok = false;
            r.reason = "overall count mismatch: expected "
                + std::to_string(r.expected_total)
                + " got " + std::to_string(stats.count);
            return r;
        }
    }

    auto per = m.compute_per_indicator_stats();
    size_t sum = 0;
    for (const auto& [name, s] : per.indicator_stats) sum += s.count;
    r.observed_per_indicator_sum = sum;
    if (sum != stats.count) {
        r.ok = false;
        r.reason = "per-indicator sum (" + std::to_string(sum)
            + ") != overall count (" + std::to_string(stats.count) + ")";
        return r;
    }

    if (stats.mean_ms < 0.0 || stats.min_ms < 0.0 || stats.max_ms < stats.min_ms) {
        r.ok = false;
        r.reason = "stats sanity failed";
        return r;
    }

    return r;
}

void emit_json(const std::vector<Result>& results) {
    bool all_ok = true;
    for (const auto& r : results) if (!r.ok) all_ok = false;

    std::printf("{\n");
    std::printf("  \"ok\": %s,\n", all_ok ? "true" : "false");
#ifndef __has_feature
#define __has_feature(x) 0
#endif

    std::printf("  \"tsan\": %s,\n",
#if __has_feature(thread_sanitizer) || defined(__SANITIZE_THREAD__)
        "true"
#else
        "false"
#endif
    );
    std::printf("  \"cases\": [\n");
    for (size_t i = 0; i < results.size(); ++i) {
        const auto& r = results[i];
        std::printf("    {\"threads\": %zu, \"per_thread\": %zu, "
                    "\"expected\": %zu, \"observed\": %zu, "
                    "\"per_indicator_sum\": %zu, \"wall_ms\": %.3f, "
                    "\"ok\": %s, \"reason\": \"%s\"}%s\n",
            r.threads, r.per_thread, r.expected_total, r.observed_total,
            r.observed_per_indicator_sum, r.wall_ms,
            r.ok ? "true" : "false", r.reason.c_str(),
            (i + 1 == results.size()) ? "" : ",");
    }
    std::printf("  ]\n");
    std::printf("}\n");
}

} // namespace

int main(int argc, char** argv) {
    size_t scale = 1;
    if (argc > 1) scale = std::max<size_t>(1, std::strtoul(argv[1], nullptr, 10));

    std::vector<Result> results;
    results.push_back(run_one(1, 50000 * scale));
    results.push_back(run_one(4, 25000 * scale));
    results.push_back(run_one(8, 12500 * scale));

    emit_json(results);

    for (const auto& r : results) if (!r.ok) return 1;
    return 0;
}