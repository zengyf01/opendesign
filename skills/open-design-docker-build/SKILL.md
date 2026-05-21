---
name: open-design-docker-build
description: |
  构建 Open Design Docker 镜像 (Build Open Design Docker image from source)
triggers:
  - "build docker image"
  - "docker build open design"
  - "构建 docker 镜像"
od:
  mode: utility
  category: devops
---

# open-design-docker-build

从项目根目录执行以下命令构建 Open Design Docker 镜像：

```bash
docker build -f deploy/Dockerfile -t open-design:dev .
```

构建完成后验证镜像：

```bash
docker images open-design:dev
```

## 可选：使用 docker-compose

```bash
cd deploy
docker-compose build
```

## 验证构建

构建完成后可以使用 `open-design-docker-start` 技能启动容器。