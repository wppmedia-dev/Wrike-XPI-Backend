# Redis & RedisInsight Installation using Docker

This document explains how to install and configure **Redis** and **RedisInsight** using Docker containers.

---

# Prerequisites

Make sure the following are installed on your server:

- Docker
- Docker service running

Check Docker version:

```bash
docker --version
```

---

# Step 1: Create Docker Network

Create a dedicated Docker network for communication between Redis and RedisInsight.

```bash
docker network create redis-net
```

### Why this is needed

Using a custom Docker network allows containers to communicate securely using container names.

---

# Step 2: Run Redis Container

Run the following command to start Redis.

```bash
sudo docker run -d \
  --name redis \
  --network redis-net \
  -p 6379:6379 \
  -v /opt/redis/data:/data \
  --restart unless-stopped \
  redis:latest \
  redis-server \
  --appendonly yes \
  --requirepass "uwQF1s6dK87gt5Yr2MhP"
```

---

# Redis Container Configuration

| Parameter                  | Description                                  |
| -------------------------- | -------------------------------------------- |
| `-d`                       | Run container in background mode             |
| `--name redis`             | Assign container name as `redis`             |
| `--network redis-net`      | Attach container to custom Docker network    |
| `-p 6379:6379`             | Expose Redis service on port 6379            |
| `-v /opt/redis/data:/data` | Persist Redis data on host machine           |
| `--restart unless-stopped` | Automatically restart container after reboot |
| `redis:latest`             | Use latest Redis Docker image                |
| `--appendonly yes`         | Enable AOF persistence                       |
| `--requirepass`            | Enable password authentication               |

---

# Redis Persistence

Redis data will be stored on the host machine at:

```text
/opt/redis/data
```

This prevents data loss when the container restarts.

---

# Redis Security

Redis password authentication is enabled using:

```bash
--requirepass "uwQF1s6dK87gt5Yr2MhP"
```

Always use a strong password in production environments.

---

# Step 3: Run RedisInsight Container

RedisInsight provides a graphical interface for managing Redis.

Run the following command:

```bash
sudo docker run -d \
  --name redisinsight \
  --network redis-net \
  -p 5603:5540 \
  -v /opt/redisinsight/data:/data \
  --restart unless-stopped \
  redis/redisinsight:latest
```

---

# RedisInsight Container Configuration

| Parameter                         | Description                        |
| --------------------------------- | ---------------------------------- |
| `--name redisinsight`             | Container name                     |
| `--network redis-net`             | Connect to Redis network           |
| `-p 5603:5540`                    | Expose RedisInsight UI             |
| `-v /opt/redisinsight/data:/data` | Persist RedisInsight configuration |
| `--restart unless-stopped`        | Automatically restart container    |
| `redis/redisinsight:latest`       | Latest RedisInsight image          |

---

# RedisInsight Data Storage

RedisInsight data is stored at:

```text
/opt/redisinsight/data
```

---

# Step 4: Access RedisInsight

Open the following URL in your browser:

```text
http://localhost:5603
```

Or replace `localhost` with your server IP:

```text
http://YOUR_SERVER_IP:5603
```

---

# Step 5: Connect Redis Server in RedisInsight

Use the following details:

| Field    | Value                  |
| -------- | ---------------------- |
| Host     | `redis`                |
| Port     | `6379`                 |
| Password | `uwQF1s6dK87gt5Yr2MhP` |

---

# Why use `redis` as Host?

Since both containers are connected to the same Docker network:

```text
redis-net
```

Docker automatically resolves the container name:

```text
redis
```

as the internal hostname.

---

# Step 6: Verify Running Containers

Check running containers:

```bash
docker ps
```

Expected output should contain:

- redis
- redisinsight

---

# Useful Docker Commands

## View Redis Logs

```bash
docker logs -f redis
```

---

## View RedisInsight Logs

```bash
docker logs -f redisinsight
```

---

## Stop Containers

```bash
docker stop redis redisinsight
```

---

## Start Containers

```bash
docker start redis redisinsight
```

---

## Restart Containers

```bash
docker restart redis redisinsight
```

---

## Remove Containers

```bash
docker rm -f redis redisinsight
```

---

# Backup Recommendation

Since Redis data is stored on the host system:

```text
/opt/redis/data
```

it is recommended to regularly back up this directory.

---

# Security Recommendations

- Do not expose Redis publicly without firewall protection.
- Use strong passwords.
- Restrict port access using firewall rules.
- Consider enabling TLS for production environments.

---

# Summary

This setup provides:

- Persistent Redis storage
- Password-protected Redis instance
- Automatic container restart
- Redis GUI management using RedisInsight
- Isolated Docker network communication

---
