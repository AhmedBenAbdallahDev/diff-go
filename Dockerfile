# ── Stage 1: Build ──────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o diff-ashref-tn .

# ── Stage 2: Run ─────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /app/diff-ashref-tn .
COPY static/ ./static/

ENV PORT=8080
EXPOSE 8080

CMD ["./diff-ashref-tn"]
