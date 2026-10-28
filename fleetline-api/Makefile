.PHONY: run build test e2e routes fmt up

run:        ## run against local Postgres/PostGIS and Redis
	go run ./cmd/server

build:
	CGO_ENABLED=0 go build -o bin/server ./cmd/server

e2e:        ## needs a running server (make run or make up)
	API_URL=$${API_URL:-http://localhost:8080} go test ./test -count=1 -v

routes:
	go run ./cmd/routes > ROUTES.md

fmt:
	gofmt -w . && go vet ./...

up:
	docker compose up --build
