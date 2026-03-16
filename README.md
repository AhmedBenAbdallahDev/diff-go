# diff-ashref-tn

Real-time side-by-side text/code diff viewer.  
Paste two texts and see differences highlighted instantly.

## Stack

- **Backend:** Go 1.22 (static file server)
- **Frontend:** Vanilla HTML/CSS/JS + [diff-match-patch](https://github.com/google/diff-match-patch)

## Run locally

```bash
go run main.go
# open http://localhost:8080
```

## Build

```bash
go build -o diff-ashref-tn .
./diff-ashref-tn
```

## Deploy (Linux VPS)

```bash
# 1. Build for Linux on your machine
GOOS=linux GOARCH=amd64 go build -o diff-ashref-tn .

# 2. Upload to VPS
scp diff-ashref-tn user@yourserver:/opt/diff-ashref-tn/
scp -r static user@yourserver:/opt/diff-ashref-tn/

# 3. Install systemd service (see deploy/diff-ashref-tn.service)
sudo cp deploy/diff-ashref-tn.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now diff-ashref-tn
```

## Environment Variables

| Variable | Default | Description        |
|----------|---------|--------------------|
| `PORT`   | `8080`  | HTTP port to listen on |
