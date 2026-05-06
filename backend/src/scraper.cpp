#include "../include/scraper.h"
#include <curl/curl.h>
#include <regex>
#include <iostream>

namespace pokemon {

static size_t write_callback(void* contents, size_t size, size_t nmemb, std::string* userp) {
    userp->append((char*)contents, size * nmemb);
    return size * nmemb;
}

double Scraper::get_ebay_price(const std::string& card_name) {
    CURL* curl = curl_easy_init();
    if (!curl) return 0.0;
    
    char* encoded = curl_easy_escape(curl, card_name.c_str(), card_name.length());
    std::string url = "https://api.ebay.com/buy/browse/v1/item_summary/search?q=" + std::string(encoded);
    curl_free(encoded);
    
    std::string response;
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 5L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
    
    CURLcode res = curl_easy_perform(curl);
    curl_easy_cleanup(curl);
    
    if (res == CURLE_OK && !response.empty()) {
        // Parse JSON for price - look for "price" field
        std::regex price_regex(R"("price"\s*:\s*"?\$?(\d+\.?\d*))");
        std::smatch match;
        
        if (std::regex_search(response, match, price_regex)) {
            try {
                return std::stod(match[1]);
            } catch (...) {
                return 0.0;
            }
        }
    }
    
    return 0.0;
}

double Scraper::get_tcg_price(const std::string& card_name) {
    CURL* curl = curl_easy_init();
    if (!curl) return 0.0;
    
    char* encoded = curl_easy_escape(curl, card_name.c_str(), card_name.length());
    std::string url = "https://api.tcgplayer.com/pricing/product/" + std::string(encoded);
    curl_free(encoded);
    
    std::string response;
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 5L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    
    CURLcode res = curl_easy_perform(curl);
    curl_easy_cleanup(curl);
    
    if (res == CURLE_OK && !response.empty()) {
        std::regex price_regex(R"("mid"\s*:\s*(\d+\.?\d*))");
        std::smatch match;
        
        if (std::regex_search(response, match, price_regex)) {
            try {
                return std::stod(match[1]);
            } catch (...) {
                return 0.0;
            }
        }
    }
    
    return 0.0;
}

double Scraper::get_best_price(const std::string& card_name) {
    double ebay = get_ebay_price(card_name);
    double tcg = get_tcg_price(card_name);
    
    if (ebay == 0.0) return tcg;
    if (tcg == 0.0) return ebay;
    return std::min(ebay, tcg);
}

} // namespace pokemon