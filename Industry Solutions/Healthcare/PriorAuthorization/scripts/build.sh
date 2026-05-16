#!/usr/bin/env bash
set -euo pipefail

# Healthcare Prior Authorization — Build & Deploy Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

usage() {
  cat <<EOF
Usage: $0 <command> [options]

Commands:
  install        Install Lambda dependencies
  install_ui     Install UI dependencies
  build          Build the SAM application
  build_ui       Build the UI (injects VITE_API_URL from stack outputs)
  sync_ui        Sync UI dist/ to S3 bucket
  push-agents    Build + push agent containers to ECR
  deploy         Deploy the full stack (ECR repos, AgentCore runtimes, durable Lambda, UI)
  test           Run unit tests
  all            install + install_ui + build + build_ui + push-agents + deploy + sync_ui

Options:
  --region       AWS region (default: us-west-2)
  --stack-name   CloudFormation stack name (default: healthcare-prior-auth)
  --profile      AWS CLI profile

EOF
  exit 1
}

REGION="${AWS_DEFAULT_REGION:-us-west-2}"
STACK_NAME="healthcare-prior-auth"
PROFILE_FLAG=""
COMMAND=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    install|install_ui|build|build_ui|sync_ui|push-agents|deploy|test|all) COMMAND="$1"; shift ;;
    --region) REGION="$2"; shift 2 ;;
    --stack-name) STACK_NAME="$2"; shift 2 ;;
    --profile) PROFILE_FLAG="--profile $2"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -z "$COMMAND" ]] && usage

ACCOUNT_ID=$(aws sts get-caller-identity $PROFILE_FLAG --query Account --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Helper: retrieve a CloudFormation stack output value by key
get_stack_output() {
  local key="$1"
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    $PROFILE_FLAG \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue" \
    --output text
}

cmd_install() {
  echo "📦 Installing Lambda dependencies..."
  (cd "$PROJECT_DIR" && npm install)
}

cmd_install_ui() {
  echo "📦 Installing UI dependencies..."
  (cd "$PROJECT_DIR/ui" && npm install)
}

cmd_build() {
  echo "🔨 Building SAM application..."
  (cd "$PROJECT_DIR" && sam build)
}

cmd_build_ui() {
  echo "🔨 Building UI..."
  local api_url
  api_url=$(get_stack_output "PaDemoApiUrl") || true

  if [[ -z "$api_url" ]]; then
    echo "⚠️  PaDemoApiUrl not found in stack outputs. Building UI without API URL."
    echo "   Deploy the stack first, then re-run build_ui to inject the correct URL."
  else
    echo "   Using API URL: $api_url"
  fi

  (cd "$PROJECT_DIR/ui" && VITE_API_URL="$api_url" npm run build)
}

cmd_sync_ui() {
  echo "☁️  Syncing UI to S3..."
  local bucket_name
  bucket_name=$(get_stack_output "DemoUIBucketName")

  if [[ -z "$bucket_name" ]]; then
    echo "❌ DemoUIBucketName not found in stack outputs. Deploy the stack first."
    exit 1
  fi

  echo "   Bucket: $bucket_name"
  aws s3 sync "$PROJECT_DIR/ui/dist/" "s3://${bucket_name}" \
    --region "$REGION" \
    --delete \
    $PROFILE_FLAG

  local bucket_url
  bucket_url=$(get_stack_output "DemoUIBucketUrl") || true
  if [[ -n "$bucket_url" ]]; then
    echo "✅ UI deployed to: $bucket_url"
  fi
}

cmd_push_agents() {
  echo "🐳 Building and pushing agent containers to ECR..."

  # Login to ECR
  aws ecr get-login-password --region "$REGION" $PROFILE_FLAG | \
    docker login --username AWS --password-stdin "$ECR_REGISTRY"

  AGENTS=(document-agent eligibility-agent policy-agent medical-necessity-agent synthesis-agent)

  for AGENT in "${AGENTS[@]}"; do
    REPO="healthcare-pa/${AGENT}"
    IMAGE="${ECR_REGISTRY}/${REPO}:latest"

    echo "  Building ${AGENT}..."
    docker build \
      -t "$IMAGE" \
      -f "$PROJECT_DIR/agents/Dockerfile" \
      "$PROJECT_DIR/agents/${AGENT}"

    echo "  Pushing ${AGENT}..."
    docker push "$IMAGE"
  done

  echo "✅ All agent images pushed to ECR"
}

cmd_test() {
  echo "🧪 Running tests..."
  (cd "$PROJECT_DIR" && npm test)
}

cmd_deploy() {
  echo "🚀 Deploying stack to ${REGION}..."

  # Build UI before deploy (API URL may be empty on first deploy)
  cmd_build_ui

  (cd "$PROJECT_DIR" && sam deploy \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --resolve-s3 \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset \
    $PROFILE_FLAG)

  # After deploy, rebuild UI with the now-available API URL and sync to S3
  echo "🔄 Rebuilding UI with deployed API URL..."
  cmd_build_ui
  cmd_sync_ui
}

case "$COMMAND" in
  install) cmd_install ;;
  install_ui) cmd_install_ui ;;
  build) cmd_build ;;
  build_ui) cmd_build_ui ;;
  sync_ui) cmd_sync_ui ;;
  push-agents) cmd_push_agents ;;
  deploy) cmd_deploy ;;
  test) cmd_test ;;
  all) cmd_install; cmd_install_ui; cmd_build; cmd_build_ui; cmd_push_agents; cmd_deploy ;;
esac
