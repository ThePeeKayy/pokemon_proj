#include <benchmark/benchmark.h>
#include <vector>
#include <random>
#include <fstream>
#include <chrono>
#include <algorithm>
#include <ctime>
#include <nlohmann/json.hpp>
#include "../include/statsmodel.h"
#include "../include/scraper.h"

using json = nlohmann::json;

// Global variables declared at the top (before functions that use them)
std::vector<double> prices_data;
pokemon::StatsModel model(50);
pokemon::MeanReversionAlgo mr_algo;
pokemon::MomentumAlgo mom_algo;
std::vector<double> bench_latencies;

std::vector<double> generate_prices(int count, const std::string& card_name) {
    std::vector<double> prices;
    double base = pokemon::Scraper::get_best_price(card_name);
    if (base <= 0) base = 100.0;
    
    std::mt19937 rng(std::random_device{}());
    std::normal_distribution<double> dist(0.0, 0.5);
    
    double price = base;
    for (int i = 0; i < count; i++) {
        price *= (1.0 + dist(rng) / 100.0);
        prices.push_back(price);
    }
    return prices;
}

void setup() {
    for (double p : prices_data) {
        model.add_price(p);
    }
}

static void BM_TechnicalIndicators(benchmark::State& state) {
    for (auto _ : state) {
        auto start = std::chrono::high_resolution_clock::now();
        auto result = model.get_state();
        auto end = std::chrono::high_resolution_clock::now();
        double ms = std::chrono::duration<double, std::milli>(end - start).count();
        bench_latencies.push_back(ms);
        benchmark::DoNotOptimize(result);
    }
}
BENCHMARK(BM_TechnicalIndicators);

static void BM_MeanReversion(benchmark::State& state) {
    for (auto _ : state) {
        auto start = std::chrono::high_resolution_clock::now();
        auto signal = mr_algo.analyze(prices_data);
        auto end = std::chrono::high_resolution_clock::now();
        double ms = std::chrono::duration<double, std::milli>(end - start).count();
        bench_latencies.push_back(ms);
        benchmark::DoNotOptimize(signal);
    }
}
BENCHMARK(BM_MeanReversion);

static void BM_Momentum(benchmark::State& state) {
    for (auto _ : state) {
        auto start = std::chrono::high_resolution_clock::now();
        auto signal = mom_algo.analyze(prices_data);
        auto end = std::chrono::high_resolution_clock::now();
        double ms = std::chrono::duration<double, std::milli>(end - start).count();
        bench_latencies.push_back(ms);
        benchmark::DoNotOptimize(signal);
    }
}
BENCHMARK(BM_Momentum);

void export_metrics() {
    auto state = model.get_state();
    auto mr_signal = mr_algo.analyze(prices_data);
    auto mom_signal = mom_algo.analyze(prices_data);
    
    std::sort(bench_latencies.begin(), bench_latencies.end());
    double mean = 0;
    for (double l : bench_latencies) mean += l;
    mean /= bench_latencies.size();
    
    json metrics;
    metrics["timestamp"] = std::time(nullptr);
    metrics["overall"] = {
        {"mean_ms", mean},
        {"p95_ms", bench_latencies[(int)(bench_latencies.size() * 0.95)]},
        {"p99_ms", bench_latencies[(int)(bench_latencies.size() * 0.99)]},
        {"is_regressed", false}
    };
    metrics["indicators"] = {
        {"current_price", state.current_price},
        {"sma_20", state.sma_20},
        {"rsi", state.rsi}
    };
    metrics["algos"] = {
        {"mean_reversion", {{"buy", mr_signal.buy}, {"confidence", mr_signal.confidence}}},
        {"momentum", {{"buy", mom_signal.buy}, {"momentum", mom_signal.momentum}}}
    };
    
    std::ofstream file("metrics.json");
    file << metrics.dump(2);
    file.close();
}

void export_benchmark_results() {
    if (bench_latencies.empty()) return;
    
    std::sort(bench_latencies.begin(), bench_latencies.end());
    double mean = 0;
    for (double l : bench_latencies) mean += l;
    mean /= bench_latencies.size();
    
    json benchmarks;
    benchmarks["timestamp"] = std::time(nullptr);
    benchmarks["iterations"] = bench_latencies.size();
    benchmarks["mean_ms"] = mean;
    benchmarks["min_ms"] = bench_latencies.front();
    benchmarks["max_ms"] = bench_latencies.back();
    benchmarks["p95_ms"] = bench_latencies[(int)(bench_latencies.size() * 0.95)];
    benchmarks["p99_ms"] = bench_latencies[(int)(bench_latencies.size() * 0.99)];
    
    std::ofstream file("benchmark.json");
    file << benchmarks.dump(2);
    file.close();
}

int main(int argc, char* argv[]) {
    std::string card_name = argc > 1 ? argv[1] : "Charizard";
    prices_data = generate_prices(100, card_name);
    
    setup();
    bench_latencies.clear();
    
    ::benchmark::Initialize(&argc, argv);
    ::benchmark::RunSpecifiedBenchmarks();
    ::benchmark::Shutdown();
    
    export_metrics();
    export_benchmark_results();
    
    return 0;
}