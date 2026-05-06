#pragma once

#include <string>
#include <vector>

namespace pokemon {

struct Listing {
    std::string title;
    double price;
    std::string source;
};

class Scraper {
public:
    // Get current cheapest price from eBay
    static double get_ebay_price(const std::string& card_name);
    
    // Get from TCG Player API
    static double get_tcg_price(const std::string& card_name);
    
    // Get best price from all sources
    static double get_best_price(const std::string& card_name);
};

} 