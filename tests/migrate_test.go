package tests

import (
	"testing"

	"github.com/nca-apprentices/ncaleague/league"
)

// The pods of a rolling update start together, and each migrates the
// database it shares with the others.
func TestOpenMigratesOnceWhenPodsStartTogether(t *testing.T) {
	db := freshDB(t)
	const pods = 8

	errs := make(chan error, pods)
	for range pods {
		go func() {
			_, err := league.Open(ctx, db)
			errs <- err
		}()
	}
	for range pods {
		if err := <-errs; err != nil {
			t.Fatalf("Open: %v", err)
		}
	}
}
