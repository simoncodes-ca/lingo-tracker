#!/bin/bash

# Detailed test runner with debugging
cd /Users/simon/git/lingo-tracker

echo "========================================="
echo "Running Tracker Tests with Full Output"
echo "========================================="
echo ""

# Run tests with verbose output
NODE_OPTIONS="--max-old-space-size=4096" pnpm nx test tracker --run --reporter=verbose 2>&1 | tee /tmp/tracker-test-full.txt

echo ""
echo "========================================="
echo "Test Execution Complete"
echo "========================================="
echo ""
echo "Full output saved to: /tmp/tracker-test-full.txt"
echo ""
echo "Summary (last 100 lines):"
tail -100 /tmp/tracker-test-full.txt
