#!/bin/bash

# Hikma Engine API Deployment Script
# Usage: ./scripts/deploy.sh [environment] [version]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-development}"
VERSION="${2:-latest}"
REGISTRY="${DOCKER_REGISTRY:-hikma-engine}"

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
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if kubectl is installed (for Kubernetes deployments)
    if [[ "$ENVIRONMENT" == "production" ]] && ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed (required for production deployment)"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Build Docker image
build_image() {
    log_info "Building Docker image..."
    
    cd "$PROJECT_ROOT"
    
    # Build the image
    docker build \
        -f Dockerfile.api \
        -t "${REGISTRY}/hikma-api:${VERSION}" \
        -t "${REGISTRY}/hikma-api:latest" \
        --build-arg BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --build-arg GIT_COMMIT="$(git rev-parse HEAD)" \
        .
    
    log_success "Docker image built successfully"
}

# Push Docker image to registry
push_image() {
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_info "Pushing Docker image to registry..."
        
        docker push "${REGISTRY}/hikma-api:${VERSION}"
        docker push "${REGISTRY}/hikma-api:latest"
        
        log_success "Docker image pushed successfully"
    else
        log_info "Skipping image push for non-production environment"
    fi
}

# Deploy to development environment
deploy_development() {
    log_info "Deploying to development environment..."
    
    cd "$PROJECT_ROOT"
    
    # Stop existing containers
    docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
    
    # Start services
    docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Health check
    if curl -f http://localhost:3000/api/v1/monitoring/health > /dev/null 2>&1; then
        log_success "Development deployment successful"
        log_info "API available at: http://localhost:3000"
        log_info "Documentation available at: http://localhost:3000/api/v1/docs"
    else
        log_error "Health check failed"
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs hikma-api
        exit 1
    fi
}

# Deploy to staging environment
deploy_staging() {
    log_info "Deploying to staging environment..."
    
    cd "$PROJECT_ROOT"
    
    # Use production compose file but with staging overrides
    export HIKMA_API_PORT=3001
    export REDIS_PORT=6380
    
    docker-compose -f docker-compose.yml down
    docker-compose -f docker-compose.yml up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Health check
    if curl -f http://localhost:3001/api/v1/monitoring/health > /dev/null 2>&1; then
        log_success "Staging deployment successful"
        log_info "API available at: http://localhost:3001"
    else
        log_error "Health check failed"
        docker-compose -f docker-compose.yml logs hikma-api
        exit 1
    fi
}

# Deploy to production environment (Kubernetes)
deploy_production() {
    log_info "Deploying to production environment (Kubernetes)..."
    
    cd "$PROJECT_ROOT"
    
    # Check if kubectl is configured
    if ! kubectl cluster-info &> /dev/null; then
        log_error "kubectl is not configured or cluster is not accessible"
        exit 1
    fi
    
    # Create namespace if it doesn't exist
    kubectl create namespace hikma-engine --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply Kubernetes manifests
    kubectl apply -f k8s/
    
    # Wait for deployment to be ready
    log_info "Waiting for deployment to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/hikma-api -n hikma-engine
    
    # Get service endpoint
    SERVICE_IP=$(kubectl get service hikma-api -n hikma-engine -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    if [[ -z "$SERVICE_IP" ]]; then
        SERVICE_IP=$(kubectl get service hikma-api -n hikma-engine -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    fi
    
    if [[ -n "$SERVICE_IP" ]]; then
        log_success "Production deployment successful"
        log_info "API available at: http://${SERVICE_IP}"
    else
        log_warning "Deployment successful, but external IP not yet available"
        log_info "Check service status with: kubectl get service hikma-api -n hikma-engine"
    fi
}

# Run tests
run_tests() {
    log_info "Running tests..."
    
    cd "$PROJECT_ROOT"
    
    # Install dependencies if needed
    if [[ ! -d "node_modules" ]]; then
        npm ci
    fi
    
    # Run tests
    npm test
    
    log_success "Tests passed"
}

# Generate documentation
generate_docs() {
    log_info "Generating documentation..."
    
    cd "$PROJECT_ROOT"
    
    # Create docs directory
    mkdir -p docs/api
    
    # Generate static documentation
    npm run docs:generate
    
    log_success "Documentation generated in docs/api/"
}

# Cleanup old resources
cleanup() {
    log_info "Cleaning up old resources..."
    
    case "$ENVIRONMENT" in
        development|staging)
            # Remove old Docker images
            docker image prune -f
            docker volume prune -f
            ;;
        production)
            # Cleanup old Kubernetes resources
            kubectl delete pods --field-selector=status.phase=Succeeded -n hikma-engine
            kubectl delete pods --field-selector=status.phase=Failed -n hikma-engine
            ;;
    esac
    
    log_success "Cleanup completed"
}

# Main deployment function
main() {
    log_info "Starting deployment for environment: $ENVIRONMENT, version: $VERSION"
    
    # Check prerequisites
    check_prerequisites
    
    # Run tests
    run_tests
    
    # Build image
    build_image
    
    # Push image (production only)
    push_image
    
    # Generate documentation
    generate_docs
    
    # Deploy based on environment
    case "$ENVIRONMENT" in
        development)
            deploy_development
            ;;
        staging)
            deploy_staging
            ;;
        production)
            deploy_production
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            log_info "Supported environments: development, staging, production"
            exit 1
            ;;
    esac
    
    # Cleanup
    cleanup
    
    log_success "Deployment completed successfully!"
}

# Show usage information
show_usage() {
    echo "Usage: $0 [environment] [version]"
    echo ""
    echo "Environments:"
    echo "  development  - Deploy to local development environment (default)"
    echo "  staging      - Deploy to staging environment"
    echo "  production   - Deploy to production Kubernetes cluster"
    echo ""
    echo "Version:"
    echo "  Specify the version tag for the Docker image (default: latest)"
    echo ""
    echo "Examples:"
    echo "  $0                          # Deploy to development with latest version"
    echo "  $0 staging v1.2.0          # Deploy version v1.2.0 to staging"
    echo "  $0 production v1.2.0       # Deploy version v1.2.0 to production"
    echo ""
    echo "Environment Variables:"
    echo "  DOCKER_REGISTRY  - Docker registry URL (default: hikma-engine)"
    echo "  KUBECONFIG       - Path to Kubernetes config file"
}

# Handle command line arguments
if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    show_usage
    exit 0
fi

# Run main function
main "$@"
