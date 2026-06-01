#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <thread>
#include <vector>

namespace {

// ----- Workload simulators -------------------------------------------------

inline void fast_work() noexcept {
    volatile uint64_t x = 0;
    for (int i = 0; i < 32; ++i) x += i * 1315423911u;
    (void)x;
}

inline void slow_work() noexcept {
    const auto end = std::chrono::steady_clock::now()
                   + std::chrono::microseconds(2000);
    volatile uint64_t x = 0;
    while (std::chrono::steady_clock::now() < end) {
        for (int i = 0; i < 128; ++i) x += i * 2654435761u;
    }
    (void)x;
}

// Mutex pool

struct MutexPool {
    std::mutex mu;
    std::vector<int> items;

    explicit MutexPool(size_t n) {
        items.reserve(n);
        for (size_t i = 0; i < n; ++i) items.push_back(static_cast<int>(i));
    }

    int acquire() {
        std::lock_guard<std::mutex> lk(mu);
        if (items.empty()) return -1;
        int v = items.back();
        items.pop_back();
        return v;
    }
    void release(int v) {
        std::lock_guard<std::mutex> lk(mu);
        items.push_back(v);
    }
};

// Lock-free Treiber-stack pool

struct LockFreeNode {
    int value;
    LockFreeNode* next;
};

struct LockFreePool {
    alignas(64) std::atomic<LockFreeNode*> head{nullptr};
    std::vector<LockFreeNode> storage;  

    explicit LockFreePool(size_t n) : storage(n) {
        for (size_t i = 0; i < n; ++i) {
            storage[i].value = static_cast<int>(i);
            LockFreeNode* h = head.load(std::memory_order_relaxed);
            do { storage[i].next = h; }
            while (!head.compare_exchange_weak(h, &storage[i],
                       std::memory_order_release, std::memory_order_relaxed));
        }
    }

    int acquire() {
        LockFreeNode* h = head.load(std::memory_order_acquire);
        while (h) {
            LockFreeNode* nxt = h->next;
            if (head.compare_exchange_weak(h, nxt,
                    std::memory_order_acq_rel,
                    std::memory_order_acquire)) {
                return h->value;
            }
        }
        return -1;
    }

    void release(int v) {
        LockFreeNode* n = &storage[v];
        LockFreeNode* h = head.load(std::memory_order_relaxed);
        do { n->next = h; }
        while (!head.compare_exchange_weak(h, n,
                   std::memory_order_release, std::memory_order_relaxed));
    }
};

// Benchmark driver

template <typename Pool, typename Work>
double run(Pool& pool, size_t num_threads, size_t iters_per_thread, Work work) {
    std::atomic<bool> go{false};
    auto fn = [&]() {
        while (!go.load(std::memory_order_acquire)) {}
        for (size_t i = 0; i < iters_per_thread; ++i) {
            int v = pool.acquire();
            if (v < 0) continue;
            work();
            pool.release(v);
        }
    };
    std::vector<std::thread> ts;
    ts.reserve(num_threads);
    for (size_t i = 0; i < num_threads; ++i) ts.emplace_back(fn);

    const auto t0 = std::chrono::steady_clock::now();
    go.store(true, std::memory_order_release);
    for (auto& t : ts) t.join();
    const auto t1 = std::chrono::steady_clock::now();
    const double total_ns = std::chrono::duration<double, std::nano>(t1 - t0).count();
    const double total_ops = static_cast<double>(num_threads) * iters_per_thread;
    return total_ns / total_ops;  // ns per op
}

struct Row {
    size_t threads;
    const char* workload;
    double mutex_ns;
    double lockfree_ns;
};

} // namespace

int main(int argc, char** argv) {
    size_t scale = 1;
    if (argc > 1) scale = std::max<size_t>(1, std::strtoul(argv[1], nullptr, 10));

    const size_t pool_size = 8;
    const size_t thread_counts[] = {1, 4, 8, 16};
    const size_t fast_iters = 200000 * scale;
    const size_t slow_iters = 200 * scale; 

    std::vector<Row> rows;
    rows.reserve(8);

    for (size_t nt : thread_counts) {
        {
            MutexPool m(pool_size);
            LockFreePool lf(pool_size);
            double mu_ns = run(m,  nt, fast_iters, fast_work);
            double lf_ns = run(lf, nt, fast_iters, fast_work);
            rows.push_back({nt, "fast", mu_ns, lf_ns});
        }
        {
            MutexPool m(pool_size);
            LockFreePool lf(pool_size);
            double mu_ns = run(m,  nt, slow_iters, slow_work);
            double lf_ns = run(lf, nt, slow_iters, slow_work);
            rows.push_back({nt, "slow", mu_ns, lf_ns});
        }
    }

    std::printf("{\n");
    std::printf("  \"pool_size\": %zu,\n", pool_size);
    std::printf("  \"timestamp\": %lld,\n",
        static_cast<long long>(std::chrono::system_clock::to_time_t(
            std::chrono::system_clock::now())));
    std::printf("  \"rows\": [\n");
    for (size_t i = 0; i < rows.size(); ++i) {
        const auto& r = rows[i];
        const double speedup = r.mutex_ns / r.lockfree_ns;
        std::printf("    {\"threads\": %zu, \"workload\": \"%s\", "
                    "\"mutex_ns\": %.2f, \"lockfree_ns\": %.2f, "
                    "\"speedup\": %.3f}%s\n",
            r.threads, r.workload, r.mutex_ns, r.lockfree_ns, speedup,
            (i + 1 == rows.size()) ? "" : ",");
    }
    std::printf("  ]\n");
    std::printf("}\n");
    return 0;
}