#!/usr/bin/env python3
"""
24x7 Keep-Alive Watchdog for Gcarbon Calling CRM.
Pings the production API health & sync endpoints every 5 minutes
to prevent serverless cold-starts and verify continuous 24/7 uptime.
"""
import time
import urllib.request
import json
from datetime import datetime

TARGET_URL = "https://gcarbon-calling-acme-fb0a.vercel.app/api/health"
SYNC_URL = "https://gcarbon-calling-acme-fb0a.vercel.app/api/sync/sharepoint"
INTERVAL_SECONDS = 300  # 5 minutes

def log(msg):
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{now}] {msg}", flush=True)

def ping(url):
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "GcarbonCalling-KeepAliveWatchdog/1.0"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read().decode('utf-8')
            return resp.status, data
    except Exception as e:
        return 0, str(e)

def main():
    log(f"Starting 24x7 Keep-Alive Watchdog for {TARGET_URL}")
    while True:
        status, body = ping(TARGET_URL)
        if status == 200:
            log(f"Health check OK (200) - {TARGET_URL}")
        else:
            log(f"Health check Warning ({status}): {body}")

        # Also ping cloud sync endpoint
        s_status, s_body = ping(SYNC_URL)
        if s_status == 200:
            log(f"Cloud sync ping OK (200) - {SYNC_URL}")
        else:
            log(f"Cloud sync ping Warning ({s_status}): {s_body}")

        time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    main()
