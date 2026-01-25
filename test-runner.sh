#!/bin/bash

# Run tracker tests and save output
cd /Users/simon/git/lingo-tracker

echo "Running tracker tests..."
pnpm nx test tracker --run 2>&1 | tee /tmp/tracker-test-output.txt

# Show summary
echo ""
echo "===================="
echo "Test Summary:"
echo "===================="
tail -50 /tmp/tracker-test-output.txt
