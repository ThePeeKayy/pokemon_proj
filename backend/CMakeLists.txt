# backend/CMakeLists.txt - SIMPLE LOCAL VERSION (NO AWS)

cmake_minimum_required(VERSION 3.20)
project(pokemon-quant)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUST compile the C++ code - no external dependencies needed
add_executable(pokemon-quant
    src/main.cpp
    src/StatsModel.cpp
)

# That's it! No find_package, no CURL, no AWS Lambda
# All dependencies handled by Node.js server