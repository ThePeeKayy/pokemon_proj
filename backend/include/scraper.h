#pragma once
#include <string>
#include <vector>
#include <optional>  

namespace pokemon {

struct Listing {
    std::string title;
    double price;
    std::string source;
};

class Scraper {
public:
    static std::optional<double> get_ebay_price_with_retry(const std::string& card_name, int max_attempts = 3);
    static std::optional<double> get_ebay_price(const std::string& card_name);
    static std::optional<double> get_best_price(const std::string& card_name);
};

} // namespace pokemon