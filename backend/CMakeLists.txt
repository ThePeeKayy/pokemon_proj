cmake_minimum_required(VERSION 3.15)
project(pokemon-quant)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -flto -ffast-math")

find_package(CURL REQUIRED)
find_package(Threads REQUIRED)

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