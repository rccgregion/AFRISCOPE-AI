// Test-only session secret. createApp() refuses to start without
// SESSION_SECRET; tests use a fixed throwaway value (never a real secret).
process.env.SESSION_SECRET ??= 'test-only-session-secret-not-for-production-0123456789abcdef';
