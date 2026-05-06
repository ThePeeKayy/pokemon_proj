# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file LICENSE.rst or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION ${CMAKE_VERSION}) # this file comes with cmake

# If CMAKE_DISABLE_SOURCE_CHANGES is set to true and the source directory is an
# existing directory in our source tree, calling file(MAKE_DIRECTORY) on it
# would cause a fatal error, even though it would be a no-op.
if(NOT EXISTS "C:/Users/pengk/OneDrive/Desktop/pokemon_proj/backend/build/_deps/aws-lambda-cpp-src")
  file(MAKE_DIRECTORY "C:/Users/pengk/OneDrive/Desktop/pokemon_proj/backend/build/_deps/aws-lambda-cpp-src")
endif()
file(MAKE_DIRECTORY
  "C:/Users/pengk/OneDrive/Desktop/pokemon_proj/backend/build/_deps/aws-lambda-cpp-build"
  "C:/Users/pengk/OneDrive/Desktop/pokemon_proj/backend/build/_deps/aws-lambda-cpp-subbuild/aws-lambda-cpp-populate-prefix"
  "C:/Users/pengk/OneDrive/Desktop/pokemon_proj/backend/build/_deps/aws-lambda-cpp-subbuild/aws-lambda-cpp-populate-prefix/tmp"
  "C:/Users/pengk/OneDrive/Desktop/pokemon_proj/backend/build/_deps/aws-lambda-cpp-subbuild/aws-lambda-cpp-populate-prefix/src/aws-lambda-cpp-populate-stamp"
  "C:/Users/pengk/OneDrive/Desktop/pokemon_proj/backend/build/_deps/aws-lambda-cpp-subbuild/aws-lambda-cpp-populate-prefix/src"
  "C:/Users/pengk/OneDrive/Desktop/pokemon_proj/backend/build/_deps/aws-lambda-cpp-subbuild/aws-lambda-cpp-populate-prefix/src/aws-lambda-cpp-populate-stamp"
)

set(configSubDirs )
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "C:/Users/pengk/OneDrive/Desktop/pokemon_proj/backend/build/_deps/aws-lambda-cpp-subbuild/aws-lambda-cpp-populate-prefix/src/aws-lambda-cpp-populate-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "C:/Users/pengk/OneDrive/Desktop/pokemon_proj/backend/build/_deps/aws-lambda-cpp-subbuild/aws-lambda-cpp-populate-prefix/src/aws-lambda-cpp-populate-stamp${cfgdir}") # cfgdir has leading slash
endif()
