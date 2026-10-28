package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/store"
)

// Generic handlers for every endpoint group without its own table. Each constructor returns a gin
// handler for one shape of endpoint, so the route catalog stays one line per endpoint.
//
// Objects are stored whole as JSON. Lists accept ?q= (search), ?page=, ?pageSize= and any other
// query parameter as an exact-match filter on that field.

var reservedQuery = map[string]bool{"q": true, "page": true, "pageSize": true, "token": true}

func (s *Server) listRes(kind, parentParam string) gin.HandlerFunc {
	return func(c *gin.Context) {
		page := max(qInt(c, "page", 1), 1)
		size := qInt(c, "pageSize", 100)
		q := store.ResourceQuery{Search: c.Query("q"), Limit: size, Offset: (page - 1) * size, Where: map[string]string{}}
		if parentParam != "" {
			q.ParentID = c.Param(parentParam)
		}
		for key, values := range c.Request.URL.Query() {
			if !reservedQuery[key] && len(values) > 0 && values[0] != "" {
				q.Where[key] = values[0]
			}
		}
		items, total, err := s.st.ListResources(c, kind, q)
		ok(c, domain.Page[store.Resource]{Items: items, Total: total, Page: page, PageSize: q.Limit}, err)
	}
}

func (s *Server) getRes(kind, idParam string) gin.HandlerFunc {
	return func(c *gin.Context) {
		r, err := s.st.GetResource(c, kind, c.Param(idParam))
		ok(c, r, err)
	}
}

func (s *Server) createRes(kind, parentParam string) gin.HandlerFunc {
	return func(c *gin.Context) {
		data, good := object(c)
		if !good {
			return
		}
		parent := ""
		if parentParam != "" {
			parent = c.Param(parentParam)
		}
		r, err := s.st.CreateResource(c, s.st.DB, kind, parent, data)
		created(c, r, err)
	}
}

func (s *Server) updateRes(kind, idParam string) gin.HandlerFunc {
	return func(c *gin.Context) {
		data, good := object(c)
		if !good {
			return
		}
		r, err := s.st.UpdateResource(c, kind, c.Param(idParam), data)
		ok(c, r, err)
	}
}

func (s *Server) deleteRes(kind, idParam string) gin.HandlerFunc {
	return func(c *gin.Context) {
		noContent(c, s.st.DeleteResource(c, kind, c.Param(idParam)))
	}
}

// deleteAllRes removes every object of a kind under a parent (or all of them when parentParam is "").
func (s *Server) deleteAllRes(kind, parentParam string) gin.HandlerFunc {
	return func(c *gin.Context) {
		parent := ""
		if parentParam != "" {
			parent = c.Param(parentParam)
		}
		n, err := s.st.DeleteResources(c, kind, parent)
		ok(c, gin.H{"removed": n}, err)
	}
}

// getOne and putOne are single settings objects keyed by their owner, e.g. an account's config.
func (s *Server) getOne(kind, ownerParam string) gin.HandlerFunc {
	return func(c *gin.Context) {
		r, err := s.st.GetResource(c, kind, c.Param(ownerParam))
		if err == store.ErrNotFound {
			c.JSON(http.StatusOK, store.Resource{"id": c.Param(ownerParam)})
			return
		}
		ok(c, r, err)
	}
}

func (s *Server) putOne(kind, ownerParam string) gin.HandlerFunc {
	return func(c *gin.Context) {
		data, good := object(c)
		if !good {
			return
		}
		data["id"] = c.Param(ownerParam)
		r, err := s.st.CreateResource(c, s.st.DB, kind, c.Param(ownerParam), data)
		ok(c, r, err)
	}
}

func (s *Server) deleteOne(kind, ownerParam string) gin.HandlerFunc {
	return s.deleteRes(kind, ownerParam)
}

// link attaches one thing to another (a site to a driver, a licence to a vehicle). The body names the
// child, e.g. {"siteId": "wc-cr"}; the link id is "<parent>:<child>" so adding twice is harmless.
func (s *Server) link(kind, parentParam, childField string) gin.HandlerFunc {
	return func(c *gin.Context) {
		data, good := object(c)
		if !good {
			return
		}
		child, _ := data[childField].(string)
		if strings.TrimSpace(child) == "" {
			fail(c, http.StatusBadRequest, "bad_request", childField+" is required")
			return
		}
		data["id"] = c.Param(parentParam) + ":" + child
		r, err := s.st.CreateResource(c, s.st.DB, kind, c.Param(parentParam), data)
		created(c, r, err)
	}
}

// unlink removes a link by parent and child, from the path or from the body's childField.
func (s *Server) unlink(kind, parentParam, childParam, childField string) gin.HandlerFunc {
	return func(c *gin.Context) {
		child := c.Param(childParam)
		if child == "" {
			data, good := object(c)
			if !good {
				return
			}
			child, _ = data[childField].(string)
		}
		noContent(c, s.st.DeleteResource(c, kind, c.Param(parentParam)+":"+child))
	}
}

// record stores something that happened (a receipt sent, a rating, a payment) under its parent and returns it.
func (s *Server) record(kind, parentParam string) gin.HandlerFunc {
	return func(c *gin.Context) {
		data, good := object(c)
		if !good {
			return
		}
		data["by"] = principal(c).ID
		parent := ""
		if parentParam != "" {
			parent = c.Param(parentParam)
		}
		r, err := s.st.CreateResource(c, s.st.DB, kind, parent, data)
		created(c, r, err)
	}
}

// static returns a fixed value (configuration the console reads and nobody edits yet).
func static(v any) gin.HandlerFunc {
	return func(c *gin.Context) { c.JSON(http.StatusOK, v) }
}
