#!/bin/bash
cd frontend
pnpm install
pnpm build
cd ../backend
pnpm install
mkdir -p build
cd build
cmake ..
cmake --build .
cd ..
pnpm start