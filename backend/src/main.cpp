// backend/src/main.cpp - WITH DEBUGGING

#include <iostream>
#include <sstream>
#include <iomanip>
#include "../include/statsmodel.h"
#include "../include/scraper.h"

int main(int argc, char* argv[]) {
    std::cerr.flush();
    std::cout.flush();
    
    // FIRST: Check if we're even here
    std::cerr << "[DEBUG] main() started" << std::endl;
    std::cerr.flush();
    
    try {
        // Get card name from command line argument
        std::string card_name = "Charizard";
        if (argc > 1) {
            card_name = argv[1];
        }
        
        std::cerr << "[DEBUG] Card name: " << card_name << std::endl;
        std::cerr.flush();
        
        // Create stats model
        std::cerr << "[DEBUG] Creating StatsModel..." << std::endl;
        std::cerr.flush();
        
        pokemon::StatsModel model(50);
        
        std::cerr << "[DEBUG] StatsModel created successfully" << std::endl;
        std::cerr.flush();
        
        // Fetch real prices from web
        std::cerr << "[DEBUG] Calling Scraper::get_best_price()..." << std::endl;
        std::cerr.flush();
        
        double price = pokemon::Scraper::get_best_price(card_name);
        
        std::cerr << "[DEBUG] Scraper returned: " << price << std::endl;
        std::cerr.flush();
        
        if (price <= 0) {
            // If scraper fails, use test data
            std::cerr << "[DEBUG] Using fallback test data" << std::endl;
            std::cerr.flush();
            
            std::vector<double> prices = {
                100.0, 101.5, 102.3, 101.8, 103.2, 
                104.1, 103.5, 105.0, 104.2, 106.0,
                105.5, 107.0, 106.5, 108.0, 107.2,
                109.0, 108.5, 110.0, 109.3, 111.0
            };
            
            std::cerr << "[DEBUG] Adding " << prices.size() << " prices to model" << std::endl;
            std::cerr.flush();
            
            for (double p : prices) {
                model.add_price(p);
            }
            
            std::cerr << "[DEBUG] Added all prices" << std::endl;
            std::cerr.flush();
        } else {
            // Use real price
            std::cerr << "[DEBUG] Using real price: $" << price << std::endl;
            std::cerr.flush();
            
            // Simulate historical data
            for (int i = 0; i < 20; i++) {
                double variation = price * (0.98 + (i * 0.001));
                model.add_price(variation);
            }
            model.add_price(price);
        }
        
        std::cerr << "[DEBUG] Getting market state..." << std::endl;
        std::cerr.flush();
        
        auto state = model.get_state();
        
        std::cerr << "[DEBUG] Market state retrieved" << std::endl;
        std::cerr << "[DEBUG] Current price: " << state.current_price << std::endl;
        std::cerr << "[DEBUG] RSI: " << state.rsi << std::endl;
        std::cerr.flush();
        
        // Output JSON to stdout
        std::cerr << "[DEBUG] Building JSON output..." << std::endl;
        std::cerr.flush();
        
        std::cout << "{"
                  << "\"card\":\"" << card_name << "\","
                  << "\"price\":" << std::fixed << std::setprecision(2) << state.current_price << ","
                  << "\"rsi\":" << state.rsi << ","
                  << "\"sma20\":" << state.sma_20 << ","
                  << "\"volatility\":" << state.volatility << ","
                  << "\"bbands_upper\":" << state.bbands_upper << ","
                  << "\"bbands_lower\":" << state.bbands_lower << ","
                  << "\"macd\":" << state.macd << ","
                  << "\"signal_line\":" << state.signal_line << ","
                  << "\"buy_signal\":" << (state.buy_signal ? "true" : "false") << ","
                  << "\"sell_signal\":" << (state.sell_signal ? "true" : "false")
                  << "}" << std::endl;
        
        std::cout.flush();
        std::cerr << "[DEBUG] JSON output written" << std::endl;
        std::cerr.flush();
        
        std::cerr << "[DEBUG] SUCCESS - exiting with code 0" << std::endl;
        std::cerr.flush();
        
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "[EXCEPTION] " << e.what() << std::endl;
        std::cerr.flush();
        return 1;
    } catch (...) {
        std::cerr << "[EXCEPTION] Unknown exception" << std::endl;
        std::cerr.flush();
        return 1;
    }
}