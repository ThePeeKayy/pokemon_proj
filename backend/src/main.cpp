// backend/src/main.cpp - SIMPLE LOCAL VERSION

#include <iostream>
#include <sstream>
#include "../include/statsmodel.h"

int main() {
    // Create stats model
    pokemon::StatsModel model(50);
    
    // Add test prices (simulate data from frontend)
    std::vector<double> prices = {
        100.0, 101.5, 102.3, 101.8, 103.2, 
        104.1, 103.5, 105.0, 104.2, 106.0,
        105.5, 107.0, 106.5, 108.0, 107.2,
        109.0, 108.5, 110.0, 109.3, 111.0
    };
    
    for (double price : prices) {
        model.add_price(price);
    }
    
    // Get results
    auto state = model.get_state();
    
    // Output JSON (this is what Node.js will capture and send to frontend)
    std::cout << "{"
              << "\"price\":" << state.current_price << ","
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
    
    return 0;
}