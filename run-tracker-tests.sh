#!/bin/bash

# Script to run tracker tests and capture output
# This will help identify all failing tests

cd /Users/simon/git/lingo-tracker

echo "Running tracker tests..."
echo "======================="
echo ""

# Run tests and capture output
pnpm nx test tracker --run 2>&1 | tee tracker-test-output.txt

echo ""
echo "======================="
echo "Test run complete. Results saved to tracker-test-output.txt"
echo ""
echo "Summary:"
grep -E "(FAIL|PASS|Test Suites:|Tests:)" tracker-test-output.txt | tail -20
