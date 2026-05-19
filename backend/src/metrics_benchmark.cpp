#include <benchmark/benchmark.h>
#include <vector>
#include <random>
#include <fstream>
#include <chrono>
#include <algorithm>
#include <ctime>
#include <memory>
#include <nlohmann/json.hpp>
#include "../include/statsmodel.h"
#include "../include/scraper.h"

using json = nlohmann::json;

namespace {

struct BenchContext {
    std::vector<double>         prices_data;
    pokemon::StatsModel         model{50};
    pokemon::MeanReversionAlgo  mr_algo;
    pokemon::MomentumAlgo       mom_algo;
    std::vector<double>         bench_latencies;
};

BenchContext& ctx() {
    static BenchContext c;
    return c;
}

std::vector<double> generate_prices(int count, const std::string& card_name) {
    std::vector<double> prices;
    prices.reserve(count);
    double base = pokemon::Scraper::get_best_price(card_name);
    if (base <= 0) base = 100.0;

    std::mt19937 rng(std::random_device{}());
    std::normal_distribution<double> dist(0.0, 0.5);

    double price = base;
    for (int i = 0; i < count; ++i) {
        price *= (1.0 + dist(rng) / 100.0);
        prices.push_back(price);
    }
    return prices;
}

void setup() {
    for (double p : ctx().prices_data) ctx().model.add_price(p);
}

} // namespace

static void BM_TechnicalIndicators(benchmark::State& state) {
    auto& c = ctx();
    for (auto _ : state) {
        auto start = std::chrono::high_resolution_clock::now();
        auto result = c.model.get_state();
        auto end = std::chrono::high_resolution_clock::now();
        double ms = std::chrono::duration<double, std::milli>(end - start).count();
        c.bench_latencies.push_back(ms);
        benchmark::DoNotOptimize(result);
    }
}
BENCHMARK(BM_TechnicalIndicators);

static void BM_MeanReversion(benchmark::State& state) {
    auto& c = ctx();
    for (auto _ : state) {
        auto start = std::chrono::high_resolution_clock::now();
        auto signal = c.mr_algo.analyze(c.prices_data);
        auto end = std::chrono::high_resolution_clock::now();
        double ms = std::chrono::duration<double, std::milli>(end - start).count();
        c.bench_latencies.push_back(ms);
        benchmark::DoNotOptimize(signal);
    }
}
BENCHMARK(BM_MeanReversion);

static void BM_Momentum(benchmark::State& state) {
    auto& c = ctx();
    for (auto _ : state) {
        auto start = std::chrono::high_resolution_clock::now();
        auto signal = c.mom_algo.analyze(c.prices_data);
        auto end = std::chrono::high_resolution_clock::now();
        double ms = std::chrono::duration<double, std::milli>(end - start).count();
        c.bench_latencies.push_back(ms);
        benchmark::DoNotOptimize(signal);
    }
}
BENCHMARK(BM_Momentum);

static void export_metrics() {
    auto& c = ctx();
    auto state = c.model.get_state();
    auto mr_signal = c.mr_algo.analyze(c.prices_data);
    auto mom_signal = c.mom_algo.analyze(c.prices_data);

    std::sort(c.bench_latencies.begin(), c.bench_latencies.end());
    double mean = 0;
    for (double l : c.bench_latencies) mean += l;
    if (!c.bench_latencies.empty()) mean /= c.bench_latencies.size();

    auto pct = [&](double p) -> double {
        if (c.bench_latencies.empty()) return 0.0;
        size_t idx = static_cast<size_t>(c.bench_latencies.size() * p);
        if (idx >= c.bench_latencies.size()) idx = c.bench_latencies.size() - 1;
        return c.bench_latencies[idx];
    };

    json metrics;
    metrics["timestamp"] = std::time(nullptr);
    metrics["overall"] = {
        {"mean_ms", mean},
        {"p95_ms", pct(0.95)},
        {"p99_ms", pct(0.99)},
        {"is_regressed", false}
    };
    metrics["indicators"] = {
        {"current_price", state.current_price},
        {"sma_20", state.sma_20},
        {"rsi", state.rsi}
    };
    metrics["algos"] = {
        {"mean_reversion", {{"buy", mr_signal.buy}, {"confidence", mr_signal.confidence}}},
        {"momentum",       {{"buy", mom_signal.buy}, {"momentum", mom_signal.momentum}}}
    };

    std::ofstream file("metrics.json");
    file << metrics.dump(2);
}

static void export_benchmark_results() {
    auto& c = ctx();
    if (c.bench_latencies.empty()) return;

    std::sort(c.bench_latencies.begin(), c.bench_latencies.end());
    double mean = 0;
    for (double l : c.bench_latencies) mean += l;
    mean /= c.bench_latencies.size();

    auto pct = [&](double p) -> double {
        size_t idx = static_cast<size_t>(c.bench_latencies.size() * p);
        if (idx >= c.bench_latencies.size()) idx = c.bench_latencies.size() - 1;
        return c.bench_latencies[idx];
    };

    json benchmarks;
    benchmarks["timestamp"]  = std::time(nullptr);
    benchmarks["iterations"] = c.bench_latencies.size();
    benchmarks["mean_ms"]    = mean;
    benchmarks["min_ms"]     = c.bench_latencies.front();
    benchmarks["max_ms"]     = c.bench_latencies.back();
    benchmarks["p95_ms"]     = pct(0.95);
    benchmarks["p99_ms"]     = pct(0.99);

    std::ofstream file("benchmark.json");
    file << benchmarks.dump(2);
}

int main(int argc, char* argv[]) {
    const std::string card_name = argc > 1 ? argv[1] : "Charizard";
    ctx().prices_data = generate_prices(100, card_name);

    setup();
    ctx().bench_latencies.clear();

    ::benchmark::Initialize(&argc, argv);
    ::benchmark::RunSpecifiedBenchmarks();
    ::benchmark::Shutdown();

    export_metrics();
    export_benchmark_results();
    return 0;
}