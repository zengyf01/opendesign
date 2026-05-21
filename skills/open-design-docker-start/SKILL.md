---
name: open-design-docker-start
description: |
  启动 Open Design Docker 容器 (Start Open Design container from image)
triggers:
  - "start docker container"
  - "docker start open design"
  - "启动 docker 容器"
od:
  mode: utility
  category: devops
---

# open-design-docker-start

启动 Open Design 容器：

```bash
docker run -d \
  --name open-design \
  -p 7456:7456 \
  -v open_design_data:/app/.od \
  open-design:dev
```

验证健康状态：

```bash
curl http://127.0.0.1:7456/api/health
```

查看日志：

```bash
docker logs -f open-design
```

## 停止容器

```bash
docker stop open-design && docker rm open-design
```

## 前提条件

需要先使用 `open-design-docker-build` 技能构建镜像。