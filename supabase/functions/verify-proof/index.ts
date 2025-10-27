// @ts-nocheck
// Deno Deploy / Supabase Edge Function: verify-proof
// Verifies a student's signed attendance proof and records attendance
// Environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import * as ed from "npm:@noble/ed25519@2.1.0";

function canonicalMessage(token: string, lat: number, lng: number, timestampIso: string): string {
  const latStr = lat.toFixed(6);
  const lngStr = lng.toFixed(6);
  return `v1|${token}|${timestampIso}|${latStr}|${lngStr}`;
}

function toJSON(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') return toJSON({ error: 'Method not allowed' }, 405);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: auth } = await userClient.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return toJSON({ error: 'Not authenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const token = String(body.token || '');
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const timestampIso = String(body.timestamp || '');
    const signatureHex = String(body.signature || '');

    if (!token || !Number.isFinite(lat) || !Number.isFinite(lng) || !timestampIso || !signatureHex) {
      return toJSON({ error: 'Invalid payload' }, 400);
    }

    // 1) Validate session token
    const { data: session, error: sesErr } = await svc
      .from('attendance_sessions')
      .select('id, token, lat, lng, radius_m, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (sesErr) return toJSON({ error: sesErr.message }, 500);
    if (!session) return toJSON({ error: 'Invalid session token' }, 400);
    if (new Date(session.expires_at).getTime() < Date.now()) return toJSON({ error: 'Session expired' }, 400);

    // 2) Validate location
    const dist = haversineDistanceMeters(lat, lng, session.lat, session.lng);
    if (dist > (session.radius_m ?? 50)) return toJSON({ error: 'Out of range' }, 400);

    // 3) Fetch user public key
    const { data: profile, error: profErr } = await svc
      .from('user_profiles')
      .select('id, public_key, device_id')
      .eq('id', userId)
      .maybeSingle();
    if (profErr) return toJSON({ error: profErr.message }, 500);
    if (!profile?.public_key) return toJSON({ error: 'Public key not registered' }, 400);

    // 4) Verify signature
    const message = canonicalMessage(token, lat, lng, timestampIso);
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = ed.utils.hexToBytes(signatureHex);
    const pubBytes = ed.utils.hexToBytes(profile.public_key);
    const ok = await ed.verifyAsync(sigBytes, msgBytes, pubBytes);
    if (!ok) return toJSON({ error: 'Invalid signature' }, 400);

    // 5) Insert attendance record (verified=true)
    const nowIso = new Date().toISOString();
    const { error: insErr } = await svc.from('attendance_records').insert({
      user_id: userId,
      method: 'crypto',
      verified: true,
      verified_at: nowIso,
      verified_by: userId, // or null; this is a self-verified event
      metadata: {
        version: 'v1',
        token,
        lat,
        lng,
        timestamp: timestampIso,
        signature: signatureHex,
        message,
        session_id: session.id,
        distance_m: Math.round(dist),
        public_key: profile.public_key,
        device_id: profile.device_id || null,
      },
    });
    if (insErr) return toJSON({ error: insErr.message }, 500);

    return toJSON({ ok: true });
  } catch (e) {
    console.error('[verify-proof] error', e);
    return toJSON({ error: 'Server error' }, 500);
  }
});
