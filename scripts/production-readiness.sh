#!/bin/bash

# Production Readiness Validation Script for Hikma Engine API
# Usage: ./scripts/production-readiness.sh [environment]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"
API_URL="${API_URL:-http://localhost:3000}"

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
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Counters for tracking results
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Function to run a check
run_check() {
    local check_name="$1"
    local check_command="$2"
    local is_critical="${3:-true}"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    log_info "Checking: $check_name"
    
    if eval "$check_command" > /dev/null 2>&1; then
        log_success "$check_name"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        if [[ "$is_critical" == "true" ]]; then
            log_error "$check_name"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            return 1
        else
            log_warning "$check_name"
            WARNING_CHECKS=$((WARNING_CHECKS + 1))
            return 0
        fi
    fi
}

# API Health Checks
check_api_health() {
    log_info "=== API Health Checks ==="
    
    run_check "API Server is running" \
        "curl -f -s '$API_URL/api/v1/monitoring/liveness' > /dev/null"
    
    run_check "Health endpoint returns healthy status" \
        "curl -f -s '$API_URL/api/v1/monitoring/health' | jq -e '.data.status == \"healthy\"'"
    
    run_check "Readiness probe passes" \
        "curl -f -s '$API_URL/api/v1/monitoring/readiness' | jq -e '.status == \"ready\"'"
    
    run_check "All critical services are operational" \
        "curl -f -s '$API_URL/api/v1/monitoring/health' | jq -e '.data.summary.failed == 0'"
    
    run_check "System information is accessible" \
        "curl -f -s '$API_URL/api/v1/monitoring/system' | jq -e '.success == true'"
}

# Search Functionality Checks
check_search_functionality() {
    log_info "=== Search Functionality Checks ==="
    
    run_check "Semantic search is working" \
        "curl -f -s '$API_URL/api/v1/search/semantic?q=test&limit=5' | jq -e '.success == true'"
    
    run_check "Structural search is working" \
        "curl -f -s '$API_URL/api/v1/search/structure?q=function&limit=5' | jq -e '.success == true'"
    
    run_check "Git search is working" \
        "curl -f -s '$API_URL/api/v1/search/git?q=commit&limit=5' | jq -e '.success == true'"
    
    run_check "Hybrid search is working" \
        "curl -f -s '$API_URL/api/v1/search/hybrid?q=test&limit=5' | jq -e '.success == true'"
    
    run_check "Comprehensive search is working" \
        "curl -f -s '$API_URL/api/v1/search/comprehensive?q=test&limit=10' | jq -e '.success == true'"
}

# Performance Checks
check_performance() {
    log_info "=== Performance Checks ==="
    
    # Response time check
    local response_time=$(curl -w "%{time_total}" -s -o /dev/null "$API_URL/api/v1/monitoring/health")
    if (( $(echo "$response_time < 1.0" | bc -l) )); then
        log_success "Health endpoint response time: ${response_time}s"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_warning "Health endpoint response time: ${response_time}s (>1s)"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    # Memory usage check
    local memory_usage=$(curl -s "$API_URL/api/v1/monitoring/system" | jq -r '.data.process.memory.heapUsed')
    local memory_mb=$((memory_usage / 1024 / 1024))
    if [[ $memory_mb -lt 512 ]]; then
        log_success "Memory usage: ${memory_mb}MB"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_warning "Memory usage: ${memory_mb}MB (>512MB)"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    run_check "Performance metrics are being collected" \
        "curl -f -s '$API_URL/api/v1/monitoring/performance' | jq -e '.data.metrics.requests.total >= 0'"
}

# Security Checks
check_security() {
    log_info "=== Security Checks ==="
    
    # Check security headers
    local headers_response=$(curl -I -s "$API_URL/api/v1/monitoring/health")
    
    if echo "$headers_response" | grep -i "x-content-type-options" > /dev/null; then
        log_success "X-Content-Type-Options header present"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_warning "X-Content-Type-Options header missing"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if echo "$headers_response" | grep -i "x-frame-options" > /dev/null; then
        log_success "X-Frame-Options header present"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_warning "X-Frame-Options header missing"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    # Check input validation
    local validation_response=$(curl -s -w "%{http_code}" -o /dev/null "$API_URL/api/v1/search/semantic?limit=invalid")
    if [[ "$validation_response" == "400" ]]; then
        log_success "Input validation is working"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_error "Input validation failed"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# Configuration Checks
check_configuration() {
    log_info "=== Configuration Checks ==="
    
    run_check "Configuration is valid" \
        "curl -f -s '$API_URL/api/v1/monitoring/config' | jq -e '.success == true'"
    
    # Check environment-specific configuration
    if [[ "$ENVIRONMENT" == "production" ]]; then
        run_check "Production environment is set" \
            "curl -s '$API_URL/api/v1/monitoring/system' | jq -e '.data.api.environment == \"production\"'"
        
        run_check "Monitoring is enabled" \
            "curl -s '$API_URL/api/v1/monitoring/config' | jq -e '.data.monitoring.enabled == true'"
        
        run_check "Cache is enabled" \
            "curl -s '$API_URL/api/v1/monitoring/config' | jq -e '.data.cache.enabled == true'"
    fi
}

# Error Handling Checks
check_error_handling() {
    log_info "=== Error Handling Checks ==="
    
    run_check "Error monitoring is working" \
        "curl -f -s '$API_URL/api/v1/monitoring/errors' | jq -e '.success == true'"
    
    run_check "404 errors are handled correctly" \
        "test \$(curl -s -w '%{http_code}' -o /dev/null '$API_URL/api/v1/non-existent') == '404'"
    
    run_check "Validation errors return 400" \
        "test \$(curl -s -w '%{http_code}' -o /dev/null '$API_URL/api/v1/search/semantic') == '400'"
    
    # Check error response format
    local error_response=$(curl -s "$API_URL/api/v1/search/semantic")
    if echo "$error_response" | jq -e '.success == false and .error.code and .error.message' > /dev/null; then
        log_success "Error response format is correct"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_error "Error response format is incorrect"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# Documentation Checks
check_documentation() {
    log_info "=== Documentation Checks ==="
    
    run_check "API documentation is accessible" \
        "curl -f -s '$API_URL/api/v1/docs/openapi.json' > /dev/null" \
        "false"
    
    run_check "Version information is available" \
        "curl -f -s '$API_URL/api/v1/monitoring/version' | jq -e '.data.api'"
}

# Monitoring and Observability Checks
check_monitoring() {
    log_info "=== Monitoring and Observability Checks ==="
    
    run_check "Comprehensive metrics are available" \
        "curl -f -s '$API_URL/api/v1/monitoring/metrics' | jq -e '.data.errors and .data.performance and .data.health'"
    
    run_check "Request correlation IDs are generated" \
        "curl -s '$API_URL/api/v1/monitoring/health' | jq -e '.meta.requestId | startswith(\"req_\")'"
    
    run_check "Processing time is tracked" \
        "curl -s '$API_URL/api/v1/monitoring/health' | jq -e '.meta.processingTime >= 0'"
    
    run_check "Cleanup endpoint is functional" \
        "curl -f -s -X POST '$API_URL/api/v1/monitoring/cleanup' -H 'Content-Type: application/json' -d '{}' | jq -e '.success == true'"
}

# Load Testing Validation
check_load_capacity() {
    log_info "=== Load Capacity Checks ==="
    
    # Simple concurrent request test
    log_info "Testing concurrent request handling..."
    local concurrent_pids=()
    local concurrent_results=()
    
    for i in {1..10}; do
        (
            response=$(curl -s -w "%{http_code}" -o /dev/null "$API_URL/api/v1/monitoring/liveness")
            echo "$response"
        ) &
        concurrent_pids+=($!)
    done
    
    # Wait for all requests and collect results
    for pid in "${concurrent_pids[@]}"; do
        wait "$pid"
        concurrent_results+=($(jobs -p | wc -l))
    done
    
    # Check if most requests succeeded
    local success_count=0
    for result in "${concurrent_results[@]}"; do
        if [[ "$result" == "200" ]]; then
            success_count=$((success_count + 1))
        fi
    done
    
    if [[ $success_count -ge 8 ]]; then
        log_success "Concurrent request handling: $success_count/10 succeeded"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_warning "Concurrent request handling: $success_count/10 succeeded"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# Database and Storage Checks
check_storage() {
    log_info "=== Storage and Database Checks ==="
    
    # Check database connectivity through health endpoint
    local health_response=$(curl -s "$API_URL/api/v1/monitoring/health")
    
    # Check SQLite with vector extension
    if echo "$health_response" | jq -e '.data.checks.sqlite.status == "pass"' > /dev/null; then
        log_success "SQLite connection is healthy"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_error "SQLite connection failed"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    # Check vector extension availability
    if echo "$health_response" | jq -e '.data.checks.sqlite.details.vectorEnabled == true' > /dev/null; then
        log_success "SQLite vector extension is enabled"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_warning "SQLite vector extension is not available (semantic search may be limited)"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    

}

# Generate readiness report
generate_report() {
    log_info "=== Production Readiness Report ==="
    
    local pass_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    local fail_rate=$((FAILED_CHECKS * 100 / TOTAL_CHECKS))
    local warn_rate=$((WARNING_CHECKS * 100 / TOTAL_CHECKS))
    
    echo ""
    echo "📊 SUMMARY:"
    echo "  Total Checks: $TOTAL_CHECKS"
    echo "  ✅ Passed: $PASSED_CHECKS ($pass_rate%)"
    echo "  ❌ Failed: $FAILED_CHECKS ($fail_rate%)"
    echo "  ⚠️  Warnings: $WARNING_CHECKS ($warn_rate%)"
    echo ""
    
    if [[ $FAILED_CHECKS -eq 0 ]]; then
        if [[ $WARNING_CHECKS -eq 0 ]]; then
            log_success "🎉 PRODUCTION READY: All checks passed!"
            echo "The API is ready for production deployment."
        else
            log_warning "⚠️  PRODUCTION READY WITH WARNINGS: $WARNING_CHECKS non-critical issues found."
            echo "The API can be deployed to production, but consider addressing the warnings."
        fi
        return 0
    else
        log_error "❌ NOT PRODUCTION READY: $FAILED_CHECKS critical issues found."
        echo "Please fix the failed checks before deploying to production."
        return 1
    fi
}

# Main function
main() {
    log_info "🚀 Starting Production Readiness Check for $ENVIRONMENT environment"
    log_info "API URL: $API_URL"
    echo ""
    
    # Check prerequisites
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed"
        exit 1
    fi
    
    if ! command -v bc &> /dev/null; then
        log_warning "bc is not installed, some performance checks may be skipped"
    fi
    
    # Run all checks
    check_api_health
    echo ""
    
    check_search_functionality
    echo ""
    
    check_performance
    echo ""
    
    check_security
    echo ""
    
    check_configuration
    echo ""
    
    check_error_handling
    echo ""
    
    check_documentation
    echo ""
    
    check_monitoring
    echo ""
    
    check_load_capacity
    echo ""
    
    check_storage
    echo ""
    
    # Generate final report
    generate_report
}

# Show usage
show_usage() {
    echo "Usage: $0 [environment]"
    echo ""
    echo "Environment:"
    echo "  production   - Run production readiness checks (default)"
    echo "  staging      - Run staging environment checks"
    echo "  development  - Run development environment checks"
    echo ""
    echo "Environment Variables:"
    echo "  API_URL      - API base URL (default: http://localhost:3000)"
    echo ""
    echo "Examples:"
    echo "  $0                           # Check production readiness"
    echo "  $0 staging                   # Check staging environment"
    echo "  API_URL=https://api.example.com $0  # Check remote API"
}

# Handle command line arguments
if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    show_usage
    exit 0
fi

# Run main function
main "$@"
