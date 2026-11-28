import os
import sys
from locust import HttpUser, task, between

# Add backend directory to path to allow importing token generator
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

try:
    from auth_service import create_signed_token, COOKIE_NAME
except ImportError:
    COOKIE_NAME = "inflect_auth"
    create_signed_token = None


class InflectLoadUser(HttpUser):
    """
    Simulates real concurrent user traffic against Inflect backend:
    - High-frequency health probes
    - Authenticated session calls (Analytics, Token Quota, Call History)
    """
    wait_time = between(0.5, 2.0)

    def on_start(self):
        """Pre-authenticates the virtual user by logging in and retaining session cookie."""
        login_payload = {
            "email": "tester@inflect.ai",
            "password": "TestPass123!"
        }
        res = self.client.post("/api/auth/login", json=login_payload, name="/api/auth/login")
        if res.status_code != 200 and create_signed_token:
            # Fallback direct token injection if login endpoint was rate limited
            token = create_signed_token({
                "userId": f"bench-user-{id(self)}",
                "email": "tester@inflect.ai",
                "fullName": "Benchmark Runner",
                "orgId": "1fa13021-3f20-491e-af0c-8a4ffba4b1f6",
                "orgName": "Benchmark Org",
                "role": "ADMIN"
            })
            self.client.cookies.set("inflect_token", token)

    @task(5)
    def check_health(self):
        """Frequent health check probe."""
        self.client.get("/api/health", name="/api/health")

    @task(3)
    def view_analytics_overview(self):
        """Authenticated analytics dashboard overview."""
        self.client.get("/api/analytics/overview", name="/api/analytics/overview")

    @task(2)
    def view_token_quota(self):
        """Authenticated tenant token quota endpoint."""
        self.client.get("/api/org/token-quota", name="/api/org/token-quota")

    @task(2)
    def list_history(self):
        """Authenticated call history listing."""
        self.client.get("/api/history?page=1&page_size=10", name="/api/history")
