package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"fleetline/api/internal/dispatch"
	"fleetline/api/internal/live"
	"fleetline/api/internal/store"
)

// apiError is the one error shape every endpoint returns.
type apiError struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

func fail(c *gin.Context, status int, code, msg string) {
	c.AbortWithStatusJSON(status, apiError{Error: msg, Code: code})
}

// failErr maps service and store errors to HTTP statuses. Unknown errors are logged and hidden.
func failErr(c *gin.Context, err error) {
	msg := err.Error()
	for _, prefix := range []string{dispatch.ErrConflict.Error() + ": ", dispatch.ErrInvalid.Error() + ": "} {
		msg = strings.TrimPrefix(msg, prefix)
	}
	switch {
	case errors.Is(err, store.ErrNotFound):
		fail(c, http.StatusNotFound, "not_found", "Not found")
	case errors.Is(err, dispatch.ErrInvalid):
		fail(c, http.StatusUnprocessableEntity, "invalid", msg)
	case errors.Is(err, dispatch.ErrConflict), errors.Is(err, live.ErrLocked):
		fail(c, http.StatusConflict, "conflict", msg)
	case errors.Is(err, errBadRequest):
		fail(c, http.StatusBadRequest, "bad_request", strings.TrimPrefix(msg, errBadRequest.Error()+": "))
	default:
		slog.Error("request failed", "path", c.FullPath(), "err", err)
		fail(c, http.StatusInternalServerError, "internal", "Something went wrong")
	}
}

var errBadRequest = errors.New("bad request")

// ok writes a JSON response, or the error.
func ok(c *gin.Context, v any, err error) {
	if err != nil {
		failErr(c, err)
		return
	}
	c.JSON(http.StatusOK, v)
}

func created(c *gin.Context, v any, err error) {
	if err != nil {
		failErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, v)
}

func noContent(c *gin.Context, err error) {
	if err != nil {
		failErr(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// body decodes a JSON body into dst. Unknown fields are allowed; an empty body leaves dst unchanged.
func body(c *gin.Context, dst any) bool {
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		fail(c, http.StatusBadRequest, "bad_request", "Could not read the request body")
		return false
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		return true
	}
	if err := json.Unmarshal(raw, dst); err != nil {
		fail(c, http.StatusBadRequest, "bad_request", "Body must be valid JSON: "+err.Error())
		return false
	}
	return true
}

// object decodes a JSON object body (for generic resources and patches).
func object(c *gin.Context) (map[string]any, bool) {
	out := map[string]any{}
	if !body(c, &out) {
		return nil, false
	}
	return out, true
}

func qInt(c *gin.Context, key string, def int) int {
	if v, err := strconv.Atoi(c.Query(key)); err == nil {
		return v
	}
	return def
}

func qInt64(c *gin.Context, key string, def int64) int64 {
	if v, err := strconv.ParseInt(c.Query(key), 10, 64); err == nil {
		return v
	}
	return def
}

func qFloat(c *gin.Context, key string) (float64, bool) {
	v, err := strconv.ParseFloat(c.Query(key), 64)
	return v, err == nil
}

func qBool(c *gin.Context, key string) bool {
	v, _ := strconv.ParseBool(c.Query(key))
	return v
}

func qList(c *gin.Context, key string) []string {
	out := []string{}
	for _, v := range strings.Split(c.Query(key), ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

// latLng reads lat and lng from the query string.
func latLng(c *gin.Context) (lat, lng float64, good bool) {
	lat, ok1 := qFloat(c, "lat")
	lng, ok2 := qFloat(c, "lng")
	if !ok1 || !ok2 {
		fail(c, http.StatusBadRequest, "bad_request", "lat and lng are required")
		return 0, 0, false
	}
	return lat, lng, true
}
