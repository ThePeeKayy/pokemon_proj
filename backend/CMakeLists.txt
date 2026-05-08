cmake_minimum_required(VERSION 3.15)
project(pokemon-quant)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Aggressive optimization flags
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -flto -ffast-math -ffunction-sections -fdata-sections")
set(CMAKE_EXE_LINKER_FLAGS_RELEASE "-Wl,--gc-sections")

# Enable SIMD
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -mavx2 -mfma")

find_package(CURL REQUIRED)
find_package(Threads REQUIRED)

# Main executable
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


# Metrics exporter executable
add_executable(metrics-exporter
    src/metrics_exporter.cpp
    src/statsmodel.cpp
    src/scraper.cpp
)

target_include_directories(metrics-exporter PRIVATE 
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(metrics-exporter PRIVATE 
    CURL::libcurl
    Threads::Threads
)

# Strip symbols in release
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    add_custom_command(TARGET pokemon-quant POST_BUILD
        COMMAND ${CMAKE_STRIP} pokemon-quant
    )
endif()