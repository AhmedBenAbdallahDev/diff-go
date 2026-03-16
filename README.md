# diff-ashref-tn

Real-time side-by-side text/code diff viewer.  
Paste two texts and see differences highlighted instantly.

## Stack

- **Backend:** Go 1.22 (static file server)
- **Frontend:** Vanilla HTML/CSS/JS + [diff-match-patch](https://github.com/google/diff-match-patch)

## Run locally (Go)

```bash
go run main.go
# open http://localhost:8080
```

## Run with Docker (recommended)

```bash
docker compose up -d
# open http://localhost:8080
```

To stop:
```bash
docker compose down
```

To rebuild after changes:
```bash
docker compose up -d --build
```

## Deploy to VPS with Docker

```bash
# 1. SSH into your VPS and clone the repo
git clone https://github.com/AhmedBenAbdallahDev/diff-ashref-tn.git
cd diff-ashref-tn

# 2. Build and start
docker compose up -d --build

# 3. Check it's running
docker ps
curl http://localhost:8080
```

That's it. Docker handles everything — no Go install needed on the server.

## Environment Variables

| Variable | Default | Description        |
|----------|---------|--------------------|
| `PORT`   | `8080`  | HTTP port to listen on |
