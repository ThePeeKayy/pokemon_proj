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
    static double get_ebay_price_with_retry(const std::string& card_name, int max_attempts = 3);
    static double get_ebay_price(const std::string& card_name);
    static double get_best_price(const std::string& card_name);
};

} // namespace pokemon