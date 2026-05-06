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
    std::cerr << "[get_ebay_price] Starting scrape for: " << card_name << std::endl;
    std::cerr.flush();

    CURL* curl = curl_easy_init();
    if (!curl) {
        std::cerr << "[ERROR] Failed to init CURL - no network available" << std::endl;
        std::cerr.flush();
        return 0.0;
    }

    try {
        char* encoded = curl_easy_escape(curl, card_name.c_str(), card_name.length());
        std::string url = "https://www.ebay.com/sch/i.html?_nkw=" + std::string(encoded);
        curl_free(encoded);

        std::cerr << "[get_ebay_price] URL: " << url << std::endl;
        std::cerr.flush();

        std::string response;

        curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);
        curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L);
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
        curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
        curl_easy_setopt(curl, CURLOPT_USERAGENT, "Mozilla/5.0");

        CURLcode res = curl_easy_perform(curl);
        curl_easy_cleanup(curl);

        if (res != CURLE_OK) {
            std::cerr << "[ERROR] CURL failed: " << curl_easy_strerror(res) << std::endl;
            std::cerr << "[INFO] Will use fallback test data instead" << std::endl;
            std::cerr.flush();
            return 0.0;
        }

        if (response.empty()) {
            std::cerr << "[ERROR] Empty response from eBay" << std::endl;
            std::cerr << "[INFO] Will use fallback test data instead" << std::endl;
            std::cerr.flush();
            return 0.0;
        }

        std::cerr << "[get_ebay_price] Received " << response.length() << " bytes" << std::endl;
        std::cerr.flush();

        std::regex price_regex(R"(\$\s*([0-9,]+\.?[0-9]{0,2}))");

        std::vector<double> prices;
        auto begin = std::sregex_iterator(response.begin(), response.end(), price_regex);
        auto end = std::sregex_iterator();

        for (auto i = begin; i != end; ++i) {
            std::string price_str = (*i)[1];

            price_str.erase(
                std::remove(price_str.begin(), price_str.end(), ','),
                price_str.end()
            );

            try {
                double price = std::stod(price_str);

                if (price >= 100.0) {
                    prices.push_back(price);
                }
            } catch (...) {}
        }

        if (prices.empty()) {
            std::cerr << "[WARNING] No prices >= $100 found in eBay response" << std::endl;
            std::cerr << "[INFO] Will use fallback test data instead" << std::endl;
            std::cerr.flush();
            return 0.0;
        }

        double sum = 0.0;
        for (double p : prices)
            sum += p;

        double avg = sum / prices.size();

        std::cerr << "[SUCCESS] Average eBay price: $" << avg
                  << " from " << prices.size() << " listings" << std::endl;
        std::cerr.flush();

        return avg;

    } catch (const std::exception& e) {
        std::cerr << "[EXCEPTION in get_ebay_price] " << e.what() << std::endl;
        std::cerr << "[INFO] Will use fallback test data instead" << std::endl;
        std::cerr.flush();
        if (curl) curl_easy_cleanup(curl);
        return 0.0;
    } catch (...) {
        std::cerr << "[UNKNOWN EXCEPTION in get_ebay_price]" << std::endl;
        std::cerr << "[INFO] Will use fallback test data instead" << std::endl;
        std::cerr.flush();
        if (curl) curl_easy_cleanup(curl);
        return 0.0;
    }
}

double Scraper::get_best_price(const std::string& card_name) {
    std::cerr << "\n=== get_best_price: " << card_name << " ===" << std::endl;
    std::cerr.flush();
    return get_ebay_price(card_name);
}

} // namespace pokemon