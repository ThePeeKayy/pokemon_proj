cmake_minimum_required(VERSION 3.15)
project(pokemon-quant)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -flto -ffast-math -ffunction-sections -fdata-sections")
set(CMAKE_EXE_LINKER_FLAGS_RELEASE "-Wl,--gc-sections")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -mavx2 -mfma")

find_package(CURL REQUIRED)
find_package(Threads REQUIRED)

option(ENABLE_BENCHMARKS "Enable Google Benchmark" ON)

include(FetchContent)

FetchContent_Declare(json
    URL https://github.com/nlohmann/json/releases/download/v3.11.2/json.tar.xz
)
FetchContent_MakeAvailable(json)

if(ENABLE_BENCHMARKS)
    FetchContent_Declare(benchmark
        GIT_REPOSITORY https://github.com/google/benchmark.git
        GIT_TAG v1.8.3
    )
    set(BENCHMARK_ENABLE_TESTING OFF)
    set(BENCHMARK_ENABLE_GTEST_TESTS OFF)
    FetchContent_MakeAvailable(benchmark)
endif()

add_executable(pokemon-quant
    src/main.cpp
    src/statsmodel.cpp
    src/scraper.cpp
)

target_include_directories(pokemon-quant PRIVATE 
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(pokemon-quant PRIVATE 
    CURL::libcurl
    Threads::Threads
)

if(ENABLE_BENCHMARKS)
    add_executable(metrics-benchmark
        src/metrics_benchmark.cpp
        src/statsmodel.cpp
        src/scraper.cpp
    )

    target_include_directories(metrics-benchmark PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
    )

    target_link_libraries(metrics-benchmark PRIVATE
        CURL::libcurl
        Threads::Threads
        benchmark::benchmark
        nlohmann_json::nlohmann_json
    )
endif()

if(CMAKE_BUILD_TYPE STREQUAL "Release")
    add_custom_command(TARGET pokemon-quant POST_BUILD
        COMMAND ${CMAKE_STRIP} pokemon-quant
    )
endif()