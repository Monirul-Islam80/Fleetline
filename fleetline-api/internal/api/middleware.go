package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// requestLog logs one line per request, skipping the noisy GPS pings at info level.
func requestLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		level := slog.LevelInfo
		if strings.HasSuffix(c.FullPath(), "/location") || c.Writer.Status() < 400 && c.Request.Method == http.MethodGet {
			level = slog.LevelDebug
		}
		if c.Writer.Status() >= 500 {
			level = slog.LevelError
		}
		slog.Log(c.Request.Context(), level, "http", "method", c.Request.Method, "path", c.Request.URL.Path,
			"status", c.Writer.Status(), "ms", time.Since(start).Milliseconds())
	}
}

// cors allows the console's origin to call the API with cookies.
func cors(origins []string) gin.HandlerFunc {
	allowed := map[string]bool{}
	allowAll := false
	for _, o := range origins {
		allowed[o] = true
		allowAll = allowAll || o == "*"
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && (allowAll || allowed[origin]) {
			h := c.Writer.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Operator, X-Webhook-Secret")
			h.Set("Access-Control-Max-Age", "600")
			h.Add("Vary", "Origin")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// securityHeaders are cheap defaults for a JSON API.
func securityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		c.Next()
	}
}

/* ---------- Tokens and auth ---------- */

// Principal is who is calling: an operator (API key), a driver or a passenger (signed token).
type Principal struct {
	Kind string // "operator", "driver", "user"
	ID   string
}

const principalKey = "principal"

// tokens are HMAC-signed "kind.id.expiry" strings. Small and dependency-free; swap for your identity provider later.
type tokens struct{ secret []byte }

func (t tokens) issue(kind, id string, ttl time.Duration) string {
	payload := fmt.Sprintf("%s.%s.%d", kind, id, time.Now().Add(ttl).Unix())
	mac := hmac.New(sha256.New, t.secret)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (t tokens) verify(token string) (Principal, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return Principal{}, false
	}
	payload, err1 := base64.RawURLEncoding.DecodeString(parts[0])
	sig, err2 := base64.RawURLEncoding.DecodeString(parts[1])
	if err1 != nil || err2 != nil {
		return Principal{}, false
	}
	mac := hmac.New(sha256.New, t.secret)
	mac.Write(payload)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return Principal{}, false
	}
	fields := strings.Split(string(payload), ".")
	if len(fields) != 3 {
		return Principal{}, false
	}
	exp, err := strconv.ParseInt(fields[2], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return Principal{}, false
	}
	return Principal{Kind: fields[0], ID: fields[1]}, true
}

// authenticate resolves the caller from an API key or bearer token. With required=false (demo mode)
// anonymous callers are treated as the default operator.
func (s *Server) authenticate(required bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if key := c.GetHeader("X-API-Key"); key != "" {
			for _, k := range s.cfg.APIKeys {
				if subtle.ConstantTimeCompare([]byte(k), []byte(key)) == 1 {
					c.Set(principalKey, Principal{Kind: "operator", ID: s.operatorName(c)})
					c.Next()
					return
				}
			}
			if s.clientTokenValid(c, key) {
				c.Set(principalKey, Principal{Kind: "operator", ID: s.operatorName(c)})
				c.Next()
				return
			}
			fail(c, http.StatusUnauthorized, "unauthorized", "Invalid API key")
			return
		}
		token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if token == "" {
			token = c.Query("token") // browsers cannot set headers on a WebSocket
		}
		if token != "" {
			p, valid := s.tokens.verify(token)
			if !valid {
				fail(c, http.StatusUnauthorized, "unauthorized", "Invalid or expired token")
				return
			}
			c.Set(principalKey, p)
			c.Next()
			return
		}
		if required {
			fail(c, http.StatusUnauthorized, "unauthorized", "Sign in or send an API key")
			return
		}
		c.Set(principalKey, Principal{Kind: "operator", ID: s.operatorName(c)})
		c.Next()
	}
}

// operatorOnly stops driver and passenger tokens reaching dispatcher endpoints.
func operatorOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		if p := principal(c); p.Kind != "operator" {
			fail(c, http.StatusForbidden, "forbidden", "This endpoint is for operators")
			return
		}
		c.Next()
	}
}

func principal(c *gin.Context) Principal {
	if v, ok := c.Get(principalKey); ok {
		return v.(Principal)
	}
	return Principal{}
}

func (s *Server) operatorName(c *gin.Context) string {
	if name := strings.TrimSpace(c.GetHeader("X-Operator")); name != "" && len(name) <= 80 {
		return name
	}
	return s.cfg.OperatorName
}

// webhookAuth checks the telephony provider's shared secret (header or ?secret=).
func (s *Server) webhookAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if s.cfg.WebhookSecret == "" {
			c.Next()
			return
		}
		got := c.GetHeader("X-Webhook-Secret")
		if got == "" {
			got = c.Query("secret")
		}
		if subtle.ConstantTimeCompare([]byte(got), []byte(s.cfg.WebhookSecret)) != 1 {
			fail(c, http.StatusUnauthorized, "unauthorized", "Bad webhook secret")
			return
		}
		c.Next()
	}
}

// clientTokenValid accepts an active token created through POST /clienttokens as an API key.
func (s *Server) clientTokenValid(c *gin.Context, key string) bool {
	if !strings.HasPrefix(key, "flt_") {
		return false
	}
	var n int
	err := s.st.DB.GetContext(c, &n, `SELECT count(*) FROM resources WHERE kind = 'clienttokens' AND data->>'token' = $1 AND coalesce((data->>'active')::boolean, true)`, key)
	return err == nil && n > 0
}
