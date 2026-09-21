from django.contrib.auth.models import User
from django.test import TestCase


class AccountApiTests(TestCase):
    def test_register_rejects_invalid_json(self):
        response = self.client.post(
            "/api/auth/register/",
            data="{broken",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_login_username_lookup_is_case_insensitive(self):
        User.objects.create_user(username="PlayerOne", password="secret1")
        response = self.client.post(
            "/api/auth/login/",
            data='{"username":"playerone","password":"secret1"}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "PlayerOne")
