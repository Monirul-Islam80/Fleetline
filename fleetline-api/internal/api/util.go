package api

import (
	"encoding/json"
	"strconv"
)

// mergeStruct applies JSON fields onto a copy of v (used for PATCH on typed records).
func mergeStruct[T any](v T, fields map[string]any) T {
	raw, err := json.Marshal(v)
	if err != nil {
		return v
	}
	current := map[string]any{}
	if json.Unmarshal(raw, &current) != nil {
		return v
	}
	for k, val := range fields {
		current[k] = val
	}
	raw, err = json.Marshal(current)
	if err != nil {
		return v
	}
	var out T
	if json.Unmarshal(raw, &out) != nil {
		return v
	}
	return out
}

func fmtCoord(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
