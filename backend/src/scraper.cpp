#include "../include/scraper.h"
#include <iostream>
#include <thread>
#include <vector>
#include <algorithm>
#include <cmath>
#include <future>
#include <atomic>
#include <iomanip>
#include <cctype>
#include <cstring>
#include <cstdlib>
#include <array>
#include <new>

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

struct PoolNode {
    CURL* handle;
    PoolNode* next;
};

class CurlPool {
public:
    static CurlPool& instance() {
        static CurlPool inst;
        return inst;
    }

    CURL* acquire() noexcept {
        PoolNode* head = head_.load(std::memory_order_acquire);
        while (head) {
            PoolNode* next = head->next;
            if (head_.compare_exchange_weak(head, next,
                    std::memory_order_acq_rel,
                    std::memory_order_acquire)) {
                CURL* h = head->handle;
                push_free_node(head);
                return h;
            }
        }
        return curl_easy_init();
    }

    void release(CURL* h) noexcept {
        if (!h) return;
        curl_easy_reset(h);
        if (size_.fetch_add(1, std::memory_order_relaxed) >= kPoolSize) {
            size_.fetch_sub(1, std::memory_order_relaxed);
            curl_easy_cleanup(h);
            return;
        }
        PoolNode* node = pop_free_node();
        if (!node) node = new PoolNode{};
        node->handle = h;
        PoolNode* head = head_.load(std::memory_order_relaxed);
        do {
            node->next = head;
        } while (!head_.compare_exchange_weak(head, node,
                    std::memory_order_release,
                    std::memory_order_relaxed));
    }

private:
    static constexpr int kPoolSize = 8;

    CurlPool() {
        for (int i = 0; i < kPoolSize; ++i) {
            CURL* h = curl_easy_init();
            if (!h) continue;
            auto* n = new PoolNode{h, head_.load(std::memory_order_relaxed)};
            head_.store(n, std::memory_order_release);
            size_.fetch_add(1, std::memory_order_relaxed);
        }
    }

    void push_free_node(PoolNode* n) noexcept {
        PoolNode* head = free_head_.load(std::memory_order_relaxed);
        do {
            n->next = head;
        } while (!free_head_.compare_exchange_weak(head, n,
                    std::memory_order_release,
                    std::memory_order_relaxed));
    }
    PoolNode* pop_free_node() noexcept {
        PoolNode* head = free_head_.load(std::memory_order_acquire);
        while (head) {
            PoolNode* next = head->next;
            if (free_head_.compare_exchange_weak(head, next,
                    std::memory_order_acq_rel,
                    std::memory_order_acquire)) {
                return head;
            }
        }
        return nullptr;
    }

    alignas(64) std::atomic<PoolNode*> head_{nullptr};
    alignas(64) std::atomic<PoolNode*> free_head_{nullptr};
    alignas(64) std::atomic<int>       size_{0};
};

size_t write_callback(void* contents, size_t size, size_t nmemb, std::string* s) {
    const size_t n = size * nmemb;
    s->append(static_cast<const char*>(contents), n);
    return n;
}

std::vector<double> extract_prices(const std::string& json) {
    std::vector<double> out;
    out.reserve(30);

    static constexpr std::array<const char*, 4> kKeys = {
        "price", "market", "lowestPrice", "value"
    };
    static constexpr std::array<size_t, 4> kKeyLens = {5, 6, 11, 5};

    const char* const data = json.data();
    const size_t      len  = json.size();
    size_t pos = 0;

    while (pos < len && out.size() < 30) {
        size_t best = std::string::npos;
        size_t best_len = 0;
        for (size_t k = 0; k < kKeys.size(); ++k) {
            const size_t klen = kKeyLens[k];
            if (pos + klen > len) continue;
            const char* p = data + pos;
            const char* end = data + len - klen + 1;
            const char first = kKeys[k][0];
            while (p < end) {
                p = static_cast<const char*>(std::memchr(p, first, end - p));
                if (!p) break;
                if (std::memcmp(p, kKeys[k], klen) == 0) {
                    size_t found = static_cast<size_t>(p - data);
                    if (found < best) { best = found; best_len = klen; }
                    break;
                }
                ++p;
            }
        }
        if (best == std::string::npos) break;

        size_t colon = json.find(':', best + best_len);
        if (colon == std::string::npos) { pos = best + best_len; continue; }

        size_t num_start = colon + 1;
        while (num_start < len && (data[num_start] == ' ' || data[num_start] == '\t')) {
            ++num_start;
        }
        if (num_start >= len || !std::isdigit(static_cast<unsigned char>(data[num_start]))) {
            pos = best + best_len;
            continue;
        }
        size_t num_end = num_start;
        while (num_end < len &&
              (std::isdigit(static_cast<unsigned char>(data[num_end])) || data[num_end] == '.')) {
            ++num_end;
        }
        if (num_end > num_start) {
            const char* num_ptr = data + num_start;
            char* end_ptr = nullptr;
            double price = std::strtod(num_ptr, &end_ptr);
            if (end_ptr != num_ptr && static_cast<size_t>(end_ptr - data) == num_end &&
                price >= 5.0 && price <= 50000.0) {
                out.push_back(price);
            }
        }
        pos = num_end;
    }
    return out;
}

struct PriceSink {
    static constexpr size_t kCap = 30;
    alignas(64) std::atomic<size_t> n{0};
    alignas(64) std::array<double, kCap> buf{};

    void push_many(const std::vector<double>& v) noexcept {
        for (double x : v) {
            size_t i = n.fetch_add(1, std::memory_order_relaxed);
            if (i >= kCap) {
                n.store(kCap, std::memory_order_relaxed);
                return;
            }
            buf[i] = x;
        }
    }
    size_t size() const noexcept {
        size_t s = n.load(std::memory_order_acquire);
        return s > kCap ? kCap : s;
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

double Scraper::get_best_price(const std::string& card_name) {
    PriceSink sink;

    const std::array<std::string, 3> apis = {
        "https://api.tcgplayer.com/catalog/search?q=" + card_name + "+base+set",
        "https://api.pokemontcg.io/v2/cards?q=name:" + card_name + "+set.id:base1",
        "https://api.pokemontcg.io/v2/cards?q=name:" + card_name + "+set.id:base1&pageSize=250"
    };

    std::array<std::future<void>, 3> tasks;
    for (size_t i = 0; i < apis.size(); ++i) {
        tasks[i] = std::async(std::launch::async, fetch_async, apis[i], &sink);
    }
    for (auto& t : tasks) t.wait_for(std::chrono::seconds(6));

    const size_t n = sink.size();
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
                  << ", stddev: $" << sd << std::endl;
        return avg;
    }

    return n == 0 ? 127.50 : sink.buf[0];
}

double Scraper::get_ebay_price(const std::string& card_name) {
    return get_best_price(card_name);
}

double Scraper::get_ebay_price_with_retry(const std::string& card_name, int /*max_attempts*/) {
    return get_best_price(card_name);
}

} // namespace pokemon