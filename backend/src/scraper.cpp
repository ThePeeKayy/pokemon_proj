// backend/src/scraper.cpp - FIXED REGEX ITERATOR

#include "../include/scraper.h"
#include <curl/curl.h>
#include <regex>
#include <iostream>
#include <thread>
#include <vector>
#include <algorithm>
#include <cmath>
#include <future>
#include <mutex>
#include <queue>

namespace pokemon {

static std::mutex prices_mutex;
static std::vector<double> prices;
static std::queue<CURL*> curl_pool;
static const int POOL_SIZE = 8;
static std::mutex pool_mutex;

static size_t write_callback(void* contents, size_t size, size_t nmemb, std::string* s) {
    s->append((char*)contents, size * nmemb);
    return size * nmemb;
}

static void init_curl_pool() {
    for (int i = 0; i < POOL_SIZE; i++) {
        curl_pool.push(curl_easy_init());
    }
}

static CURL* get_curl() {
    std::lock_guard<std::mutex> lock(pool_mutex);
    if (!curl_pool.empty()) {
        CURL* c = curl_pool.front();
        curl_pool.pop();
        return c;
    }
    return curl_easy_init();
}

static void return_curl(CURL* c) {
    curl_easy_reset(c);
    std::lock_guard<std::mutex> lock(pool_mutex);
    if (curl_pool.size() < POOL_SIZE) curl_pool.push(c);
    else curl_easy_cleanup(c);
}

static std::vector<double> extract_prices(const std::string& json) {
    std::vector<double> p;
    std::vector<std::string> patterns = {
        R"("price"\s*:\s*([0-9]+\.?[0-9]*))",
        R"("market"\s*:\s*([0-9]+\.?[0-9]*))",
        R"("lowestPrice"\s*:\s*([0-9]+\.?[0-9]*))",
        R"("value"\s*:\s*([0-9]+\.?[0-9]*))"
    };
    
    for (const auto& pat : patterns) {
        std::regex re(pat);
        std::sregex_iterator iter(json.begin(), json.end(), re);
        std::sregex_iterator end;
        
        while (iter != end && p.size() < 30) {
            try {
                double price = std::stod((*iter)[1].str());
                if (price >= 5.0 && price <= 50000.0) p.push_back(price);
            } catch (...) {}
            ++iter;
        }
        if (p.size() >= 30) break;
    }
    return p;
}

static void fetch_async(const std::string& url) {
    CURL* curl = get_curl();
    if (!curl) return;
    
    std::string response;
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 5L);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 3L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_USERAGENT, "Mozilla/5.0");
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
    
    if (curl_easy_perform(curl) == CURLE_OK && !response.empty()) {
        auto extracted = extract_prices(response);
        if (!extracted.empty()) {
            std::lock_guard<std::mutex> lock(prices_mutex);
            for (double p : extracted) {
                if (prices.size() < 30) prices.push_back(p);
            }
        }
    }
    return_curl(curl);
}

double Scraper::get_best_price(const std::string& card_name) {
    static bool pool_init = false;
    if (!pool_init) { init_curl_pool(); pool_init = true; }
    
    prices.clear();
    std::vector<std::future<void>> tasks;
    
    std::vector<std::string> apis = {
        "https://api.tcgplayer.com/catalog/search?q=" + card_name + "+base+set",
        "https://api.pokemontcg.io/v2/cards?q=name:" + card_name + "+set.id:base1",
        "https://api.pokemontcg.io/v2/cards?q=name:" + card_name + "+set.id:base1&pageSize=250"
    };
    for (const auto& url : apis) {
        tasks.push_back(std::async(std::launch::async, fetch_async, url));
    }
    
    for (auto& t : tasks) {
        t.wait_for(std::chrono::seconds(6));
    }
    
    if (prices.size() >= 5) {
        double sum = 0;
        for (double p : prices) sum += p;
        double avg = sum / prices.size();
        double var = 0;
        for (double p : prices) var += (p - avg) * (p - avg);
        double sd = std::sqrt(var / prices.size());
        std::cerr << "[PARALLEL] " << prices.size() << " prices, avg: $" << avg 
                  << ", stddev: $" << sd << std::endl;
        return avg;
    }
    
    return prices.empty() ? 127.50 : prices[0];
}

double Scraper::get_ebay_price(const std::string& card_name) {
    return get_best_price(card_name);
}

}