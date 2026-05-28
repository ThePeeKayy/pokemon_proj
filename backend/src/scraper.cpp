#include "../include/scraper.h"
#include <iostream>
#include <thread>
#include <vector>
#include <algorithm>
#include <cmath>
#include <future>
#include <mutex>
#include <iomanip>
#include <array>
#include <optional>
#include <nlohmann/json.hpp>

#ifdef _WIN32
#include <winsock2.h>
#include <curl/curl.h>
#pragma comment(lib, "curl.lib")
#pragma comment(lib, "ws2_32.lib")
#else
#include <curl/curl.h>
#endif

namespace pokemon {

namespace {

class CurlPool {
public:
    static CurlPool& instance() {
        static CurlPool inst;
        return inst;
    }

    CURL* acquire() {
        std::lock_guard<std::mutex> lk(mu_);
        if (!pool_.empty()) {
            CURL* h = pool_.back();
            pool_.pop_back();
            return h;
        }
        return curl_easy_init();
    }

    void release(CURL* h) {
        if (!h) return;
        curl_easy_reset(h);
        std::lock_guard<std::mutex> lk(mu_);
        if (pool_.size() >= kPoolSize) {
            curl_easy_cleanup(h);
            return;
        }
        pool_.push_back(h);
    }

    ~CurlPool() {
        for (CURL* h : pool_) curl_easy_cleanup(h);
    }

private:
    static constexpr size_t kPoolSize = 8;
    std::mutex mu_;
    std::vector<CURL*> pool_;
};

size_t write_callback(void* contents, size_t size, size_t nmemb, std::string* s) {
    const size_t n = size * nmemb;
    s->append(static_cast<const char*>(contents), n);
    return n;
}

void collect_prices(const nlohmann::json& j, std::vector<double>& out) {
    static const std::array<const char*, 4> kKeys = {
        "price", "market", "lowestPrice", "value"
    };
    if (j.is_object()) {
        for (auto it = j.begin(); it != j.end(); ++it) {
            const std::string& k = it.key();
            bool match = false;
            for (const char* key : kKeys) {
                if (k == key) { match = true; break; }
            }
            if (match) {
                double v = 0.0;
                if (it.value().is_number()) {
                    v = it.value().get<double>();
                } else if (it.value().is_string()) {
                    try { v = std::stod(it.value().get<std::string>()); }
                    catch (...) { v = 0.0; }
                }
                if (v >= 5.0 && v <= 50000.0) out.push_back(v);
            }
            collect_prices(it.value(), out);
        }
    } else if (j.is_array()) {
        for (const auto& item : j) collect_prices(item, out);
    }
}

std::vector<double> extract_prices(const std::string& body) {
    std::vector<double> out;
    if (body.empty()) return out;
    try {
        auto j = nlohmann::json::parse(body, nullptr, /*allow_exceptions=*/false);
        if (j.is_discarded()) return out;
        out.reserve(30);
        collect_prices(j, out);
        if (out.size() > 30) out.resize(30);
    } catch (...) {
        // Malformed JSON; return empty.
    }
    return out;
}

struct PriceSink {
    static constexpr size_t kCap = 30;
    std::mutex mu;
    std::array<double, kCap> buf{};
    size_t n = 0;

    void push_many(const std::vector<double>& v) {
        std::lock_guard<std::mutex> lk(mu);
        for (double x : v) {
            if (n >= kCap) return;
            buf[n++] = x;
        }
    }
    size_t size() {
        std::lock_guard<std::mutex> lk(mu);
        return n;
    }
};

void fetch_async(const std::string& url, PriceSink* sink) {
    CURL* curl = CurlPool::instance().acquire();
    if (!curl) return;

    std::string response;
    response.reserve(8 * 1024);
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 5L);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 3L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_USERAGENT, "Mozilla/5.0");
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
    curl_easy_setopt(curl, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);

    if (curl_easy_perform(curl) == CURLE_OK && !response.empty()) {
        auto extracted = extract_prices(response);
        if (!extracted.empty()) {
            sink->push_many(extracted);
        }
    }
    CurlPool::instance().release(curl);
}

} // namespace

// Public API

std::optional<double> Scraper::get_best_price(const std::string& card_name) {
    PriceSink sink;

    const std::string url =
        "https://api.pokemontcg.io/v2/cards?q=name:" + card_name + "+set.id:base1&pageSize=250";

    fetch_async(url, &sink);

    const size_t n = sink.size();
    if (n == 0) return std::nullopt;

    if (n >= 5) {
        double sum = 0.0;
        for (size_t i = 0; i < n; ++i) sum += sink.buf[i];
        const double avg = sum / static_cast<double>(n);

        double var = 0.0;
        for (size_t i = 0; i < n; ++i) {
            const double d = sink.buf[i] - avg;
            var += d * d;
        }
        const double sd = std::sqrt(var / static_cast<double>(n));

        std::cerr << "[SCRAPER] Extracted " << n << " prices, avg: $"
                  << std::fixed << std::setprecision(2) << avg
                  << ", stddev: $" << sd << "\n";
        return avg;
    }

    return sink.buf[0];
}

std::optional<double> Scraper::get_ebay_price(const std::string& card_name) {
    return get_best_price(card_name);
}

std::optional<double> Scraper::get_ebay_price_with_retry(const std::string& card_name,
                                                        int max_attempts) {
    std::optional<double> last;
    for (int i = 0; i < std::max(1, max_attempts); ++i) {
        last = get_best_price(card_name);
        if (last.has_value()) return last;
    }
    return last;  // nullopt on total failure
}

} // namespace pokemon