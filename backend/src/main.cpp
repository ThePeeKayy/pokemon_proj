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
        const auto price_opt = pokemon::Scraper::get_best_price(card);

        if (!price_opt.has_value()) {
            static constexpr double p[] =
                {100, 101.5, 102.3, 101.8, 103.2, 104.1, 103.5, 105.0, 104.2, 106.0};
            for (double x : p) model.add_price(x);
        } else {
            const double price = *price_opt;
            for (int i = 0; i < 20; ++i) {
                model.add_price(price * (0.98 + i * 0.001));
            }
            model.add_price(price);
        }
        return 0;
    } catch (...) {
        std::cerr << "[ERROR]" << std::endl;
        return 1;
    }
}