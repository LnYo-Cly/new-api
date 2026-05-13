package common

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
)

type verificationValue struct {
	code string
	time time.Time
}

const (
	EmailVerificationPurpose = "v"
	PasswordResetPurpose     = "r"
)

var verificationMutex sync.Mutex
var verificationMap map[string]verificationValue
var verificationSendLockMap map[string]time.Time
var verificationMapMaxSize = 10
var VerificationValidMinutes = 10
var VerificationSendCooldownMinutes = 5

func GenerateVerificationCode(length int) string {
	code := uuid.New().String()
	code = strings.Replace(code, "-", "", -1)
	if length == 0 {
		return code
	}
	return code[:length]
}

func RegisterVerificationCodeWithKey(key string, code string, purpose string) {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap[purpose+key] = verificationValue{
		code: code,
		time: time.Now(),
	}
	if len(verificationMap) > verificationMapMaxSize {
		removeExpiredPairs()
	}
}

func TryAcquireVerificationSendLock(key string, purpose string) (bool, time.Duration) {
	lockKey := getVerificationSendLockKey(key, purpose)
	cooldown := time.Duration(VerificationSendCooldownMinutes) * time.Minute
	if RedisEnabled {
		ctx := context.Background()
		ok, err := RDB.SetNX(ctx, lockKey, time.Now().Unix(), cooldown).Result()
		if err == nil {
			if ok {
				return true, 0
			}
			ttl, ttlErr := RDB.TTL(ctx, lockKey).Result()
			if ttlErr == nil && ttl > 0 {
				return false, ttl
			}
			return false, cooldown
		}
		if err != redis.Nil {
			SysError(fmt.Sprintf("failed to acquire verification send lock %s: %v", lockKey, err))
		}
	}

	verificationMutex.Lock()
	defer verificationMutex.Unlock()

	now := time.Now()
	if sendTime, exists := verificationSendLockMap[lockKey]; exists {
		elapsed := now.Sub(sendTime)
		if elapsed < cooldown {
			return false, cooldown - elapsed
		}
	}
	verificationSendLockMap[lockKey] = now
	return true, 0
}

func ReleaseVerificationSendLock(key string, purpose string) {
	lockKey := getVerificationSendLockKey(key, purpose)
	if RedisEnabled {
		if err := RedisDel(lockKey); err != nil && err != redis.Nil {
			SysError(fmt.Sprintf("failed to release verification send lock %s: %v", lockKey, err))
		}
	}

	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	delete(verificationSendLockMap, lockKey)
}

func VerifyCodeWithKey(key string, code string, purpose string) bool {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	value, okay := verificationMap[purpose+key]
	now := time.Now()
	if !okay || int(now.Sub(value.time).Seconds()) >= VerificationValidMinutes*60 {
		return false
	}
	return code == value.code
}

func DeleteKey(key string, purpose string) {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	delete(verificationMap, purpose+key)
}

// no lock inside, so the caller must lock the verificationMap before calling!
func removeExpiredPairs() {
	now := time.Now()
	for key := range verificationMap {
		if int(now.Sub(verificationMap[key].time).Seconds()) >= VerificationValidMinutes*60 {
			delete(verificationMap, key)
		}
	}
	cooldown := time.Duration(VerificationSendCooldownMinutes) * time.Minute
	for key, sendTime := range verificationSendLockMap {
		if now.Sub(sendTime) >= cooldown {
			delete(verificationSendLockMap, key)
		}
	}
}

func getVerificationSendLockKey(key string, purpose string) string {
	normalizedKey := strings.ToLower(strings.TrimSpace(key))
	return "verification:send-lock:" + purpose + ":" + normalizedKey
}

func init() {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap = make(map[string]verificationValue)
	verificationSendLockMap = make(map[string]time.Time)
}
