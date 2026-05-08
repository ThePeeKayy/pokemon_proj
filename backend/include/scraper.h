// backend/include/scraper.h

#pragma once

#include <string>
#include <vector>
#include <iomanip>

namespace pokemon {

struct Listing {
    std::string title;
    double price;
    std::string source;
};

class Scraper {
public:
    // Get price with retry logic and delays
    static double get_ebay_price_with_retry(const std::string& card_name, int max_attempts = 3);
    
    // Get current cheapest price from eBay (uses retry internally)
    static double get_ebay_price(const std::string& card_name);
    
    // Get best price from all sources (Boost.Regex optimized)
    static double get_best_price(const std::string& card_name);
    
};

} // namespace pokemon