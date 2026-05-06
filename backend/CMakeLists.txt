# backend/CMakeLists.txt - SIMPLIFIED (Skip the exists() check)

cmake_minimum_required(VERSION 3.20)
project(pokemon-quant)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

message(STATUS "🔨 Building Pokemon Quant")
message(STATUS "")

# Just assume mingw64 is there - don't check with EXISTS()
set(CURL_INCLUDE_DIR "/mingw64/include")
set(CURL_LIB_DIR "/mingw64/lib")

message(STATUS "Using CURL from: /mingw64")
message(STATUS "")

# Build executable
add_executable(pokemon-quant
    src/main.cpp
    src/statsmodel.cpp
    src/scraper.cpp
)

# Include directories
target_include_directories(pokemon-quant PRIVATE 
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CURL_INCLUDE_DIR}
)

# Link directories
target_link_directories(pokemon-quant PRIVATE ${CURL_LIB_DIR})

# Link libraries
target_link_libraries(pokemon-quant PRIVATE curl)

message(STATUS "✅ Build configured successfully!")
message(STATUS "")