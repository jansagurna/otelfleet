SHELL := /bin/bash
COMPOSE := docker compose -f deploy/compose/docker-compose.yaml

.PHONY: dev-up dev-down run build test lint gen gen-go gen-web migrate clean

dev-up:
	$(COMPOSE) up -d --build

dev-down:
	$(COMPOSE) down -v

run:
	go run ./cmd/otelfleet

build:
	mkdir -p bin
	go build -o bin/otelfleet ./cmd/otelfleet

test:
	go test ./...
	cd collector/extension/tenantauth && go test ./...
	cd collector/processor/tenantstamp && go test ./...

lint:
	golangci-lint run ./...

gen: gen-go gen-web

gen-go:
	go tool oapi-codegen -config api/oapi-codegen.yaml api/openapi.yaml
	protoc --go_out=. --go_opt=module=github.com/sag-solutions/otelfleet \
		--go-grpc_out=. --go-grpc_opt=module=github.com/sag-solutions/otelfleet \
		proto/authservice.proto

gen-web:
	cd web && pnpm gen

clean:
	rm -rf bin collector/dist web/dist
