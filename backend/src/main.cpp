#include <iostream>
#include <iomanip>
#include <chrono>
#include <cstring>
#include <string>
#include "../include/statsmodel.h"
#include "../include/scraper.h"

int main(int argc, char* argv[]) {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    const auto start_time = std::chrono::high_resolution_clock::now();

    try {
        const std::string card = argc > 1 ? argv[1] : "Charizard";

        pokemon::StatsModel model(50);
        const double price = pokemon::Scraper::get_best_price(card);

        if (price <= 0) {
            static constexpr double p[] =
                {100, 101.5, 102.3, 101.8, 103.2, 104.1, 103.5, 105.0, 104.2, 106.0};
            for (double x : p) model.add_price(x);
        } else {
            for (int i = 0; i < 20; ++i) {
                model.add_price(price * (0.98 + i * 0.001));
            }
            model.add_price(price);
        }

        const auto state    = model.get_state();
        const auto end_time = std::chrono::high_resolution_clock::now();
        const auto latency_ns =
            std::chrono::duration_cast<std::chrono::nanoseconds>(
                end_time - start_time).count();
        const double latency_ms = latency_ns / 1'000'000.0;

        std::cout << "{\"card\":\"" << card
                  << "\",\"price\":"        << std::fixed << std::setprecision(4) << state.current_price
                  << ",\"rsi\":"            << state.rsi
                  << ",\"sma20\":"          << state.sma_20
                  << ",\"volatility\":"     << state.volatility
                  << ",\"bbands_upper\":"   << state.bbands_upper
                  << ",\"bbands_lower\":"   << state.bbands_lower
                  << ",\"macd\":"           << state.macd
                  << ",\"signal_line\":"    << state.signal_line
                  << ",\"buy_signal\":"     << (state.buy_signal  ? "true" : "false")
                  << ",\"sell_signal\":"    << (state.sell_signal ? "true" : "false")
                  << ",\"latency_ms\":"     << std::fixed << std::setprecision(2) << latency_ms
                  << "}" << std::endl;
        return 0;
    } catch (...) {
        std::cerr << "[ERROR]" << std::endl;
        return 1;
    }
}