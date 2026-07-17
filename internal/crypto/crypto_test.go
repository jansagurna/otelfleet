package crypto

import (
	"bytes"
	"errors"
	"testing"
)

func TestRoundtrip(t *testing.T) {
	c, err := New(NewRandomKeyBase64())
	if err != nil {
		t.Fatal(err)
	}
	for _, plaintext := range [][]byte{[]byte("Bearer super-secret"), []byte(""), bytes.Repeat([]byte("x"), 10_000)} {
		ct, err := c.Encrypt(plaintext)
		if err != nil {
			t.Fatalf("encrypt: %v", err)
		}
		if bytes.Contains(ct, plaintext) && len(plaintext) > 0 {
			t.Error("ciphertext contains plaintext")
		}
		got, err := c.Decrypt(ct)
		if err != nil {
			t.Fatalf("decrypt: %v", err)
		}
		if !bytes.Equal(got, plaintext) {
			t.Errorf("roundtrip = %q, want %q", got, plaintext)
		}
	}

	// Same plaintext encrypts to different ciphertexts (random nonce).
	a, _ := c.Encrypt([]byte("hello"))
	b, _ := c.Encrypt([]byte("hello"))
	if bytes.Equal(a, b) {
		t.Error("two encryptions of the same plaintext are identical (nonce reuse?)")
	}
}

func TestTamperDetection(t *testing.T) {
	c, err := New(NewRandomKeyBase64())
	if err != nil {
		t.Fatal(err)
	}
	ct, err := c.Encrypt([]byte("secret"))
	if err != nil {
		t.Fatal(err)
	}
	for i := range ct {
		mangled := bytes.Clone(ct)
		mangled[i] ^= 0xff
		if _, err := c.Decrypt(mangled); !errors.Is(err, ErrDecrypt) {
			t.Errorf("flipping byte %d: err = %v, want ErrDecrypt", i, err)
		}
	}
	if _, err := c.Decrypt(ct[:4]); !errors.Is(err, ErrDecrypt) {
		t.Errorf("truncated ciphertext: err = %v, want ErrDecrypt", err)
	}
	if _, err := c.Decrypt(nil); !errors.Is(err, ErrDecrypt) {
		t.Errorf("nil ciphertext: err = %v, want ErrDecrypt", err)
	}
}

func TestWrongKey(t *testing.T) {
	c1, err := New(NewRandomKeyBase64())
	if err != nil {
		t.Fatal(err)
	}
	c2, err := New(NewRandomKeyBase64())
	if err != nil {
		t.Fatal(err)
	}
	ct, err := c1.Encrypt([]byte("secret"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := c2.Decrypt(ct); !errors.Is(err, ErrDecrypt) {
		t.Errorf("decrypt with wrong key: err = %v, want ErrDecrypt", err)
	}
}

func TestNilCipher(t *testing.T) {
	var c *Cipher
	if c.Configured() {
		t.Error("nil cipher reports configured")
	}
	if _, err := c.Encrypt([]byte("x")); !errors.Is(err, ErrNotConfigured) {
		t.Errorf("nil Encrypt err = %v, want ErrNotConfigured", err)
	}
	if _, err := c.Decrypt([]byte("x")); !errors.Is(err, ErrNotConfigured) {
		t.Errorf("nil Decrypt err = %v, want ErrNotConfigured", err)
	}
}

func TestNewRejectsBadKeys(t *testing.T) {
	if _, err := New("not-base64!!!"); err == nil {
		t.Error("invalid base64 accepted")
	}
	if _, err := New("c2hvcnQ="); err == nil { // "short"
		t.Error("short key accepted")
	}
}
