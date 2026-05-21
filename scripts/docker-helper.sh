#!/bin/bash
# Open Design Docker 辅助脚本

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="open-design:dev"
CONTAINER_NAME="open-design"
PORT=7456

build() {
    echo "正在从源码构建 Docker 镜像..."
    docker build -f "$PROJECT_ROOT/deploy/Dockerfile" -t "$IMAGE_NAME" "$PROJECT_ROOT"
    echo "构建完成: $IMAGE_NAME"
}

start() {
    echo "正在启动 Open Design 容器..."
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            echo "容器已在运行中"
            return
        fi
        echo "移除已有容器..."
        docker rm "$CONTAINER_NAME"
    fi
    docker run -d \
        --name "$CONTAINER_NAME" \
        -p "${PORT}:7456" \
        -v open_design_data:/app/.od \
        "$IMAGE_NAME"
    echo "容器已启动，端口: $PORT"
}

stop() {
    echo "正在停止 Open Design 容器..."
    docker stop "$CONTAINER_NAME" && docker rm "$CONTAINER_NAME"
    echo "容器已停止并移除"
}

logs() {
    docker logs -f "$CONTAINER_NAME"
}

health() {
    curl -s http://127.0.0.1:${PORT}/api/health || echo "健康检查失败"
}

case "$1" in
    build)
        build
        ;;
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        stop && start
        ;;
    logs)
        logs
        ;;
    health)
        health
        ;;
    *)
        echo "用法: $0 {build|start|stop|restart|logs|health}"
        echo ""
        echo "命令:"
        echo "  build   - 从源码构建 Docker 镜像"
        echo "  start   - 启动 Open Design 容器"
        echo "  stop    - 停止并移除容器"
        echo "  restart - 重启容器"
        echo "  logs    - 查看容器日志"
        echo "  health  - 检查 API 健康状态"
        exit 1
        ;;
esac