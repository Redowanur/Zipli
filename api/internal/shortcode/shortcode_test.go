package shortcode

import "testing"

func TestEncodeUniqueAndValid(t *testing.T) {
	seen := make(map[string]int64, 200000)
	for id := int64(1000); id < 201000; id++ {
		c := Encode(id)
		if prev, ok := seen[c]; ok {
			t.Fatalf("collision: %d and %d -> %s", prev, id, c)
		}
		seen[c] = id
		if len(c) > 8 {
			t.Fatalf("code too long: %s", c)
		}
	}
}

func TestEncodeNotSequential(t *testing.T) {
	if Encode(1000) == Encode(1001) {
		t.Fatal("same code")
	}
}

func TestValidAlias(t *testing.T) {
	cases := map[string]bool{
		"my-link": true, "ab": false, "login": false, "bad/slash": false,
		"Good_123": true, "": false,
	}
	for in, want := range cases {
		if got := ValidAlias(in); got != want {
			t.Errorf("ValidAlias(%q)=%v want %v", in, got, want)
		}
	}
}
