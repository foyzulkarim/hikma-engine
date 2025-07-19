#!/bin/bash

# Performance Testing Script for Hikma Engine API
# Usage: ./scripts/performance-test.sh [test-type] [duration]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
API_URL="${API_URL:-http://localhost:3000}"
TEST_TYPE="${1:-all}"
DURATION="${2:-300}" # Default 5 minutes
RESULTS_DIR="$PROJECT_ROOT/performance-results"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if API is running
    if ! curl -f "$API_URL/api/v1/monitoring/health" > /dev/null 2>&1; then
        log_error "API is not running at $API_URL"
        log_info "Please start the API server first"
        exit 1
    fi
    
    # Check if Artillery is installed
    if ! command -v artillery &> /dev/null; then
        log_warning "Artillery not found, installing..."
        npm install -g artillery
    fi
    
    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    # Check if jq is available for JSON processing
    if ! command -v jq &> /dev/null; then
        log_warning "jq not found, some features may be limited"
    fi
    
    log_success "Prerequisites check passed"
}

# Create results directory
setup_results_dir() {
    mkdir -p "$RESULTS_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    TEST_RESULTS_DIR="$RESULTS_DIR/test_$TIMESTAMP"
    mkdir -p "$TEST_RESULTS_DIR"
    
    log_info "Results will be saved to: $TEST_RESULTS_DIR"
}

# Get baseline metrics
get_baseline_metrics() {
    log_info "Collecting baseline metrics..."
    
    local baseline_file="$TEST_RESULTS_DIR/baseline.json"
    
    # Get system info
    curl -s "$API_URL/api/v1/monitoring/system" > "$baseline_file.system"
    
    # Get health status
    curl -s "$API_URL/api/v1/monitoring/health" > "$baseline_file.health"
    
    # Get performance metrics
    curl -s "$API_URL/api/v1/monitoring/performance" > "$baseline_file.performance"
    
    log_success "Baseline metrics collected"
}

# Run Artillery load test
run_artillery_test() {
    log_info "Running Artillery load test..."
    
    local config_file="$PROJECT_ROOT/load-tests/artillery-config.yml"
    local results_file="$TEST_RESULTS_DIR/artillery-results.json"
    local report_file="$TEST_RESULTS_DIR/artillery-report.html"
    
    # Update target URL in config
    sed "s|target: 'http://localhost:3000'|target: '$API_URL'|g" "$config_file" > "$TEST_RESULTS_DIR/artillery-config.yml"
    
    # Run Artillery test
    artillery run "$TEST_RESULTS_DIR/artillery-config.yml" \
        --output "$results_file" \
        --config "{\"phases\": [{\"duration\": $DURATION, \"arrivalRate\": 10}]}"
    
    # Generate HTML report
    if [[ -f "$results_file" ]]; then
        artillery report "$results_file" --output "$report_file"
        log_success "Artillery test completed. Report: $report_file"
    else
        log_error "Artillery test failed"
        return 1
    fi
}

# Run custom performance benchmarks
run_custom_benchmarks() {
    log_info "Running custom performance benchmarks..."
    
    local benchmark_results="$TEST_RESULTS_DIR/custom-benchmarks.json"
    
    # Initialize results file
    echo '{"benchmarks": []}' > "$benchmark_results"
    
    # Benchmark 1: Response time test
    log_info "Benchmark 1: Response time test"
    run_response_time_benchmark "$benchmark_results"
    
    # Benchmark 2: Concurrent requests test
    log_info "Benchmark 2: Concurrent requests test"
    run_concurrent_requests_benchmark "$benchmark_results"
    
    # Benchmark 3: Memory usage test
    log_info "Benchmark 3: Memory usage test"
    run_memory_usage_benchmark "$benchmark_results"
    
    # Benchmark 4: Cache performance test
    log_info "Benchmark 4: Cache performance test"
    run_cache_performance_benchmark "$benchmark_results"
    
    log_success "Custom benchmarks completed"
}

# Response time benchmark
run_response_time_benchmark() {
    local results_file="$1"
    local endpoint_tests=(
        "/api/v1/monitoring/health"
        "/api/v1/search/semantic?q=test&limit=10"
        "/api/v1/search/structure?q=function&limit=5"
        "/api/v1/search/git?q=commit&limit=5"
        "/api/v1/monitoring/system"
    )
    
    local benchmark_data='{"name": "response_time", "results": []}'
    
    for endpoint in "${endpoint_tests[@]}"; do
        local total_time=0
        local successful_requests=0
        local failed_requests=0
        
        for i in {1..50}; do
            local start_time=$(date +%s%3N)
            if curl -f -s "$API_URL$endpoint" > /dev/null 2>&1; then
                local end_time=$(date +%s%3N)
                local response_time=$((end_time - start_time))
                total_time=$((total_time + response_time))
                successful_requests=$((successful_requests + 1))
            else
                failed_requests=$((failed_requests + 1))
            fi
        done
        
        local avg_response_time=0
        if [[ $successful_requests -gt 0 ]]; then
            avg_response_time=$((total_time / successful_requests))
        fi
        
        local endpoint_result=$(jq -n \
            --arg endpoint "$endpoint" \
            --argjson avg_time "$avg_response_time" \
            --argjson success "$successful_requests" \
            --argjson failed "$failed_requests" \
            '{endpoint: $endpoint, avg_response_time_ms: $avg_time, successful_requests: $success, failed_requests: $failed}')
        
        benchmark_data=$(echo "$benchmark_data" | jq ".results += [$endpoint_result]")
    done
    
    # Add benchmark to results file
    local updated_results=$(jq ".benchmarks += [$benchmark_data]" "$results_file")
    echo "$updated_results" > "$results_file"
}

# Concurrent requests benchmark
run_concurrent_requests_benchmark() {
    local results_file="$1"
    local concurrency_levels=(5 10 20 50)
    local benchmark_data='{"name": "concurrent_requests", "results": []}'
    
    for concurrency in "${concurrency_levels[@]}"; do
        log_info "Testing concurrency level: $concurrency"
        
        local start_time=$(date +%s)
        local pids=()
        
        # Start concurrent requests
        for ((i=1; i<=concurrency; i++)); do
            (
                curl -s "$API_URL/api/v1/search/semantic?q=test$i&limit=5" > /dev/null 2>&1
            ) &
            pids+=($!)
        done
        
        # Wait for all requests to complete
        for pid in "${pids[@]}"; do
            wait "$pid"
        done
        
        local end_time=$(date +%s)
        local total_time=$((end_time - start_time))
        
        local result=$(jq -n \
            --argjson concurrency "$concurrency" \
            --argjson total_time "$total_time" \
            '{concurrency: $concurrency, total_time_seconds: $total_time}')
        
        benchmark_data=$(echo "$benchmark_data" | jq ".results += [$result]")
    done
    
    # Add benchmark to results file
    local updated_results=$(jq ".benchmarks += [$benchmark_data]" "$results_file")
    echo "$updated_results" > "$results_file"
}

# Memory usage benchmark
run_memory_usage_benchmark() {
    local results_file="$1"
    local benchmark_data='{"name": "memory_usage", "results": []}'
    
    # Get initial memory usage
    local initial_memory=$(curl -s "$API_URL/api/v1/monitoring/system" | jq '.data.memory.heapUsed // 0')
    
    # Perform memory-intensive operations
    for i in {1..100}; do
        curl -s "$API_URL/api/v1/search/comprehensive?q=memory_test_$i&limit=20" > /dev/null 2>&1
    done
    
    # Get final memory usage
    local final_memory=$(curl -s "$API_URL/api/v1/monitoring/system" | jq '.data.memory.heapUsed // 0')
    local memory_increase=$((final_memory - initial_memory))
    
    local result=$(jq -n \
        --argjson initial "$initial_memory" \
        --argjson final "$final_memory" \
        --argjson increase "$memory_increase" \
        '{initial_memory_mb: ($initial / 1024 / 1024 | floor), final_memory_mb: ($final / 1024 / 1024 | floor), memory_increase_mb: ($increase / 1024 / 1024 | floor)}')
    
    benchmark_data=$(echo "$benchmark_data" | jq ".results += [$result]")
    
    # Add benchmark to results file
    local updated_results=$(jq ".benchmarks += [$benchmark_data]" "$results_file")
    echo "$updated_results" > "$results_file"
}

# Cache performance benchmark
run_cache_performance_benchmark() {
    local results_file="$1"
    local benchmark_data='{"name": "cache_performance", "results": []}'
    local test_query="cache_performance_test"
    
    # First request (cache miss)
    local start_time=$(date +%s%3N)
    curl -s "$API_URL/api/v1/search/semantic?q=$test_query&limit=10" > /dev/null 2>&1
    local end_time=$(date +%s%3N)
    local first_request_time=$((end_time - start_time))
    
    # Second request (cache hit)
    start_time=$(date +%s%3N)
    curl -s "$API_URL/api/v1/search/semantic?q=$test_query&limit=10" > /dev/null 2>&1
    end_time=$(date +%s%3N)
    local second_request_time=$((end_time - start_time))
    
    # Calculate cache performance improvement
    local improvement=0
    if [[ $first_request_time -gt 0 ]]; then
        improvement=$(echo "scale=2; (($first_request_time - $second_request_time) / $first_request_time) * 100" | bc -l)
    fi
    
    local result=$(jq -n \
        --argjson first_time "$first_request_time" \
        --argjson second_time "$second_request_time" \
        --arg improvement "$improvement" \
        '{first_request_ms: $first_time, second_request_ms: $second_time, cache_improvement_percent: ($improvement | tonumber)}')
    
    benchmark_data=$(echo "$benchmark_data" | jq ".results += [$result]")
    
    # Add benchmark to results file
    local updated_results=$(jq ".benchmarks += [$benchmark_data]" "$results_file")
    echo "$updated_results" > "$results_file"
}

# Generate performance report
generate_report() {
    log_info "Generating performance report..."
    
    local report_file="$TEST_RESULTS_DIR/performance-report.md"
    
    cat > "$report_file" << EOF
# Performance Test Report

**Test Date:** $(date)
**API URL:** $API_URL
**Test Duration:** ${DURATION}s
**Test Type:** $TEST_TYPE

## Summary

This report contains the results of performance testing for the Hikma Engine Semantic Search API.

## Test Results

### Artillery Load Test
- Configuration: [artillery-config.yml](./artillery-config.yml)
- Results: [artillery-results.json](./artillery-results.json)
- HTML Report: [artillery-report.html](./artillery-report.html)

### Custom Benchmarks
- Results: [custom-benchmarks.json](./custom-benchmarks.json)

### Baseline Metrics
- System Info: [baseline.json.system](./baseline.json.system)
- Health Status: [baseline.json.health](./baseline.json.health)
- Performance Metrics: [baseline.json.performance](./baseline.json.performance)

## Key Findings

EOF

    # Add key findings from results
    if [[ -f "$TEST_RESULTS_DIR/custom-benchmarks.json" ]]; then
        echo "### Response Time Analysis" >> "$report_file"
        echo "" >> "$report_file"
        
        # Extract response time data
        if command -v jq &> /dev/null; then
            jq -r '.benchmarks[] | select(.name == "response_time") | .results[] | "- \(.endpoint): \(.avg_response_time_ms)ms (Success: \(.successful_requests), Failed: \(.failed_requests))"' "$TEST_RESULTS_DIR/custom-benchmarks.json" >> "$report_file"
        fi
        
        echo "" >> "$report_file"
        echo "### Cache Performance" >> "$report_file"
        echo "" >> "$report_file"
        
        # Extract cache performance data
        if command -v jq &> /dev/null; then
            jq -r '.benchmarks[] | select(.name == "cache_performance") | .results[] | "- First request: \(.first_request_ms)ms, Second request: \(.second_request_ms)ms, Improvement: \(.cache_improvement_percent)%"' "$TEST_RESULTS_DIR/custom-benchmarks.json" >> "$report_file"
        fi
    fi
    
    cat >> "$report_file" << EOF

## Recommendations

Based on the test results, consider the following optimizations:

1. **Response Time**: Monitor endpoints with response times > 1000ms
2. **Concurrency**: Ensure the API can handle expected concurrent load
3. **Memory Usage**: Monitor memory growth during sustained load
4. **Caching**: Verify cache hit rates are above 70% for repeated queries

## Files Generated

- Performance Report: $(basename "$report_file")
- Test Results Directory: $(basename "$TEST_RESULTS_DIR")

EOF

    log_success "Performance report generated: $report_file"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    # Kill any background processes
    jobs -p | xargs -r kill
}

# Main function
main() {
    log_info "Starting performance testing..."
    log_info "Test type: $TEST_TYPE, Duration: ${DURATION}s"
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Check prerequisites
    check_prerequisites
    
    # Setup results directory
    setup_results_dir
    
    # Get baseline metrics
    get_baseline_metrics
    
    # Run tests based on type
    case "$TEST_TYPE" in
        "artillery"|"load")
            run_artillery_test
            ;;
        "benchmark"|"custom")
            run_custom_benchmarks
            ;;
        "all")
            run_artillery_test
            run_custom_benchmarks
            ;;
        *)
            log_error "Unknown test type: $TEST_TYPE"
            log_info "Supported types: artillery, benchmark, all"
            exit 1
            ;;
    esac
    
    # Generate report
    generate_report
    
    log_success "Performance testing completed!"
    log_info "Results available in: $TEST_RESULTS_DIR"
}

# Show usage
show_usage() {
    echo "Usage: $0 [test-type] [duration]"
    echo ""
    echo "Test Types:"
    echo "  artillery   - Run Artillery load test only"
    echo "  benchmark   - Run custom benchmarks only"
    echo "  all         - Run all tests (default)"
    echo ""
    echo "Duration:"
    echo "  Duration in seconds for load tests (default: 300)"
    echo ""
    echo "Environment Variables:"
    echo "  API_URL     - API base URL (default: http://localhost:3000)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Run all tests for 5 minutes"
    echo "  $0 artillery 600     # Run load test for 10 minutes"
    echo "  $0 benchmark         # Run benchmarks only"
}

# Handle command line arguments
if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    show_usage
    exit 0
fi

# Run main function
main "$@"
