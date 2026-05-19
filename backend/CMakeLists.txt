cmake_minimum_required(VERSION 3.5)
project(pokemon-quant)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)


find_package(CURL REQUIRED)
find_package(Threads REQUIRED)

FetchContent_Declare(json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

option(ENABLE_BENCHMARKS "Enable Google Benchmark" ON)
option(ENABLE_TESTS      "Enable correctness tests" ON)

if(ENABLE_BENCHMARKS)
    FetchContent_Declare(benchmark
        GIT_REPOSITORY https://github.com/google/benchmark.git
        GIT_TAG v1.8.3
    )
    set(BENCHMARK_ENABLE_TESTING OFF)
    set(BENCHMARK_ENABLE_GTEST_TESTS OFF)
    FetchContent_MakeAvailable(benchmark)
endif()

string(APPEND CMAKE_CXX_FLAGS_RELEASE " -ffunction-sections -fdata-sections")

option(ENABLE_AVX2 "Enable AVX2/FMA instructions" OFF)
if(ENABLE_AVX2)
    target_compile_options(core PRIVATE -mavx2 -mfma)
endif()
set(CMAKE_EXE_LINKER_FLAGS_RELEASE
    "-Wl,--gc-sections"
)

set(CMAKE_CXX_FLAGS_TSAN
    "-fsanitize=thread -O1 -g -fno-omit-frame-pointer -fPIE"
)
set(CMAKE_EXE_LINKER_FLAGS_TSAN
    "-fsanitize=thread -pie"
)


add_library(core
    src/statsmodel.cpp
    src/scraper.cpp
)

target_include_directories(core PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(core PUBLIC
    CURL::libcurl
    Threads::Threads
    nlohmann_json::nlohmann_json
)


add_executable(pokemon-quant
    src/main.cpp
)

target_link_libraries(pokemon-quant PRIVATE core)


if(ENABLE_BENCHMARKS)
    add_executable(metrics-benchmark
        src/metrics_benchmark.cpp
    )

    target_link_libraries(metrics-benchmark PRIVATE
        core
        benchmark::benchmark
    )
endif()

add_executable(bench-pool-comparison
    bench/bench_pool_comparison.cpp
)

target_link_libraries(bench-pool-comparison PRIVATE Threads::Threads)


if(ENABLE_TESTS)
    add_executable(test-metrics-concurrent
        tests/test_metrics_concurrent.cpp
    )

    target_link_libraries(test-metrics-concurrent PRIVATE
        core
        Threads::Threads
    )
endif()


if(CMAKE_BUILD_TYPE STREQUAL "Release")
    add_custom_command(TARGET pokemon-quant POST_BUILD
        COMMAND ${CMAKE_STRIP} pokemon-quant
    )
endif()